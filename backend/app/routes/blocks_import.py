"""
Importação em lote de domínios bloqueados a partir de arquivos .xlsx e .pdf.
Lógica portada do script dns-bloqueios/gera_bloqueios.py.
"""
import re
import io
from typing import List

import aiosqlite
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..auth import require_admin
from ..db import DB_PATH
from ..domain_utils import normalizar, dominio_valido, is_tld_protegido, is_whitelisted, DOMAIN_RE
from .blocks import rebuild_blocks_conf

router = APIRouter(prefix="/api/blocks", tags=["blocks-import"])

# ── Regex ────────────────────────────────────────────────────────────────────

DOMINIO_RE = re.compile(r'^([a-z0-9][a-z0-9\-]{0,62})(\.[a-z0-9\-]{1,63})+$', re.IGNORECASE)

# TLDs institucionais que nunca devem ser bloqueados
TLD_WHITELIST_RE = re.compile(
    r'\.(gov\.br|jus\.br|leg\.br|mil\.br|edu\.br|mp\.br|def\.br|'
    r'tc\.br|trt\.br|tse\.br|anatel\.gov\.br|mj\.gov\.br|pf\.gov\.br)$',
    re.IGNORECASE,
)

# Marcadores de início de seção de domínios nos PDFs da Anatel
MARCADORES_RE = re.compile(
    r'DOM[ÍI]NIOS?\s+(J[ÁA]\s+)?BLOQUEADOS?'
    r'|Tabela\s*[-–]\s*Anexo'
    r'|URL\s*/\s*Endere[çc]o\s+IP'
    r'|IP\s+Host\s+Ad+ress'
    r'|endere[çc]os?\s+eletr[oô]nicos?\s+a\s+ser'
    r'|lista\s+de\s+dom[íi]nios'
    r'|DNS\s+novos',
    re.IGNORECASE,
)


def _dominio_valido(d: str) -> bool:
    """Valida domínio e descarta TLDs institucionais."""
    d = d.strip().rstrip('.')
    if not d or len(d) > 253:
        return False
    if TLD_WHITELIST_RE.search(d):
        return False
    parts = d.split('.')
    return len(parts) >= 2 and all(len(p) > 0 for p in parts)


# ── Extratores ───────────────────────────────────────────────────────────────

def _extrair_de_pdf(contents: bytes) -> set:
    try:
        import pdfplumber
    except ImportError:
        raise HTTPException(500, "pdfplumber não está instalado no servidor")

    dominios: set = set()
    dentro = False

    with pdfplumber.open(io.BytesIO(contents)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for linha in text.splitlines():
                linha = linha.strip()
                if MARCADORES_RE.search(linha):
                    dentro = True
                    continue
                if not dentro:
                    continue
                for token in linha.split():
                    token = token.strip('-').strip('.').lower()
                    if DOMINIO_RE.match(token) and _dominio_valido(token):
                        dominios.add(token)

    # Fallback: analisa tudo se nenhum marcador encontrado
    if not dominios:
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for page in pdf.pages:
                text = page.extract_text() or ""
                for linha in text.splitlines():
                    token = linha.strip().lower()
                    if DOMINIO_RE.match(token) and _dominio_valido(token):
                        dominios.add(token)

    return dominios


def _extrair_de_xlsx(contents: bytes) -> set:
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(500, "openpyxl não está instalado no servidor")

    dominios: set = set()
    wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)

    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))

        # Encontra a linha de início (onde aparece "Bloqueio")
        inicio = None
        for i, row in enumerate(rows):
            row_str = ' '.join(str(c) for c in row if c is not None)
            if re.search(r'bloqueio', row_str, re.IGNORECASE) and inicio is None:
                inicio = i + 1
                break
        if inicio is None:
            inicio = 11  # fallback padrão da planilha Anatel

        for i, row in enumerate(rows):
            if i < inicio or not row or row[0] is None:
                continue
            val = str(row[0]).strip().lower()
            if DOMINIO_RE.match(val) and _dominio_valido(val):
                dominios.add(val)

    wb.close()
    return dominios


