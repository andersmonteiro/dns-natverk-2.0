import aiosqlite
import asyncio
import hashlib
import os
from pathlib import Path

DB_PATH = "/data/dns_panel.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    username  TEXT UNIQUE NOT NULL,
    password  TEXT NOT NULL,
    role      TEXT NOT NULL DEFAULT 'viewer',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dns_query (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         INTEGER NOT NULL,
    client_ip  TEXT NOT NULL,
    qname      TEXT NOT NULL,
    qtype      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dns_query_ts ON dns_query(ts);
CREATE INDEX IF NOT EXISTS idx_dns_query_client ON dns_query(client_ip);

CREATE TABLE IF NOT EXISTS rollup_hourly (
    hour_ts    INTEGER NOT NULL,
    client_ip  TEXT NOT NULL,
    qtype      TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (hour_ts, client_ip, qtype)
);

CREATE TABLE IF NOT EXISTS collector_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocked_domain (
    domain     TEXT PRIMARY KEY,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
);

CREATE TABLE IF NOT EXISTS whitelist_domain (
    domain     TEXT PRIMARY KEY,
    reason     TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         DATETIME DEFAULT CURRENT_TIMESTAMP,
    username   TEXT,
    action     TEXT,
    detail     TEXT
);
"""

async def get_db():
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        yield db

async def init_db():
    Path("/data").mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        await db.commit()

        # Admin padrão se não existir
        from passlib.context import CryptContext
        pwd = CryptContext(schemes=["bcrypt"])
        cursor = await db.execute("SELECT COUNT(*) FROM users")
        row = await cursor.fetchone()
        if row[0] == 0:
            hashed = pwd.hash("admin")
            await db.execute(
                "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
                ("admin", hashed, "admin")
            )
            await db.commit()
