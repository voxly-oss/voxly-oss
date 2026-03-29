from typing import Any, List, Dict, Optional
import json
import logging
import asyncio
from app.config import settings
from app.services.ai_providers.base import AIProvider, AIResponse, SYSTEM_PROMPT

logger = logging.getLogger(__name__)

try:
    from google import genai
    from google.genai import types
except ImportError:  # pragma: no cover - dependency availability is environment-specific
    genai = None
    types = None


def _to_gemini_tools(tools: list) -> list:
    gemini_tools = []
    for tool in tools:
        schema = tool.to_openai_schema()
        func = schema["function"]
        gemini_tools.append(
            types.Tool(
                function_declarations=[
                    types.FunctionDeclaration(
                        name=func["name"],
                        description=func["description"],
                        parameters=func["parameters"],
                    )
                ]
            )
        )
    return gemini_tools


def _to_gemini_contents(messages: list) -> list:
    contents = []
    for msg in messages:
        role = "model"
        if msg["role"] == "user":
            role = "user"
        elif msg["role"] == "tool":
            role = "tool"

        content = msg["content"]
        parts = []
        if isinstance(content, str):
            parts.append({"text": content})
        elif isinstance(content, list):
            for block in content:
                if block.get("type") == "text":
                    parts.append({"text": block.get("text")})
                elif block.get("type") == "tool_use":
                    parts.append(
                        {
                            "function_call": {
                                "name": block.get("name"),
                                "args": block.get("input"),
                            }
                        }
                    )
                elif block.get("type") == "tool_result":
                    parts.append(
                        {
                            "function_response": {
                                "name": block.get("name"),
                                "response": {"result": block.get("content")},
                            }
                        }
                    )
        if parts:
            contents.append({"role": role, "parts": parts})
    return contents


def _build_usage_object(usage) -> Any:
    if usage:
        return type(
            "Usage",
            (),
            {
                "input_tokens": getattr(usage, "prompt_token_count", 0),
                "output_tokens": getattr(usage, "candidates_token_count", 0),
            },
        )()
    return type("Usage", (), {"input_tokens": 0, "output_tokens": 0})()


def _build_provider_response(response, model_name: str):
    content_blocks = []
    stop_reason = "end_turn"
    if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
        for part in response.candidates[0].content.parts:
            if part.function_call:
                content_blocks.append(
                    type(
                        "ToolUseBlock",
                        (),
                        {
                            "type": "tool_use",
                            "name": part.function_call.name,
                            "input": part.function_call.args,
                            "id": f"call_{part.function_call.name}_{response.candidates[0].index}",
                        },
                    )()
                )
                stop_reason = "tool_use"
            elif part.text:
                content_blocks.append(type("TextBlock", (), {"type": "text", "text": part.text})())
    return type(
        "ProviderResponse",
        (),
        {
            "content": content_blocks,
            "stop_reason": stop_reason,
            "usage": _build_usage_object(response.usage_metadata),
            "model": model_name,
        },
    )()


def _build_error_provider_response(error: Exception):
    return type(
        "ProviderResponse",
        (),
        {
            "content": [type("TextBlock", (), {"type": "text", "text": f"Error: {error}"})()],
            "stop_reason": "end_turn",
            "usage": type("Usage", (), {"input_tokens": 0, "output_tokens": 0})(),
            "model": "error",
        },
    )()

class GeminiProvider(AIProvider):
    """Google Gemini (Pro 1.5) provider using the modern google-genai SDK."""
    
    def __init__(self, api_key: str = None):
        super().__init__(api_key)
        key = api_key or settings.GEMINI_API_KEY
        if not key:
            raise ValueError("Gemini API Key is missing. Please set GEMINI_API_KEY.")
        if genai is None or types is None:
            raise ValueError("Gemini provider requires 'google-genai' package. Install backend dependencies.")
        
        self.client = genai.Client(api_key=key)
        self.model_name = 'gemini-1.5-pro'
        self.legacy_model = None
        try:
            model_cls = getattr(genai, "GenerativeModel", None)
            if callable(model_cls):
                self.legacy_model = model_cls(self.model_name)
        except Exception:
            self.legacy_model = None

    @property
    def provider_name(self) -> str:
        return "Gemini"

    @property
    def default_model(self) -> str:
        return "gemini-1.5-pro"

    async def generate_response(
        self,
        message: str,
        context: str = "",
        system_prompt: str = SYSTEM_PROMPT,
        max_tokens: int = 1000,
    ) -> AIResponse:
        """Standard text generation."""
        try:
            full_prompt = f"{system_prompt}\n\nContext:\n{context}\n\nUser: {message}"
            
            if self.legacy_model and hasattr(self.legacy_model, "generate_content_async"):
                response = await self.legacy_model.generate_content_async(full_prompt)
            else:
                response = await asyncio.to_thread(
                    self.client.models.generate_content,
                    model=self.model_name,
                    contents=full_prompt
                )
            
            # Extract usage with safe getattr as per CodeRabbit review
            usage = response.usage_metadata
            tokens = 0
            if usage:
                total = self._safe_int(getattr(usage, "total_token_count", None), default=-1)
                if total >= 0:
                    tokens = total
                else:
                    prompt = self._safe_int(getattr(usage, "prompt_token_count", None))
                    candidates = self._safe_int(getattr(usage, "candidates_token_count", None))
                    tokens = prompt + candidates
            
            return AIResponse(
                response=response.text,
                tokens_used=tokens,
                model=self.model_name,
                provider="gemini",
                success=True
            )
            
        except Exception as e:
            logger.error(f"Gemini error: {e}")
            return AIResponse(
                response="Error generating response.",
                tokens_used=0,
                model="error",
                provider="gemini",
                success=False,
                error=str(e)
            )

    async def generate_response_with_tools(
        self,
        messages: list,
        tools: list,
        system_prompt: str = SYSTEM_PROMPT,
        max_tokens: int = 1000,
    ) -> Any:
        """
        Generate response using Gemini Function Calling (new SDK).
        """
        gemini_tools = _to_gemini_tools(tools)
        contents = _to_gemini_contents(messages)

        try:
            # Using generate_content with tools and system_instruction
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    tools=gemini_tools,
                    max_output_tokens=max_tokens
                )
            )

            return _build_provider_response(response, self.model_name)

        except Exception as e:
            logger.error(f"Gemini Tool Error: {e}")
            return _build_error_provider_response(e)

    @staticmethod
    def _safe_int(value, default: int = 0) -> int:
        if isinstance(value, bool) or value is None:
            return default
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        return default
