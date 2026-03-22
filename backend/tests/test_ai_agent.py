import pytest
import os
from unittest.mock import MagicMock, patch, AsyncMock
from app.services.ai_agent import VoxlyAgent

# Mock environment variables for all tests in this module
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

# Helper Classes for Mocking AI Response
class MockBlock:
    def __init__(self, type, name=None, input=None, id=None, text=None):
        self.type = type
        self.name = name
        self.input = input
        self.id = id
        self.text = text

class MockResponse:
    def __init__(self, content, stop_reason, usage=None):
        self.content = content
        self.stop_reason = stop_reason
        self.usage = usage or MagicMock(input_tokens=10, output_tokens=10)
        self.model = "mock-model"

class MockProvider:
    async def generate_response_with_tools(self, messages, tools, system_prompt=None, max_tokens=1000):
        last_msg = messages[-1]["content"]
        
        # Check if last_msg is list (from tool result) or string
        if isinstance(last_msg, list):
             # It's likely a tool result
             return MockResponse(
                 content=[MockBlock(type="text", text="The project status looks good.")],
                 stop_reason="end_turn"
             )
        
        # Initial Query -> Call Tool
        if "launch strategy" in str(last_msg):
            return MockResponse(
                content=[
                    MockBlock(type="text", text="I check the docs."),
                    MockBlock(type="tool_use", name="search_local_docs", input={"query": "launch strategy"}, id="call_123")
                ],
                stop_reason="tool_use"
            )
            
        return MockResponse(content=[MockBlock(type="text", text="I don't know.")], stop_reason="end_turn")

@pytest.mark.asyncio
async def test_voxly_agent_tool_use():
    """Test full agent loop with mocked provider and tools."""
    
    # Initialize Agent
    agent = VoxlyAgent(api_key="sk-dummy")
    
    # Inject Mock Provider
    agent.provider = MockProvider()
    
    # Mock the Tools to avoid actual file system / GitHub calls
    mock_kb_tool = MagicMock()
    mock_kb_tool.name = "search_local_docs"
    mock_kb_tool.run = AsyncMock(return_value="Docs Content: The deployment guide covers setup steps.")
    mock_kb_tool.to_openai_schema.return_value = {"function": {"name": "search_local_docs"}}
    
    # Replace real tools with mock
    agent.tools = [mock_kb_tool]
    agent.tool_map = {t.name: t for t in agent.tools}
    
    # Run Chat
    response = await agent.chat(user_message="What is the launch strategy?")
    
    # Assertions
    assert response["response"] == "The project status looks good."
    assert response["steps"] > 0
    # Check if tool was actually called
    mock_kb_tool.run.assert_called_once()
    assert getattr(mock_kb_tool.run.call_args, 'kwargs', {}).get('query') == "launch strategy" or \
           getattr(mock_kb_tool.run.call_args, 'args', [{}])[0] == "launch strategy" # Logic implementation detail
