from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import aiosqlite
from ..auth import get_current_user, require_admin
from ..db import DB_PATH

router = APIRouter(prefix="/api/blocks", tags=["blocks"])


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
    domain = data.domain.strip().lower()
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
    return {"ok": True, "domain": domain}


@router.delete("/{domain}")
async def remove_block(domain: str, user=Depends(require_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM blocked_domain WHERE domain = ?", (domain,))
        await db.execute(
            "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
            (user["username"], "block_remove", domain)
        )
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(404, "Domínio não encontrado")
    return {"ok": True}
