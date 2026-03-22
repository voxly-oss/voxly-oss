# 🛠️ Installation Guide

This guide covers three ways to install and run Voxly.

---

## Prerequisites

| Tool | Version |
|------|---------|
| **Node.js** | 18+ |
| **Python** | 3.11+ |
| **PostgreSQL** | 14+ |
| **Redis** | 7+ *(optional, for caching)* |

---

## Option 1: Docker Compose (Easiest)

```bash
git clone https://github.com/voxly/voxly.git
cd voxly
cp .env.example .env   # Edit with your API keys
docker compose up
```

This starts:
- **Backend** on `http://localhost:8000`
- **Frontend** on `http://localhost:3000`
- **PostgreSQL** on port `5432`
- **Redis** on port `6379`

---

## Option 2: Manual Setup

### Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your credentials (DATABASE_URL, SECRET_KEY, etc.)

# Run database migrations
alembic upgrade head

# Start the server
uvicorn app.main:app --reload
```

Backend runs at: `http://localhost:8000`
API docs at: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Set NEXT_PUBLIC_API_URL=http://localhost:8000

# Start dev server
npm run dev
```

Frontend runs at: `http://localhost:3000`

---

## Option 3: CLI Installer

```bash
npx create-voxly@latest my-agency
cd my-agency
```

The CLI will walk you through setup interactively.

---

## Environment Variables

Create a `.env` file in `backend/` with:

```env
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/voxly
SECRET_KEY=your-secret-key-here

# AI Provider (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...    # Optional

# GitHub
GITHUB_TOKEN=ghp_...

# Optional
REDIS_URL=redis://localhost:6379
DEBUG=true
```

Create a `.env` file in `frontend/` with:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Verify Installation

1. Open `http://localhost:8000/health` → Should return `{"status": "healthy"}`
2. Open `http://localhost:3000` → Should show the Voxly login page
3. Open `http://localhost:8000/docs` → Should show Swagger API docs

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `ModuleNotFoundError` | Activate your virtual environment |
| `Connection refused` on port 8000 | Backend not running. Check `uvicorn` output. |
| Database errors | Run `alembic upgrade head` |
| Frontend can't reach API | Check `NEXT_PUBLIC_API_URL` in frontend `.env` |

---

## Next Steps

- [Architecture Overview](./architecture.md)
- [Contributing Guide](../CONTRIBUTING.md)
