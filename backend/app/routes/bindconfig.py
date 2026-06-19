"""
Rotas para gerenciamento de configuração do BIND9.
O backend e o bind container compartilham o volume bind_etc (/etc/bind).
"""
import asyncio
import json
import os
import re
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import require_admin, get_current_user
from ..config import settings

router = APIRouter(prefix="/api/bindconfig", tags=["bindconfig"])

CONF_DIR    = Path(settings.bind_conf_dir)
ZONES_DIR   = Path(settings.bind_zones_dir)
LOCAL_CONF  = CONF_DIR / "named.conf.local"
OPT_CONF    = CONF_DIR / "named.conf.options"
ACL_FILE    = CONF_DIR / "natverk-acl.json"

DEFAULT_ACL = {
    "allow_query": [
        "localhost", "127.0.0.1", "::1",
        "192.168.0.0/16", "172.16.0.0/12", "10.0.0.0/8",
    ],
    "forwarders": [
        "1.1.1.1", "1.0.0.1",
        "8.8.8.8", "8.8.4.4",
        "208.67.222.222", "208.67.220.220",
    ],
    "listen_on": ["any"],
    "max_cache_size": "4096M",
    "recursive_clients": 15000,
    "tcp_clients": 5000,
    "min_cache_ttl": 60,
    "max_cache_ttl": 86400,
    "max_ncache_ttl": 3600,
    "auth_nxdomain": False,
    "dnssec_validation": "auto",
    "version_hidden": True,
}


_IP_RE = r'([\da-fA-F:\.]+(?:/\d+)?|localhost|any)'

def _parse_block(content: str, keyword: str) -> list:
    """Extrai lista de valores de um bloco 'keyword { val; val; }' no named.conf."""
    m = re.search(rf'{re.escape(keyword)}\s*\{{([^}}]*)\}}', content, re.DOTALL)
    if not m:
        return []
    return re.findall(_IP_RE + r'\s*;', m.group(1))

def _sync_acl_from_options(content: str) -> None:
    """Lê named.conf.options e atualiza natverk-acl.json com forwarders,
    allow_query e listen_on — mantendo demais campos intactos."""
    acl = _load_acl()
    changed = False

    fwds = _parse_block(content, 'forwarders')
    if fwds:
        acl['forwarders'] = fwds
        changed = True

    aq = _parse_block(content, 'allow-query')
    if aq:
        acl['allow_query'] = aq
        changed = True

    # listen-on NÃO é sincronizado — dentro do Docker deve ser sempre "any"

    if changed:
        ACL_FILE.write_text(json.dumps(acl, indent=2))


def _load_acl() -> dict:
    if ACL_FILE.exists():
        try:
            return json.loads(ACL_FILE.read_text())
        except Exception:
            pass
    return dict(DEFAULT_ACL)


def _build_options_from_acl(acl: dict) -> str:
    aq   = "\n".join(f"        {n};" for n in acl.get("allow_query", []))
    fwd  = "\n".join(f"        {n};" for n in acl.get("forwarders", []))
    dnssec = acl.get("dnssec_validation", "auto")
    version = '"not disclosed"' if acl.get("version_hidden", True) else '"bind"'
    anx  = "no" if not acl.get("auth_nxdomain", False) else "yes"

    return f"""\
options {{
    directory "/var/cache/bind";

    // Dentro do Docker o BIND deve escutar em todas as interfaces do container
    listen-on port 53 {{ any; }};
    listen-on-v6 port 53 {{ any; }};

    // Redes autorizadas a fazer consultas DNS neste servidor
    allow-query {{
{aq}
    }};

    // Servidores DNS de encaminhamento
    forwarders {{
{fwd}
    }};

    forward first;
    dnssec-validation {dnssec};

    // Performance
    max-cache-size {acl.get("max_cache_size", "4096M")};
    recursive-clients {acl.get("recursive_clients", 15000)};
    tcp-clients {acl.get("tcp_clients", 5000)};
    min-cache-ttl {acl.get("min_cache_ttl", 60)};
    max-cache-ttl {acl.get("max_cache_ttl", 86400)};
    max-ncache-ttl {acl.get("max_ncache_ttl", 3600)};

    auth-nxdomain {anx};
    version {version};

    querylog yes;
}};

logging {{
    channel natverk_query_log {{
        file "/var/log/named/queries.log" versions 5 size 20m;
        severity dynamic;
        print-time yes;
        print-category yes;
    }};
    category queries {{ natverk_query_log; }};
}};
"""


