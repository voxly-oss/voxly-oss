import logging
import json
import urllib.parse
from typing import List, Dict, Any, Optional
import httpx
import base64

from app.services.ai_providers import get_provider
from app.services.ai_providers.base import AIResponse
# Import tools
from app.tools.base import Tool
from app.tools.github_tools import GitHubSearchIssuesTool, GitHubGetFileTool, GitHubCreateIssueTool
from app.tools.kb_tools import LocalDocsTool

logger = logging.getLogger(__name__)
ALLOWED_IMAGE_HOSTS = {
    "api.twilio.com",
    "media.twiliocdn.com",
    "mms.twilio.com",
    "media.giphy.com",
    "api.github.com",
    "raw.githubusercontent.com",
    "user-images.githubusercontent.com",
    "camo.githubusercontent.com",
}
MAX_IMAGE_BYTES = 10 * 1024 * 1024


async def _build_image_block(img_url: str) -> dict | None:
    try:
        parsed = urllib.parse.urlparse(img_url)
        if parsed.scheme not in ("https", "http"):
            logger.warning(f"Rejected image with non-http scheme: {img_url}")
            return None
        host = parsed.netloc.lower().split(":")[0]
        if not any(host == allowed or host.endswith("." + allowed) for allowed in ALLOWED_IMAGE_HOSTS):
            logger.warning(f"Rejected image from disallowed host: {host}")
            return None

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(img_url)
            if resp.status_code != 200:
                logger.warning(f"Failed to download image {img_url}: {resp.status_code}")
                return None

            body = resp.content
            if len(body) > MAX_IMAGE_BYTES:
                logger.warning(f"Image from {img_url} exceeds size limit ({len(body)} bytes) — skipped")
                return None

            media_type = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
            encoded_image = base64.b64encode(body).decode("utf-8")
            logger.info(f"Attached image from {host} ({media_type}, {len(body)} bytes)")
            return {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": encoded_image,
                },
            }
    except Exception as exc:
        logger.error(f"Error processing image {img_url}: {exc}")
        return None


async def _build_messages(text_content: str, images: List[str] | None) -> List[Dict[str, Any]]:
    if not images:
        return [{"role": "user", "content": text_content}]

    initial_content = []
    for img_url in images:
        image_block = await _build_image_block(img_url)
        if image_block:
            initial_content.append(image_block)
    initial_content.append({"type": "text", "text": text_content})
    return [{"role": "user", "content": initial_content}]


def _update_usage(provider_response, total_tokens_used: int, model_used: str) -> tuple[int, str]:
    if not hasattr(provider_response, "usage"):
        return total_tokens_used, model_used

    usage = provider_response.usage
    in_tokens = getattr(usage, "input_tokens", 0)
    out_tokens = getattr(usage, "output_tokens", 0)
    total_tokens_used += in_tokens + out_tokens
    if hasattr(provider_response, "model"):
        model_used = provider_response.model
    return total_tokens_used, model_used


async def _append_tool_results(messages, content, tool_map) -> None:
    tool_uses = [block for block in content if block.type == "tool_use"]
    for tool_use in tool_uses:
        tool_name = tool_use.name
        tool_input = tool_use.input
        tool_id = tool_use.id
        logger.info(f"Agent calling tool: {tool_name} with {tool_input}")

        if tool_name in tool_map:
            tool_instance = tool_map[tool_name]
            try:
                tool_result = await tool_instance.run(**tool_input)
            except Exception as exc:
                tool_result = f"Tool Execution Error: {str(exc)}"
        else:
            tool_result = f"Error: Tool {tool_name} not found."

        messages.append(
            {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_id,
                        "content": str(tool_result),
                    }
                ],
            }
        )


def _extract_text_response(content) -> str:
    text_blocks = [block.text for block in content if block.type == "text"]
    return "\n".join(text_blocks)

