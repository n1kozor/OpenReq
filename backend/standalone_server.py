import os

os.environ.setdefault("OPENREQ_STANDALONE", "1")

from app.main import app  # noqa: E402

if __name__ == "__main__":
    import uvicorn

    host = os.getenv("OPENREQ_HOST", "127.0.0.1")
    port = int(os.getenv("OPENREQ_PORT", "4010"))
    uvicorn.run(app, host=host, port=port, log_level="info")
