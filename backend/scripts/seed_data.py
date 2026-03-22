import sys
import os
import logging
from datetime import datetime, timedelta

# Add backend directory to path so we can import app modules
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from app.database import SessionLocal
from app.models.user import User
from app.models.client import Client
from app.models.project import Project
from app.utils.auth import get_password_hash

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def seed_data():
    db = SessionLocal()
    try:
        # 1. Create Admin User
        admin_email = "admin@voxly.dev"
        user = db.query(User).filter(User.email == admin_email).first()
        if not user:
            logger.info(f"Creating admin user: {admin_email}")
            user = User(
                email=admin_email,
                password_hash=get_password_hash("password"),
                full_name="Voxly Admin",
                agency_name="Voxly Dev Agency",
                is_active=True,
                subscription_tier="enterprise"
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            logger.info(f"Admin user already exists: {admin_email}")

        # 2. Create Sample Client
        client_name = "Acme Corp"
        client = db.query(Client).filter(Client.name == client_name, Client.user_id == user.id).first()
        if not client:
            logger.info(f"Creating sample client: {client_name}")
            client = Client(
                user_id=user.id,
                name=client_name,
                company="Acme Corporation",
                email="contact@acme.com",
                phone="+15550123456",
                is_active=True
            )
            db.add(client)
            db.commit()
            db.refresh(client)
        else:
            logger.info(f"Sample client already exists: {client_name}")

        # 3. Create Sample Project
        project_name = "Skynet Integration"
        project = db.query(Project).filter(Project.name == project_name, Project.client_id == client.id).first()
        if not project:
            logger.info(f"Creating sample project: {project_name}")
            project = Project(
                client_id=client.id,
                name=project_name,
                description="AI-powered neural network integration for global defense systems.",
                status="active",
                start_date=datetime.now().date(),
                expected_end_date=datetime.now().date() + timedelta(days=90),
                github_repo="skynet/core"
            )
            db.add(project)
            db.commit()
        else:
            logger.info(f"Sample project already exists: {project_name}")

        logger.info("✅ Database seeding completed successfully!")

    except Exception as e:
        logger.error(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
