"""
Background-work dispatch helper.

Chooses between durable Celery execution and in-process FastAPI BackgroundTasks
based on ``settings.USE_CELERY``. This lets production get at-least-once,
retryable, restart-safe processing while local dev/tests keep working with no
broker or worker running.
"""
import logging

from app.config import settings

logger = logging.getLogger(__name__)


def dispatch(background_tasks, celery_task, sync_callable, *args) -> str:
    """Run background work via Celery (if enabled) or in-process.

    Args:
        background_tasks: FastAPI BackgroundTasks (used in the in-process path).
        celery_task: the Celery task object (``.delay`` is called with ``args``).
        sync_callable: the in-process coroutine/callable used as a fallback.
        *args: positional args passed to whichever path runs.

    Returns:
        "celery" or "background" — which path handled it (useful for logging/tests).
    """
    if settings.USE_CELERY:
        try:
            celery_task.delay(*args)
            return "celery"
        except Exception as exc:
            # Broker unreachable — degrade gracefully rather than dropping the
            # webhook. In-process is best-effort but better than a 500 to Twilio.
            logger.error("Celery dispatch failed, falling back in-process: %s", exc)

    background_tasks.add_task(sync_callable, *args)
    return "background"
