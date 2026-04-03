from typing import Any, List, Dict, Optional
import json
import logging
from openai import AsyncOpenAI
from app.config import settings
from app.services.ai_providers.base import AIProvider, AIResponse, SYSTEM_PROMPT

logger = logging.getLogger(__name__)


def _get_block_type(block) -> str | None:
    if hasattr(block, "type"):
        return block.type
    if isinstance(block, dict):
        return block.get("type")
    return None


def _get_block_value(block, attr: str, default=None):
    if hasattr(block, attr):
        return getattr(block, attr)
    if isinstance(block, dict):
        return block.get(attr, default)
    return default


def _build_openai_message(role: str, content) -> dict:
    if isinstance(content, str):
        return {"role": role, "content": content}

    text_part = ""
    tool_calls = []
    for block in content:
        block_type = _get_block_type(block)
        if block_type == "text":
            text_part += _get_block_value(block, "text", "")
        elif block_type == "tool_use":
            tool_calls.append(
                {
                    "id": _get_block_value(block, "id", ""),
                    "type": "function",
                    "function": {
                        "name": _get_block_value(block, "name", ""),
                        "arguments": json.dumps(_get_block_value(block, "input", {})),
                    },
                }
            )

    new_msg = {"role": role, "content": text_part}
    if tool_calls:
        new_msg["tool_calls"] = tool_calls
        if not text_part:
            new_msg["content"] = None
    return new_msg


def _extract_tool_result_messages(content) -> list[dict]:
    tool_messages = []
    if not isinstance(content, list):
        return tool_messages
    for block in content:
        if _get_block_type(block) == "tool_result":
            tool_messages.append(
                {
                    "role": "tool",
                    "tool_call_id": _get_block_value(block, "tool_use_id"),
                    "content": _get_block_value(block, "content"),
                }
            )
    return tool_messages


def _to_openai_messages(messages: list, system_prompt: str) -> list[dict]:
    openai_messages = [{"role": "system", "content": system_prompt}]
    for msg in messages:
        role = msg["role"]
        content = msg["content"]
        openai_messages.append(_build_openai_message(role, content))
        if role == "user":
            openai_messages.extend(_extract_tool_result_messages(content))
    return openai_messages


def _to_provider_response(response):
    message = response.choices[0].message
    content_blocks = []
    if message.content:
        content_blocks.append(type("TextBlock", (), {"type": "text", "text": message.content})())
    if message.tool_calls:
        for tool_call in message.tool_calls:
            content_blocks.append(
                type(
                    "ToolUseBlock",
                    (),
                    {
                        "type": "tool_use",
                        "name": tool_call.function.name,
                        "input": json.loads(tool_call.function.arguments),
                        "id": tool_call.id,
                    },
                )()
            )

    finish_reason = response.choices[0].finish_reason
    stop_reason = "tool_use" if finish_reason == "tool_calls" else "end_turn" if finish_reason == "stop" else finish_reason
    usage = response.usage
    usage_obj = type(
        "Usage",
        (),
        {
            "input_tokens": usage.prompt_tokens,
            "output_tokens": usage.completion_tokens,
        },
    )()
    return type(
        "ProviderResponse",
        (),
        {
            "content": content_blocks,
            "stop_reason": stop_reason,
            "usage": usage_obj,
            "model": response.model,
        },
    )()

class OpenAIProvider(AIProvider):
    """OpenAI (GPT-4) provider."""
    
    def __init__(self, api_key: str = None):
        super().__init__(api_key)
        key = api_key or settings.OPENAI_API_KEY
        if not key:
            raise ValueError("OpenAI API Key is missing. Please set OPENAI_API_KEY.")
        self.client = AsyncOpenAI(api_key=key)

    @property
    def provider_name(self) -> str:
        return "OpenAI"

    @property
    def default_model(self) -> str:
        return "gpt-4o"

    async def generate_response(
        self,
        message: str,
        context: str = "",
        system_prompt: str = SYSTEM_PROMPT,
        max_tokens: int = 1000,
    ) -> AIResponse:
        """Standard text generation."""
        try:
            full_system_prompt = f"{system_prompt}\n\nContext:\n{context}"
            
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": full_system_prompt},
                    {"role": "user", "content": message}
                ],
                max_tokens=max_tokens,
                temperature=0.7,
            )
            
            content = response.choices[0].message.content
            usage = response.usage
            
            return AIResponse(
                response=content,
                tokens_used=(usage.prompt_tokens + usage.completion_tokens) if usage else 0,
                model="gpt-4o",
                provider="openai",
                success=True
            )
            
        except Exception as e:
            logger.error(f"OpenAI error: {e}")
            return AIResponse(
                response="Error generating response.",
                tokens_used=0,
                model="error",
                provider="openai",
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
        Generate response using OpenAI Tools API.
        Adapts generic tool definitions to OpenAI format.
        """
        openai_tools = [tool.to_openai_schema() for tool in tools]
        openai_messages = _to_openai_messages(messages, system_prompt)

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=openai_messages,
                tools=openai_tools,
                tool_choice="auto", 
                max_tokens=max_tokens
            )
            
            return _to_provider_response(response)

        except Exception as e:
            logger.error(f"OpenAI Tool Error: {e}")
            raise e
