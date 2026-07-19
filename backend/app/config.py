from pydantic_settings import BaseSettings, SettingsConfigDict as ConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    DATABASE_URL: str

    # JWT Configuration
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Internal service auth (WhatsApp webhook → handle_chat)
    # Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    INTERNAL_WEBHOOK_SECRET: str = ""

    # AI (Anthropic / OpenAI / Gemini)
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    GEMINI_API_KEY: str = ""

    # GitHub
    GITHUB_TOKEN: str = ""
    GITHUB_WEBHOOK_SECRET: str = ""  # Set this in production!

    # WhatsApp (Twilio)
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_WHATSAPP_NUMBER: str = "whatsapp:+14155238886"

    # Redis (for caching and Celery)
    REDIS_URL: str = "redis://localhost:6379"

    # Stripe (International billing)
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # Razorpay (India billing)
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    # API Key Configuration
    API_KEY_PREFIX: str = "vx_live_"

    # Google OAuth
    GOOGLE_CLIENT_ID: str = ""

    # GitHub OAuth
    GITHUB_OAUTH_CLIENT_ID: str = ""
    GITHUB_OAUTH_CLIENT_SECRET: str = ""

    # LinkedIn OAuth


    # Frontend URL (for OAuth redirects)
    FRONTEND_URL: str = "http://localhost:3000"

    # Email config
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "onboarding@resend.dev"

    # Super Admin (Voxly owner only)
    SUPER_ADMIN_EMAIL: str = ""
    SUPER_ADMIN_SECRET: str = ""  # Extra secret required in X-Admin-Secret header

    # Telegram Bot
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_WEBHOOK_SECRET: str = ""  # Random token to verify Telegram webhook calls

    # Application
    DEBUG: bool = False
    RATE_LIMIT_PER_MINUTE: int = 60  # Auth endpoints rate limit

    # Phase 1 Milestone 3: tenant dual-write (temporary migration scaffolding —
    # see docs/TARGET_ARCHITECTURE.md and CLAUDE.md Phase 1 log). Both default
    # OFF: flipping them on is a deploy-time decision, not a code change.
    # With DUAL_WRITE_ORGANIZATIONS_ENABLED=False, tenant resolution performs
    # zero DB queries and every write path behaves exactly as before Milestone 3.
    DUAL_WRITE_ORGANIZATIONS_ENABLED: bool = False
    # Independent of the above — gates an internal, response-invisible
    # comparison read used to validate org_id-scoped queries before Phase 2
    # ever cuts real reads over to them.
    DUAL_READ_SHADOW_VERIFY_ENABLED: bool = False

    # Agent Vision Phase 0 (see docs/AGENT_VISION_RESEARCH.md): transcribe
    # inbound voice notes before the AI pipeline. Default OFF — flag-off is a
    # byte-identical no-op (audio media keeps its pre-Phase-0 handling). Uses
    # OPENAI_API_KEY for OpenAI's transcription API; degrades to no-op if unset.
    VOICE_TRANSCRIPTION_ENABLED: bool = False

    # Agent Vision Phase 0 slice 2: detect the client's language and localize the
    # fixed system strings (errors, onboarding). Default OFF — flag-off makes
    # detect_language() return 'en' for everything, so every canned string keeps
    # its exact current English text. AI-generated replies mirror language via
    # the prompt regardless of this flag.
    LANGUAGE_DETECTION_ENABLED: bool = False

    model_config = ConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


settings = get_settings()
