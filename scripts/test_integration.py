import asyncio
import sys
import os
from unittest.mock import MagicMock, patch

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

# MOCK ENV VARS FOR CONFIG LOADING
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["SECRET_KEY"] = "test-secret"
os.environ["ANTHROPIC_API_KEY"] = "sk-mock-key"

async def test_integration():
    print("🧪 Testing ai_service integration with VoxlyAgent...")
    
    # Mock the VoxlyAgent to avoid real API calls and isolation
    with patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        # Setup Mock Instance
        mock_agent_instance = MagicMock()
        MockAgentClass.return_value = mock_agent_instance
        
        # Setup async chat method mock
        async def mock_chat(user_message, context):
            print(f"    [MockAgent] Received message: {user_message}")
            return {
                "success": True,
                "response": "This is a mocked agent response.",
                "steps": 2,
                "used_tools": True,
                "tokens_used": 150,
                "model": "claude-mock"
            }
        
        mock_agent_instance.chat.side_effect = mock_chat

        # Import service (it will use the mocked agent class)
        from app.services.ai_service import generate_client_response
        
        # Call the service
        result = await generate_client_response(
            client_name="Test Client",
            project_name="Test Project",
            github_stats={"commits": 10},
            milestones=[],
            client_question="What is the progress?"
        )
        
        # Verify Result Structure
        print("\n🔍 Result Validation:")
        print(f"    Success: {result['success']}")
        print(f"    Response: {result['response']}")
        print(f"    Tokens: {result['tokens_used']}")
        print(f"    Provider: {result['provider']}")
        
        if (result['success'] == True and 
            result['tokens_used'] == 150 and 
            "mocked agent response" in result['response']):
            print("\n✅ INTEGRATION TEST PASSED: ai_service correctly wraps VoxlyAgent.")
        else:
            print("\n❌ INTEGRATION TEST FAILED: Result mismatch.")

if __name__ == "__main__":
    asyncio.run(test_integration())
