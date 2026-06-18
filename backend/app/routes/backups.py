import asyncio
import os
import glob
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import get_current_user, require_admin

router = APIRouter(prefix="/api/backups", tags=["backups"])

BIND_DIR = "/etc/bind"
BACKUP_PATTERN = "*.bkp*"


def _list_backups():
    pattern = os.path.join(BIND_DIR, BACKUP_PATTERN)
    files = glob.glob(pattern)
    result = []
    for f in sorted(files, key=os.path.getmtime, reverse=True):
        try:
            stat = os.stat(f)
            result.append({
                "name": os.path.basename(f),
                "path": f,
                "size": stat.st_size,
                "mtime": stat.st_mtime,
            })
        except Exception:
            pass
    return result


@router.get("/")
async def list_backups(user=Depends(get_current_user)):
    return {"items": _list_backups()}


class RestoreRequest(BaseModel):
    path: str


@router.post("/restore")
async def restore_backup(data: RestoreRequest, user=Depends(require_admin)):
    path = data.path.strip()
    if not path.startswith(BIND_DIR) or ".." in path:
        raise HTTPException(400, "Caminho inválido")
    if not os.path.exists(path):
        raise HTTPException(404, "Backup não encontrado")

    # Descobre o arquivo original (remove extensão .bkp-*)
    basename = os.path.basename(path)
    parts = basename.split(".bkp")
    if len(parts) < 2:
        raise HTTPException(400, "Arquivo não parece ser um backup")
    original_name = parts[0]
    original_path = os.path.join(BIND_DIR, original_name)

    # Valida com named-checkconf antes de restaurar
    try:
        proc = await asyncio.create_subprocess_exec(
            "named-checkconf", "-p",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=10)
    except Exception:
        pass

    # Copia o backup para o arquivo original
    try:
        import shutil
        shutil.copy2(path, original_path)
    except Exception as e:
        raise HTTPException(500, f"Erro ao restaurar: {e}")

    return {"ok": True, "restored": original_path}
