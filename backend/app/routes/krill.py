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
    """Retorna o XML de Publisher Request para enviar ao registro.br."""
    xml = await _get_xml(f"/cas/{ca}/repo/request.xml")
    return {"xml": xml}


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

@router.post("/cas/{ca}/roas")
async def add_roa(ca: str, roa: ROA, user=Depends(require_admin)):
    max_len = roa.max_length or int(roa.prefix.split("/")[1])
    entry = {"asn": roa.asn, "prefix": roa.prefix, "max_length": max_len}
    return await _post(f"/cas/{ca}/routes", {"added": [entry], "removed": []})


class RemoveROA(BaseModel):
    asn: str
    prefix: str
    max_length: int

@router.delete("/cas/{ca}/roas")
async def remove_roa(ca: str, roa: RemoveROA, user=Depends(require_admin)):
    entry = {"asn": roa.asn, "prefix": roa.prefix, "max_length": roa.max_length}
    return await _post(f"/cas/{ca}/routes", {"added": [], "removed": [entry]})


# ── BGP Analysis ──────────────────────────────────────────────────────────────

@router.get("/cas/{ca}/bgp")
async def bgp_analysis(ca: str, user=Depends(get_current_user)):
    try:
        return await _get(f"/cas/{ca}/bgp")
    except Exception as e:
        return {"announcements": [], "error": str(e)}
