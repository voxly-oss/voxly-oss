from dotenv import load_dotenv; load_dotenv()
from app.database import SessionLocal
from app.models.project import Project
from app.models.client import Client
import uuid

db = SessionLocal()
try:
    # Update dogfood project with github_repo
    p = db.query(Project).filter(Project.name == "Voxly \u2014 Dogfood Launch").first()
    if p:
        p.github_repo = "voxly-app/client-projects"
        db.commit()
        print(f"Project updated: github_repo = voxly-app/client-projects")
        print(f"Project ID: {p.id}")
        print(f"Client ID: {p.client_id}")
        # Check client phone
        c = db.query(Client).filter(Client.id == p.client_id).first()
        if c:
            print(f"Client: {c.name}, Phone: {c.phone}")
        else:
            print("Client not found!")
    else:
        print("Project 'Voxly \u2014 Dogfood Launch' not found")
        all_projects = db.query(Project).all()
        for proj in all_projects:
            print(f"  - {proj.name} | {proj.id}")
finally:
    db.close()
