"""
Usage Tracker

Tracks API usage per key/user via Redis counters.
Periodically flushed to PostgreSQL for persistent storage.
"""
import logging
import uuid
from datetime import date, datetime
from typing import Optional
from sqlalchemy.orm import Session

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class UsageTracker:
    """Track API usage in Redis with periodic DB flush."""
    
    def __init__(self, redis_client):
        self.redis = redis_client
    
    async def track_request(
        self,
        user_id: str,
        api_key_id: Optional[str],
        endpoint: str,
    ):
        """
        Track a single API request.
        Increments Redis counters for fast tracking.
        """
        today = date.today().isoformat()
        
        try:
            pipe = self.redis.pipeline()
            
            # User daily counter
            user_day_key = f"usage:user:{user_id}:{today}"
            pipe.incr(user_day_key)
            pipe.expire(user_day_key, 172800)  # 2 days TTL
            
            # User monthly counter
            month = today[:7]  # "2026-02"
            user_month_key = f"usage:user:{user_id}:{month}"
            pipe.incr(user_month_key)
            pipe.expire(user_month_key, 2678400)  # 31 days TTL
            
            # API key specific counter
            if api_key_id:
                key_day = f"usage:key:{api_key_id}:{today}"
                pipe.incr(key_day)
                pipe.expire(key_day, 172800)
            
            # Endpoint counter (for analytics)
            endpoint_key = f"usage:endpoint:{user_id}:{endpoint}:{today}"
            pipe.incr(endpoint_key)
            pipe.expire(endpoint_key, 172800)
            
            pipe.execute()
            
        except Exception as e:
            logger.warning(f"Usage tracking Redis error: {e}")
    
    async def get_usage_today(self, user_id: str) -> int:
        """Get today's API call count for a user."""
        today = date.today().isoformat()
        key = f"usage:user:{user_id}:{today}"
        try:
            count = self.redis.get(key)
            return int(count) if count else 0
        except Exception as e:
            logger.warning(f"Failed to read usage: {e}")
            return 0
    
    async def get_usage_month(self, user_id: str) -> int:
        """Get this month's API call count for a user."""
        month = date.today().isoformat()[:7]
        key = f"usage:user:{user_id}:{month}"
        try:
            count = self.redis.get(key)
            return int(count) if count else 0
        except Exception as e:
            logger.warning(f"Failed to read monthly usage: {e}")
            return 0
    
    async def get_ai_messages_month(self, user_id: str) -> int:
        """Get this month's AI message count for a user."""
        month = date.today().isoformat()[:7]
        key = f"usage:ai:{user_id}:{month}"
        try:
            count = self.redis.get(key)
            return int(count) if count else 0
        except Exception as e:
            logger.warning(f"Failed to read AI usage: {e}")
            return 0
    
    async def track_ai_message(self, user_id: str):
        """Track an AI message (separate from API calls)."""
        month = date.today().isoformat()[:7]
        key = f"usage:ai:{user_id}:{month}"
        try:
            pipe = self.redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, 2678400)
            pipe.execute()
        except Exception as e:
            logger.warning(f"AI usage tracking error: {e}")
    
    async def flush_to_db(self, db: Session, user_id: str):
        """
        Flush Redis usage data to PostgreSQL for persistent storage.
        Called periodically by Celery or on-demand.
        """
        from app.models.usage_log import UsageLog
        from app.models.user import User
        from app.utils.tenant_context import resolve_tenant_context

        today = date.today()
        today_str = today.isoformat()

        try:
            count = await self.get_usage_today(user_id)
            if count > 0:
                # user_id arrives as a plain string (Redis key / Celery arg);
                # coerce once so every DB filter/insert below binds correctly
                # (a raw str against a UUID(as_uuid=True) column fails under
                # SQLite; keep the original string for Redis/logging).
                user_uuid = uuid.UUID(user_id)

                # Upsert usage log
                existing = db.query(UsageLog).filter(
                    UsageLog.user_id == user_uuid,
                    UsageLog.date == today
                ).first()

                # Background job -- no current_user/JWT here, so resolution
                # goes through the plain callable (Phase 1 Milestone 3), not
                # the FastAPI dependency. No-op when the flag is off.
                user = db.query(User).filter(User.id == user_uuid).first()
                org_id = resolve_tenant_context(db, user).org_id if user else None

                if existing:
                    existing.request_count = count
                    if org_id is not None and existing.org_id is None:
                        existing.org_id = org_id
                else:
                    log = UsageLog(
                        user_id=user_uuid,
                        org_id=org_id,
                        date=today,
                        request_count=count
                    )
                    db.add(log)

                db.commit()
                logger.info(f"Flushed usage for user {user_id}: {count} requests")

        except Exception as e:
            logger.error(f"Failed to flush usage to DB: {e}")
            db.rollback()


def get_usage_tracker() -> UsageTracker:
    """Get usage tracker instance with Redis client."""
    from app.services.cache_service import redis_client
    return UsageTracker(redis_client)
