import os
from fastapi import APIRouter, Depends, Query
from ..auth import get_current_user
from ..config import settings

router = APIRouter(prefix="/api/bindlog", tags=["bindlog"])


@router.get("/tail")
async def tail_log(lines: int = Query(100), user=Depends(get_current_user)):
    path = settings.bind_log_path
    if not os.path.exists(path):
        return {"lines": [], "exists": False}

    try:
        # Lê as últimas N linhas eficientemente
        with open(path, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            chunk = min(size, lines * 200)
            f.seek(max(0, size - chunk))
            data = f.read().decode(errors="replace")

        all_lines = data.splitlines()
        last_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {"lines": last_lines, "exists": True, "path": path}
    except Exception as e:
        return {"lines": [], "exists": True, "error": str(e)}
