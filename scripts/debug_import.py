import os
import sys

# Add backend to path so we can import app modules
sys.path.append(os.path.join(os.getcwd(), "backend"))

print("--- Debugging Imports ---")

try:
    print("1. Importing app.config...")
    try:
        from app.config import get_settings
        print("   Success.")
        
        print("2. Loading settings...")
        s = get_settings()
        if hasattr(s, "ANTHROPIC_API_KEY"):
            print(f"   Success. Key present: {bool(s.ANTHROPIC_API_KEY)}")
        else:
            print("   Success but no ANTHROPIC_API_KEY attribute.")
    except Exception as e:
        print(f"   FAILED in config step: {e}")
        import traceback
        traceback.print_exc()

except Exception as e:
    print(f"   FAILED to import config: {e}")

try:
    print("3. Importing anthropic...")
    try:
        from anthropic import Anthropic
        print("   Success.")
        
        print("4. Initializing Anthropic client...")
        a = Anthropic(api_key="sk-test-123")
        print("   Success.")
    except Exception as e:
        print(f"   FAILED in anthropic step: {e}")
        import traceback
        traceback.print_exc()
except Exception as e:
    print(f"   FAILED to import anthropic: {e}")

try:
    print("5. Importing Tool base...")
    try:
        from app.tools.base import Tool
        print("   Success.")
    except Exception as e:
        print(f"   FAILED in Tool step: {e}")
        import traceback
        traceback.print_exc()
except Exception as e:
    print(f"   FAILED to import Tool: {e}")

print("--- End Debug ---")