# ── helpers ───────────────────────────────────────────────────────────────────

async def _run(cmd: list, timeout: int = 15) -> dict:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        ok = proc.returncode == 0
        return {"ok": ok, "output": (stdout + stderr).decode(errors="replace").strip()}
    except asyncio.TimeoutError:
        return {"ok": False, "output": "Timeout"}
    except Exception as e:
        return {"ok": False, "output": str(e)}


def _rndc_cmd(subcmd: str) -> list:
    return [
        settings.rndc_path,
        "-s", settings.rndc_host,
        "-p", str(settings.rndc_port),
        "-k", settings.rndc_key_file,
    ] + subcmd.split()


async def _rndc(subcmd: str) -> dict:
    return await _run(_rndc_cmd(subcmd), timeout=10)


def _ensure_zones_dir():
    ZONES_DIR.mkdir(parents=True, exist_ok=True)


def _parse_zones_from_local() -> list[dict]:
    """Extrai blocos zone do named.conf.local."""
    if not LOCAL_CONF.exists():
        return []
    content = LOCAL_CONF.read_text(errors="replace")
    zones = []
    # Regex: zone "name" { type ...; file "..."; };
    pattern = re.compile(
        r'zone\s+"([^"]+)"\s*\{([^}]*)\}',
        re.DOTALL | re.IGNORECASE
    )
    for m in pattern.finditer(content):
        name = m.group(1)
        body = m.group(2)
        ztype = (re.search(r'type\s+(\w+)', body) or type('', (), {'group': lambda s, i: 'master'})()).group(1)
        fmatch = re.search(r'file\s+"([^"]+)"', body)
        zfile = fmatch.group(1) if fmatch else f"/etc/bind/zones/{name}.zone"
        zones.append({
            "name": name,
            "type": ztype,
            "file": zfile,
            "exists": Path(zfile).exists(),
        })
    return zones


def _next_serial(current: str) -> str:
    today = time.strftime("%Y%m%d")
    if current.startswith(today):
        seq = int(current[8:]) + 1
        return f"{today}{seq:02d}"
    return f"{today}01"


def _default_zone_file(domain: str) -> str:
    return f"""\
$ORIGIN {domain}.
$TTL 3600
@  IN  SOA  ns1.{domain}. admin.{domain}. (
       {time.strftime('%Y%m%d')}01  ; Serial
       3600               ; Refresh
       1800               ; Retry
       604800             ; Expire
       3600 )             ; Minimum TTL

@     IN  NS   ns1.{domain}.
ns1   IN  A    127.0.0.1
"""


# ── named.conf.options ────────────────────────────────────────────────────────

@router.get("/options")
async def get_options(user=Depends(get_current_user)):
    if not OPT_CONF.exists():
        return {"content": "", "exists": False}
    return {"content": OPT_CONF.read_text(errors="replace"), "exists": True}


class SaveOptions(BaseModel):
    content: str

@router.put("/options")
async def save_options(data: SaveOptions, user=Depends(require_admin)):
    backup = OPT_CONF.read_text() if OPT_CONF.exists() else ""
    OPT_CONF.write_text(data.content)
    res = await _run(["named-checkconf", str(CONF_DIR / "named.conf")])
    if not res["ok"]:
        OPT_CONF.write_text(backup)
        raise HTTPException(400, f"Erro de sintaxe: {res['output']}")
    # Sincroniza forwarders, allow_query e listen_on de volta ao natverk-acl.json
    try:
        _sync_acl_from_options(data.content)
    except Exception:
        pass
    await _rndc("reconfig")
    return {"ok": True, "output": "Opções salvas e BIND recarregado."}


# ── named.conf.local (texto) ──────────────────────────────────────────────────

@router.get("/local")
async def get_local(user=Depends(get_current_user)):
    if not LOCAL_CONF.exists():
        return {"content": "", "exists": False}
    return {"content": LOCAL_CONF.read_text(errors="replace"), "exists": True}


class SaveLocal(BaseModel):
    content: str

