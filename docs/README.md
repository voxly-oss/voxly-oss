# Voxly Documentation

Welcome to the Voxly developer documentation hub.

## 📚 Documents

| Document | What's in it |
|----------|-------------|
| [SETUP.md](./SETUP.md) | **Start here.** Local dev setup from zero → running in 30 min |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | High-level system design, component map, data flow diagrams |
| [DATABASE.md](./DATABASE.md) | Full database schema with ER diagram, all tables and columns |
| [API_CONTRACT.md](./API_CONTRACT.md) | Every API endpoint: method, path, auth, request/response |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Git workflow, commit conventions, PR checklist, code style |
| [DUE_DILIGENCE.md](./DUE_DILIGENCE.md) | Evidence-based product/technical review: findings F1–F20, scorecard |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Production + B2B roadmap: P0 fixes → enterprise, with code & data-model changes |

## 🚀 Quick Start

```bash
git clone https://github.com/ravin972/voxly.git
cd voxly
cp backend/.env.example backend/.env
# → Fill in your keys in backend/.env (see SETUP.md)
docker compose up
```

Frontend: http://localhost:3000  
Backend API: http://localhost:8000  
Swagger UI: http://localhost:8000/docs *(DEBUG=True only)*

## 🗂 Key Paths

```
backend/app/api/v1/   → All API routes
backend/app/models/   → Database models
backend/app/services/ → AI, email, WhatsApp logic
backend/tests/        → Test suite (pytest)
frontend/app/         → Next.js pages
docs/                 → 📍 You are here
```
