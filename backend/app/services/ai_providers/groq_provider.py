"""Groq provider: open-weight models (Llama, etc.) behind an OpenAI-compatible API.

Reuses OpenAIProvider unchanged; only the endpoint, key and model differ.
"""

from app.config import settings
from app.services.ai_providers.openai_provider import OpenAIProvider


class GroqProvider(OpenAIProvider):
    provider_id = "groq"
    display_name = "Groq"
    key_setting = "GROQ_API_KEY"
    base_url = "https://api.groq.com/openai/v1"

    def _configured_model(self) -> str:
        return settings.GROQ_MODEL
