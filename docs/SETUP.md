# Voxly — Local Development Setup Guide

> Get the full Voxly stack running on your machine in under 30 minutes.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.12+ | [python.org](https://python.org) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Docker Desktop | Latest | [docker.com](https://docker.com/get-started) |
| Git | Any | `brew install git` / your package manager |

---

## Option A — One-Command Start (Recommended) 🐳

This starts everything (Postgres, Redis, Backend, Frontend) in Docker containers.

```bash
# 1. Clone the repo
git clone https://github.com/ravin972/voxly.git
cd voxly

# 2. Create backend environment file
cp backend/.env.example backend/.env
# → Edit backend/.env and fill in your secrets (see section below)

# 3. Start the whole stack
docker compose up
```

Once running:
| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs *(only works when `DEBUG=True`)* |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |

To stop: `docker compose down`
To reset database: `docker compose down -v` (removes all volumes)

---

## Option B — Manual Start (Better for Hot Reload Dev)

### Step 1 — Start Infrastructure Only
```bash
docker compose up postgres redis
```

### Step 2 — Backend
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate      # macOS/Linux
.\venv\Scripts\activate       # Windows

# Install dependencies
pip install -r requirements.txt

# Copy and fill in your .env
cp .env.example .env

# Run database migrations
alembic upgrade head

# Seed subscription plans (run once)
python -m app.scripts.seed_plans

# Start the server
uvicorn app.main:app --reload --port 8000
```

### Step 3 — Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## Environment Variables Reference (`backend/.env`)

```dotenv
# ── Database ──────────────────────────────────────────────────────────
# For local Docker Postgres:
DATABASE_URL=postgresql://projectvoice:projectvoice@localhost:5432/projectvoice
# For Supabase:
# DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

# ── JWT Auth ──────────────────────────────────────────────────────────
SECRET_KEY=your-super-secret-key-min-32-chars  # generate: python -c "import secrets; print(secrets.token_hex(32))"
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# ── Internal Security ─────────────────────────────────────────────────
INTERNAL_WEBHOOK_SECRET=   # generate same way as SECRET_KEY

# ── AI Providers (at least one required) ──────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=AIzaSy...

# ── GitHub Integration ────────────────────────────────────────────────
GITHUB_TOKEN=ghp_...                    # For reading repo stats
GITHUB_WEBHOOK_SECRET=your-webhook-secret

# ── WhatsApp / Twilio ─────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# ── Email / Resend ────────────────────────────────────────────────────
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=support@yourdomain.com

# ── Billing ───────────────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...

# ── OAuth (Social Login) ──────────────────────────────────────────────
GOOGLE_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
LINKEDIN_CLIENT_ID=...
LINKEDIN_CLIENT_SECRET=...

# ── App Settings ──────────────────────────────────────────────────────
FRONTEND_URL=http://localhost:3000
DEBUG=True                  # Set False in production
REDIS_URL=redis://localhost:6379
```

---

## Running Tests

```bash
cd backend
pytest                          # All tests
pytest -v                       # Verbose
pytest tests/test_auth.py       # Single file
pytest --cov=app --cov-report=term  # With coverage report
```

---

## Useful Commands

```bash
# Generate a new Alembic migration after changing a model
alembic revision --autogenerate -m "describe your change"
alembic upgrade head

# Reset local database completely
alembic downgrade base
alembic upgrade head

# Connect to local Postgres
docker exec -it voxly-postgres-1 psql -U projectvoice -d projectvoice

# View backend logs
docker compose logs -f backend

# Rebuild after dependency changes
docker compose build backend
docker compose up
```

---

## Project Structure Overview

```
voxly/
├── backend/             # FastAPI Python backend
│   ├── app/
│   │   ├── api/v1/     # All API route handlers (12 routers)
│   │   ├── models/     # SQLAlchemy ORM models
│   │   ├── schemas/    # Pydantic request/response schemas
│   │   ├── services/   # Business logic (AI, email, WhatsApp)
│   │   ├── tools/      # AI agent tools (GitHub, knowledge base)
│   │   ├── utils/      # Auth helpers, rate limiting
│   │   └── main.py     # FastAPI app + middleware
│   ├── alembic/        # Database migrations
│   ├── tests/          # pytest test suite
│   └── requirements.txt
│
├── frontend/            # Next.js 14 frontend
│   ├── app/            # Pages (App Router)
│   ├── components/     # Reusable React components
│   ├── hooks/          # Custom React hooks (WebSocket, auth, etc.)
│   └── lib/            # API client, utilities
│
├── docs/               # 📚 You are here
├── docker-compose.yml  # Local dev stack
├── docker-compose.prod.yml
└── SESSION_NOTES.md    # Running dev diary
```

See `docs/ARCHITECTURE.md` for the full system design.
