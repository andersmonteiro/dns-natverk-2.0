from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from datetime import datetime
import aiosqlite
from ..auth import verify_password, create_token, get_current_user
from ..db import DB_PATH

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
async def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM users WHERE username = ?", (form.username,))
        user = await cursor.fetchone()

    if not user or not verify_password(form.password, user["password"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")

    # Captura IP real — tenta X-Forwarded-For (nginx proxy_add), depois X-Real-IP, depois client direto
    ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or request.headers.get("x-real-ip", "").strip()
        or (request.client.host if request.client else "")
    )
    ua = request.headers.get("user-agent", "")
    now = datetime.utcnow().isoformat()

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE users SET last_login_at=?, last_login_ip=?, last_login_ua=? WHERE username=?",
            (now, ip, ua, form.username)
        )
        await db.commit()

    token = create_token({"sub": user["username"], "role": user["role"]})
    return {"access_token": token, "token_type": "bearer", "role": user["role"]}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return {"username": user["username"], "role": user["role"]}
