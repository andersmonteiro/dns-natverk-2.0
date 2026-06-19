import asyncio
import subprocess
import psutil
import time
import socket
import platform
from typing import Optional

def get_system_info() -> dict:
    cpu = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disk_root = psutil.disk_usage("/")

    try:
        disk_var = psutil.disk_usage("/var")
        disk_var_pct = round(disk_var.percent, 1)
    except Exception:
        disk_var_pct = None

    load = psutil.getloadavg()

    return {
        "cpu_pct": round(cpu, 1),
        "mem_pct": round(mem.percent, 1),
        "mem_used_mb": round(mem.used / 1024 / 1024),
        "mem_total_mb": round(mem.total / 1024 / 1024),
        "disk_pct_root": round(disk_root.percent, 1),
        "disk_pct_var": disk_var_pct,
        "uptime_secs": int(time.time() - psutil.boot_time()),
        "load_1m": round(load[0], 2),
        "load_5m": round(load[1], 2),
        "load_15m": round(load[2], 2),
    }

def get_host_info() -> dict:
    return {
        "hostname": socket.gethostname(),
        "fqdn": socket.getfqdn(),
        "os": f"{platform.system()} {platform.release()}",
        "arch": platform.machine(),
        "cpus": psutil.cpu_count(logical=True),
        "mem_total_gb": round(psutil.virtual_memory().total / 1024**3, 1),
    }

def get_bind_status() -> dict:
    import socket as _socket
    import os as _os
    from email.utils import parsedate_to_datetime as _parsedate
    import datetime as _dt

    # Bridge network: tenta host.docker.internal primeiro, depois fallbacks
    active = False
    for host in ["host.docker.internal", "172.17.0.1", "127.0.0.1"]:
        try:
            s = _socket.create_connection((host, 53), timeout=2)
            s.close()
            active = True
            break
        except Exception:
            continue

    # Versão via named -v
    version = None
    try:
        r = subprocess.run(["named", "-v"], capture_output=True, text=True, timeout=5)
        out = (r.stdout + r.stderr).strip()
        if "BIND" in out:
            version = out.split()[1] if len(out.split()) > 1 else out
    except Exception:
        pass

    # Uptime via rndc status — parseia "boot time: ..."
    uptime_secs = None
    try:
        rndc_host = _os.environ.get("RNDC_HOST", "bind")
        rndc_key  = _os.environ.get("RNDC_KEY_FILE", "/etc/bind/rndc.key")
        r = subprocess.run(
            ["rndc", "-s", rndc_host, "-k", rndc_key, "status"],
            capture_output=True, text=True, timeout=5,
        )
        for line in r.stdout.splitlines():
            if line.lower().startswith("boot time:"):
                boot_str = line.split(":", 1)[1].strip()
                boot_dt  = _parsedate(boot_str)
                now      = _dt.datetime.now(_dt.timezone.utc)
                uptime_secs = int((now - boot_dt).total_seconds())
                break
    except Exception:
        pass

    return {
        "active": active,
        "state": "running" if active else "stopped",
        "version": version,
        "uptime_secs": uptime_secs,
    }
