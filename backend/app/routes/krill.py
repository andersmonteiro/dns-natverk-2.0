"""
Proxy routes para o Krill RPKI CA.
O Krill roda em HTTPS internamente (auto-signed cert), por isso verify=False.
"""
import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional

from ..auth import get_current_user, require_admin
from ..config import settings

router = APIRouter(prefix="/api/krill", tags=["krill"])

KRILL  = settings.krill_url
TOKEN  = settings.krill_auth_token
HDRS   = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


# ── helpers ───────────────────────────────────────────────────────────────────

async def _get(path: str):
    async with httpx.AsyncClient(verify=False, timeout=10) as c:
        r = await c.get(f"{KRILL}/api/v1{path}", headers=HDRS)
        if not r.is_success:
            raise HTTPException(r.status_code, r.text)
        return r.json()

async def _post(path: str, body: dict = None, xml: str = None):
    headers = dict(HDRS)
    if xml is not None:
        headers["Content-Type"] = "application/xml"
    async with httpx.AsyncClient(verify=False, timeout=15) as c:
        if xml is not None:
            r = await c.post(f"{KRILL}/api/v1{path}", content=xml.encode(), headers=headers)
        else:
            r = await c.post(f"{KRILL}/api/v1{path}", json=body or {}, headers=headers)
        if not r.is_success:
            raise HTTPException(r.status_code, r.text)
        try:
            return r.json()
        except Exception:
            return {"ok": True}

async def _delete(path: str, body: dict = None):
    async with httpx.AsyncClient(verify=False, timeout=10) as c:
        r = await c.delete(f"{KRILL}/api/v1{path}", json=body or {}, headers=HDRS)
        if not r.is_success:
            raise HTTPException(r.status_code, r.text)
        try:
            return r.json()
        except Exception:
            return {"ok": True}

async def _get_xml(path: str) -> str:
    async with httpx.AsyncClient(verify=False, timeout=10) as c:
        r = await c.get(f"{KRILL}/api/v1{path}", headers={"Authorization": f"Bearer {TOKEN}"})
        if not r.is_success:
            raise HTTPException(r.status_code, r.text)
        return r.text


# ── status ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def krill_status(user=Depends(get_current_user)):
    try:
        # /authorized funciona no Krill v0.16+ (retorna 200 se token válido)
        async with httpx.AsyncClient(verify=False, timeout=10) as c:
            r = await c.get(f"{KRILL}/api/v1/authorized", headers=HDRS)
            if not r.is_success:
                return {"online": False, "error": f"HTTP {r.status_code}", "cas": []}
        cas_list = await _get("/cas")
        raw_items = cas_list.get("cas", [])
        # Krill may return strings ["natverk"] or objects [{"handle":"natverk",...}]
        handles = []
        for item in raw_items:
            if isinstance(item, dict):
                h = item.get("handle", "")
            else:
                h = str(item)
            if h:
                handles.append(h)
        cas = []
        for h in handles:
            try:
                detail = await _get(f"/cas/{h}")
                raw_parents = detail.get("parents") or {}
                if isinstance(raw_parents, dict):
                    parent = next(iter(raw_parents.keys()), None)
                elif isinstance(raw_parents, list) and raw_parents:
                    p = raw_parents[0]
                    parent = p.get("handle") if isinstance(p, dict) else str(p)
                else:
                    parent = None
                # Extract repo_info as flat string dict (no nested objects)
                raw_repo = detail.get("repo_info") or {}
                repo_data: dict = {}
                if isinstance(raw_repo, dict):
                    for k, v in raw_repo.items():
                        if isinstance(v, (str, int, float)) and v not in ("", None):
                            repo_data[str(k)] = str(v)
                has_repo = bool(repo_data)
                cas.append({"handle": h, "parent": parent, "has_repo": has_repo, "repo_data": repo_data})
            except Exception:
                cas.append({"handle": h, "parent": None, "has_repo": False, "repo_data": {}})
        return {"online": True, "info": {"version": "krill"}, "cas": cas}
    except Exception as e:
        return {"online": False, "error": str(e), "cas": []}


# ── CAs ───────────────────────────────────────────────────────────────────────

@router.get("/cas")
async def list_cas(user=Depends(get_current_user)):
    r = await _get("/cas")
    return r.get("cas", [])


class CreateCA(BaseModel):
    handle: str

@router.post("/cas")
async def create_ca(data: CreateCA, user=Depends(require_admin)):
    return await _post("/cas", {"handle": data.handle})


