"""
Coletor do querylog do BIND9.
Faz tail do arquivo de log e insere eventos no SQLite em batch.

Inicialização:
  1. Lê arquivos rotacionados (queries.log.4 → .0) que ainda não foram processados
     — rastreados por inode na tabela collector_state
  2. Lê o arquivo atual desde o início, pulando o que já está no banco (ts > max_ts)
  3. Entra em modo tail contínuo

Rotação de log:
  - Detecta rotação por mudança de inode
  - Reabre automaticamente o novo arquivo sem perder eventos
"""
import asyncio
import datetime
import os
import re
import time
import aiosqlite
from pathlib import Path
from collections import deque
from ..config import settings
from ..db import DB_PATH

# Formato do BIND9 querylog — severity (info:) é opcional dependendo da config
LINE_RE = re.compile(
    r"queries:(?:\s+\w+:)?\s+client\s+(?:@\S+\s+)?(?P<ip>[\da-fA-F:\.]+)#\d+\s+"
    r"\((?P<qname>[^)]+)\): query: \S+ IN (?P<qtype>\w+)"
)

# Timestamp no início da linha: DD-Mon-YYYY HH:MM:SS
TS_RE = re.compile(r"^(\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2})")

# Brasil sempre UTC-3 (sem horário de verão desde 2019)
_BRT = datetime.timezone(datetime.timedelta(hours=-3))

BATCH_SIZE       = 500
FLUSH_INTERVAL   = 2.0      # segundos
BUFFER_MAX       = 50_000
CATCHUP_YIELD_EVERY = 2000  # yield ao event loop a cada N linhas

_buffer: deque = deque(maxlen=BUFFER_MAX)
_stats = {
    "events_total": 0,
    "events_dropped": 0,
    "last_flush_ts": None,
    "buffer_size": 0,
    "running": False,
}


def get_stats() -> dict:
    return {**_stats, "buffer_size": len(_buffer)}


def _parse_line_ts(line: str) -> int:
    """
    Extrai o timestamp do início da linha do log BIND e converte para Unix (UTC).
    Fallback para time.time() se não conseguir parsear.
    """
    m = TS_RE.match(line)
    if m:
        try:
            dt = datetime.datetime.strptime(m.group(1), "%d-%b-%Y %H:%M:%S")
            return int(dt.replace(tzinfo=_BRT).timestamp())
        except ValueError:
            pass
    return int(time.time())


async def _flush(db: aiosqlite.Connection):
    if not _buffer:
        return
    batch = []
    while _buffer and len(batch) < BATCH_SIZE:
        batch.append(_buffer.popleft())
    await db.executemany(
        "INSERT INTO dns_query (ts, client_ip, qname, qtype) VALUES (?, ?, ?, ?)",
        batch
    )
    await db.commit()
    _stats["last_flush_ts"] = time.time()


def _open_log(log_path: Path):
    """Abre o arquivo de log e retorna (file_handle, inode)."""
    f = open(log_path, "r", errors="replace")
    inode = os.stat(log_path).st_ino
    return f, inode


async def _get_max_ts(db: aiosqlite.Connection) -> int:
    """Retorna o maior timestamp já gravado no banco (0 se vazio)."""
    cur = await db.execute("SELECT MAX(ts) FROM dns_query")
    row = await cur.fetchone()
    return row[0] or 0


async def _is_inode_processed(db: aiosqlite.Connection, inode: int) -> bool:
    """Verifica se um arquivo (por inode) já foi totalmente processado."""
    cur = await db.execute(
        "SELECT value FROM collector_state WHERE key = ?",
        (f"log_inode_{inode}",)
    )
    return await cur.fetchone() is not None


async def _mark_inode_processed(db: aiosqlite.Connection, inode: int):
    """Marca um arquivo (por inode) como processado."""
    await db.execute(
        "INSERT OR REPLACE INTO collector_state (key, value) VALUES (?, ?)",
        (f"log_inode_{inode}", str(int(time.time())))
    )
    await db.commit()


def _rotated_log_files(log_path: Path) -> list:
    """
    Retorna as versões rotacionadas do log em ordem cronológica (mais antigo primeiro).
    BIND cria: queries.log.0 (mais recente) → queries.log.N (mais antigo).
    """
    rotated = []
    for i in range(10):  # BIND mantém até 5 por padrão, verificamos até 10
        p = Path(f"{log_path}.{i}")
        if p.exists():
            rotated.append(p)
    # Reverte: rotated[0]=.0 (recente) → queremos do mais antigo para o mais recente
    return list(reversed(rotated))


