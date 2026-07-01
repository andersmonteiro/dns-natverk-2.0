import asyncio
from pathlib import Path

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user, require_admin
from ..config import settings
from ..db import DB_PATH
from ..domain_utils import normalizar, dominio_valido, is_tld_protegido, is_whitelisted, PROTECTED_TLDS

router = APIRouter(prefix="/api/blocks", tags=["blocks"])

# Lock para evitar race condition em operacoes simultaneas de rebuild
_rebuild_lock = asyncio.Lock()

BIND_DIR       = Path(settings.bind_conf_dir)
BLOQUEIOS_CONF = BIND_DIR / "named.conf.bloqueios"
WHITELIST_CONF = BIND_DIR / "named.conf.whitelist"
NAMED_CONF     = BIND_DIR / "named.conf"
BLOQUEIO       = BIND_DIR / "db.bloqueio"

BLOQUEIO_CONTENT = """; Zona de bloqueio - DNS Natverk Panel
; Todos os dominios bloqueados apontam para esta zona (sinkhole 0.0.0.0)
$TTL 300
@ IN SOA localhost. root.localhost. (
    2026010101   ; serial
    3600         ; refresh
    900          ; retry
    86400        ; expire
    300 )        ; minimum TTL

@ IN NS  localhost.
@ IN A   0.0.0.0
* IN A   0.0.0.0
@ IN AAAA ::
* IN AAAA ::
"""


async def _rndc_reconfig() -> None:
    try:
        proc = await asyncio.create_subprocess_exec(
            settings.rndc_path,
            "-s", settings.rndc_host,
            "-p", str(settings.rndc_port),
            "-k", settings.rndc_key_file,
            "reconfig",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.communicate(), timeout=10)
    except Exception:
        pass


async def rebuild_blocks_conf() -> None:
    """Regenera named.conf.bloqueios e named.conf.whitelist, recarrega o BIND.
    Protegido por lock para evitar corrupcao em chamadas simultaneas."""
    async with _rebuild_lock:
        if not BLOQUEIO.exists():
            BLOQUEIO.write_text(BLOQUEIO_CONTENT)

        async with aiosqlite.connect(DB_PATH) as db:
            cur = await db.execute("SELECT domain FROM whitelist_domain")
            whitelist = {r[0] for r in await cur.fetchall()}

            cursor = await db.execute("SELECT domain FROM blocked_domain ORDER BY domain")
            all_blocked = [row[0] for row in await cursor.fetchall()]

        wl_domains = sorted(d for d in whitelist if d not in PROTECTED_TLDS)
        wl_lines = [
            'zone "{}" {{ type forward; forwarders {{ 8.8.8.8; 1.1.1.1; }}; forward only; }};\n'.format(d)
            for d in wl_domains
        ]
        WHITELIST_CONF.write_text(
            "// Whitelist - DNS Natverk Panel - sempre encaminhado ao upstream\n"
            + "".join(wl_lines)
        )

        if NAMED_CONF.exists():
            nc = NAMED_CONF.read_text()
            if 'named.conf.whitelist' not in nc:
                nc = nc.replace(
                    'include "/etc/bind/named.conf.bloqueios";',
                    'include "/etc/bind/named.conf.whitelist";\ninclude "/etc/bind/named.conf.bloqueios";'
                )
                NAMED_CONF.write_text(nc)

        block_domains = [
            d for d in all_blocked
            if not is_tld_protegido(d) and not is_whitelisted(d, whitelist)
        ]
        lines = [
            'zone "{}" {{ type primary; file "/etc/bind/db.bloqueio"; }};\n'.format(d)
            for d in block_domains
        ]
        BLOQUEIOS_CONF.write_text(
            "// Gerenciado automaticamente pelo DNS Natverk Panel\n"
            + "".join(lines)
        )

        await _rndc_reconfig()


class DomainIn(BaseModel):
    domain: str

class BulkDomainsIn(BaseModel):
    domains: list[str]


@router.get("/")
async def list_blocked(user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT domain, created_at, created_by FROM blocked_domain ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.post("/")
async def add_block(data: DomainIn, user=Depends(require_admin)):
    domain = normalizar(data.domain)
    if not domain or not dominio_valido(domain):
        raise HTTPException(400, "Dominio invalido - verifique a sintaxe")

    if is_tld_protegido(domain):
        raise HTTPException(400, "'{}' e um TLD protegido e nao pode ser bloqueado".format(domain))

    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT domain FROM whitelist_domain")
        whitelist = {r[0] for r in await cur.fetchall()}

    if is_whitelisted(domain, whitelist):
        raise HTTPException(409, "'{}' esta protegido pela whitelist e nao pode ser bloqueado".format(domain))

    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute(
                "INSERT INTO blocked_domain (domain, created_by, source) VALUES (?, ?, 'manual')",
                (domain, user["username"])
            )
            await db.execute(
                "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
                (user["username"], "block_add", domain)
            )
            await db.commit()
        except aiosqlite.IntegrityError:
            raise HTTPException(409, "Dominio ja bloqueado")

    await rebuild_blocks_conf()
    return {"ok": True, "domain": domain}


@router.post("/bulk-remove")
async def bulk_remove_blocks(data: BulkDomainsIn, user=Depends(require_admin)):
    removed = 0
    async with aiosqlite.connect(DB_PATH) as db:
        for domain in data.domains:
            cursor = await db.execute("DELETE FROM blocked_domain WHERE domain = ?", (domain,))
            removed += cursor.rowcount
        await db.execute(
            "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
            (user["username"], "block_bulk_remove", "count={}".format(removed))
        )
        await db.commit()
    await rebuild_blocks_conf()
    return {"ok": True, "removed": removed}


@router.delete("/{domain:path}")
async def remove_block(domain: str, user=Depends(require_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM blocked_domain WHERE domain = ?", (domain,)
        )
        await db.execute(
            "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
            (user["username"], "block_remove", domain)
        )
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(404, "Dominio nao encontrado")

    await rebuild_blocks_conf()
    return {"ok": True}
