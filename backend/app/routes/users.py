from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import aiosqlite
from ..auth import get_current_user, require_admin, hash_password
from ..db import DB_PATH

router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "viewer"


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class RoleChange(BaseModel):
    role: str


@router.get("/")
async def list_users(user=Depends(require_admin)):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, username, role, created_at FROM users ORDER BY id"
        )
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.post("/")
async def create_user(data: UserCreate, user=Depends(require_admin)):
    if len(data.password) < 6:
        raise HTTPException(400, "Senha deve ter ao menos 6 caracteres")
    hashed = hash_password(data.password)
    async with aiosqlite.connect(DB_PATH) as db:
        try:
            await db.execute(
                "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
                (data.username.strip(), hashed, data.role)
            )
            await db.execute(
                "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
                (user["username"], "user_create", data.username)
            )
            await db.commit()
        except aiosqlite.IntegrityError:
            raise HTTPException(409, "Usuário já existe")
    return {"ok": True}


@router.delete("/{user_id}")
async def delete_user(user_id: int, user=Depends(require_admin)):
    if user_id == user["id"]:
        raise HTTPException(400, "Não é possível excluir a si mesmo")
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("SELECT username FROM users WHERE id = ?", (user_id,))
        target = await cursor.fetchone()
        if not target:
            raise HTTPException(404, "Usuário não encontrado")
        await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        await db.execute(
            "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
            (user["username"], "user_delete", target[0])
        )
        await db.commit()
    return {"ok": True}


@router.put("/{user_id}/role")
async def change_role(user_id: int, data: RoleChange, user=Depends(require_admin)):
    if user_id == user["id"]:
        raise HTTPException(400, "Não é possível alterar o próprio papel")
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE users SET role = ? WHERE id = ?", (data.role, user_id))
        await db.execute(
            "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
            (user["username"], "user_role_change", f"id={user_id} role={data.role}")
        )
        await db.commit()
    return {"ok": True}


@router.post("/me/password")
async def change_password(data: PasswordChange, user=Depends(get_current_user)):
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"])
    if not pwd.verify(data.current_password, user["password"]):
        raise HTTPException(400, "Senha atual incorreta")
    if len(data.new_password) < 8:
        raise HTTPException(400, "Nova senha deve ter ao menos 8 caracteres")
    hashed = hash_password(data.new_password)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("UPDATE users SET password = ? WHERE id = ?", (hashed, user["id"]))
        await db.execute(
            "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
            (user["username"], "password_change", "self")
        )
        await db.commit()
    return {"ok": True}
