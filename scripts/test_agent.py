import asyncio
import os
import sys

# Add backend to path so we can import app modules
sys.path.append(os.path.join(os.getcwd(), "backend"))

# from app.services.ai_agent import VoxlyAgent # Moved inside main
from dotenv import load_dotenv

# Load env vars (API keys)
env_path = os.path.join(os.getcwd(), "backend", ".env")
print(f"Loading .env from: {env_path}")
load_dotenv(env_path, override=True)

# Debug: Check if critical vars are loaded
print(f"DATABASE_URL present: {'DATABASE_URL' in os.environ}")
print(f"ANTHROPIC_API_KEY present: {'ANTHROPIC_API_KEY' in os.environ}")

# Initial dummy values if missing (for test only)
if "DATABASE_URL" not in os.environ:
    os.environ["DATABASE_URL"] = "sqlite:///./test.db"
    print("⚠️ Set dummy DATABASE_URL for testing")
if "SECRET_KEY" not in os.environ:
    os.environ["SECRET_KEY"] = "dummy-secret-for-test"
    print("⚠️ Set dummy SECRET_KEY for testing")

# Mock Provider for Testing Logic without API Key
class MockProvider:
    async def generate_response_with_tools(self, messages, tools, system_prompt=None, max_tokens=1000):
        # Check standard attributes access (verifying interface compatibility)
        print(f"    [Mock] Handling request with {len(messages)} messages")
        
        last_msg = messages[-1]["content"]
        
        # Scenario 1: Initial Query -> Call Tool
        if "launch strategy" in str(last_msg):
            print("    [Mock] Deciding to call tool 'search_local_docs'...")
            # Return an object that mimic's Anthropic's response structure
            from app.tools.base import Tool
            # We need to construct a response that has .content list with .type='tool_use'
            
            class MockBlock:
                def __init__(self, type, name=None, input=None, id=None, text=None):
                    self.type = type
                    self.name = name
                    self.input = input
                    self.id = id
                    self.text = text

            class MockResponse:
                def __init__(self, content):
                    self.content = content
                    self.stop_reason = "tool_use"

            return MockResponse(content=[
                MockBlock(type="text", text="I check the docs."),
                MockBlock(type="tool_use", name="search_local_docs", input={"query": "godfather gate"}, id="call_123")
            ])
            
        # Scenario 2: Tool Result -> Final Answer
        elif "tool_result" in str(messages[-1]):
            print("    [Mock] Received tool result. Generating final answer...")
            class MockResponse:
                def __init__(self, content):
                    self.content = content
                    self.stop_reason = "end_turn"
            
            class MockBlock:
                def __init__(self, type, text):
                    self.type = type
                    self.text = text
            
            return MockResponse(content=[
                MockBlock(type="text", text="The strategy includes a 'Godfather Gate' which requires dogfooding.")
            ])
            
        return None

async def main():
    print("🤖 Initializing Voxly Agent (Godfather Edition)...")
    
    # Import here to ensure env vars are loaded first
    try:
        from app.services.ai_agent import VoxlyAgent
    except Exception as e:
        print("❌ CRITICAL ERROR importing Agent:")
        import traceback
        traceback.print_exc()
        return

    # ALWAYS use MockProvider for logic verification test
    print("⚠️ Forcing Mock Provider for Architecture Validation.")
    agent = VoxlyAgent(api_key="sk-dummy")
    agent.provider = MockProvider()

    # Test Case 2: Knowledge Base Tool (Dogfooding)
    print("\n--- Test 2: KB Tool (Dogfooding Strategy) ---")
    query = "What is the launch strategy or godfather gate?"
    print(f"User: {query}")
    
    # Run Chat
    response = await agent.chat(user_message=query)
    
    print(f"Agent Steps: {response.get('steps')}")
    print(f"Agent Response:\n{response.get('response')}")
    
    if response.get('used_tools'):
        print("✅ SUCCESS: Agent used tools correctly.")
    else:
        print("❌ FAILURE: Agent did not use tools.")


if __name__ == "__main__":
    asyncio.run(main())
