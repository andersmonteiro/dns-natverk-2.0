#!/usr/bin/env python3
"""
Popula o banco com dados fake para testes de dashboard.
Rode dentro do container backend:
  docker exec -it dns-natverk-20-backend-1 python /seed_fake_data.py

Ou copie para dentro do container e rode:
  docker cp scripts/seed_fake_data.py dns-natverk-20-backend-1:/seed_fake_data.py
  docker exec dns-natverk-20-backend-1 python /seed_fake_data.py
"""

import sqlite3
import random
import time

DB = "/data/dns_panel.db"

CLIENTS = [
    "192.168.1.10", "192.168.1.11", "192.168.1.15",
    "192.168.1.20", "192.168.1.50", "10.0.0.5",
    "10.0.0.12", "172.16.0.3",
]
DOMAINS = [
    "google.com", "cloudflare.com", "github.com", "youtube.com",
    "facebook.com", "netflix.com", "amazon.com", "twitter.com",
    "reddit.com", "openai.com", "microsoft.com", "apple.com",
    "spotify.com", "discord.com", "whatsapp.com", "instagram.com",
    "api.github.com", "fonts.googleapis.com", "cdn.cloudflare.com",
    "s3.amazonaws.com", "accounts.google.com", "login.microsoftonline.com",
]
QTYPES = ["A", "A", "A", "A", "AAAA", "AAAA", "MX", "TXT", "NS", "CNAME"]

def seed(n=2000, days=7):
    conn = sqlite3.connect(DB)
    now = int(time.time())
    start = now - days * 86400

    rows = []
    for _ in range(n):
        ts = random.randint(start, now)
        client = random.choice(CLIENTS)
        domain = random.choice(DOMAINS)
        qtype  = random.choice(QTYPES)
        rows.append((ts, client, domain, qtype))

    conn.executemany(
        "INSERT INTO dns_query (ts, client_ip, qname, qtype) VALUES (?, ?, ?, ?)",
        rows
    )

    # Rollup por hora
    buckets = {}
    for ts, client, domain, qtype in rows:
        hour = (ts // 3600) * 3600
        key = (hour, client, qtype)
        buckets[key] = buckets.get(key, 0) + 1

    for (hour, client, qtype), count in buckets.items():
        conn.execute("""
            INSERT INTO rollup_hourly (hour_ts, client_ip, qtype, count)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(hour_ts, client_ip, qtype) DO UPDATE SET count = count + excluded.count
        """, (hour, client, qtype, count))

    conn.commit()
    conn.close()
    print(f"✓ Inseridos {n} registros de dns_query e rollup preenchido.")

if __name__ == "__main__":
    seed(n=3000, days=7)
