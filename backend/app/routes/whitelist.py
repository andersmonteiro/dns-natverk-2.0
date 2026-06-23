from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List
import aiosqlite
from ..auth import get_current_user, require_admin
from ..db import DB_PATH
from ..domain_utils import WHITELIST_DEFAULTS
from .blocks import rebuild_blocks_conf

router = APIRouter(prefix="/api/whitelist", tags=["whitelist"])


class DomainIn(BaseModel):
    domain: str
    reason: str = ""


@router.get("/")
async def list_whitelist(user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT domain, reason, created_at, created_by, source
               FROM whitelist_domain
               ORDER BY CASE WHEN source = 'manual' THEN 0 ELSE 1 END, created_at DESC"""
        )
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.post("/")
async def add_whitelist(data: DomainIn, user=Depends(require_admin)):
    domain = data.domain.strip().lower()
    if not domain:
        raise HTTPException(400, "Domínio inválido")
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute(
                "INSERT INTO whitelist_domain (domain, reason, created_by, source) VALUES (?, ?, ?, 'manual')",
                (domain, data.reason.strip(), user["username"])
            )
            await db.execute(
                "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
                (user["username"], "whitelist_add", domain)
            )
            await db.commit()
        except aiosqlite.IntegrityError:
            raise HTTPException(409, "Domínio já está na whitelist")
    await rebuild_blocks_conf()
    return {"ok": True, "domain": domain}


@router.get("/defaults")
async def get_defaults(user=Depends(get_current_user)):
    """Retorna a lista de entradas recomendadas para a whitelist."""
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT domain FROM whitelist_domain")
        existing = {r[0] for r in await cur.fetchall()}
    return [
        {"domain": d, "reason": r, "already_added": d in existing}
        for d, r in WHITELIST_DEFAULTS
    ]


class SeedIn(BaseModel):
    domains: List[str]


@router.post("/seed")
async def seed_whitelist(data: SeedIn, user=Depends(require_admin)):
    """Insere em lote as entradas padrão selecionadas."""
    defaults_map = {d: r for d, r in WHITELIST_DEFAULTS}
    inserted = 0
    skipped = 0
    async with aiosqlite.connect(DB_PATH) as db:
        for domain in data.domains:
            domain = domain.strip().lower()
            reason = defaults_map.get(domain, "Padrão do sistema")
            try:
                await db.execute(
                    "INSERT INTO whitelist_domain (domain, reason, created_by, source) VALUES (?, ?, ?, 'default')",
                    (domain, reason, user["username"])
                )
                inserted += 1
            except Exception:
                skipped += 1
        await db.execute(
            "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
            (user["username"], "whitelist_seed", f"inserted={inserted} skipped={skipped}")
        )
        await db.commit()
    await rebuild_blocks_conf()
    return {"ok": True, "inserted": inserted, "skipped": skipped}


@router.post("/bulk-remove")
async def bulk_remove_whitelist(data: SeedIn, user=Depends(require_admin)):
    removed = 0
    async with aiosqlite.connect(DB_PATH) as db:
        for domain in data.domains:
            cursor = await db.execute("DELETE FROM whitelist_domain WHERE domain = ?", (domain,))
            removed += cursor.rowcount
        await db.execute(
            "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
            (user["username"], "whitelist_bulk_remove", f"count={removed}")
        )
        await db.commit()
    await rebuild_blocks_conf()
    return {"ok": True, "removed": removed}


@router.delete("/{domain}")
async def remove_whitelist(domain: str, user=Depends(require_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM whitelist_domain WHERE domain = ?", (domain,))
        await db.execute(
            "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
            (user["username"], "whitelist_remove", domain)
        )
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(404, "Domínio não encontrado")
    await rebuild_blocks_conf()
    return {"ok": True}
