<p align="center">
  <img src="docs/logo.png" alt="OpenReq Logo" width="120" />
</p>

<h1 align="center">OpenReq</h1>

<p align="center">
  A modern, open-source API client for testing, debugging, and documenting HTTP APIs.
  <br />
  <a href="https://openreq.app"><strong>openreq.app</strong></a>
</p>

<p align="center">
  <a href="#features">Features</a> &bull;
  <a href="#screenshots">Screenshots</a> &bull;
  <a href="#getting-started">Getting Started</a> &bull;
  <a href="#tech-stack">Tech Stack</a> &bull;
  <a href="#license">License</a>
</p>

---

![Animation.gif](../../Desktop/Animation.gif)

## Features

> For full documentation, scripting guide, API reference, and more visit **[openreq.app](https://openreq.app)**.

- **Request Builder** — Compose and send HTTP requests with headers, body, query params, and auth
- **Response Viewer** — Pretty, Raw, Tree, and Preview modes for JSON, HTML, and SVG responses
- **Collections** — Organize requests into collections with variables, auth, and scripts
- **Collection Runner** — Execute entire collections with real-time streaming results
- **Environments** — Manage variables across environments with easy switching
- **Import / Export** — Import from Postman, OpenAPI, and cURL; export to Postman format
- **Code Generation** — Generate client code in 8 languages (cURL, Python, JavaScript, Go, Java, C#, PHP, Axios)
- **Pre-request & Test Scripts** — JavaScript-based scripting with test assertions
- **OAuth 2.0** — Authorization Code, Client Credentials, and PKCE flows
- **WebSocket Client** — Built-in WebSocket proxy panel for real-time APIs
- **AI Assistant** — OpenAI-powered code generation and request assistance
- **Workspaces** — Collaborate with teams through shared workspaces
- **Run Reports** — Persistent test reports with JSON and HTML export
- **Customizable Layout** — Drag-and-drop resizable panels with layout presets
- **Multi-language UI** — English, Hungarian, and German interface
- **Dark / Light Theme** — Full theme support with system preference detection
- **Setup Wizard** — Guided first-run configuration

## Screenshots

<!-- TODO: Add screenshot - Main request builder interface -->
![Request Builder](docs/screenshots/request-builder.png)

<!-- TODO: Add screenshot - Response viewer with Pretty/Tree/Preview modes -->
![Response Viewer](docs/screenshots/response-viewer.png)

<!-- TODO: Add screenshot - Collection runner with streaming results -->
![Collection Runner](docs/screenshots/collection-runner.png)

<!-- TODO: Add screenshot - Dashboard overview -->
![Dashboard](docs/screenshots/dashboard.png)

## Getting Started

### Docker (recommended)

```bash
git clone https://github.com/n1kozor/openreq.git
cd openreq
cp .env.example .env
docker compose up -d
```

The app will be available at `http://localhost:5173` with the API at `http://localhost:8000`.

### Manual Setup

**1. Clone & configure**

```bash
git clone https://github.com/n1kozor/openreq.git
cd openreq
cp .env.example .env
```

**2. Backend**

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**3. Frontend** (in a separate terminal)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` — the setup wizard will guide you through initial configuration.

### Configuration

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET_KEY` | `super-secret-change-me-in-production` | Secret key for JWT tokens |
| `DATABASE_URL` | `sqlite:///./data/openreq.db` | Database connection string |
| `ALLOW_REGISTRATION` | `true` | Enable/disable user registration |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins |
| `PROXY_REQUEST_TIMEOUT` | `30` | Request proxy timeout in seconds |

## Tech Stack

**Backend**
- [FastAPI](https://fastapi.tiangolo.com/) — async Python web framework
- [SQLAlchemy](https://www.sqlalchemy.org/) + SQLite — ORM and database
- [HTTPX](https://www.python-httpx.org/) — HTTP/2 capable request proxy
- JWT authentication with role-based access control

**Frontend**
- [React 19](https://react.dev/) + TypeScript
- [Vite](https://vitejs.dev/) — build tooling
- [MUI 6](https://mui.com/) — component library
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — code editor
- [TanStack Query](https://tanstack.com/query) — data fetching
- [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout) — draggable panels

## Project Structure

```
openreq/
├── backend/
│   └── app/
│       ├── api/v1/       # REST API endpoints
│       ├── models/        # SQLAlchemy models
│       ├── schemas/       # Pydantic schemas
│       ├── services/      # Business logic
│       └── core/          # Auth & security
├── frontend/
│   └── src/
│       ├── components/    # React components
│       ├── api/           # API client layer
│       ├── pages/         # Top-level pages
│       ├── i18n/          # Translations (EN, HU, DE)
│       ├── hooks/         # Custom hooks
│       └── theme/         # MUI theme config
├── docs/                  # Logo and documentation
└── docker-compose.yaml
```

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.

## License

[MIT License](LICENSE) — use it however you want, for anything you want.
