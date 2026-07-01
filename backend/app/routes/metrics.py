from fastapi import APIRouter, Depends, Query
from typing import Optional
import aiosqlite
import time
from ..auth import get_current_user
from ..db import DB_PATH
from ..sysinfo import get_system_info, get_host_info, get_bind_status
from ..collectors.querylog import get_stats as collector_stats

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


def _range_to_ts(range_str: str) -> int:
    """Converte string de range para timestamp Unix (início da janela)."""
    now = int(time.time())
    mapping = {
        "1h": 3600, "3h": 10800, "6h": 21600, "12h": 43200,
        "24h": 86400, "7d": 604800, "30d": 2592000,
    }
    delta = mapping.get(range_str, 86400)
    return now - delta


@router.get("/system")
async def system_metrics(user=Depends(get_current_user)):
    return {
        "system": get_system_info(),
        "host": get_host_info(),
        "bind": get_bind_status(),
        "collector": collector_stats(),
    }


def _fill_buckets_simple(rows, since: int, bucket_secs: int) -> list:
    """
    Preenche todos os buckets do período com 0 onde não há dados.
    Garante que o gráfico sempre tem pontos suficientes para desenhar uma linha.
    """
    now = int(time.time())
    data = {r["bucket"]: r["count"] for r in rows}
    start = (since // bucket_secs) * bucket_secs
    end   = (now   // bucket_secs) * bucket_secs
    result = []
    b = start
    while b <= end:
        result.append({"ts": b, "count": data.get(b, 0)})
        b += bucket_secs
    return result


@router.get("/queries/timeseries")
async def queries_timeseries(
    range: str = Query("24h"),
    bucket: str = Query("1h"),  # 5m, 15m, 1h
    user=Depends(get_current_user)
):
    since = _range_to_ts(range)
    bucket_secs = {"5m": 300, "15m": 900, "1h": 3600, "6h": 21600, "1d": 86400}.get(bucket, 3600)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT
                (ts / ?) * ? AS bucket,
                COUNT(*) AS count
            FROM dns_query
            WHERE ts >= ?
            GROUP BY bucket
            ORDER BY bucket
        """, (bucket_secs, bucket_secs, since))
        rows = await cursor.fetchall()

    return _fill_buckets_simple(rows, since, bucket_secs)


@router.get("/queries/total")
async def queries_total(range: str = Query("24h"), user=Depends(get_current_user)):
    since = _range_to_ts(range)
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT COUNT(*) as total FROM dns_query WHERE ts >= ?", (since,)
        )
        row = await cursor.fetchone()
    return {"total": row[0]}


@router.get("/clients/top")
async def top_clients(
    range: str = Query("24h"),
    limit: int = Query(10),
    user=Depends(get_current_user)
):
    since = _range_to_ts(range)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT client_ip, COUNT(*) as count
            FROM dns_query WHERE ts >= ?
            GROUP BY client_ip
            ORDER BY count DESC LIMIT ?
        """, (since, limit))
        rows = await cursor.fetchall()
    return [{"ip": r["client_ip"], "count": r["count"]} for r in rows]


@router.get("/domains/top")
async def top_domains(
    range: str = Query("24h"),
    limit: int = Query(20),
    user=Depends(get_current_user)
):
    since = _range_to_ts(range)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT qname, COUNT(*) as count
            FROM dns_query WHERE ts >= ?
            GROUP BY qname
            ORDER BY count DESC LIMIT ?
        """, (since, limit))
        rows = await cursor.fetchall()
    return [{"domain": r["qname"], "count": r["count"]} for r in rows]


@router.get("/qtypes")
async def query_types(range: str = Query("24h"), user=Depends(get_current_user)):
    since = _range_to_ts(range)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT qtype, COUNT(*) as count
            FROM dns_query WHERE ts >= ?
            GROUP BY qtype ORDER BY count DESC
        """, (since,))
        rows = await cursor.fetchall()
    return [{"type": r["qtype"], "count": r["count"]} for r in rows]