@router.put("/local")
async def save_local(data: SaveLocal, user=Depends(require_admin)):
    backup = LOCAL_CONF.read_text() if LOCAL_CONF.exists() else ""
    LOCAL_CONF.write_text(data.content)
    res = await _run(["named-checkconf", str(CONF_DIR / "named.conf")])
    if not res["ok"]:
        LOCAL_CONF.write_text(backup)
        raise HTTPException(400, f"Erro de sintaxe: {res['output']}")
    await _rndc("reconfig")
    return {"ok": True, "output": "named.conf.local salvo e BIND recarregado."}


# ── Zonas (GUI) ───────────────────────────────────────────────────────────────

@router.get("/zones")
async def list_zones(user=Depends(get_current_user)):
    return {"zones": _parse_zones_from_local()}


class CreateZone(BaseModel):
    name: str
    type: str = "master"
    content: Optional[str] = None  # conteúdo inicial do zone file (pro mode)

@router.post("/zones")
async def create_zone(data: CreateZone, user=Depends(require_admin)):
    _ensure_zones_dir()
    name = data.name.strip().rstrip(".")
    zone_file = ZONES_DIR / f"{name}.zone"

    # Verifica se já existe
    zones = _parse_zones_from_local()
    if any(z["name"] == name for z in zones):
        raise HTTPException(400, f"Zona '{name}' já existe.")

    # Cria arquivo de zona
    content = data.content or _default_zone_file(name)
    zone_file.write_text(content)

    # Adiciona ao named.conf.local
    block = f'\nzone "{name}" {{\n    type {data.type};\n    file "{zone_file}";\n}};\n'
    with LOCAL_CONF.open("a") as f:
        f.write(block)

    # Valida e recarrega
    res = await _run(["named-checkconf", str(CONF_DIR / "named.conf")])
    if not res["ok"]:
        zone_file.unlink(missing_ok=True)
        # Remove o bloco adicionado
        content_local = LOCAL_CONF.read_text()
        LOCAL_CONF.write_text(content_local.replace(block, ""))
        raise HTTPException(400, f"Erro de sintaxe: {res['output']}")

    await _rndc("reconfig")
    return {"ok": True, "output": f"Zona '{name}' criada."}


@router.delete("/zones/{name:path}")
async def delete_zone(name: str, user=Depends(require_admin)):
    name = name.strip().rstrip(".")
    if not LOCAL_CONF.exists():
        raise HTTPException(404, "named.conf.local não encontrado.")

    content = LOCAL_CONF.read_text()
    pattern = re.compile(
        r'\nzone\s+"' + re.escape(name) + r'"\s*\{[^}]*\};\n?',
        re.DOTALL | re.IGNORECASE
    )
    new_content = pattern.sub("", content)
    if new_content == content:
        raise HTTPException(404, f"Zona '{name}' não encontrada.")

    LOCAL_CONF.write_text(new_content)

    # Remove arquivo de zona se existir
    zone_file = ZONES_DIR / f"{name}.zone"
    zone_file.unlink(missing_ok=True)

    await _rndc("reconfig")
    return {"ok": True, "output": f"Zona '{name}' removida."}


# ── Arquivo de zona (editor) ──────────────────────────────────────────────────

@router.get("/zones/{name:path}/file")
async def get_zone_file(name: str, user=Depends(get_current_user)):
    name = name.strip().rstrip(".")
    # Busca arquivo da zona no named.conf.local
    zones = _parse_zones_from_local()
    zone = next((z for z in zones if z["name"] == name), None)
    if not zone:
        raise HTTPException(404, f"Zona '{name}' não encontrada.")
    zpath = Path(zone["file"])
    if not zpath.exists():
        return {"content": _default_zone_file(name), "exists": False, "path": str(zpath)}
    return {"content": zpath.read_text(errors="replace"), "exists": True, "path": str(zpath)}


class SaveZoneFile(BaseModel):
    content: str

@router.put("/zones/{name:path}/file")
async def save_zone_file(name: str, data: SaveZoneFile, user=Depends(require_admin)):
    name = name.strip().rstrip(".")
    zones = _parse_zones_from_local()
    zone = next((z for z in zones if z["name"] == name), None)
    if not zone:
        raise HTTPException(404, f"Zona '{name}' não encontrada.")

    _ensure_zones_dir()
    zpath = Path(zone["file"])
    backup = zpath.read_text() if zpath.exists() else ""
    zpath.write_text(data.content)

    # Valida o arquivo de zona
    res = await _run(["named-checkzone", name, str(zpath)])
    if not res["ok"]:
        zpath.write_text(backup)
        raise HTTPException(400, f"Erro no arquivo de zona: {res['output']}")

    await _rndc("reload")
    return {"ok": True, "output": f"Zona '{name}' salva e recarregada."}