class VoxlyAgent:
    """
    Voxly Agent — ReAct-based AI Assistant.
    
    Implements a ReAct (Reason+Act) loop:
    1. Receive user query
    2. Decide if tools are needed
    3. Execute tools
    4. Observe results
    5. Formulate final answer
    """
    
    def __init__(self, provider_name: str = "claude", api_key: str = None):
        # Auto-detect best provider if default is chosen but key is missing
        if provider_name == "claude" and not api_key:
            from app.config import settings
            if not settings.ANTHROPIC_API_KEY and settings.OPENAI_API_KEY:
                logger.info("Anthropic Key missing, auto-switching to OpenAI provider")
                provider_name = "openai"

        self.provider = get_provider(provider_name, api_key)
        self.tools: List[Tool] = [
            GitHubSearchIssuesTool(),
            GitHubGetFileTool(),
            GitHubCreateIssueTool(),
            LocalDocsTool()
        ]
        self.tool_map = {t.name: t for t in self.tools}
        self.max_steps = 5  # Safety rail: prevent infinite tool loops

    async def chat(
        self,
        user_message: str,
        images: List[str] = None,
        context: str = "",
        system_prompt: str = None,
        history: List[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Run the agent loop for a single turn.

        Args:
            history: Prior conversation turns as a list of
                {"role": "user"|"assistant", "content": str} dicts. Seeded
                before the current message so the agent has short-term memory.
        """
        # 1. Initialize conversation history with context and user message
        # In a real app, 'messages' would be passed in or retrieved from memory.
        # For this V2 implementation, we construct the initial state.
        
        base_system_prompt = system_prompt or (
            "You are Voxly, an intelligent AI Assistant for a top-tier software agency. "
            "Your goal is to bridge the gap between non-technical clients and the technical team.\n\n"
            
            "**CORE INSTRUCTIONS:**\n"
            "1. **Language Mirroring**: Reply in the SAME language/style the user uses. "
            "If they speak Hindi/Hinglish, reply in Hindi/Hinglish. If English, reply in English.\n"
            "2. **Idea-to-Tech Translator**: If a client says 'I want an Uber for X', ask about specific features "
            "(Drivers, Passengers, Payments) to build a spec. Do NOT dump technical jargon.\n"
            "3. **White Labeling**: NEVER mention 'Claude', 'OpenAI', or specific model names. "
            "Refer to yourself as 'Our AI Engine' or just 'Voxly'. If asked how you work, explain the *value*, not the stack.\n"
            "4. **The Clarifier**: If a client gives vague feedback like 'I don't like the color', 'It looks bad', or 'Change the banner', "
            "DO NOT just say okay. ASK clarifying questions: 'Which specific element?', 'Do you have a reference color (Hex/RGB)?', 'Can you send a screenshot?'. "
            "Your job is to translate 'vibes' into 'specs' for the developers.\n"
            "5. **Professional & Friendly**: Be helpful, concise, and polite. Use emojis where appropriate. 🇮🇳\n\n"
            
            "**TOOLS:**\n"
            "You have access to tools to search GitHub and Documentation. "
            "ALWAYS verify facts using tools before answering specific project status questions."
        )

        text_content = f"Context: {context}\n\nUser: {user_message}"
        if images:
             text_content += "\n\n[System: The user has attached the following images. You can link to them in Markdown using these URLs]:\n" + "\n".join(images)
        
        # Add text content
        # Note: If images are present, we must use a list of content blocks
        # If no images, we can use a simple string or a list with one text block
        # To be safe and consistent, let's use list of blocks if images exist
        
        # Seed short-term memory with prior turns, then the current message.
        messages = list(history) if history else []
        messages.extend(await _build_messages(text_content, images))

        step_count = 0
        final_response = ""
        total_tokens_used = 0
        model_used = "unknown"
        
        # 2. ReAct Loop
        while step_count < self.max_steps:
            step_count += 1
            logger.info(f"Agent Step {step_count}")
            
            # Call LLM with Tools
            try:
                # We use the provider's specific method for tool calling
                # Note: This assumes the provider supports the 'generate_response_with_tools' interface
                # which we added to ClaudeProvider.
                provider_response = await self.provider.generate_response_with_tools(
                    messages=messages,
                    tools=self.tools,
                    system_prompt=base_system_prompt
                )
            except Exception as e:
                logger.error(f"Agent Loop Error: {e}")
                return {"success": False, "error": str(e)}

            # Check if LLM wants to use a tool
            stop_reason = getattr(provider_response, "stop_reason", None)
            content = provider_response.content if provider_response.content else []

            # Track Token Usage
            total_tokens_used, model_used = _update_usage(
                provider_response,
                total_tokens_used,
                model_used,
            )

            # Append assistant's thought process to history
            # Anthropic expects the exact message structure back
            messages.append({"role": "assistant", "content": content})
            
            if stop_reason == "tool_use":
                await _append_tool_results(messages, content, self.tool_map)
                continue
            
            elif stop_reason == "end_turn":
                final_response = _extract_text_response(content)
                break
            
            else:
                # Unknown stop reason, break to be safe
                logger.warning(f"Unknown stop reason: {stop_reason}")
                break

        return {
            "success": True,
            "response": final_response,
            "steps": step_count,
            "used_tools": step_count > 1,
            "tokens_used": total_tokens_used,
            "model": model_used
        }
