"""
Abstract base class for all AI providers.

Every new AI provider (OpenAI, Gemini, Ollama, etc.) must implement this interface.
This ensures consistent behavior across providers and makes swapping trivial.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class AIResponse:
    """Standardized response from any AI provider."""
    response: str
    tokens_used: int
    model: str
    success: bool
    provider: str
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


# Shared system prompt — same regardless of AI provider
SYSTEM_PROMPT = """You are a professional and friendly project manager assistant for a software development agency in India.

Your role:
1. Provide accurate project status updates based on GitHub data and milestones
2. Be warm, friendly, and reassuring (clients are often anxious about progress)
3. Use simple language, avoid technical jargon
4. If asked about delays, be honest but focus on solutions
5. Encourage clients to ask follow-up questions
6. Match the language of the question (English/Hindi/Hinglish)

Response format guidelines:
- Start with a friendly greeting (e.g., "Hey!", "Namaste!", "Hi there!")
- Use emojis sparingly and appropriately (✅ 🔄 ⏳ 🚀)
- Structure: Overview → Details → Next steps
- Keep responses under 200 words
- End with an open question (e.g., "Anything specific you want to know?")

Language matching:
- If question is in Hindi/Hinglish, respond in Hindi/Hinglish
- If question is in English, respond in English
- Use natural, conversational tone"""


def build_context(
    client_name: str,
    project_name: str,
    github_stats: Dict,
    milestones: List[Dict],
    client_question: str,
) -> str:
    """Build context string for the AI provider. Same format for all providers."""
    
    milestone_text = "\n".join([
        f"- {m['title']}: {m['status']} ({m['progress']}% complete)"
        for m in milestones
    ]) if milestones else "No milestones defined yet"
    
    return f"""
Client Information:
- Name: {client_name}
- Project: {project_name}

GitHub Statistics (Last 7 days):
- Total commits: {github_stats.get('commits_last_7_days', 0)}
- Open issues: {github_stats.get('open_issues', 0)}
- Closed issues: {github_stats.get('closed_issues', 0)}
- Overall progress: {github_stats.get('progress_percent', 0)}%
- Last commit: {github_stats.get('last_commit_message', 'No recent activity')}
- Last updated: {github_stats.get('last_commit_date', 'Unknown')}

Project Milestones:
{milestone_text}

Client's Question:
{client_question}
"""


class AIProvider(ABC):
    """
    Abstract base class for AI providers.
    
    To add a new provider:
    1. Create a new file in ai_providers/ (e.g., openai_provider.py)
    2. Implement this interface
    3. Register it in __init__.py PROVIDERS dict
    
    That's it! The rest of the system works automatically.
    """
    
    def __init__(self, api_key: str = None):
        """
        Initialize the provider.
        
        Args:
            api_key: User-provided API key (BYOK mode).
                     If None, uses the platform's default key from settings.
        """
        self.api_key = api_key
    
    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Human-readable provider name (e.g., 'Claude', 'OpenAI')."""
        pass
    
    @property
    @abstractmethod
    def default_model(self) -> str:
        """Default model to use (e.g., 'claude-sonnet-4-20250514', 'gpt-4o')."""
        pass
    
    @abstractmethod
    async def generate_response(
        self,
        message: str,
        context: str,
        system_prompt: str = SYSTEM_PROMPT,
        max_tokens: int = 1000,
    ) -> AIResponse:
        """
        Generate an AI response.
        
        Args:
            message: The user's question/message
            context: Built context string (from build_context())
            system_prompt: System instructions for the AI
            max_tokens: Maximum response length
        
        Returns:
            AIResponse with the generated text and metadata
        """
        pass
    
    async def health_check(self) -> bool:
        """Test if the provider is accessible with current credentials."""
        try:
            result = await self.generate_response(
                message="test",
                context="This is a health check. Respond with 'ok'.",
                max_tokens=10,
            )
            return result.success
        except Exception:
            return False
