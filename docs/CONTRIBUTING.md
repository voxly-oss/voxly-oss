# Voxly — Contributing Guide

Welcome to the Voxly codebase! This document explains how we work together as a team.

---

## Git Workflow

We use **GitHub Flow** — simple, branch-based development.

```
main (protected, always deployable)
  └── feature/your-feature-name
  └── fix/bug-description
  └── chore/maintenance-task
```

### Branch Naming
| Type | Pattern | Example |
|------|---------|---------|
| New feature | `feature/short-description` | `feature/super-admin-dashboard` |
| Bug fix | `fix/short-description` | `fix/whatsapp-signature-validation` |
| Chore | `chore/short-description` | `chore/update-requirements` |
| Docs | `docs/short-description` | `docs/api-contract` |

### Step-by-Step Workflow
```bash
# 1. Always branch from main
git checkout main
git pull origin main
git checkout -b feature/your-feature

# 2. Make changes, commit frequently
git add .
git commit -m "feat: add super admin tenant list endpoint"

# 3. Push and open a Pull Request
git push origin feature/your-feature
# → Open PR on GitHub targeting main
```

---

## Commit Message Format

We use **Conventional Commits**:

```
<type>: <short description>

Types:
  feat      - New feature
  fix       - Bug fix
  chore     - Dependency update, tooling
  docs      - Documentation only
  refactor  - Code restructuring (no behavior change)
  test      - Adding or updating tests
  style     - Formatting, no logic change
  security  - Security fix
```

**Examples:**
```
feat: add GitHub push notification to WhatsApp
fix: mask phone numbers in outbound WhatsApp logs
security: add HMAC verification to Twilio webhook
docs: add API contract for auth endpoints
test: add tests for client creation and deletion
```

---

## Pull Request Checklist

Before opening a PR, ensure:

- [ ] Branch is based on latest `main`
- [ ] Code follows existing patterns (no raw SQLAlchemy queries without `user_id` filter)
- [ ] New endpoints have `Depends(get_current_user)` unless explicitly public
- [ ] New endpoints have `@limiter.limit(...)` if they can be abused
- [ ] No secrets, `.env` files, or API keys in the diff
- [ ] New routes are registered in `app/main.py`
- [ ] Tests pass: `cd backend && pytest`
- [ ] If adding a new DB column: migration created with `alembic revision --autogenerate`

---

## Code Style & Conventions

### Backend (Python)
- **Python 3.12**, formatted with `black` (we'll enforce this via pre-commit soon)
- **Type hints everywhere** — all function signatures must have types
- **No raw exception text in API responses** — always return a user-facing message
- **Tenant isolation** — every DB query that touches tenant data MUST filter by `user_id`
- **Background tasks** — use FastAPI `BackgroundTasks` for I/O that doesn't need to block the response

**Pattern for a new API endpoint:**
```python
@router.post("/resource", response_model=ResourceResponse)
@limiter.limit("20/minute")
async def create_resource(
    request: Request,  # required by slowapi
    data: ResourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # always
):
    # 1. Validate ownership (if acting on existing data)
    # 2. Business logic
    # 3. Save to DB
    # 4. Return response schema (never raw ORM object)
```

### Frontend (TypeScript)
- **Next.js 14 App Router** — use Server Components where possible
- **No `any` types** — use proper TypeScript interfaces
- **API calls go through `lib/api.ts`** — never use `fetch` directly
- **Hooks in `hooks/`** — custom logic goes in hooks, not component files

---

## Project Structure

```
backend/app/api/v1/   ← API route handlers
backend/app/models/   ← SQLAlchemy models (one file per table)
backend/app/schemas/  ← Pydantic schemas for request/response
backend/app/services/ ← Business logic (AI, email, WhatsApp)
backend/app/tools/    ← AI agent tools
backend/app/utils/    ← Shared utilities (auth, rate limit)
backend/tests/        ← pytest tests
```

**Rule:** If the code is used in more than one place → move it to `services/` or `utils/`.

---

## Running Tests

```bash
cd backend
pytest                              # all tests
pytest -v                           # verbose
pytest tests/test_auth.py           # single file
pytest --cov=app                    # with coverage
```

New tests go in `backend/tests/`. Name them `test_<feature>.py`.  
Use the `client` fixture from `conftest.py` — it sets up an in-memory test DB automatically.

---

## Key Environment Variables

See `docs/SETUP.md` for the full list. Most critical for local dev:
- `DATABASE_URL` — Postgres connection string
- `SECRET_KEY` — JWT signing key (min 32 chars)
- `OPENAI_API_KEY` — at least one AI key is required for WhatsApp flow to work

---

## Getting Help

- **Architecture questions:** Read `docs/ARCHITECTURE.md`
- **Database/schema questions:** Read `docs/DATABASE.md`
- **API reference:** Read `docs/API_CONTRACT.md` or visit `http://localhost:8000/docs` (DEBUG mode only)
- **Session history:** Read `SESSION_NOTES.md` for a running log of what was built and why
- **Stuck on something?** Open a GitHub Discussion or tag @ravin972 in a PR comment
