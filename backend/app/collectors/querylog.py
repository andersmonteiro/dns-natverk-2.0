"""
Coletor do querylog do BIND9.
Faz tail do arquivo de log e insere eventos no SQLite em batch.

Comportamento na inicialização:
  - Lê o arquivo desde o início (histórico retroativo)
  - Usa o timestamp do próprio log (não o horário atual) para manter precisão
  - Pula entradas já existentes no banco (ts <= max_ts_no_banco)
  - Após alcançar o fim do arquivo, passa para modo tail contínuo

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
# Ex sem severity: 19-Jun-2026 13:38:32.968 queries: client @0x... 38.50.57.240#55370 (google.com): query: google.com IN A + (127.0.0.1)
# Ex com severity: 17-Jun-2026 14:32:10.123 queries: info: client @0x... 192.168.1.1#54321 (google.com): query: google.com IN A + (127.0.0.1)
LINE_RE = re.compile(
    r"queries:(?:\s+\w+:)?\s+client\s+(?:@\S+\s+)?(?P<ip>[\da-fA-F:\.]+)#\d+\s+"
    r"\((?P<qname>[^)]+)\): query: \S+ IN (?P<qtype>\w+)"
)

# Timestamp no início da linha: DD-Mon-YYYY HH:MM:SS
TS_RE = re.compile(r"^(\d{2}-[A-Za-z]{3}-\d{4} \d{2}:\d{2}:\d{2})")

# Brasil sempre UTC-3 (sem horário de verão desde 2019)
_BRT = datetime.timezone(datetime.timedelta(hours=-3))

BATCH_SIZE = 500
FLUSH_INTERVAL = 2.0   # segundos
BUFFER_MAX = 50_000
# Yield ao event loop a cada N linhas durante o catch-up para não bloquear
CATCHUP_YIELD_EVERY = 2000

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


def _rotated_log_files(log_path: Path) -> list[Path]:
    """
    Retorna as versões rotacionadas do log em ordem cronológica (mais antigo primeiro).
    BIND cria queries.log.0 (mais recente) ... queries.log.N (mais antigo).
    Ex: /var/log/named/queries.log → queries.log.0, queries.log.1, ...
    """
    rotated = []
    for i in range(10):  # BIND mantém até 5 por padrão, verificamos até 10
        p = Path(f"{log_path}.{i}")
        if p.exists():
            rotated.append(p)
    # rotated[0] = queries.log.0 (mais recente), reverter para ler do mais antigo primeiro
    return list(reversed(rotated))


async def _read_file_into_buffer(f, max_ts: int, db: aiosqlite.Connection) -> int:
    """
    Lê um arquivo de log completo, insere no buffer (e faz flush periódico).
    Retorna o maior ts encontrado no arquivo.
    """
    lines_read = 0
    local_max_ts = max_ts
    last_flush = time.monotonic()

    for line in f:
        m = LINE_RE.search(line)
        if m:
            ts = _parse_line_ts(line)
            if ts > max_ts:
                _buffer.append((ts, m.group("ip"), m.group("qname").lower(), m.group("qtype").upper()))
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

    # Flush final do arquivo
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

        # Pega o último timestamp gravado para evitar duplicatas no catch-up
        max_ts = await _get_max_ts(db)

        # ── Fase 1: catch-up dos arquivos rotacionados (mais antigo → mais recente) ──
        for rotated in _rotated_log_files(log_path):
            with open(rotated, "r", errors="replace") as rf:
                max_ts = await _read_file_into_buffer(rf, max_ts, db)

        # ── Fase 2: lê o arquivo atual desde o início ──
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
                        if ts > max_ts:  # Pula o que já está no banco
                            _buffer.append((
                                ts,
                                m.group("ip"),
                                m.group("qname").lower(),
                                m.group("qtype").upper(),
                            ))
                            _stats["events_total"] += 1

                    # Yield periódico durante catch-up para não bloquear o event loop
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

                    # Detecta rotação de log: compara inode do arquivo atual com o aberto
                    try:
                        new_inode = os.stat(log_path).st_ino
                        if new_inode != current_inode:
                            # BIND rotacionou o log — reabre do início do novo arquivo
                            f.close()
                            f, current_inode = _open_log(log_path)
                            max_ts = 0  # Novo arquivo: sem histórico a pular
                    except FileNotFoundError:
                        pass  # Arquivo temporariamente ausente durante rotação

                    # Flush periódico
                    if time.monotonic() - last_flush >= FLUSH_INTERVAL:
                        try:
                            await _flush(db)
                        except Exception:
                            pass
                        last_flush = time.monotonic()
                    await asyncio.sleep(0.1)
        finally:
            f.close()
