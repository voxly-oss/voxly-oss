import asyncio
import sys
import os
from unittest.mock import MagicMock, patch, AsyncMock

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

# Mock environment
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["ANTHROPIC_API_KEY"] = "sk-mock"
os.environ["OPENAI_API_KEY"] = "sk-mock"
os.environ["GEMINI_API_KEY"] = "gemini-mock"

async def test_openai_provider():
    print("\n🧪 Testing OpenAIProvider...")
    
    with patch("openai.AsyncOpenAI") as MockClient:
        # Mock Response
        mock_response = MagicMock()
        mock_response.choices[0].message.content = "OpenAI Hello"
        mock_response.choices[0].message.tool_calls = []
        mock_response.usage.prompt_tokens = 10
        mock_response.usage.completion_tokens = 20
        mock_response.model = "gpt-4-turbo-preview"
        
        # Setup Client Mock with AsyncMock
        mock_instance = MagicMock()
        mock_instance.chat.completions.create = AsyncMock(return_value=mock_response)
        MockClient.return_value = mock_instance
        
        from app.services.ai_providers.openai_provider import OpenAIProvider
        
        provider = OpenAIProvider(api_key="sk-test")
        result = await provider.generate_response("Hello")
        
        print(f"    Response: {result.response}")
        print(f"    Tokens: {result.tokens_used}")
        print(f"    Provider: {result.provider}")
        
        # Note: OpenAIProvider hardcodes "openai" as provider_name
        if result.success and result.provider == "OpenAI" and result.tokens_used == 30:
            print("    ✅ OpenAIProvider Test Passed")
        elif result.success and result.provider == "openai" and result.tokens_used == 30:
            print("    ✅ OpenAIProvider Test Passed (lowercase match)")
        else:
            print("    ❌ OpenAIProvider Test Failed")

async def test_gemini_provider():
    print("\n🧪 Testing GeminiProvider...")
    
    with patch("google.generativeai.GenerativeModel") as MockModel:
        # Mock Response
        mock_response = MagicMock()
        mock_response.text = "Gemini Hello"
        mock_response.usage_metadata.prompt_token_count = 15
        mock_response.usage_metadata.candidates_token_count = 25
        
        # Setup Model Mock with AsyncMock
        mock_instance = MagicMock()
        mock_instance.generate_content_async = AsyncMock(return_value=mock_response)
        MockModel.return_value = mock_instance

        # Patch configure generic
        with patch("google.generativeai.configure"):
            from app.services.ai_providers.gemini_provider import GeminiProvider
            
            provider = GeminiProvider(api_key="gemini-test")
            result = await provider.generate_response("Hello")
            
            print(f"    Response: {result.response}")
            print(f"    Tokens: {result.tokens_used}")
            print(f"    Provider: {result.provider}")
            
            if result.success and result.provider == "Gemini" and result.tokens_used == 40:
                print("    ✅ GeminiProvider Test Passed")
            elif result.success and result.provider == "gemini" and result.tokens_used == 40:
                print("    ✅ GeminiProvider Test Passed (lowercase match)")
            else:
                print("    ❌ GeminiProvider Test Failed")

if __name__ == "__main__":
    asyncio.run(test_openai_provider())
    asyncio.run(test_gemini_provider())
