"""Tests for P1.4 (Celery dispatch) and P1.6 (payment webhook completion)."""
import uuid
from datetime import datetime, timezone

from app.api.v1 import billing
from app.tasks import dispatch as dispatch_mod
from app.models.user import User
from app.models.plan import Plan
from app.models.subscription import Subscription


# ── P1.4: dispatch helper chooses Celery vs in-process ───────────────

class _FakeBackgroundTasks:
    def __init__(self):
        self.calls = []

    def add_task(self, fn, *args):
        self.calls.append((fn, args))


class _FakeCeleryTask:
    def __init__(self):
        self.delayed = []

    def delay(self, *args):
        self.delayed.append(args)


def test_dispatch_uses_background_when_celery_disabled(monkeypatch):
    monkeypatch.setattr(dispatch_mod.settings, "USE_CELERY", False)
    bg, task = _FakeBackgroundTasks(), _FakeCeleryTask()

    def sync_fn(a, b):
        pass

    result = dispatch_mod.dispatch(bg, task, sync_fn, 1, 2)
    assert result == "background"
    assert bg.calls == [(sync_fn, (1, 2))]
    assert task.delayed == []


def test_dispatch_uses_celery_when_enabled(monkeypatch):
    monkeypatch.setattr(dispatch_mod.settings, "USE_CELERY", True)
    bg, task = _FakeBackgroundTasks(), _FakeCeleryTask()

    result = dispatch_mod.dispatch(bg, task, lambda *a: None, "x")
    assert result == "celery"
    assert task.delayed == [("x",)]
    assert bg.calls == []


def test_dispatch_falls_back_when_broker_down(monkeypatch):
    """If Celery is enabled but the broker raises, we degrade to in-process."""
    monkeypatch.setattr(dispatch_mod.settings, "USE_CELERY", True)
    bg = _FakeBackgroundTasks()

    class _BrokenTask:
        def delay(self, *args):
            raise ConnectionError("broker down")

    def sync_fn(*a):
        pass

    result = dispatch_mod.dispatch(bg, _BrokenTask(), sync_fn, 9)
    assert result == "background"
    assert bg.calls == [(sync_fn, (9,))]


# ── P1.6: Stripe subscription.updated syncs period + status ──────────

def test_ts_to_dt_converts_and_handles_none():
    dt = billing._ts_to_dt(1_767_225_600)  # 2026-01-01T00:00:00Z
    assert dt.year == 2026 and dt.tzinfo is not None
    assert billing._ts_to_dt(None) is None
    assert billing._ts_to_dt("bad") is None


def _seed_subscription(db, gateway_sub_id: str) -> Subscription:
    user = User(id=uuid.uuid4(), email=f"{uuid.uuid4().hex[:6]}@t.com", password_hash="x", is_active=True)
    plan = Plan(id=uuid.uuid4(), name="Pro", slug="pro", tier_level=1)
    db.add_all([user, plan])
    db.commit()
    sub = Subscription(
        id=uuid.uuid4(), user_id=user.id, plan_id=plan.id, status="active",
        payment_gateway="stripe", gateway_subscription_id=gateway_sub_id,
    )
    db.add(sub)
    db.commit()
    return sub


def test_stripe_subscription_updated_sets_period_and_status(db_session):
    sub = _seed_subscription(db_session, "sub_123")
    billing._handle_stripe_subscription_updated(db_session, {
        "id": "sub_123",
        "status": "past_due",
        "cancel_at_period_end": True,
        "current_period_start": 1_767_225_600,   # 2026-01-01
        "current_period_end": 1_769_904_000,     # 2026-02-01
    })
    db_session.refresh(sub)
    assert sub.status == "past_due"
    assert sub.cancel_at_period_end is True
    assert sub.current_period_start.year == 2026
    assert sub.current_period_end > sub.current_period_start


def test_stripe_subscription_updated_ignores_unknown_sub(db_session):
    # No matching subscription -> no error, no-op.
    billing._handle_stripe_subscription_updated(db_session, {"id": "sub_nonexistent", "status": "active"})
