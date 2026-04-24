"""Klypup API entry point."""

import logging
import os

# Disable chromadb + posthog anonymous telemetry — must be set before
# chromadb imports anywhere in the process.
os.environ.setdefault("ANONYMIZED_TELEMETRY", "False")
os.environ.setdefault("CHROMA_TELEMETRY_ENABLED", "False")
os.environ.setdefault("POSTHOG_DISABLED", "1")
for _name in ("chromadb.telemetry", "chromadb", "posthog", "backoff"):
    logging.getLogger(_name).setLevel(logging.CRITICAL)
logging.getLogger("chromadb.telemetry.product.posthog").disabled = True

# Compact INFO logging so the research agent's step-by-step progress
# shows up in the uvicorn terminal without extra wiring.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
# Quiet these down — they're noisy at INFO.
for _n in ("httpx", "httpcore", "urllib3", "google", "google.auth", "chardet"):
    logging.getLogger(_n).setLevel(logging.WARNING)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, compare, health, market, reports, research, watchlist
from app.core.config import settings

app = FastAPI(title=settings.APP_NAME, version=settings.APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(market.router, prefix="/api/market", tags=["market"])
app.include_router(reports.router, prefix="/api/reports", tags=["reports"])
app.include_router(watchlist.router, prefix="/api/watchlist", tags=["watchlist"])
app.include_router(research.router, prefix="/api/research", tags=["research"])
app.include_router(compare.router, prefix="/api/compare", tags=["compare"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])


@app.get("/")
async def root() -> dict:
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }
