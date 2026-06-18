import asyncio
from pathlib import Path

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user, require_admin
from ..config import settings
from ..db import DB_PATH

router = APIRouter(prefix="/api/blocks", tags=["blocks"])

BIND_DIR    = Path(settings.bind_conf_dir)
BLOQUEIOS_CONF = BIND_DIR / "named.conf.bloqueios"
BLOQUEIO    = BIND_DIR / "db.bloqueio"

BLOQUEIO_CONTENT = """\
; Zona de bloqueio — DNS Nätverk Panel
; Todos os domínios bloqueados apontam para esta zona (sinkhole 0.0.0.0)
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
    """Regenera named.conf.bloqueios a partir do banco de dados e recarrega o BIND."""
    # Garante que db.bloqueio existe
    if not BLOQUEIO.exists():
        BLOQUEIO.write_text(BLOQUEIO_CONTENT)

    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT domain FROM blocked_domain ORDER BY domain")
        domains = [row[0] for row in await cursor.fetchall()]

    lines = [
        f'zone "{d}" {{ type master; file "/etc/bind/db.bloqueio"; }};\n'
        for d in domains
    ]
    header = "// Gerenciado automaticamente pelo DNS Natverk Panel\n"
    BLOQUEIOS_CONF.write_text(header + "".join(lines))

    await _rndc_reconfig()


class DomainIn(BaseModel):
    domain: str


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
    domain = data.domain.strip().lower().rstrip(".")
    if not domain:
        raise HTTPException(400, "Domínio inválido")
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute(
                "INSERT INTO blocked_domain (domain, created_by) VALUES (?, ?)",
                (domain, user["username"])
            )
            await db.execute(
                "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
                (user["username"], "block_add", domain)
            )
            await db.commit()
        except aiosqlite.IntegrityError:
            raise HTTPException(409, "Domínio já bloqueado")

    await rebuild_blocks_conf()
    return {"ok": True, "domain": domain}


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
            raise HTTPException(404, "Domínio não encontrado")

    await rebuild_blocks_conf()
    return {"ok": True}
