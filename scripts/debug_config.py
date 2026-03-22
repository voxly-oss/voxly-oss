import os
import sys
import json
from pydantic import ValidationError

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

# Mock Env Vars BEFORE import
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["SECRET_KEY"] = "debug-secret"

print("--- Debugging Config ---")
try:
    from app.config import Settings
    print("Imported Settings class.")
    
    try:
        s = Settings()
        print("Settings instantiated successfully.")
        print(f"DATABASE_URL: {s.DATABASE_URL}")
    except ValidationError as e:
        print("!!! VALIDATION ERROR !!!")
        # Print as JSON via model_dump if possible, or just str
        try:
            print(json.dumps(e.errors(), indent=2))
        except:
            print(str(e))
    except Exception as e:
        print(f"Other Error: {e}")

except Exception as e:
    print(f"Import Error: {e}")
