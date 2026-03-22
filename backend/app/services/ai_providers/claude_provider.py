"""
Claude (Anthropic) AI Provider — Default provider for Voxly.

Uses Anthropic's Claude API for generating client responses.
Supports BYOK (Bring Your Own Key) mode.
"""

from anthropic import AsyncAnthropic
from app.config import get_settings
from typing import Any
from app.services.ai_providers.base import AIProvider, AIResponse, SYSTEM_PROMPT
import logging

logger = logging.getLogger(__name__)
settings = get_settings()


class ClaudeProvider(AIProvider):
    """Anthropic Claude provider (default)."""
    
    def __init__(self, api_key: str = None):
        super().__init__(api_key)
        # Use user's key (BYOK) or platform's key
        key = api_key or settings.ANTHROPIC_API_KEY
        self.client = AsyncAnthropic(api_key=key)
    
    @property
    def provider_name(self) -> str:
        return "Claude"
    
    @property
    def default_model(self) -> str:
        return "claude-sonnet-4-5-20250929"
    
    async def generate_response(
        self,
        message: str,
        context: str,
        system_prompt: str = SYSTEM_PROMPT,
        max_tokens: int = 1000,
    ) -> AIResponse:
        try:
            response = await self.client.messages.create(
                model=self.default_model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=[
                    {
                        "role": "user",
                        "content": context,
                    }
                ],
            )
            
            response_text = (
                response.content[0].text
                if response.content
                else "Sorry, I couldn't generate a response."
            )
            
            tokens_used = response.usage.input_tokens + response.usage.output_tokens
            
            logger.info(
                f"Claude API call successful. "
                f"Model: {self.default_model}, Tokens: {tokens_used}"
            )
            
            return AIResponse(
                response=response_text,
                tokens_used=tokens_used,
                model=self.default_model,
                success=True,
                provider="claude",
                metadata={
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                },
            )
        
        except Exception as e:
            logger.error(f"Claude API error: {str(e)}")
            
            return AIResponse(
                response=(
                    f"Hi! I'm having trouble checking your project status "
                    f"right now. Please contact your project manager directly "
                    f"or try again in a few minutes. 🙏"
                ),
                tokens_used=0,
                model="error",
                success=False,
                error=str(e),
            )

    async def generate_response_with_tools(
        self,
        messages: list,
        tools: list,
        system_prompt: str = SYSTEM_PROMPT,
        max_tokens: int = 1000,
    ) -> Any:
        try:
            # Format tools for Anthropic (input_schema is already correct from base.py)
            anthropic_tools = [t.to_schema() for t in tools]
            
            response = await self.client.messages.create(
                model=self.default_model,
                max_tokens=max_tokens,
                system=system_prompt,
                messages=messages,
                tools=anthropic_tools,
            )
            return response
        except Exception as e:
            logger.error(f"Claude Tool API error: {str(e)}")
            raise e

