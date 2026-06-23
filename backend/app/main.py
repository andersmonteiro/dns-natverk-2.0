import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import init_db
from .config import settings
from .routes import auth, metrics, ops, blocks, blocks_import, whitelist, audit, users, tools, backups, bindlog, bindconfig, krill

app = FastAPI(title="DNS Panel", version="1.0.0", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(metrics.router)
app.include_router(ops.router)
app.include_router(blocks.router)
app.include_router(blocks_import.router)
app.include_router(whitelist.router)
app.include_router(audit.router)
app.include_router(users.router)
app.include_router(tools.router)
app.include_router(backups.router)
app.include_router(bindlog.router)
app.include_router(bindconfig.router)
app.include_router(krill.router)


async def init_bind_files():
    """Inicializa arquivos necessários no volume bind_etc."""
    from pathlib import Path
    bind_dir = Path(settings.bind_conf_dir)

    if not bind_dir.exists():
        return  # volume não montado (dev sem Docker)

    # named.conf.bloqueios
    blocks = bind_dir / "named.conf.bloqueios"
    if not blocks.exists():
        blocks.write_text("// Gerenciado automaticamente pelo DNS Natverk Panel\n")

    # db.bloqueio
    bloqueio = bind_dir / "db.bloqueio"
    if not bloqueio.exists():
        bloqueio.write_text(
            "; Zona de bloqueio — DNS Nätverk Panel\n"
            "; Todos os domínios bloqueados apontam para esta zona (sinkhole 0.0.0.0)\n"
            "$TTL 300\n"
            "@ IN SOA localhost. root.localhost. (\n"
            "    2026010101   ; serial\n"
            "    3600         ; refresh\n"
            "    900          ; retry\n"
            "    86400        ; expire\n"
            "    300 )        ; minimum TTL\n\n"
            "@ IN NS  localhost.\n"
            "@ IN A   0.0.0.0\n"
            "* IN A   0.0.0.0\n"
            "@ IN AAAA ::\n"
            "* IN AAAA ::\n"
        )

    # natverk-acl.json + named.conf.options
    from .routes.bindconfig import ACL_FILE, DEFAULT_ACL, OPT_CONF, _load_acl, _build_options_from_acl
    import json
    acl_fresh = not ACL_FILE.exists()
    if acl_fresh:
        ACL_FILE.write_text(json.dumps(DEFAULT_ACL, indent=2))

    # Regenera named.conf.options apenas em fresh install ou se o arquivo não existir.
    # Não sobrescreve edições manuais feitas pelo modo Avançado.
    if acl_fresh or not OPT_CONF.exists():
        try:
            acl = _load_acl()
            OPT_CONF.write_text(_build_options_from_acl(acl))
        except Exception:
            pass

    # Rebuild named.conf.bloqueios from DB
    try:
        from .routes.blocks import rebuild_blocks_conf
        await rebuild_blocks_conf()
    except Exception:
        pass


@app.on_event("startup")
async def startup():
    await init_db()
    await init_bind_files()
    if settings.collector_enabled:
        from .collectors.querylog import collect_forever
        asyncio.create_task(collect_forever())


@app.get("/api/health")
async def health():
    return {"status": "ok"}
