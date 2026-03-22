# Voxly Backend

> AI-powered client communication engine for dev agencies. Connect GitHub repos, let AI craft intelligent updates, and deliver them to WhatsApp, Telegram & Slack — automatically.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python](https://img.shields.io/badge/Python-3.12+-blue.svg)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green.svg)](https://fastapi.tiangolo.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Website**: [voxly.dev](https://voxly.dev) · **Docs**: [voxly.dev/docs](https://voxly.dev/docs) · **Full Setup**: `npx create-voxly@latest my-agency`

---

## What is Voxly?

Voxly is a backend engine that bridges GitHub activity with client communication channels. When a developer pushes code or opens a PR, Voxly's AI generates a human-friendly summary and delivers it to your client via WhatsApp, Telegram, or Slack.

```
GitHub Push → Voxly AI → WhatsApp/Telegram/Slack
```

## Features

- 🤖 **Multi-Provider AI** — Anthropic Claude, OpenAI GPT, Google Gemini, Groq, Ollama
- 📱 **Multi-Channel Delivery** — WhatsApp (Twilio), Telegram, Slack
- 🔗 **GitHub Webhooks** — React to push, PR, issue, and deployment events
- 🔐 **JWT Authentication** — Secure multi-agency support
- ⚡ **Async Task Queue** — Celery + Redis for non-blocking delivery
- 🗄️ **PostgreSQL** — Full relational schema with Alembic migrations
- 🐳 **Docker Ready** — Single `docker compose up` to run everything

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API | FastAPI 0.115+ |
| Database | PostgreSQL 16 + SQLAlchemy |
| Migrations | Alembic |
| Task Queue | Celery + Redis |
| AI | LangChain (multi-provider) |
| WhatsApp | Twilio |
| Auth | JWT (python-jose) |
| Testing | pytest + pytest-asyncio |

## Quick Start

### Option 1 — Docker (Recommended)

```bash
git clone https://github.com/ravin972/voxly-backend.git
cd voxly-backend
cp .env.example .env   # Fill in your credentials
docker compose up
```

API available at: `http://localhost:8000`
Swagger docs at: `http://localhost:8000/docs`

### Option 2 — Local Development

**Prerequisites**: Python 3.12+, PostgreSQL, Redis

```bash
git clone https://github.com/ravin972/voxly-backend.git
cd voxly-backend

# Create virtualenv
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your database URL, API keys, etc.

# Run migrations
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/voxly
SECRET_KEY=your-strong-random-secret
ANTHROPIC_API_KEY=sk-ant-...         # or use OPENAI_API_KEY / GEMINI_API_KEY
GITHUB_TOKEN=ghp_...                 # for GitHub webhook integration
TWILIO_ACCOUNT_SID=AC...             # for WhatsApp delivery
TWILIO_AUTH_TOKEN=...
REDIS_URL=redis://localhost:6379
```

## Project Structure

```
backend/
├── app/
│   ├── api/          # REST API endpoints
│   ├── core/         # Settings, security, config
│   ├── models/       # SQLAlchemy ORM models
│   ├── schemas/      # Pydantic request/response schemas
│   ├── services/     # Business logic (AI, messaging, GitHub)
│   │   ├── ai_providers/   # Anthropic, OpenAI, Gemini, Groq, Ollama
│   │   └── messaging/      # WhatsApp, Telegram, Slack
│   └── main.py       # FastAPI app entry point
├── alembic/          # Database migrations
├── tests/            # pytest test suite
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

## API Documentation

Once running, visit:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

```bash
# Fork, clone, create a branch
git checkout -b feat/my-new-feature

# Make your changes, add tests
pytest -v

# Open a PR against main
```

## License

MIT — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with ❤️ by the Voxly Team · <a href="https://voxly.dev">voxly.dev</a>
</p>
