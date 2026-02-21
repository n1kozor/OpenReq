# OpenReq

A modern, open-source API client for testing, debugging, and documenting HTTP APIs.

Homepage: https://openreq.app

---

**What You Get**
- Request builder, auth, scripting, environments, code generation, and visual test flows
- Import from Postman/OpenAPI/cURL, export to Postman
- WebSocket + GraphQL support
- AI-assisted collection import
- Desktop apps: Client and Standalone

---

**Product Options**
- **Standalone Desktop**: All-in-one installer (frontend + backend). No server required. Local SQLite.
- **Desktop Client**: Connects to your self-hosted backend for team workspaces.
- **Self-Hosted Web**: Run backend + web UI on your server.

---

**Quick Start (Docker)**
```bash
git clone https://github.com/n1kozor/OpenReq.git
cd OpenReq
cp .env.example .env
docker compose up -d
```

Open the app at `http://localhost:8000` and the API at `http://localhost:8000/api`.

---

**Manual Setup**

Backend:
```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend (new terminal):
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

---

**Desktop Builds (Windows)**
There are two Electron builds:
- Client build: connects to an external server.
- Standalone build: bundles the backend and runs offline with local SQLite.

Run from `desktop-app/`:
```bash
npm run build:client
npm run build:standalone
```

Standalone build steps:
- Builds the frontend with `VITE_STANDALONE=true`
- Copies `frontend/dist` into `backend/static`
- Builds a backend executable via PyInstaller
- Bundles backend into the Electron app resources
- Creates an NSIS installer

Standalone runtime defaults:
- Backend: `127.0.0.1:4010`
- Data: local SQLite under app user data
- Auth/setup: disabled

---

**Configuration**
Copy `.env.example` to `.env` and adjust as needed.

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET_KEY` | `super-secret-change-me-in-production` | Secret key for JWT tokens |
| `DATABASE_URL` | `sqlite:///./data/openreq.db` | Database connection string |
| `ALLOW_REGISTRATION` | `true` | Enable/disable user registration |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins |
| `PROXY_REQUEST_TIMEOUT` | `30` | Request proxy timeout in seconds |

---

**Tech Stack**
Backend:
- FastAPI
- SQLAlchemy + SQLite
- HTTPX
- JWT auth

Frontend:
- React + TypeScript
- Vite
- MUI
- Monaco Editor
- TanStack Query
- react-grid-layout

---

**Project Structure**
```
openreq/
├── backend/
│   └── app/
│       ├── api/v1/       # REST API endpoints
│       ├── models/       # SQLAlchemy models
│       ├── schemas/      # Pydantic schemas
│       ├── services/     # Business logic
│       └── core/         # Auth & security
├── frontend/
│   └── src/
│       ├── components/   # React components
│       ├── api/          # API client
│       ├── pages/        # Top-level pages
│       ├── i18n/         # Translations (EN, HU, DE)
│       ├── hooks/        # Custom hooks
│       └── theme/        # MUI theme config
├── desktop-app/          # Electron desktop apps
├── browser-extension/    # Optional extension
├── docs/                 # Docs + marketing page
└── docker-compose.yaml
```

---

**Contributing**
Issues and PRs are welcome.

---

**License**
MIT License. See `LICENSE`.
