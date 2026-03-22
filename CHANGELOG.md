# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — 2026-02-28

### Added
- **Multi-provider AI**: Anthropic Claude 3.5, OpenAI GPT-4o, Google Gemini, Groq, Ollama
- **Agentic ReAct Loop**: Reason + Act pattern for complex multi-step queries
- **BYOK (Bring Your Own Key)**: Per-user API key management with encrypted storage
- **GitHub Webhook Integration**: AI-powered build failure analysis with WhatsApp alerts
- **Multimodal Vision**: Screenshot → GitHub Issue via GPT-4o Vision
- **WhatsApp & Telegram**: Client communication via Twilio
- **Rate Limiting**: `slowapi` on auth endpoints (register 5/min, login 10/min, reset 3/min)
- **Webhook HMAC**: GitHub webhook signature validation (SHA-256)
- **Docker Compose**: One-command local development stack
- **`create-voxly` CLI**: `npx create-voxly@latest my-agency` scaffold
- **OAuth**: Google, GitHub, LinkedIn sign-in
- **Billing**: Stripe (international) + Razorpay (India) dual-gateway

### Security
- CORS locked to `FRONTEND_URL` (no wildcard)
- Webhook HMAC-SHA256 signature validation
- Rate limiting on auth endpoints
- Swagger/ReDoc hidden in production (`DEBUG=false`)
- Passwords hashed with bcrypt
- JWT authentication on all API endpoints

### Documentation
- `ROADMAP.md` — Now/Next/Later public roadmap
- `SECURITY.md` — Vulnerability reporting guide
- `CONTRIBUTING.md` — Developer contribution guide
- `CODE_OF_CONDUCT.md` — Community guidelines
- GitHub Issue Templates (Bug Report, Feature Request)
- PR Template
- Architecture & Installation docs in `docs/`

### Tests
- `test_auth.py` — 7 tests (register, login, JWT, password)
- `test_clients.py` — 13 tests (CRUD + multi-tenancy isolation)
- `test_github_webhook.py` — 4 tests (HMAC signature validation)
- `test_ai_providers.py` — Provider abstraction tests
- `test_ai_agent.py` — ReAct loop logic tests
- `test_ai_integration.py` — End-to-end AI chain tests
