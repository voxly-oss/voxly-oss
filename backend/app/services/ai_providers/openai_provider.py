from typing import Any, List, Dict, Optional
import json
import logging
from openai import AsyncOpenAI
from app.config import settings
from app.services.ai_providers.base import AIProvider, AIResponse, SYSTEM_PROMPT

logger = logging.getLogger(__name__)

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
        # Convert tools to OpenAI format
        openai_tools = [tool.to_openai_schema() for tool in tools]
        
        # Prepare messages
        # VoxlyAgent stores history in Anthropic format (content is list of blocks).
        # We must convert this to OpenAI format (content=str, tool_calls=list).
        
        openai_messages = [{"role": "system", "content": system_prompt}]
        
        for msg in messages:
            role = msg["role"]
            content = msg["content"]
            
            if isinstance(content, str):
                openai_messages.append({"role": role, "content": content})
                continue
                
            # If content is list (Anthropic style)
            if isinstance(content, list):
                text_part = ""
                tool_calls = []
                
                for block in content:
                    if hasattr(block, "type"):
                        b_type = block.type
                    elif isinstance(block, dict):
                        b_type = block.get("type")
                    else:
                        continue
                        
                    if b_type == "text":
                        text_val = getattr(block, "text", "") if hasattr(block, "text") else block.get("text", "")
                        text_part += text_val
                        
                    elif b_type == "tool_use":
                        # Convert to OpenAI tool_call
                        t_id = getattr(block, "id", "") if hasattr(block, "id") else block.get("id", "")
                        t_name = getattr(block, "name", "") if hasattr(block, "name") else block.get("name", "")
                        t_input = getattr(block, "input", {}) if hasattr(block, "input") else block.get("input", {})
                        
                        tool_calls.append({
                            "id": t_id,
                            "type": "function",
                            "function": {
                                "name": t_name,
                                "arguments": json.dumps(t_input)
                            }
                        })
                        
                    elif b_type == "tool_result":
                        # OpenAI expects tool result as separate role="tool" message
                        # BUT VoxlyAgent appends tool_result as 'user' message with content block.
                        # We need to handle this carefully.
                        # Actually, OpenAI expects:
                        # User: ...
                        # Assistant: (tool_calls)
                        # Tool: (result)
                        # VoxlyAgent stores:
                        # User: ...
                        # Assistant: (tool_use block)
                        # User: (tool_result block)
                        
                        # So if we see a 'user' message with 'tool_result' block, 
                        # we must convert it to role="tool".
                        pass

                # Construct OpenAI Message
                new_msg = {"role": role, "content": text_part}
                if tool_calls:
                    new_msg["tool_calls"] = tool_calls
                    # OpenAI assistant message with tool_calls usually has null content or some text
                    if not text_part:
                        new_msg["content"] = None
                
                openai_messages.append(new_msg)
            
            # SPECIAL CASE: VoxlyAgent stores Tool Results as USER messages with tool_result block.
            # OpenAI requires role="tool".
            # We need to detect if the processed message was actually a tool result.
            # In the loop above, if we found a tool_result block in a USER message, 
            # we should add it as a SEPARATE role="tool" message.
            
            if role == "user" and isinstance(content, list):
                # Check for tool_results
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        openai_messages.append({
                            "role": "tool",
                            "tool_call_id": block.get("tool_use_id"),
                            "content": block.get("content")
                        })
                    # If using object access
                    elif hasattr(block, "type") and block.type == "tool_result":
                        openai_messages.append({
                            "role": "tool",
                            "tool_call_id": block.tool_use_id,
                            "content": block.content
                        })

        try:
            response = await self.client.chat.completions.create(
                model="gpt-4o",
                messages=openai_messages,
                tools=openai_tools,
                tool_choice="auto", 
                max_tokens=max_tokens
            )
            
            message = response.choices[0].message
            
            # Map OpenAI response to common format expected by Agent Loop
            # Agent expects an object with .content, .stop_reason, .usage
            # And .content needs to be a list of blocks (Text or ToolUse)
            
            # OpenAI response structure:
            # message.content (str)
            # message.tool_calls (list)
            
            content_blocks = []
            
            if message.content:
                # Mock Anthropic TextBlock
                content_blocks.append(type('TextBlock', (), {'type': 'text', 'text': message.content})())
            
            if message.tool_calls:
                for tc in message.tool_calls:
                    # Mock Anthropic ToolUseBlock
                    content_blocks.append(type('ToolUseBlock', (), {
                        'type': 'tool_use',
                        'name': tc.function.name,
                        'input': json.loads(tc.function.arguments),
                        'id': tc.id
                    })())
            
            # Determine stop reason
            stop_reason = "end_turn"
            if response.choices[0].finish_reason == "tool_calls":
                stop_reason = "tool_use"
            elif response.choices[0].finish_reason == "stop":
                stop_reason = "end_turn"
            else:
                stop_reason = response.choices[0].finish_reason

            # Usage
            usage = response.usage
            # Mock Anthropic Usage
            usage_obj = type('Usage', (), {
                'input_tokens': usage.prompt_tokens,
                'output_tokens': usage.completion_tokens
            })()

            # Mock Provider Response Object
            provider_response = type('ProviderResponse', (), {
                'content': content_blocks,
                'stop_reason': stop_reason,
                'usage': usage_obj,
                'model': response.model
            })()
            
            return provider_response

        except Exception as e:
            logger.error(f"OpenAI Tool Error: {e}")
            raise e
