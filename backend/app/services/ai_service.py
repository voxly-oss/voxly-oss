"""
Voxly AI Service — Orchestrator for AI-powered client responses.

This module uses the pluggable provider system from ai_providers/.
It delegates actual AI calls to the configured provider (Claude, OpenAI, etc.)
while handling context building, logging, and error handling.

Usage:
    from app.services.ai_service import generate_client_response

    result = await generate_client_response(
        client_name="Acme Corp",
        project_name="Website Redesign",
        github_stats={...},
        milestones=[...],
        client_question="What's the status?"
    )
"""

from app.services.ai_providers import get_provider, DEFAULT_PROVIDER
from app.services.ai_providers.base import build_context, SYSTEM_PROMPT
from app.config import settings
from typing import Dict, List, Any, Optional
import logging
import time

logger = logging.getLogger(__name__)

# Errors that indicate we should try next provider instead of giving up
_RETRYABLE_SIGNALS = (
    "503", "unavailable", "rate limit", "rate_limit",
    "429", "quota", "overloaded", "capacity",
)


def _build_fallback_chain() -> list:
    """Return ordered list of configured providers to try.

    Priority: Claude -> OpenAI -> Gemini. Claude is primary (funded, verified
    working, best quality); OpenAI is the reliable fallback; Gemini sits last
    because its free-tier key runs out of credits and returns 429.
    """
    chain = []
    if settings.ANTHROPIC_API_KEY:
        chain.append("claude")
    if settings.OPENAI_API_KEY:
        chain.append("openai")
    if settings.GEMINI_API_KEY:
        chain.append("gemini")
    if not chain:
        chain.append("claude")
    return chain


def _is_retryable(error: str) -> bool:
    """Return True if the error suggests a temporary provider overload."""
    lowered = error.lower()
    return any(sig in lowered for sig in _RETRYABLE_SIGNALS)


async def generate_client_response(
    client_name: str,
    project_name: str,
    github_stats: Dict,
    milestones: List[Dict],
    client_question: str,
    media_url: str = None,
    provider_name: str = None,
    api_key: str = None,
) -> Dict[str, Any]:
    """
    Generate AI response using the configured provider with automatic fallback.

    When the primary provider returns a 503/rate-limit/overload error the
    service transparently retries with the next available provider so the
    raw error string never reaches the end user.

    Returns:
        Dictionary with response, tokens_used, model, provider, success, error
    """
    context = build_context(
        client_name=client_name,
        project_name=project_name,
        github_stats=github_stats,
        milestones=milestones,
        client_question=client_question,
    )

    from app.services.ai_agent import VoxlyAgent

    # If caller specified a provider (BYOK), only try that one
    if provider_name:
        providers_to_try = [provider_name]
    else:
        providers_to_try = _build_fallback_chain()

    last_error: Optional[str] = None

    for attempt, pname in enumerate(providers_to_try):
        start_ts = time.monotonic()
        logger.info(
            "[AI] Attempt %d/%d provider=%s client=%r",
            attempt + 1, len(providers_to_try), pname, client_name,
        )
        try:
            agent = VoxlyAgent(provider_name=pname, api_key=api_key)
            result = await agent.chat(
                user_message=client_question,
                images=[media_url] if media_url else None,
                context=context,
            )

            latency_ms = int((time.monotonic() - start_ts) * 1000)

            if result["success"]:
                logger.info(
                    "[AI] OK provider=%s model=%s tokens=%s latency=%dms",
                    pname, result.get("model"), result.get("tokens_used", 0), latency_ms,
                )
                return {
                    "response": result["response"],
                    "tokens_used": result.get("tokens_used", 0),
                    "model": result.get("model", "unknown"),
                    "provider": pname,
                    "success": True,
                    "error": None,
                }

            # Provider returned success=False (e.g. Gemini 503)
            last_error = result.get("error") or "AI response generation failed"
            logger.warning(
                "[AI] FAIL provider=%s error=%r latency=%dms",
                pname, last_error, latency_ms,
            )

            if attempt < len(providers_to_try) - 1 and _is_retryable(last_error):
                next_p = providers_to_try[attempt + 1]
                logger.warning("[AI] Retryable — falling back to %s", next_p)
                continue

            break  # Non-retryable or no more fallbacks

        except Exception as exc:
            latency_ms = int((time.monotonic() - start_ts) * 1000)
            last_error = str(exc)
            logger.error(
                "[AI] Exception provider=%s %s: %s latency=%dms",
                pname, type(exc).__name__, exc, latency_ms,
                exc_info=True,
            )
            if attempt < len(providers_to_try) - 1:
                logger.warning("[AI] Falling back to %s", providers_to_try[attempt + 1])
                continue
            break

    # All providers exhausted — never send raw error to client
    logger.error(
        "[AI] All providers exhausted for client=%r. Last error: %s",
        client_name, last_error,
    )
    return {
        "response": (
            f"Hi {client_name}! The AI service is temporarily unavailable. "
            "Please try again shortly. \U0001f64f"
        ),
        "tokens_used": 0,
        "model": "error",
        "provider": "none",
        "success": False,
        "error": last_error,
    }
