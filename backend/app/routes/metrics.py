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
        "1h": 3600, "6h": 21600, "12h": 43200,
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


@router.get("/queries/timeseries")
async def queries_timeseries(
    range: str = Query("24h"),
    bucket: str = Query("1h"),  # 5m, 15m, 1h
    user=Depends(get_current_user)
):
    since = _range_to_ts(range)
    bucket_secs = {"5m": 300, "15m": 900, "1h": 3600}.get(bucket, 3600)

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

    return [{"ts": r["bucket"], "count": r["count"]} for r in rows]


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
