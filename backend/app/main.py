import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api.v1.router import api_router
from app.config import settings
from app.database import create_tables
from app.services.proxy import close_proxy_client

def _resolve_frontend_dir() -> Path:
    override = os.getenv("OPENREQ_STATIC_DIR")
    if override:
        return Path(override).expanduser().resolve()
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "app" / "static"
    return Path(__file__).resolve().parent.parent / "static"


FRONTEND_DIR = _resolve_frontend_dir()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
_log_file = os.getenv("OPENREQ_LOG_FILE")
if _log_file:
    try:
        log_path = Path(_log_file).expanduser().resolve()
        log_path.parent.mkdir(parents=True, exist_ok=True)
        handler = logging.FileHandler(log_path, encoding="utf-8")
        handler.setLevel(logging.INFO)
        handler.setFormatter(logging.Formatter("%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"))
        logging.getLogger().addHandler(handler)
        logging.getLogger(__name__).info("Logging to %s", log_path)
    except Exception as e:
        logging.getLogger(__name__).warning("Failed to init file logging: %s", e)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting %s v%s [%s]", settings.APP_NAME, settings.APP_VERSION, settings.ENVIRONMENT)
    create_tables()
    logger.info("Database tables ensured")
    yield
    await close_proxy_client()
    logger.info("Shutting down %s", settings.APP_NAME)


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health_check():
    return {"status": "healthy", "version": settings.APP_VERSION}


# ── Serve frontend static files (production) ──

# Map file extensions to media types with charset for text-based formats
_CHARSET_MEDIA_TYPES: dict[str, str] = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
}


def _media_type_for(file_path: Path) -> str | None:
    return _CHARSET_MEDIA_TYPES.get(file_path.suffix.lower())


if FRONTEND_DIR.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Serve frontend SPA — any non-API route returns index.html."""
        file_path = FRONTEND_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path, media_type=_media_type_for(file_path))
        return FileResponse(
            FRONTEND_DIR / "index.html",
            media_type="text/html; charset=utf-8",
        )