# ── Registros (GUI) ───────────────────────────────────────────────────────────

def _parse_records(zone_content: str, zone_name: str) -> list[dict]:
    """Parser simples de registros DNS de um zone file."""
    records = []
    origin = zone_name.rstrip(".") + "."
    ttl_default = "3600"
    rid = 0

    for line in zone_content.splitlines():
        line = line.strip()
        if not line or line.startswith(";") or line.startswith("$"):
            if line.startswith("$TTL"):
                parts = line.split()
                if len(parts) > 1:
                    ttl_default = parts[1]
            if line.startswith("$ORIGIN"):
                parts = line.split()
                if len(parts) > 1:
                    origin = parts[1]
            continue

        # Ignora SOA e NS de autoridade (complexos)
        if " SOA " in line.upper():
            continue

        # Tenta parsear: [name] [ttl] [class] type value
        m = re.match(
            r'^(\S+)?\s+(?:(\d+)\s+)?(?:IN\s+)?(\w+)\s+(.+)$',
            line, re.IGNORECASE
        )
        if not m:
            continue

        name, ttl, rtype, value = m.groups()
        rtype = rtype.upper()
        if rtype not in ("A", "AAAA", "CNAME", "MX", "TXT", "NS", "PTR", "SRV", "CAA"):
            continue

        rid += 1
        records.append({
            "id": rid,
            "name": name or "@",
            "ttl": ttl or ttl_default,
            "type": rtype,
            "value": value.strip().strip('"'),
        })
    return records


@router.get("/zones/{name:path}/records")
async def list_records(name: str, user=Depends(get_current_user)):
    name = name.strip().rstrip(".")
    zones = _parse_zones_from_local()
    zone = next((z for z in zones if z["name"] == name), None)
    if not zone:
        raise HTTPException(404, f"Zona '{name}' não encontrada.")
    zpath = Path(zone["file"])
    if not zpath.exists():
        return {"records": [], "raw": ""}
    content = zpath.read_text(errors="replace")
    return {"records": _parse_records(content, name), "raw": content}


class AddRecord(BaseModel):
    name: str        # ex: "www" ou "@"
    ttl: str = "3600"
    type: str        # A, AAAA, MX, CNAME, TXT, NS...
    value: str       # ex: "192.168.1.1" ou "10 mail.domain.com."
    priority: Optional[int] = None  # para MX

@router.post("/zones/{name:path}/records")
async def add_record(name: str, data: AddRecord, user=Depends(require_admin)):
    name = name.strip().rstrip(".")
    zones = _parse_zones_from_local()
    zone = next((z for z in zones if z["name"] == name), None)
    if not zone:
        raise HTTPException(404, f"Zona '{name}' não encontrada.")

    _ensure_zones_dir()
    zpath = Path(zone["file"])
    content = zpath.read_text() if zpath.exists() else _default_zone_file(name)

    # Atualiza serial
    def bump_serial(c):
        def replacer(m):
            return m.group(0).replace(m.group(1), _next_serial(m.group(1)))
        return re.sub(r'(\d{10})\s*;\s*Serial', replacer, c)

    rtype = data.type.upper()
    value = data.value.strip()
    if rtype == "MX" and data.priority is not None:
        value = f"{data.priority} {value}"

    new_line = f"{data.name:<20} {data.ttl:<8} IN  {rtype:<8} {value}"
    content = bump_serial(content) + new_line + "\n"
    zpath.write_text(content)

    res = await _run(["named-checkzone", name, str(zpath)])
    if not res["ok"]:
        raise HTTPException(400, f"Erro: {res['output']}")

    await _rndc("reload")
    return {"ok": True, "output": f"Registro {rtype} adicionado."}


class DeleteRecord(BaseModel):
    record_line: str  # linha exata a remover

@router.delete("/zones/{name:path}/records")
async def delete_record(name: str, data: DeleteRecord, user=Depends(require_admin)):
    name = name.strip().rstrip(".")
    zones = _parse_zones_from_local()
    zone = next((z for z in zones if z["name"] == name), None)
    if not zone:
        raise HTTPException(404, f"Zona '{name}' não encontrada.")

    zpath = Path(zone["file"])
    if not zpath.exists():
        raise HTTPException(404, "Arquivo de zona não encontrado.")

    lines = zpath.read_text().splitlines(keepends=True)
    new_lines = [l for l in lines if l.strip() != data.record_line.strip()]
    zpath.write_text("".join(new_lines))

    await _rndc("reload")
    return {"ok": True, "output": "Registro removido."}