def _extrair_dominios(filename: str, contents: bytes) -> tuple[set, str | None]:
    """Retorna (dominios, erro_ou_None)."""
    name = filename.lower()
    try:
        if name.endswith('.pdf'):
            return _extrair_de_pdf(contents), None
        elif name.endswith(('.xlsx', '.xls')):
            return _extrair_de_xlsx(contents), None
        else:
            return set(), f"Formato não suportado: {filename} (use .pdf ou .xlsx)"
    except HTTPException:
        raise
    except Exception as e:
        return set(), f"Erro ao processar {filename}: {e}"


# ── Schemas ──────────────────────────────────────────────────────────────────

class ApplyPayload(BaseModel):
    domains: List[str]
    source: str = "import"


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/import/preview")
async def import_preview(
    files: List[UploadFile] = File(...),
    user=Depends(require_admin),
):
    """
    Processa um ou mais arquivos (.xlsx/.pdf), extrai domínios e retorna
    uma análise completa sem gravar nada no banco.
    """
    if not files:
        raise HTTPException(400, "Nenhum arquivo enviado")

    found: set = set()
    file_names: list = []
    errors: list = []

    for f in files:
        contents = await f.read()
        fname = f.filename or "arquivo"
        file_names.append(fname)
        dominios, erro = _extrair_dominios(fname, contents)
        found.update(dominios)
        if erro:
            errors.append(erro)

    if not found and errors:
        raise HTTPException(422, "; ".join(errors))

    # Carrega blocklist e whitelist existentes
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT domain FROM blocked_domain")
        existing = {r[0] for r in await cur.fetchall()}

        cur = await db.execute("SELECT domain FROM whitelist_domain")
        whitelist = {r[0] for r in await cur.fetchall()}

    already_blocked = found & existing
    # Whitelist com suffix matching + TLD protection
    wl_hit = {d for d in found if is_whitelisted(d, whitelist) or is_tld_protegido(d)}
    new_domains = sorted(found - existing - wl_hit)

    return {
        "files": file_names,
        "errors": errors,
        "found": len(found),
        "already_blocked": len(already_blocked),
        "whitelisted": len(wl_hit),
        "new": len(new_domains),
        "sample": new_domains[:100],
        "domains": new_domains,
    }


@router.post("/import/apply")
async def import_apply(payload: ApplyPayload, user=Depends(require_admin)):
    """Insere os domínios em massa e reconstrói o named.conf.bloqueios."""
    if not payload.domains:
        raise HTTPException(400, "Lista de domínios vazia")

    source = (payload.source or "import")[:120]
    inserted = 0
    skipped = 0

    # Revalida whitelist no momento do apply (pode ter mudado desde o preview)
    async with aiosqlite.connect(DB_PATH) as db:
        cur = await db.execute("SELECT domain FROM whitelist_domain")
        whitelist = {r[0] for r in await cur.fetchall()}

    async with aiosqlite.connect(DB_PATH) as db:
        for domain in payload.domains:
            domain = normalizar(domain)
            if not domain or not dominio_valido(domain):
                skipped += 1
                continue
            if is_tld_protegido(domain) or is_whitelisted(domain, whitelist):
                skipped += 1
                continue
            try:
                await db.execute(
                    "INSERT INTO blocked_domain (domain, created_by, source) VALUES (?, ?, ?)",
                    (domain, user["username"], source),
                )
                inserted += 1
            except Exception:
                skipped += 1  # UNIQUE constraint — já existe

        await db.execute(
            "INSERT INTO audit_log (username, action, detail) VALUES (?, ?, ?)",
            (user["username"], "block_import",
             f"source={source} inserted={inserted} skipped={skipped}"),
        )
        await db.commit()

    await rebuild_blocks_conf()

    return {
        "ok": True,
        "inserted": inserted,
        "skipped": skipped,
        "total": len(payload.domains),
    }
