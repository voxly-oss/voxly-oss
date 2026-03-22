import redis
import json
from app.config import get_settings
from typing import Dict, Callable, Any
import logging
import asyncio

logger = logging.getLogger(__name__)
settings = get_settings()

# Connect to Upstash Redis
redis_client = redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=5,
    socket_timeout=5
)


async def get_github_stats_cached(project_id: str, repo_name: str) -> Dict:
    """
    Get GitHub stats with 1-hour cache
    
    Args:
        project_id: UUID of the project
        repo_name: GitHub repo in format "owner/repo"
        
    Returns:
        Dictionary with GitHub stats
    """
    cache_key = f"github:stats:{project_id}"
    
    try:
        # Try cache first
        cached = await asyncio.to_thread(redis_client.get, cache_key)
        if cached:
            logger.info(f"Cache hit for project {project_id}")
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"Redis cache read failed: {e}")
    
    # Fetch from GitHub
    from app.services.github_service import fetch_github_stats
    stats = await fetch_github_stats(repo_name)
    
    try:
        # Cache for 1 hour
        await asyncio.to_thread(
            redis_client.setex,
            cache_key,
            3600,
            json.dumps(stats),
        )
        logger.info(f"Cached GitHub stats for project {project_id}")
    except Exception as e:
        logger.warning(f"Redis cache write failed: {e}")
    
    return stats


async def invalidate_github_cache(project_id: str):
    """
    Manually invalidate cache (call after manual sync)
    
    Args:
        project_id: UUID of the project
    """
    cache_key = f"github:stats:{project_id}"
    try:
        await asyncio.to_thread(redis_client.delete, cache_key)
        logger.info(f"Invalidated cache for project {project_id}")
    except Exception as e:
        logger.warning(f"Failed to invalidate cache: {e}")


async def get_or_set_cache(key: str, value_func: Callable, expire: int = 3600) -> Any:
    """
    Generic cache get or set function
    
    Args:
        key: Cache key
        value_func: Async function to call if cache miss
        expire: Expiration in seconds (default 1 hour)
        
    Returns:
        Cached or freshly fetched value
    """
    try:
        cached = await asyncio.to_thread(redis_client.get, key)
        if cached:
            return json.loads(cached)
    except Exception as e:
        logger.warning(f"Cache read error for {key}: {e}")
    
    # Fetch fresh value
    value = await value_func()
    
    try:
        await asyncio.to_thread(redis_client.setex, key, expire, json.dumps(value))
    except Exception as e:
        logger.warning(f"Cache write error for {key}: {e}")
    
    return value
