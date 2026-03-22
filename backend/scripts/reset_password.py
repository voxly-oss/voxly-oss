import sys
import os

# Add the backend directory to sys.path so we can import app modules
# Assumes this script is run from backend/scripts/ or backend/ root
current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
sys.path.append(backend_dir)

from app.database import SessionLocal
from app.models.user import User
from app.utils.auth import get_password_hash

def reset_password(email, new_password):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"❌ User with email '{email}' not found.")
            return

        print(f"User found: {user.full_name} ({user.id})")
        
        # Hash the new password
        hashed_pw = get_password_hash(new_password)
        
        # Update user
        user.hashed_password = hashed_pw
        db.commit()
        
        print(f"✅ Password for '{email}' has been reset successfully.")
        print(f"--> You can now login with: {new_password}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python scripts/reset_password.py <email> <new_password>")
        print("Example: python scripts/reset_password.py admin@example.com newpass123")
        sys.exit(1)
    
    reset_password(sys.argv[1], sys.argv[2])
