"""
Voxly AI Providers — Pluggable AI provider system.

Supports multiple AI backends: Claude, OpenAI, Gemini, Ollama, Custom.
Users can bring their own API key (BYOK) or use Voxly's included credits.

Usage:
    from app.services.ai_providers import get_provider

    provider = get_provider("claude")  # or "openai", "gemini", "ollama", "custom"
    result = await provider.generate_response(message, context)
"""

from app.services.ai_providers.base import AIProvider, AIResponse
from app.services.ai_providers.claude_provider import ClaudeProvider
from app.services.ai_providers.openai_provider import OpenAIProvider
from app.services.ai_providers.gemini_provider import GeminiProvider

# Registry of available providers
PROVIDERS = {
    "claude": ClaudeProvider,
    "openai": OpenAIProvider,
    "gemini": GeminiProvider,
    # "ollama": OllamaProvider,     # Phase 4
    # "custom": CustomProvider,     # Phase 5
}

# Default provider — openai confirmed working for dogfood.
# Priority order: Anthropic -> Gemini -> OpenAI (set in get_provider auto-detect).
DEFAULT_PROVIDER = "openai"


def get_provider(provider_name: str = None, api_key: str = None) -> AIProvider:
    """
    Factory function to get an AI provider instance.

    Args:
        provider_name: Name of the provider ("claude", "openai", etc.)
        api_key: Optional user-provided API key (BYOK mode)

    Returns:
        An instance of the requested AIProvider

    Raises:
        ValueError: If the provider is not supported
    """
    from app.config import settings

    # Provider priority: Anthropic -> Gemini -> OpenAI
    if not provider_name:
        if settings.ANTHROPIC_API_KEY:
            name = "claude"
        elif settings.GEMINI_API_KEY:
            name = "gemini"
        elif settings.OPENAI_API_KEY:
            name = "openai"
        else:
            name = "openai"  # Default fallback
    else:
        name = provider_name

    if name not in PROVIDERS:
        available = ", ".join(PROVIDERS.keys())
        raise ValueError(
            f"Provider '{name}' not supported. Available: {available}"
        )

    provider_class = PROVIDERS[name]
    return provider_class(api_key=api_key)


def list_providers() -> list[dict]:
    """List all available providers with metadata."""
    return [
        {
            "name": name,
            "available": True,
            "is_default": name == DEFAULT_PROVIDER,
        }
        for name in PROVIDERS.keys()
    ]
