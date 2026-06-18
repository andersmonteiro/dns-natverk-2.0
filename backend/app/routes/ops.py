import asyncio
from fastapi import APIRouter, Depends
from ..auth import require_admin
from ..config import settings

router = APIRouter(prefix="/api/ops", tags=["ops"])



async def _run(cmd: list, timeout: int = 15) -> dict:
    """Executa um comando e retorna {ok, output}."""
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


async def _rndc(subcmd: str, timeout: int = 10) -> dict:
    """Executa rndc apontando para o host (onde o BIND está rodando)."""
    cmd = [settings.rndc_path, "-s", settings.rndc_host] + subcmd.split()
    res = await _run(cmd, timeout)
    if not res["ok"] and not res["output"]:
        res["output"] = "rndc falhou sem mensagem de erro"
    return res


async def _nsenter(host_cmd: list, timeout: int = 20) -> dict:
    """Executa um comando no namespace do host via nsenter."""
    cmd = ["nsenter", "-t", "1", "-m", "-u", "-i", "-n", "-p", "--"] + host_cmd
    return await _run(cmd, timeout)


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


@router.post("/rndc/querylog")
async def rndc_querylog(user=Depends(require_admin)):
    res = await _rndc("querylog on")
    if not res["output"]:
        res["output"] = "Query log ativado" if res["ok"] else "Falha"
    return res


# ── named-checkconf via host ───────────────────────────────────────────────────

@router.post("/checkconf")
async def checkconf(user=Depends(require_admin)):
    # Com /var/cache/bind montado e network_mode host, roda direto no container
    res = await _run(["named-checkconf", "/etc/bind/named.conf"])
    if res["ok"] and not res["output"]:
        res["output"] = "OK — nenhum erro de configuração encontrado"
    return res


# ── restart BIND ──────────────────────────────────────────────────────────────

@router.post("/bind/restart")
async def bind_restart(user=Depends(require_admin)):
    """Reinicia o BIND no host via nsenter → systemctl.
    Debian: serviço é 'bind9'. Fallback para 'named' (RHEL/Kali)."""
    errors = []
    for service in ["bind9", "named"]:
        res = await _nsenter(["systemctl", "restart", service], timeout=30)
        if res["ok"]:
            return {"ok": True, "output": f"Serviço '{service}' reiniciado com sucesso"}
        errors.append(f"systemctl {service}: {res['output'] or 'falhou'}")

    return {
        "ok": False,
        "output": "Não foi possível reiniciar o BIND.\n" + "\n".join(errors)
    }
