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
async def security_headers_middleware(*, request: Request, call_next):
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

# Include API routers
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(clients_router, prefix="/api/v1/clients", tags=["Clients"])
app.include_router(projects_router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(milestones_router, prefix="/api/v1/milestones", tags=["Milestones"])
app.include_router(chat_router, prefix="/api/v1/chat", tags=["Chat"])
app.include_router(whatsapp_router, prefix="/api/v1/whatsapp", tags=["WhatsApp"])
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
def health():
    """Health check endpoint."""
    return {"status": "healthy"}

