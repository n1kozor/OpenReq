# ── Stage 1: Build frontend ──
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ .
# Empty VITE_API_URL = relative URLs (same origin)
ENV VITE_API_URL=""
RUN npm run build


# ── Stage 2: Backend + frontend static files ──
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir uv && \
    uv pip install --no-cache-dir --system -r requirements.txt

COPY backend/ .

# Copy built frontend into backend static dir
COPY --from=frontend-builder /frontend/dist /app/static

RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