@router.get("/cas/{ca}")
async def get_ca(ca: str, user=Depends(get_current_user)):
    return await _get(f"/cas/{ca}")


# ── RFC 8183: Parent setup ────────────────────────────────────────────────────

@router.get("/cas/{ca}/child-request")
async def child_request(ca: str, user=Depends(get_current_user)):
    """Retorna o XML de Child Request para enviar ao registro.br."""
    xml = await _get_xml(f"/cas/{ca}/id/child_request.xml")
    return {"xml": xml}


class AddParent(BaseModel):
    handle: str        # ex: "registro-br"
    response_xml: str  # conteúdo do Parent Response XML

@router.post("/cas/{ca}/parent")
async def add_parent(ca: str, data: AddParent, user=Depends(require_admin)):
    """Submete o Parent Response XML recebido do registro.br."""
    return await _post(f"/cas/{ca}/parents", {"handle": data.handle, "contact": data.response_xml})


# ── RFC 8183: Repository setup ────────────────────────────────────────────────

@router.get("/cas/{ca}/repo-request")
async def repo_request(ca: str, user=Depends(get_current_user)):
    """Retorna o XML de Publisher Request para enviar ao registro.br.
    Tenta /repo/request.xml primeiro; fallback para /id/publisher_request.xml
    (disponível mesmo após o repositório já estar configurado).
    """
    for path in (f"/cas/{ca}/repo/request.xml", f"/cas/{ca}/id/publisher_request.xml"):
        try:
            xml = await _get_xml(path)
            if xml and xml.strip():
                return {"xml": xml}
        except Exception:
            continue
    return {"xml": ""}


def _apply_lex(target: dict, lex) -> None:
    """Extrai last_exchange e last_ok de vários formatos possíveis do Krill."""
    if not lex:
        return
    if isinstance(lex, dict):
        ts     = (lex.get("timestamp") or lex.get("at") or lex.get("time")
                  or lex.get("unix_seconds") or "")
        result = str(lex.get("result") or lex.get("status") or "")
        target["last_exchange"] = str(ts)
        target["last_ok"]       = (not result) or ("success" in result.lower()) or (result == "0")
    elif isinstance(lex, str):
        target["last_exchange"] = lex
        target["last_ok"]       = True


def _extract_uri(obj) -> str:
    """Extrai URI de serviço de qualquer estrutura aninhada do Krill v0.16."""
    if not obj:
        return ""
    if isinstance(obj, str):
        return obj
    if isinstance(obj, dict):
        # Krill v0.16: {"tag": "ParentCaContact", "value": {"service_uri": "..."}}
        val = obj.get("value")
        if isinstance(val, dict):
            for k in ("service_uri", "uri", "url"):
                if val.get(k):
                    return str(val[k])
        # Direct fields
        for k in ("service_uri", "uri", "url"):
            if obj.get(k):
                return str(obj[k])
        # Recurse into "contact" sub-key
        if obj.get("contact"):
            return _extract_uri(obj["contact"])
    return ""


def _extract_lex(obj) -> tuple:
    """Retorna (timestamp_str, last_ok) de vários formatos de last_exchange do Krill."""
    if not obj:
        return ("", None)
    if isinstance(obj, str):
        return (obj, True)
    if isinstance(obj, dict):
        # Krill v0.16: {"result": "Success", "time": 1234567890}
        # ou {"timestamp": ..., "result": ...}
        ts = (obj.get("time") or obj.get("timestamp") or obj.get("at")
              or obj.get("unix_seconds") or "")
        result = str(obj.get("result") or obj.get("status") or "")
        ok = (not result) or result.lower() in ("success", "ok", "0", "true")
        return (str(ts), ok)
    return ("", None)


@router.get("/cas/{ca}/raw-debug")
async def ca_raw_debug(ca: str, user=Depends(get_current_user)):
    """Dump bruto do Krill para debug — retorna os endpoints usados pelo /details."""
    out: dict = {}
    for path in (f"/cas/{ca}", f"/cas/{ca}/parents", f"/cas/{ca}/repo"):
        try:
            out[path] = await _get(path)
        except Exception as e:
            out[path] = {"error": str(e)}
    return out


