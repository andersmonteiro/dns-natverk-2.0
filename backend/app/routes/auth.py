from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
import aiosqlite
from ..auth import verify_password, create_token, get_current_user
from ..db import DB_PATH

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
async def login(form: OAuth2PasswordRequestForm = Depends()):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM users WHERE username = ?", (form.username,))
        user = await cursor.fetchone()

    if not user or not verify_password(form.password, user["password"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    token = create_token({"sub": user["username"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer", "role": user["role"]}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {"username": user["username"], "role": user["role"]}
