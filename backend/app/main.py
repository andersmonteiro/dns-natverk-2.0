import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import init_db
from .config import settings
from .routes import auth, metrics, ops, blocks, whitelist, audit, users, tools, backups, bindlog, bindconfig

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
app.include_router(whitelist.router)
app.include_router(audit.router)
app.include_router(users.router)
app.include_router(tools.router)
app.include_router(backups.router)
app.include_router(bindlog.router)
app.include_router(bindconfig.router)


@app.on_event("startup")
async def startup():
    await init_db()
    if settings.collector_enabled:
        from .collectors.querylog import collect_forever
        asyncio.create_task(collect_forever())


@app.get("/api/health")
async def health():
    return {"status": "ok"}