def _parse_parents(raw) -> list:
    """Normaliza parents do Krill — aceita dict ou lista."""
    result = []
    if isinstance(raw, dict):
        for handle, info in raw.items():
            p = {"handle": str(handle), "contact": _extract_uri(info),
                 "last_exchange": "", "last_ok": None}
            # last_exchange pode estar dentro de info diretamente
            if isinstance(info, dict):
                for lex_key in ("last_exchange", "last_cms_msg", "last_response"):
                    if info.get(lex_key) is not None:
                        ts, ok = _extract_lex(info[lex_key])
                        p["last_exchange"] = ts
                        p["last_ok"]       = ok
                        break
            result.append(p)
    elif isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            handle = str(item.get("handle", item.get("name", "")))
            if not handle:
                continue
            p = {"handle": handle, "contact": _extract_uri(item),
                 "last_exchange": "", "last_ok": None}
            for lex_key in ("last_exchange", "last_cms_msg", "last_response"):
                if item.get(lex_key) is not None:
                    ts, ok = _extract_lex(item[lex_key])
                    p["last_exchange"] = ts
                    p["last_ok"]       = ok
                    break
            result.append(p)
    return result


def _str_list(v) -> list:
    """Converte string CSV ou lista para lista de strings."""
    if not v:
        return []
    if isinstance(v, list):
        return [str(x) for x in v if x]
    # "138.99.108.0/22, 177.130.48.0/20" → [...]
    return [x.strip() for x in str(v).split(",") if x.strip()]


@router.get("/cas/{ca}/details")
async def ca_details(ca: str, user=Depends(get_current_user)):
    """Detalhes da CA (parents, recursos, repo) como primitivos — sem objetos aninhados."""
    try:
        detail = await _get(f"/cas/{ca}")

        # ── parents ──────────────────────────────────────────────────────────
        raw_parents = detail.get("parents") or {}
        parents = _parse_parents(raw_parents)

        # Enriquece com /cas/{ca}/parents — pode ser dict ou lista
        try:
            pd = await _get(f"/cas/{ca}/parents")
            extra = _parse_parents(pd)
            # Merge: atualiza last_exchange e contact que estejam vazios
            by_handle = {ep["handle"]: ep for ep in extra}
            for p in parents:
                ep = by_handle.get(p["handle"]) or {}
                if ep.get("last_exchange") and not p["last_exchange"]:
                    p["last_exchange"] = ep["last_exchange"]
                    p["last_ok"]       = ep["last_ok"]
                if ep.get("contact") and not p["contact"]:
                    p["contact"] = ep["contact"]
            # Se parents estava vazio, usa o resultado de /parents diretamente
            if not parents and extra:
                parents = extra
        except Exception:
            pass

        # Tenta /parents/{handle} individualmente para last_exchange
        for p in parents:
            if p.get("last_exchange"):
                continue
            try:
                ep = await _get(f"/cas/{ca}/parents/{p['handle']}")
                if isinstance(ep, dict):
                    for lex_key in ("last_exchange", "last_cms_msg", "last_response"):
                        if ep.get(lex_key) is not None:
                            ts, ok = _extract_lex(ep[lex_key])
                            p["last_exchange"] = ts
                            p["last_ok"]       = ok
                            break
                    c = _extract_uri(ep)
                    if c and not p["contact"]:
                        p["contact"] = c
            except Exception:
                pass

        # ── resources ────────────────────────────────────────────────────────
        raw_res = detail.get("resources") or {}
        resources: dict = {"asn": "", "ipv4": [], "ipv6": []}
        if isinstance(raw_res, dict):
            resources["asn"]  = str(raw_res.get("asn", raw_res.get("AS", "")) or "")
            resources["ipv4"] = _str_list(raw_res.get("ipv4", raw_res.get("v4", [])))
            resources["ipv6"] = _str_list(raw_res.get("ipv6", raw_res.get("v6", [])))

        # ── repo ─────────────────────────────────────────────────────────────
        # Campos permitidos para exibição (sem public_key, id_cert, etc.)
        REPO_SAFE_KEYS = {
            "service_uri", "sia_base", "base_uri",
            "rpki_notify", "rrdp_notification_uri",
            "publisher_handle",
        }

        def _safe_repo_from(obj: dict) -> dict:
            """Extrai campos seguros (sem chaves gigantes) de um objeto de repo."""
            out: dict = {}
            for k, v in obj.items():
                if k in REPO_SAFE_KEYS and isinstance(v, (str, int)) and v:
                    out[str(k)] = str(v)
                elif isinstance(v, dict):
                    # desce um nível (ex: "value": {"service_uri": ...})
                    merged = _safe_repo_from(v)
                    for mk, mv in merged.items():
                        if mk not in out:
                            out[mk] = mv
            return out

        repo: dict = {}
        raw_repo = detail.get("repo_info") or {}
        if isinstance(raw_repo, dict):
            repo.update(_safe_repo_from(raw_repo))

        # Enrich with /repo endpoint
        try:
            rd = await _get(f"/cas/{ca}/repo")
            if isinstance(rd, dict):
                repo.update(_safe_repo_from(rd))
                # last_exchange — varre todos os níveis do dict recursivamente
                def _find_lex(obj, depth=0):
                    if depth > 4 or not isinstance(obj, dict):
                        return
                    for lex_key in ("last_exchange", "last_cms_msg", "last_response"):
                        raw_lex = obj.get(lex_key)
                        if raw_lex is not None:
                            ts, ok = _extract_lex(raw_lex)
                            if ts:
                                repo["last_exchange"] = ts
                                repo["last_ok"]       = ok
                            return
                    for v in obj.values():
                        if isinstance(v, dict):
                            _find_lex(v, depth + 1)
                            if repo.get("last_exchange"):
                                return
                _find_lex(rd)
        except Exception:
            pass

        # Fallback: last_exchange do repo pode estar no detail da CA
        if not repo.get("last_exchange"):
            for field in ("repo_last_exchange", "last_exchange", "repo_status"):
                raw_lex = detail.get(field)
                if raw_lex is not None:
                    ts, ok = _extract_lex(raw_lex)
                    if ts:
                        repo["last_exchange"] = ts
                        repo["last_ok"]       = ok
                    break

        return {
            "handle":    str(detail.get("handle", ca)),
            "parents":   parents,
            "resources": resources,
            "repo":      repo,
        }
    except Exception as e:
        return {"handle": ca, "parents": [], "resources": {}, "repo": {}, "error": str(e)}


