"""
Rotas para gerenciamento de configuração do BIND9.
O backend e o bind container compartilham o volume bind_etc (/etc/bind).
"""
import asyncio
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

CONF_DIR   = Path(settings.bind_conf_dir)
ZONES_DIR  = Path(settings.bind_zones_dir)
LOCAL_CONF = CONF_DIR / "named.conf.local"
OPT_CONF   = CONF_DIR / "named.conf.options"


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
    OPT_CONF.write_text(data.content)
    res = await _run(["named-checkconf", str(CONF_DIR / "named.conf")])
    if not res["ok"]:
        # Reverte
        OPT_CONF.write_text(data.content)
        raise HTTPException(400, f"Erro de sintaxe: {res['output']}")
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

@router.post("/check")
async def check_config(user=Depends(require_admin)):
    res = await _run(["named-checkconf", str(CONF_DIR / "named.conf")])
    if res["ok"] and not res["output"]:
        res["output"] = "OK — nenhum erro de configuração encontrado"
    return res
