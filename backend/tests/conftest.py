import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import UUID as PG_UUID

from app.main import app
from app.database import Base, get_db
from app.rate_limit import limiter


import os


@compiles(PG_UUID, "sqlite")
def _compile_uuid_sqlite(_type, _compiler, **_kwargs):
    """Allow PostgreSQL UUID columns to run on SQLite tests."""
    return "CHAR(36)"

# Use DATABASE_URL from env if available (Postgres), otherwise SQLite
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///:memory:")

connect_args = {}
# SQLite specific args
if "sqlite" in SQLALCHEMY_DATABASE_URL:
    connect_args = {"check_same_thread": False}

engine_kwargs = {"connect_args": connect_args}
if "sqlite:///:memory:" in SQLALCHEMY_DATABASE_URL:
    engine_kwargs["poolclass"] = StaticPool

engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """Override database dependency for testing."""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


# Override the get_db dependency
app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(autouse=True)
def _disable_rate_limits():
    """Prevent global in-memory rate-limit state leaking across tests."""
    original = limiter.enabled
    limiter.enabled = False
    yield
    limiter.enabled = original


@pytest.fixture(scope="function")
def client():
    """Create a test client with fresh database."""
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        yield c
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Create a database session for testing."""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)
