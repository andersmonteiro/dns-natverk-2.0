import asyncio
from fastapi import APIRouter, Depends
from ..auth import require_admin
from ..config import settings

router = APIRouter(prefix="/api/ops", tags=["ops"])


async def _run(cmd: list, timeout: int = 15) -> dict:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        ok = proc.returncode == 0
        output = (stdout + stderr).decode(errors="replace").strip()
        return {"ok": ok, "output": output}
    except asyncio.TimeoutError:
        return {"ok": False, "output": "Timeout"}
    except FileNotFoundError as e:
        return {"ok": False, "output": f"Comando não encontrado: {e}"}
    except Exception as e:
        return {"ok": False, "output": str(e)}


def _rndc_cmd(subcmd: str) -> list:
    """Monta o comando rndc apontando para o container bind."""
    return [
        settings.rndc_path,
        "-s", settings.rndc_host,
        "-p", str(settings.rndc_port),
        "-k", settings.rndc_key_file,
    ] + subcmd.split()


async def _rndc(subcmd: str, timeout: int = 10) -> dict:
    res = await _run(_rndc_cmd(subcmd), timeout)
    if not res["ok"] and not res["output"]:
        res["output"] = "rndc falhou sem mensagem de erro"
    return res


# ── rndc ──────────────────────────────────────────────────────────────────────

@router.post("/rndc/flush")
async def rndc_flush(user=Depends(require_admin)):
    res = await _rndc("flush")
    if not res["output"]:
        res["output"] = "Cache limpo com sucesso" if res["ok"] else "Falha ao executar flush"
    return res


@router.post("/rndc/stats")
async def rndc_stats(user=Depends(require_admin)):
    res = await _rndc("stats")
    if not res["output"]:
        res["output"] = "Estatísticas gravadas em /var/cache/bind/named.stats" if res["ok"] else "Falha"
    return res


@router.post("/rndc/reconfig")
async def rndc_reconfig(user=Depends(require_admin)):
    res = await _rndc("reconfig")
    if not res["output"]:
        res["output"] = "Configuração recarregada com sucesso" if res["ok"] else "Falha"
    return res


@router.post("/rndc/reload")
async def rndc_reload(user=Depends(require_admin)):
    res = await _rndc("reload")
    if not res["output"]:
        res["output"] = "Zonas recarregadas com sucesso" if res["ok"] else "Falha"
    return res


@router.post("/rndc/querylog")
async def rndc_querylog(user=Depends(require_admin)):
    res = await _rndc("querylog on")
    if not res["output"]:
        res["output"] = "Query log ativado" if res["ok"] else "Falha"
    return res


# ── named-checkconf ───────────────────────────────────────────────────────────

@router.post("/checkconf")
async def checkconf(user=Depends(require_admin)):
    res = await _run(["named-checkconf", f"{settings.bind_conf_dir}/named.conf"])
    if res["ok"] and not res["output"]:
        res["output"] = "OK — nenhum erro de configuração encontrado"
    return res


# ── restart BIND (rndc stop → Docker restart policy sobe de novo) ─────────────

@router.post("/bind/restart")
async def bind_restart(user=Depends(require_admin)):
    """Para o BIND via rndc stop.
    O Docker restart: unless-stopped sobe o container automaticamente."""
    res = await _rndc("stop", timeout=15)
    if res["ok"] or "rndc: connection refused" not in res.get("output", ""):
        return {"ok": True, "output": "BIND reiniciando (aguarde 2-3 segundos)…"}
    return {"ok": False, "output": res["output"]}
