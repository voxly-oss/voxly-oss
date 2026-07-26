# Voxly v1.0.0-beta

**Tag:** `v1.0.0-beta`
**Commit:** `ca8ebec9908100209d3641857c2b4403998ef7ec` (`main`, PR #111)
**Release date:** 2026-07-26

## Highlights

- Backend production deployment
- Frontend V3 deployment
- Organization foundation
- Conversation Center
- AI Agents
- Analytics
- Channels
- Project Detail
- Account deletion fix
- Production stabilization
- WebSocket improvements

## Breaking Changes

- None

## Database

- Applied production migrations
- Current migration head: `5b8e3c1f9a2d` (Add unique constraint on `organizations.owner_user_id`)

## Deployment

- Cloud Run revision: `voxly-backend-00019-zz8` (image `sha256:a397c7ef9c95...`, identical build to `voxly-backend-00018-fgz` — the 00019 revision is an environment-variable update only, not a code change)
- Frontend deployment: Vercel, production branch `main`
- Production URLs:
  - Backend: `https://voxly-backend-703348211297.us-central1.run.app`
  - Frontend: `https://voxly-oss.vercel.app`

## Known Issues

**Remaining P1 items:**
- Frontend doesn't consume the Phase 3 / Channels backend endpoints it was built to use
- No inbound message throttling on WhatsApp/Telegram
- Telegram webhook fails open if its secret is unset
- HSTS header not actually reaching clients in production
- Several sensitive endpoints have no rate limiting
- Password-reset token reusable within its 15-minute window, and silent email failure
- Missing indexes on hot query columns (`chat_history.created_at`, `conversation_states.status`)
- Production feature flags (e.g. `DUAL_WRITE_ORGANIZATIONS_ENABLED`) have no source of truth in version control — set directly on the Cloud Run service outside the repo

**Remaining P2 items:**
- Organizations/Roles/Memberships/Invitations exist at the DB layer with zero API surface
- No structured (JSON) logging; no request-correlation ID beyond Cloud Run's trace header
- No global FastAPI exception handler
- GitHub sync has no explicit API rate-limit/backoff handling
- SQLAlchemy connection pool uses unexamined library defaults
- WebSocket manager is in-process only, no cross-instance pub/sub
- `.env.example` ships `DEBUG=true` (confirmed not the real production value)
- `INTERNAL_WEBHOOK_SECRET` is dead config (the endpoint it guarded was refactored away)

Full detail: `PRODUCTION_READINESS_AUDIT.md`, `STABILIZATION_REPORT.md`.

## Next Milestone

- Organization-first architecture
- Remove transitional dual-write model
- Complete tenancy migration
