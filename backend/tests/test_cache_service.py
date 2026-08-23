"""Tests for the cache service's Redis-with-in-memory-fallback behavior.

Focus: when Redis is unavailable (the real production situation — the Upstash
instance was deleted), caching must still work via the in-memory fallback,
must not raise, and must not hammer the dead Redis on every call.
"""
import time

import pytest

from app.services import cache_service


@pytest.fixture(autouse=True)
def _reset_cache_state():
    """Isolate each test from module-level cache/circuit-breaker state."""
    cache_service._mem_cache.clear()
    cache_service._redis_client = None
    cache_service._redis_down_until = 0.0
    cache_service._redis_down_logged = False
    yield
    cache_service._mem_cache.clear()


class _DeadRedis:
    """Simulates the deleted Upstash instance: every op raises."""
    def __init__(self):
        self.calls = 0

    def get(self, *a, **k):
        self.calls += 1
        raise ConnectionError("Name or service not known")

    def setex(self, *a, **k):
        self.calls += 1
        raise ConnectionError("Name or service not known")

    def delete(self, *a, **k):
        self.calls += 1
        raise ConnectionError("Name or service not known")


# ── In-memory fallback ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_set_then_get_uses_memory_when_redis_dead(monkeypatch):
    dead = _DeadRedis()
    monkeypatch.setattr(cache_service, "_get_redis_client", lambda: dead)

    await cache_service._cache_set("k1", {"n": 1}, ttl=60)
    got = await cache_service._cache_get("k1")

    assert got == {"n": 1}  # served from memory, not Redis


@pytest.mark.asyncio
async def test_cache_get_never_raises_on_dead_redis(monkeypatch):
    dead = _DeadRedis()
    monkeypatch.setattr(cache_service, "_get_redis_client", lambda: dead)

    # Must return None (miss), not raise
    assert await cache_service._cache_get("missing") is None


# ── Circuit breaker: don't hammer a dead Redis ───────────────────────


@pytest.mark.asyncio
async def test_circuit_breaker_stops_hitting_dead_redis(monkeypatch):
    dead = _DeadRedis()
    monkeypatch.setattr(cache_service, "_get_redis_client", lambda: dead)

    # First call trips the breaker (1 Redis attempt)...
    await cache_service._cache_get("a")
    assert dead.calls == 1
    # ...subsequent calls skip Redis entirely during cooldown.
    await cache_service._cache_get("b")
    await cache_service._cache_set("c", 1, ttl=60)
    assert dead.calls == 1  # no further Redis hits


@pytest.mark.asyncio
async def test_circuit_breaker_recovers_after_cooldown(monkeypatch):
    dead = _DeadRedis()
    monkeypatch.setattr(cache_service, "_get_redis_client", lambda: dead)

    await cache_service._cache_get("a")
    assert dead.calls == 1
    # Force the cooldown to expire
    cache_service._redis_down_until = time.monotonic() - 1
    await cache_service._cache_get("a")
    assert dead.calls == 2  # retried Redis after cooldown


# ── TTL expiry ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_memory_ttl_expires(monkeypatch):
    dead = _DeadRedis()
    monkeypatch.setattr(cache_service, "_get_redis_client", lambda: dead)

    cache_service._mem_set("short", "v", ttl=0)  # already expired
    time.sleep(0.01)
    assert cache_service._mem_get("short") is None


# ── Working Redis path still used ────────────────────────────────────


@pytest.mark.asyncio
async def test_uses_redis_when_available(monkeypatch):
    store = {}

    class _LiveRedis:
        def get(self, k):
            return store.get(k)

        def setex(self, k, ttl, v):
            store[k] = v

    monkeypatch.setattr(cache_service, "_get_redis_client", lambda: _LiveRedis())

    await cache_service._cache_set("k", {"hello": "world"}, ttl=60)
    assert store  # written to Redis
    got = await cache_service._cache_get("k")
    assert got == {"hello": "world"}


# ── High-level API degrades gracefully ───────────────────────────────


@pytest.mark.asyncio
async def test_get_or_set_cache_computes_and_caches(monkeypatch):
    dead = _DeadRedis()
    monkeypatch.setattr(cache_service, "_get_redis_client", lambda: dead)

    calls = {"n": 0}

    async def _compute():
        calls["n"] += 1
        return {"v": 42}

    first = await cache_service.get_or_set_cache("kk", _compute, expire=60)
    second = await cache_service.get_or_set_cache("kk", _compute, expire=60)

    assert first == second == {"v": 42}
    assert calls["n"] == 1  # second call served from memory cache


@pytest.mark.asyncio
async def test_bounded_memory_cache_does_not_grow_unbounded():
    for i in range(cache_service._MEM_MAX_ENTRIES + 50):
        cache_service._mem_set(f"key{i}", i, ttl=300)
    assert len(cache_service._mem_cache) <= cache_service._MEM_MAX_ENTRIES
