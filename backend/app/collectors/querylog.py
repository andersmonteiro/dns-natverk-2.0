"""
Coletor do querylog do BIND9.
Faz tail do arquivo de log e insere eventos no SQLite em batch.
"""
import asyncio
import re
import time
import aiosqlite
from pathlib import Path
from collections import deque
from ..config import settings
from ..db import DB_PATH

# Formato padrão do BIND9 querylog com print-category/print-severity
# Ex: 17-Jun-2026 14:32:10.123 queries: info: client @0x... 192.168.1.1#54321 (google.com): query: google.com IN A + (127.0.0.1)
LINE_RE = re.compile(
    r"queries: info: client\s+(?:@\S+\s+)?(?P<ip>\d+\.\d+\.\d+\.\d+)#\d+\s+"
    r"\((?P<qname>[^)]+)\): query: \S+ IN (?P<qtype>\w+)"
)

BATCH_SIZE = 500
FLUSH_INTERVAL = 2.0   # segundos
BUFFER_MAX = 50_000

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


async def collect_forever():
    _stats["running"] = True
    log_path = Path(settings.bind_log_path)

    while not log_path.exists():
        await asyncio.sleep(5)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA synchronous=NORMAL")

        # Abre no final do arquivo (não reprocessa histórico)
        with open(log_path, "r", errors="replace") as f:
            f.seek(0, 2)
            last_flush = time.monotonic()

            while True:
                line = f.readline()
                if line:
                    m = LINE_RE.search(line)
                    if m:
                        _buffer.append((
                            int(time.time()),
                            m.group("ip"),
                            m.group("qname").lower(),
                            m.group("qtype").upper(),
                        ))
                        _stats["events_total"] += 1
                else:
                    # Flush periódico
                    if time.monotonic() - last_flush >= FLUSH_INTERVAL:
                        try:
                            await _flush(db)
                        except Exception:
                            pass
                        last_flush = time.monotonic()
                    await asyncio.sleep(0.1)