# ── named-checkconf ───────────────────────────────────────────────────────────

@router.get("/server-ips")
async def server_ips(user=Depends(get_current_user)):
    """Retorna os IPs públicos reais do servidor host (v4 e v6)."""
    import httpx as _httpx
    ipv4, ipv6 = None, None
    async with _httpx.AsyncClient(timeout=5) as c:
        try:
            ipv4 = (await c.get("https://api.ipify.org")).text.strip()
        except Exception:
            pass
        try:
            ipv6 = (await c.get("https://api6.ipify.org")).text.strip()
        except Exception:
            pass
    return {"ipv4": ipv4, "ipv6": ipv6}


@router.post("/check")
async def check_config(user=Depends(require_admin)):
    res = await _run(["named-checkconf", str(CONF_DIR / "named.conf")])
    if res["ok"] and not res["output"]:
        res["output"] = "OK — nenhum erro de configuração encontrado"
    return res


class ValidateContent(BaseModel):
    content: str
    filename: str  # ex: "named.conf.options"

@router.post("/validate")
async def validate_content(data: ValidateContent, user=Depends(get_current_user)):
    """Valida conteúdo sem salvar: escreve temporariamente, roda checkconf, reverte."""
    safe_name = Path(data.filename).name  # previne path traversal
    target = CONF_DIR / safe_name
    backup = target.read_text() if target.exists() else None
    try:
        target.write_text(data.content)
        res = await _run(["named-checkconf", str(CONF_DIR / "named.conf")])
        if res["ok"] and not res["output"]:
            res["output"] = "✓ Configuração válida — nenhum erro encontrado"
        return res
    finally:
        if backup is not None:
            target.write_text(backup)
        elif target.exists():
            target.unlink()


# ── named.conf.bloqueios ─────────────────────────────────────────────────────

@router.get("/bloqueios")
async def get_bloqueios(user=Depends(get_current_user)):
    f = CONF_DIR / "named.conf.bloqueios"
    if not f.exists():
        return {"content": "", "exists": False}
    return {"content": f.read_text(errors="replace"), "exists": True}


class SaveBloqueios(BaseModel):
    content: str

@router.put("/bloqueios")
async def save_bloqueios(data: SaveBloqueios, user=Depends(require_admin)):
    bloq = CONF_DIR / "named.conf.bloqueios"
    backup = bloq.read_text() if bloq.exists() else ""
    bloq.write_text(data.content)
    res = await _run(["named-checkconf", str(CONF_DIR / "named.conf")])
    if not res["ok"]:
        bloq.write_text(backup)
        raise HTTPException(400, f"Erro de sintaxe: {res['output']}")
    await _rndc("reconfig")
    return {"ok": True, "output": "named.conf.bloqueios salvo e BIND recarregado."}


# ── ACL / Configurações estruturadas ─────────────────────────────────────────

@router.get("/acl")
async def get_acl(user=Depends(get_current_user)):
    return _load_acl()


class AclSettings(BaseModel):
    allow_query: list[str]
    forwarders: list[str]
    listen_on: list[str]
    max_cache_size: str = "4096M"
    recursive_clients: int = 15000
    tcp_clients: int = 5000
    min_cache_ttl: int = 60
    max_cache_ttl: int = 86400
    max_ncache_ttl: int = 3600
    auth_nxdomain: bool = False
    dnssec_validation: str = "auto"
    version_hidden: bool = True


@router.put("/acl")
async def save_acl(data: AclSettings, user=Depends(require_admin)):
    acl = data.dict()
    options_content = _build_options_from_acl(acl)

    backup = OPT_CONF.read_text() if OPT_CONF.exists() else ""
    OPT_CONF.write_text(options_content)

    res = await _run(["named-checkconf", str(CONF_DIR / "named.conf")])
    if not res["ok"]:
        OPT_CONF.write_text(backup)
        raise HTTPException(400, f"Erro de configuração: {res['output']}")

    ACL_FILE.write_text(json.dumps(acl, indent=2))
    await _rndc("reconfig")
    return {"ok": True, "output": "Configurações salvas e BIND recarregado."}
