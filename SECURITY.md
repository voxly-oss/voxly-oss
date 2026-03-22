# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 2.x     | ✅ Active support  |
| 1.x     | ❌ No longer supported |

## Reporting a Vulnerability

**Please do NOT open a public issue for security vulnerabilities.**

Instead, email us at: **security@voxly.dev**

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment
- Suggested fix (if any)

We will acknowledge your report within **48 hours** and provide a timeline for a fix.

## Security Practices

- All API endpoints require JWT authentication.
- Passwords are hashed with bcrypt.
- API keys are prefixed and scoped per-user.
- Rate limiting via `slowapi` on auth endpoints.
- CORS is locked to `FRONTEND_URL` (no wildcard in production).
- GitHub webhooks are validated with HMAC-SHA256 signatures.
- Swagger/ReDoc docs are hidden in production (`DEBUG=false`).
- Environment variables are used for all secrets (never hardcoded).

## Responsible Disclosure

We appreciate security researchers who follow responsible disclosure. We will credit you in our release notes (unless you prefer to remain anonymous).
