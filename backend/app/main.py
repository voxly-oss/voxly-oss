from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.rate_limit import limiter

from app.api.v1 import (
    auth_router, 
    clients_router, 
    projects_router, 
    milestones_router,
    chat_router,
    whatsapp_router,
    telegram_router,
    api_keys_router,
    billing_router,
    notifications_router,
    dashboard_router,
    ai_keys_router,
)

# Create FastAPI application
app = FastAPI(
    title="Voxly API",
    description="SaaS platform API for dev agencies to manage clients and projects with AI-powered WhatsApp interactions",
    version="2.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

# Attach rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Configure CORS — locked to FRONTEND_URL in all environments
allowed_origins = list({
    o for o in [
        settings.FRONTEND_URL,
        "http://localhost:3001",
        "http://localhost:3000",
    ] if o
})
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    """Attach baseline security headers to every HTTP response."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    return response


@app.middleware("http")
async def usage_metering_middleware(request: Request, call_next):
    """Record per-tenant API usage for authenticated /api/v1 calls.

    Runs after the route (and its auth dependency) has resolved, so
    ``request.state.user_id`` — set by ``get_current_user`` — is available.
    Metering never affects the response and swallows its own errors so a
    Redis blip can't break the API.
    """
    response = await call_next(request)
    try:
        user_id = getattr(request.state, "user_id", None)
        if user_id and request.url.path.startswith("/api/v1/"):
            from app.utils.usage_tracker import get_usage_tracker

            await get_usage_tracker().track_request(
                user_id=user_id,
                api_key_id=getattr(request.state, "api_key_id", None),
                endpoint=request.url.path,
            )
    except Exception:  # pragma: no cover - metering must never break a request
        pass
    return response

# Include API routers
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(clients_router, prefix="/api/v1/clients", tags=["Clients"])
app.include_router(projects_router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(milestones_router, prefix="/api/v1/milestones", tags=["Milestones"])
app.include_router(chat_router, prefix="/api/v1/chat", tags=["Chat"])
app.include_router(whatsapp_router, prefix="/api/v1/whatsapp", tags=["WhatsApp"])
app.include_router(telegram_router, prefix="/api/v1/telegram", tags=["Telegram"])
app.include_router(api_keys_router, prefix="/api/v1/api-keys", tags=["API Keys"])
app.include_router(billing_router, prefix="/api/v1/billing", tags=["Billing"])
app.include_router(notifications_router, prefix="/api/v1/notifications", tags=["Notifications"])
app.include_router(dashboard_router, prefix="/api/v1/dashboard", tags=["Dashboard"])
app.include_router(ai_keys_router, prefix="/api/v1/ai-keys", tags=["AI Keys (BYOK)"])
from app.api.v1.github import router as github_router
app.include_router(github_router, prefix="/api/v1/github", tags=["GitHub"])

from app.api.v1.ai import router as ai_router
app.include_router(ai_router, prefix="/api/v1/ai", tags=["AI Agent"])

from app.api.v1.super_admin import router as super_admin_router
app.include_router(super_admin_router, prefix="/voxly-admin", include_in_schema=False)


@app.get("/", tags=["Root"])
def root():
    """Root endpoint returning API information."""
    return {
        "message": "Voxly API",
        "version": "2.0.0",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
@app.get("/health/live", tags=["Health"])
def health_live():
    """Liveness probe — the process is up. Never touches dependencies.

    Kept shallow on purpose: a transient Redis/DB blip must not fail liveness
    (which would trigger a pointless restart). Dependency health belongs on
    the readiness probe below.
    """
    return {"status": "healthy"}


@app.get("/health/ready", tags=["Health"])
def health_ready():
    """Readiness probe — verifies the app can serve traffic.

    Checks the database and Redis. Returns 503 with a per-dependency
    breakdown if either is unavailable so orchestrators can pull the
    instance out of rotation instead of routing failing requests to it.
    """
    checks = {"database": False, "redis": False}

    # Database
    try:
        from sqlalchemy import text
        from app.database import SessionLocal

        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            checks["database"] = True
        finally:
            db.close()
    except Exception as exc:  # pragma: no cover - infra failure path
        import logging
        logging.getLogger(__name__).error("Health: DB check failed: %s", exc)

    # Redis
    try:
        from app.services.cache_service import redis_client

        redis_client.ping()
        checks["redis"] = True
    except Exception as exc:  # pragma: no cover - infra failure path
        import logging
        logging.getLogger(__name__).error("Health: Redis check failed: %s", exc)

    healthy = all(checks.values())
    payload = {"status": "healthy" if healthy else "degraded", "checks": checks}
    if not healthy:
        return JSONResponse(status_code=503, content=payload)
    return payload

