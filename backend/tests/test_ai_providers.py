import pytest
from unittest.mock import MagicMock, patch, AsyncMock
import os
from app.services.ai_providers.openai_provider import OpenAIProvider
from app.services.ai_providers.gemini_provider import GeminiProvider

# Mock environment variables for all tests in this module
@pytest.fixture(autouse=True)
def mock_env():
    with patch.dict(os.environ, {
        "OPENAI_API_KEY": "sk-mock",
        "GEMINI_API_KEY": "gemini-mock",
        "DATABASE_URL": "sqlite:///./test.db",
        "SECRET_KEY": "test-secret"
    }):
        yield

@pytest.mark.asyncio
async def test_openai_provider():
    """Test OpenAI Provider generation and tool mapping."""
    # Patch where it is imported!
    with patch("app.services.ai_providers.openai_provider.AsyncOpenAI") as MockClient:
        # Mock Response
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "OpenAI Hello"
        mock_response.choices[0].message.tool_calls = []
        mock_response.usage.prompt_tokens = 10
        mock_response.usage.completion_tokens = 20
        mock_response.model = "gpt-4-turbo-preview"
        
        # Setup Client Mock
        mock_instance = MagicMock()
        mock_instance.chat.completions.create = AsyncMock(return_value=mock_response)
        MockClient.return_value = mock_instance
        
        provider = OpenAIProvider(api_key="sk-test")
        result = await provider.generate_response("Hello")
        
        assert result.success is True
        assert result.provider.lower() == "openai"
        assert result.tokens_used == 30
        assert result.response == "OpenAI Hello"

@pytest.mark.asyncio
async def test_gemini_provider():
    """Test Gemini Provider generation."""
    # Patch genai where it is imported in gemini_provider
    with patch("app.services.ai_providers.gemini_provider.genai") as mock_genai:
        # Mock Response
        mock_response = MagicMock()
        mock_response.text = "Gemini Hello"
        mock_response.usage_metadata.prompt_token_count = 15
        mock_response.usage_metadata.candidates_token_count = 25
        
        # Setup Model Mock
        mock_model_instance = MagicMock()
        mock_model_instance.generate_content_async = AsyncMock(return_value=mock_response)
        
        mock_genai.GenerativeModel.return_value = mock_model_instance

        provider = GeminiProvider(api_key="gemini-test")
        result = await provider.generate_response("Hello")
        
        assert result.success is True
        assert result.provider.lower() == "gemini"
        assert result.tokens_used == 40
        assert result.response == "Gemini Hello"
