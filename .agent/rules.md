# Voxly — Workspace Rules

## Project Identity
- **Project Name**: Voxly (NOT ProjectVoice — that's the old name)
- **Tagline**: Open-source AI-powered client communication platform
- **GitHub**: ravin972/voxly
- **Stack**: FastAPI (backend), Next.js (frontend), Claude AI, PostgreSQL, Redis, WhatsApp (Twilio)
- **Co-founders**: Ravin Pandey (ravin972)

## Code Standards

### Backend (Python / FastAPI)
- Python 3.11+
- Use `async/await` for all database and API operations
- All API routes go in `backend/app/api/v1/`
- All services go in `backend/app/services/`
- AI providers use the pluggable provider pattern in `backend/app/services/ai_providers/`
- Alembic for database migrations, never raw SQL changes
- Type hints required on all function signatures
- Docstrings required on all public functions
- Use `logging` module (not `print`)
- Config via Pydantic `BaseSettings` in `backend/app/config.py`

### Frontend (TypeScript / Next.js)
- TypeScript strict mode
- Components in `frontend/components/`
- Hooks in `frontend/hooks/`
- API calls centralized in `frontend/lib/api.ts`
- Use shadcn/ui components from `frontend/components/ui/`
- Design system: "Deep Space" theme (dark mode, glassmorphism, cyan/violet accents)
- All pages need SEO meta tags

### Naming
- Files: `snake_case.py` (Python), `camelCase.ts` (TypeScript), `PascalCase.tsx` (React components)
- Functions: `snake_case` (Python), `camelCase` (TypeScript)
- Classes: `PascalCase` everywhere
- API routes: `/api/v1/{resource}` (plural, lowercase)
- Database tables: `snake_case` (plural)

## Security Rules (CRITICAL)
- NEVER hardcode API keys, tokens, or passwords in source code
- ALL secrets go in `.env` (which is gitignored)
- `docs/strategy/` is INTERNAL — never push to GitHub
- Run `/pre-push-check` before every push to GitHub
- Test scripts (`test_ws.*`) are gitignored
- No `console.log` with sensitive data in production code
- JWT tokens: short expiry (30 min access, 7 day refresh)

## Architecture Decisions
- REST API (no GraphQL yet — will add when mobile app is built)
- AI providers are pluggable — use `ai_providers/base.py` pattern
- WebSocket for real-time chat at `/api/v1/chat/ws`
- WhatsApp via Twilio webhook
- GitHub integration for project stats (cached in Redis)

## When Creating New Features
1. Backend first → API endpoint + tests
2. Frontend second → UI connected to API
3. Always update CHANGELOG.md
4. If it's a new API endpoint, update the API docs
5. If it changes the database, create an Alembic migration

## Branding
- Name: **Voxly** (always capitalized)
- Never use "ProjectVoice" — that's deprecated
- Logo: Orb/sphere design on dark background
- Colors: Deep Space (#0a0a1a), Cyan accents, Violet gradients
- Font: Space Grotesk / Inter
