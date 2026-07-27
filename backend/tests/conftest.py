import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
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


if "sqlite" in SQLALCHEMY_DATABASE_URL:
    @event.listens_for(Engine, "connect")
    def _sqlite_enforce_foreign_keys(dbapi_connection, _connection_record):
        """SQLite ignores FK constraints unless told otherwise per-connection,
        so ON DELETE CASCADE silently never fires on the default local test
        lane (DEBT-01) -- e.g. account-deletion tests pass on Postgres but
        leave orphan rows on SQLite, contradicting their own docstring claim
        that the two lanes behave identically."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


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


@pytest.fixture(autouse=True)
def _stub_whatsapp_send(monkeypatch):
    """Prevent the suite from making live outbound Twilio calls (DEBT-02):
    client/project creation and milestone/project completion all fire a
    background WhatsApp notification. Unstubbed, a full local run burns real
    Twilio quota, can page real phone numbers, and makes results depend on an
    external rate limit -- previously observed live as
    'HTTP 429 ... exceeded the 50 daily messages limit'. Individual tests
    that need to assert on send behavior can still override this via their
    own monkeypatch (e.g. tests/test_notifications.py's captured_whatsapp)."""
    async def _noop(*_args, **_kwargs):
        return True

    for target in (
        "app.services.whatsapp_service.send_whatsapp_message",
        "app.services.notification_service.send_whatsapp_message",
        "app.api.v1.whatsapp.send_whatsapp_message",
        "app.api.v1.github.send_whatsapp_message",
    ):
        monkeypatch.setattr(target, _noop)


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
