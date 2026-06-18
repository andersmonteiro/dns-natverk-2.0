import asyncio
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import get_current_user

router = APIRouter(prefix="/api/tools", tags=["tools"])


async def _run(cmd: list, timeout: int = 30) -> dict:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        output = (stdout + stderr).decode(errors="replace").strip()
        return {"ok": proc.returncode == 0, "output": output}
    except asyncio.TimeoutError:
        return {"ok": False, "output": "Timeout"}
    except FileNotFoundError as e:
        return {"ok": False, "output": f"Comando não encontrado: {e}"}
    except Exception as e:
        return {"ok": False, "output": str(e)}


async def _host_net(cmd: list, timeout: int = 30) -> dict:
    """Executa no namespace de rede do host via nsenter -n.
    Necessário para ping/traceroute/mtr mostrarem a rota real do servidor."""
    return await _run(["nsenter", "-t", "1", "-n", "--"] + cmd, timeout)


def _validate_host(host: str) -> str:
    host = host.strip()
    if not host or not re.match(r'^[a-zA-Z0-9._\-]{1,253}$', host):
        raise HTTPException(400, "Host inválido")
    return host


class ToolRequest(BaseModel):
    host: str
    rtype: str = ""
    server: str = ""
    count: int = 5
    dnssec: bool = False


@router.post("/nslookup")
async def nslookup(data: ToolRequest, user=Depends(get_current_user)):
    host = _validate_host(data.host)
    cmd = ["nslookup"]
    if data.rtype:
        cmd += [f"-type={data.rtype}"]
    cmd.append(host)
    if data.server:
        cmd.append(_validate_host(data.server))
    return await _run(cmd)


@router.post("/ping")
async def ping(data: ToolRequest, user=Depends(get_current_user)):
    host = _validate_host(data.host)
    count = max(1, min(data.count, 20))
    return await _host_net(["ping", "-c", str(count), "-W", "2", host], timeout=60)


@router.post("/traceroute")
async def traceroute(data: ToolRequest, user=Depends(get_current_user)):
    host = _validate_host(data.host)
    return await _host_net(["traceroute", "-w", "2", "-m", "30", host], timeout=60)


@router.post("/mtr")
async def mtr(data: ToolRequest, user=Depends(get_current_user)):
    host = _validate_host(data.host)
    return await _host_net(
        ["mtr", "--report", "--report-wide", "--report-cycles", "5", "--no-dns", host],
        timeout=60,
    )


@router.post("/whois")
async def whois(data: ToolRequest, user=Depends(get_current_user)):
    host = _validate_host(data.host)
    return await _run(["whois", host], timeout=15)