@router.get("/clients/top-by-type")
async def top_clients_by_type(
    range: str = Query("24h"),
    limit: int = Query(20),
    user=Depends(get_current_user)
):
    """Retorna top clientes com contagem por tipo de query (A, AAAA, NS, etc.)."""
    since = _range_to_ts(range)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        # Top IPs por volume total
        cursor = await db.execute("""
            SELECT client_ip, COUNT(*) as total
            FROM dns_query WHERE ts >= ?
            GROUP BY client_ip ORDER BY total DESC LIMIT ?
        """, (since, limit))
        top_ips = [r["client_ip"] for r in await cursor.fetchall()]

        if not top_ips:
            return []

        # Breakdown por tipo para cada IP
        placeholders = ','.join('?' * len(top_ips))
        cursor = await db.execute(f"""
            SELECT client_ip, qtype, COUNT(*) as count
            FROM dns_query
            WHERE ts >= ? AND client_ip IN ({placeholders})
            GROUP BY client_ip, qtype
        """, (since, *top_ips))
        rows = await cursor.fetchall()

    from collections import defaultdict
    data: dict = defaultdict(dict)
    for r in rows:
        data[r["client_ip"]][r["qtype"]] = r["count"]

    result = []
    for ip in top_ips:
        entry = {"ip": ip, "total": sum(data[ip].values()), **data[ip]}
        result.append(entry)
    return result


@router.get("/queries/timeseries-by-type")
async def queries_timeseries_by_type(
    range: str = Query("24h"),
    bucket: str = Query("1h"),
    user=Depends(get_current_user)
):
    """Série temporal com contagem por qtype em cada bucket."""
    since = _range_to_ts(range)
    bucket_secs = {"5m": 300, "15m": 900, "1h": 3600, "6h": 21600, "1d": 86400}.get(bucket, 3600)

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT (ts / ?) * ? AS bucket, qtype, COUNT(*) as count
            FROM dns_query WHERE ts >= ?
            GROUP BY bucket, qtype ORDER BY bucket
        """, (bucket_secs, bucket_secs, since))
        rows = await cursor.fetchall()

    from collections import defaultdict
    now = int(time.time())
    data: dict = defaultdict(dict)
    qtypes_seen: set = set()
    for r in rows:
        data[r["bucket"]][r["qtype"]] = r["count"]
        qtypes_seen.add(r["qtype"])

    # Preenche todos os buckets do período (zeros onde não há dados)
    start = (since // bucket_secs) * bucket_secs
    end   = (now   // bucket_secs) * bucket_secs
    result = []
    b = start
    while b <= end:
        entry = {"ts": b}
        for qt in qtypes_seen:
            entry[qt] = data[b].get(qt, 0) if b in data else 0
        result.append(entry)
        b += bucket_secs
    return result


@router.get("/queries/by-hour")
async def queries_by_hour(time_range: str = Query("24h", alias="range"), user=Depends(get_current_user)):
    """Distribuição de queries por hora do dia (0–23)."""
    since = _range_to_ts(time_range)
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("""
            SELECT CAST(strftime('%H', datetime(ts, 'unixepoch', 'localtime')) AS INTEGER) as hour,
                   COUNT(*) as count
            FROM dns_query WHERE ts >= ?
            GROUP BY hour ORDER BY hour
        """, (since,))
        rows = await cursor.fetchall()

    counts = {r["hour"]: r["count"] for r in rows}
    return [{"hour": h, "label": f"{h:02d}h", "count": counts.get(h, 0)} for h in list(range(24))]


@router.get("/clients/unique")
async def unique_clients(range: str = Query("24h"), user=Depends(get_current_user)):
    since = _range_to_ts(range)
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT COUNT(DISTINCT client_ip) as count FROM dns_query WHERE ts >= ?",
            (since,)
        )
        row = await cursor.fetchone()
    return {"count": row[0]}
