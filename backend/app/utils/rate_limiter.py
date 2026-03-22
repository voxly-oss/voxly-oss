"""
Redis-based Rate Limiter

Implements a sliding window rate limiter with soft limits:
- At 80%: adds X-RateLimit-Warning header
- At 100%: returns HTTP 429
- 5% grace buffer before hard block (at 105%)
"""
import time
import logging
from typing import Optional, Dict
from fastapi import HTTPException, Request, Response, status
import asyncio

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class RateLimiter:
    """Sliding window rate limiter using Redis."""
    
    def __init__(self, redis_client):
        self.redis = redis_client
    
    def _get_window_key(self, user_id: str, window: str) -> str:
        """Generate Redis key for rate limiting."""
        return f"ratelimit:{window}:{user_id}"
    
    async def check_rate_limit(
        self,
        user_id: str,
        limit_per_minute: int,
        limit_per_day: int
    ) -> Dict:
        """
        Check if the user is within rate limits.
        
        Returns dict with:
        - allowed: bool
        - minute_count: current minute usage
        - day_count: current day usage 
        - minute_limit: max per minute
        - day_limit: max per day
        - warning: bool (at 80%+)
        - retry_after: seconds until reset (if blocked)
        """
        now = int(time.time())
        minute_key = self._get_window_key(user_id, f"min:{now // 60}")
        day_key = self._get_window_key(user_id, f"day:{now // 86400}")
        
        try:
            def _execute_pipeline():
                pipe = self.redis.pipeline()
                pipe.incr(minute_key)
                pipe.expire(minute_key, 60)
                pipe.incr(day_key)
                pipe.expire(day_key, 86400)
                return pipe.execute()

            results = await asyncio.to_thread(_execute_pipeline)
            
            minute_count = results[0]
            day_count = results[2]
        except Exception as e:
            logger.warning(f"Rate limiter Redis error: {e}")
            # Fail open — allow request if Redis is down
            return {
                "allowed": True,
                "minute_count": 0,
                "day_count": 0,
                "minute_limit": limit_per_minute,
                "day_limit": limit_per_day,
                "warning": False,
                "retry_after": 0
            }
        
        # Check with 5% grace buffer
        hard_minute_limit = int(limit_per_minute * 1.05)
        hard_day_limit = int(limit_per_day * 1.05)
        
        # Blocked?
        blocked = minute_count > hard_minute_limit or day_count > hard_day_limit
        
        # Warning at 80%?
        minute_warning = minute_count >= int(limit_per_minute * 0.8)
        day_warning = day_count >= int(limit_per_day * 0.8)
        warning = minute_warning or day_warning
        
        # Calculate retry_after
        retry_after = 0
        if blocked:
            if minute_count > hard_minute_limit:
                retry_after = 60 - (now % 60)
            else:
                retry_after = 86400 - (now % 86400)
        
        return {
            "allowed": not blocked,
            "minute_count": minute_count,
            "day_count": day_count,
            "minute_limit": limit_per_minute,
            "day_limit": limit_per_day,
            "warning": warning,
            "retry_after": retry_after
        }
    
    def add_rate_limit_headers(self, response: Response, rate_info: Dict):
        """Add rate limit headers to the response."""
        response.headers["X-RateLimit-Limit-Minute"] = str(rate_info["minute_limit"])
        response.headers["X-RateLimit-Remaining-Minute"] = str(
            max(0, rate_info["minute_limit"] - rate_info["minute_count"])
        )
        response.headers["X-RateLimit-Limit-Day"] = str(rate_info["day_limit"])
        response.headers["X-RateLimit-Remaining-Day"] = str(
            max(0, rate_info["day_limit"] - rate_info["day_count"])
        )
        
        if rate_info["warning"]:
            response.headers["X-RateLimit-Warning"] = "Approaching rate limit"
        
        if not rate_info["allowed"]:
            response.headers["Retry-After"] = str(rate_info["retry_after"])


def get_rate_limiter() -> RateLimiter:
    """Get rate limiter instance with Redis client."""
    from app.services.cache_service import redis_client
    return RateLimiter(redis_client)