class ConfigureRepo(BaseModel):
    response_xml: str  # conteúdo do Repository Response XML

@router.post("/cas/{ca}/repo")
async def configure_repo(ca: str, data: ConfigureRepo, user=Depends(require_admin)):
    """Submete o Repository Response XML recebido do registro.br."""
    return await _post(f"/cas/{ca}/repo", xml=data.response_xml)


@router.get("/cas/{ca}/repo-contact")
async def repo_contact(ca: str, user=Depends(get_current_user)):
    """Retorna os dados do repositório configurado no Krill."""
    try:
        return await _get(f"/cas/{ca}/repo")
    except Exception as e:
        return {"error": str(e)}


# ── ROAs ──────────────────────────────────────────────────────────────────────

@router.get("/cas/{ca}/roas")
async def list_roas(ca: str, user=Depends(get_current_user)):
    try:
        data = await _get(f"/cas/{ca}/routes")
        if isinstance(data, list):
            roas = data
        else:
            roas = data.get("authorized") or data.get("roas") or []
        # Ensure each ROA has primitive fields only
        result = []
        for r in roas:
            if isinstance(r, dict):
                result.append({
                    "asn":        str(r.get("asn", "")),
                    "prefix":     str(r.get("prefix", "")),
                    "max_length": int(r["max_length"]) if r.get("max_length") is not None else None,
                })
        return {"roas": result}
    except Exception as e:
        return {"roas": [], "error": str(e)}


class ROA(BaseModel):
    asn: str         # ex: "AS64500"
    prefix: str      # ex: "177.130.48.0/22"
    max_length: Optional[int] = None

def _asn_int(asn: str) -> int:
    """Converte 'AS52747' ou '52747' para inteiro (Krill v0.16 exige u32)."""
    return int(str(asn).upper().replace("AS", "").strip())

@router.post("/cas/{ca}/roas")
async def add_roa(ca: str, roa: ROA, user=Depends(require_admin)):
    max_len = roa.max_length or int(roa.prefix.split("/")[1])
    entry = {"asn": _asn_int(roa.asn), "prefix": roa.prefix, "max_length": max_len}
    return await _post(f"/cas/{ca}/routes", {"added": [entry], "removed": []})


class RemoveROA(BaseModel):
    asn: str
    prefix: str
    max_length: int

@router.delete("/cas/{ca}/roas")
async def remove_roa(ca: str, roa: RemoveROA, user=Depends(require_admin)):
    entry = {"asn": _asn_int(roa.asn), "prefix": roa.prefix, "max_length": roa.max_length}
    return await _post(f"/cas/{ca}/routes", {"added": [], "removed": [entry]})


# ── BGP Analysis ──────────────────────────────────────────────────────────────

@router.get("/cas/{ca}/bgp")
async def bgp_analysis(ca: str, user=Depends(get_current_user)):
    try:
        return await _get(f"/cas/{ca}/bgp")
    except Exception as e:
        return {"announcements": [], "error": str(e)}
