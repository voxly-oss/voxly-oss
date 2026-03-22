from dotenv import load_dotenv; load_dotenv()
from app.database import SessionLocal
from app.models.user import User
from app.models.project import Project
from app.models.client import Client

db = SessionLocal()

# Check user
u = db.query(User).filter(User.email == 'ravin@voxly.app').first()
if u:
    print(f"User: {u.email}")
    print(f"User ID: {u.id}")
    phone = getattr(u, 'phone', 'NO PHONE FIELD')
    print(f"User Phone: {phone}")
else:
    print("User ravin@voxly.app not found")

# Check project
p = db.query(Project).first()
if p:
    print(f"\nProject: {p.name}")
    print(f"Project ID: {p.id}")
    print(f"github_repo: {getattr(p, 'github_repo', 'NO GITHUB_REPO FIELD')}")
    print(f"status: {p.status}")

# Check user model columns
cols = [c.name for c in User.__table__.columns]
print(f"\nUser columns: {cols}")

db.close()
