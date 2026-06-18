from fastapi import APIRouter, Depends, Query
import aiosqlite
from ..auth import get_current_user
from ..db import DB_PATH

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("/")
async def list_audit(
    q: str = Query(""),
    action: str = Query(""),
    username: str = Query(""),
    limit: int = Query(50),
    offset: int = Query(0),
    user=Depends(get_current_user)
):
    conditions = []
    params = []

    if q:
        conditions.append("(action LIKE ? OR detail LIKE ?)")
        params += [f"%{q}%", f"%{q}%"]
    if action:
        conditions.append("action LIKE ?")
        params.append(f"%{action}%")
    if username:
        conditions.append("username LIKE ?")
        params.append(f"%{username}%")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            f"SELECT COUNT(*) as total FROM audit_log {where}", params
        )
        total = (await cursor.fetchone())["total"]

        cursor = await db.execute(
            f"""SELECT id, ts, username, action, detail
                FROM audit_log {where}
                ORDER BY id DESC LIMIT ? OFFSET ?""",
            params + [limit, offset]
        )
        rows = await cursor.fetchall()

    return {
        "total": total,
        "items": [dict(r) for r in rows],
        "limit": limit,
        "offset": offset,
    }