async def _read_file_fully(path: Path, min_ts: int, db: aiosqlite.Connection) -> int:
    """
    Lê um arquivo de log completo e insere no buffer.
    min_ts: insere apenas linhas com ts > min_ts (para evitar duplicatas com o banco).
    Retorna o maior ts encontrado no arquivo (ou min_ts se nenhum inserido).
    """
    local_max_ts = min_ts
    lines_read = 0
    last_flush = time.monotonic()

    with open(path, "r", errors="replace") as f:
        for line in f:
            m = LINE_RE.search(line)
            if m:
                ts = _parse_line_ts(line)
                if ts > min_ts:
                    _buffer.append((
                        ts,
                        m.group("ip"),
                        m.group("qname").lower(),
                        m.group("qtype").upper(),
                    ))
                    _stats["events_total"] += 1
                    if ts > local_max_ts:
                        local_max_ts = ts

            lines_read += 1
            if lines_read % CATCHUP_YIELD_EVERY == 0:
                if time.monotonic() - last_flush >= FLUSH_INTERVAL:
                    try:
                        await _flush(db)
                    except Exception:
                        pass
                    last_flush = time.monotonic()
                await asyncio.sleep(0)

    # Flush final
    try:
        await _flush(db)
    except Exception:
        pass

    return local_max_ts


async def collect_forever():
    _stats["running"] = True
    log_path = Path(settings.bind_log_path)

    while not log_path.exists():
        await asyncio.sleep(5)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA synchronous=NORMAL")

        max_ts = await _get_max_ts(db)

        # ── Fase 1: arquivos rotacionados (histórico) ─────────────────────────
        # Lê do mais antigo ao mais recente, pulando os já processados (por inode)
        for rotated in _rotated_log_files(log_path):
            try:
                inode = os.stat(rotated).st_ino
            except FileNotFoundError:
                continue

            if await _is_inode_processed(db, inode):
                # Já foi processado em sessão anterior — atualiza max_ts sem reler
                cur = await db.execute(
                    "SELECT MAX(ts) FROM dns_query WHERE ts <= ?",
                    (int(time.time()),)
                )
                row = await cur.fetchone()
                if row and row[0]:
                    max_ts = max(max_ts, row[0])
                continue

            # Arquivo rotacionado NÃO processado: lê tudo (min_ts=0 = sem filtro)
            max_ts = max(max_ts, await _read_file_fully(rotated, min_ts=0, db=db))
            await _mark_inode_processed(db, inode)

        # ── Fase 2: arquivo atual (do início, depois tail) ────────────────────
        f, current_inode = _open_log(log_path)
        last_flush = time.monotonic()
        lines_since_yield = 0

        try:
            while True:
                line = f.readline()
                if line:
                    m = LINE_RE.search(line)
                    if m:
                        ts = _parse_line_ts(line)
                        if ts > max_ts:
                            _buffer.append((
                                ts,
                                m.group("ip"),
                                m.group("qname").lower(),
                                m.group("qtype").upper(),
                            ))
                            _stats["events_total"] += 1
                            if ts > max_ts:
                                max_ts = ts

                    lines_since_yield += 1
                    if lines_since_yield >= CATCHUP_YIELD_EVERY:
                        lines_since_yield = 0
                        if time.monotonic() - last_flush >= FLUSH_INTERVAL:
                            try:
                                await _flush(db)
                            except Exception:
                                pass
                            last_flush = time.monotonic()
                        await asyncio.sleep(0)
                else:
                    # Fim do arquivo — modo tail
                    lines_since_yield = 0

                    # Detecta rotação por mudança de inode
                    try:
                        new_inode = os.stat(log_path).st_ino
                        if new_inode != current_inode:
                            # Marca o arquivo antigo como processado
                            await _mark_inode_processed(db, current_inode)
                            # Abre o novo arquivo do início
                            f.close()
                            f, current_inode = _open_log(log_path)
                    except FileNotFoundError:
                        pass

                    if time.monotonic() - last_flush >= FLUSH_INTERVAL:
                        try:
                            await _flush(db)
                        except Exception:
                            pass
                        last_flush = time.monotonic()
                    await asyncio.sleep(0.1)
        finally:
            f.close()
