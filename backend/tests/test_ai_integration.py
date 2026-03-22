import pytest
import os
from unittest.mock import MagicMock, patch, AsyncMock

# Mock environment variables
@pytest.fixture(autouse=True)
def mock_env():
    with patch.dict(os.environ, {
        "OPENAI_API_KEY": "sk-dummy",
        "ANTHROPIC_API_KEY": "sk-dummy",
        "GEMINI_API_KEY": "gemini-dummy",
        "DATABASE_URL": "sqlite:///./test.db",
        "SECRET_KEY": "test-secret"
    }):
        yield

@pytest.mark.asyncio
async def test_generate_client_response_integration():
    """Test ai_service integration with mocked VoxlyAgent."""
    
    # We patch VoxlyAgent where it is IMPORTED in ai_service
    # We patch VoxlyAgent in the source module app.services.ai_agent
    # because ai_service imports it locally inside the function, patching ai_service.VoxlyAgent fails.
    with patch("app.services.ai_agent.VoxlyAgent") as MockAgentClass:
        # Setup Mock Instance
        mock_agent_instance = MagicMock()
        MockAgentClass.return_value = mock_agent_instance
        
        # Setup async chat method mock
        mock_chat_response = {
            "success": True,
            "response": "This is a mocked agent response.",
            "steps": 2,
            "used_tools": True,
            "tokens_used": 150,
            "model": "claude-mock"
        }
        mock_agent_instance.chat = AsyncMock(return_value=mock_chat_response)
        
        # Import service
        from app.services.ai_service import generate_client_response
        
        # Call the service
        result = await generate_client_response(
            client_name="Test Client",
            project_name="Test Project",
            github_stats={"commits": 10},
            milestones=[],
            client_question="What is the progress?"
        )
        
        # Validation
        assert result['success'] is True
        assert result['tokens_used'] == 150
        assert "mocked agent response" in result['response']
        
        # Verify Agent was called with context
        mock_agent_instance.chat.assert_called_once()
        call_kwargs = mock_agent_instance.chat.call_args.kwargs
        assert "Test Client" in call_kwargs['context']
        assert "Test Project" in call_kwargs['context']
        assert call_kwargs['user_message'] == "What is the progress?"
