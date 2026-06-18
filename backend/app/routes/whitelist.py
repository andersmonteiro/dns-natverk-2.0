from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import aiosqlite
from ..auth import get_current_user, require_admin
from ..db import DB_PATH

router = APIRouter(prefix="/api/whitelist", tags=["whitelist"])


class DomainIn(BaseModel):
    domain: str
    reason: str = ""


@router.get("/")
async def list_whitelist(user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT domain, reason, created_at, created_by FROM whitelist_domain ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.post("/")
async def add_whitelist(data: DomainIn, user=Depends(get_current_user)):
    domain = data.domain.strip().lower()
    if not domain:
        raise HTTPException(400, "Domínio inválido")
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute(
                "INSERT INTO whitelist_domain (domain, reason, created_by) VALUES (?, ?, ?)",
                (domain, data.reason.strip(), user["username"])
            )
            await db.execute(
                "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
                (user["username"], "whitelist_add", domain)
            )
            await db.commit()
        except aiosqlite.IntegrityError:
            raise HTTPException(409, "Domínio já está na whitelist")
    return {"ok": True, "domain": domain}


@router.delete("/{domain}")
async def remove_whitelist(domain: str, user=Depends(get_current_user)):
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM whitelist_domain WHERE domain = ?", (domain,))
        await db.execute(
            "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
            (user["username"], "whitelist_remove", domain)
        )
        await db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(404, "Domínio não encontrado")
    return {"ok": True}
