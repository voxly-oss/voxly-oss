"""
Cache service for GitHub stats (and generic get-or-set caching).

Uses Redis when a reachable REDIS_URL is configured, and transparently falls
back to a bounded in-process TTL cache when Redis is unavailable (e.g. the
Upstash free-tier instance was deleted). A short circuit-breaker prevents every
call from paying the socket-connect timeout against a dead Redis host — the
former behavior added seconds of latency per request.

Public API (unchanged): get_github_stats_cached, invalidate_github_cache,
get_or_set_cache.
"""
import redis
import json
import time
import threading
from app.config import get_settings
from typing import Dict, Callable, Any, Optional
import logging
import asyncio

logger = logging.getLogger(__name__)
settings = get_settings()

# ── In-memory fallback (bounded TTL cache) ───────────────────────────
_mem_cache: "dict[str, tuple[Any, float]]" = {}
_mem_lock = threading.Lock()
_MEM_MAX_ENTRIES = 512

# ── Redis with a circuit breaker ─────────────────────────────────────
# redis.from_url is lazy (no connect until first command), so building the
# client never raises here. We track a "down until" deadline so that after a
# failure we skip Redis entirely for a cooldown window instead of eating the
# socket timeout on every single call.
_redis_client: Optional["redis.Redis"] = None
_redis_down_until = 0.0            # monotonic seconds; Redis skipped until then
_redis_down_logged = False
_REDIS_COOLDOWN_SECONDS = 300      # retry Redis at most once every 5 minutes


def _get_redis_client() -> Optional["redis.Redis"]:
    global _redis_client
    if _redis_client is None:
        try:
            _redis_client = redis.from_url(
                settings.REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
        except Exception as e:  # malformed URL etc — never use Redis then
            logger.warning(f"Redis client init failed ({e}); using in-memory cache")
            _redis_client = None
    return _redis_client


# Backward-compatible export for modules that use Redis directly for counters
# (usage_tracker, rate_limiter). redis.from_url is lazy — it opens no connection
# here — so this is safe at import even when the host is unreachable; those call
# sites already wrap every Redis op in try/except and degrade gracefully.
redis_client = _get_redis_client()


def _redis_usable() -> bool:
    return time.monotonic() >= _redis_down_until


def _mark_redis_down(err: Exception) -> None:
    global _redis_down_until, _redis_down_logged
    _redis_down_until = time.monotonic() + _REDIS_COOLDOWN_SECONDS
    if not _redis_down_logged:
        logger.warning(
            f"Redis unavailable ({err}); using in-memory cache "
            f"(retry in {_REDIS_COOLDOWN_SECONDS // 60} min)"
        )
        _redis_down_logged = True


def _mem_get(key: str) -> Optional[Any]:
    with _mem_lock:
        entry = _mem_cache.get(key)
        if entry is None:
            return None
        value, expiry = entry
        if time.monotonic() >= expiry:
            _mem_cache.pop(key, None)
            return None
        return value


def _mem_set(key: str, value: Any, ttl: int) -> None:
    with _mem_lock:
        if len(_mem_cache) >= _MEM_MAX_ENTRIES:
            now = time.monotonic()
            # Drop expired entries first; if still full, clear the oldest half.
            expired = [k for k, (_, exp) in _mem_cache.items() if exp <= now]
            for k in expired:
                _mem_cache.pop(k, None)
            if len(_mem_cache) >= _MEM_MAX_ENTRIES:
                for k in sorted(_mem_cache, key=lambda k: _mem_cache[k][1])[: _MEM_MAX_ENTRIES // 2]:
                    _mem_cache.pop(k, None)
        _mem_cache[key] = (value, time.monotonic() + ttl)


def _mem_delete(key: str) -> None:
    with _mem_lock:
        _mem_cache.pop(key, None)


async def _cache_get(key: str) -> Optional[Any]:
    """Return cached value (parsed) or None. Tries Redis, falls back to memory."""
    if _redis_usable():
        client = _get_redis_client()
        if client is not None:
            try:
                cached = await asyncio.to_thread(client.get, key)
                if isinstance(cached, (str, bytes, bytearray)):
                    return json.loads(cached)
                if cached is not None:
                    return cached
            except Exception as e:
                _mark_redis_down(e)
    return _mem_get(key)


async def _cache_set(key: str, value: Any, ttl: int) -> None:
    """Store value with TTL. Tries Redis, falls back to memory."""
    if _redis_usable():
        client = _get_redis_client()
        if client is not None:
            try:
                await asyncio.to_thread(client.setex, key, ttl, json.dumps(value))
                return
            except Exception as e:
                _mark_redis_down(e)
    _mem_set(key, value, ttl)


async def _cache_delete(key: str) -> None:
    if _redis_usable():
        client = _get_redis_client()
        if client is not None:
            try:
                await asyncio.to_thread(client.delete, key)
            except Exception as e:
                _mark_redis_down(e)
    _mem_delete(key)


async def get_github_stats_cached(project_id: str, repo_name: str) -> Dict:
    """
    Get GitHub stats with 1-hour cache.

    Args:
        project_id: UUID of the project
        repo_name: GitHub repo in format "owner/repo"

    Returns:
        Dictionary with GitHub stats
    """
    cache_key = f"github:stats:{project_id}"

    cached = await _cache_get(cache_key)
    if cached is not None:
        logger.info(f"Cache hit for project {project_id}")
        return cached

    from app.services.github_service import fetch_github_stats
    stats = await fetch_github_stats(repo_name)

    await _cache_set(cache_key, stats, 3600)
    return stats


async def invalidate_github_cache(project_id: str):
    """Manually invalidate cache (call after manual sync)."""
    await _cache_delete(f"github:stats:{project_id}")


async def get_or_set_cache(key: str, value_func: Callable, expire: int = 3600) -> Any:
    """
    Generic cache get-or-set.

    Args:
        key: Cache key
        value_func: Async function to call on cache miss
        expire: Expiration in seconds (default 1 hour)

    Returns:
        Cached or freshly fetched value
    """
    cached = await _cache_get(key)
    if cached is not None:
        return cached

    value = await value_func()
    await _cache_set(key, value, expire)
    return value
