"""
Celery tasks for durable inbound-webhook processing.

Each task wraps an existing async handler via ``asyncio.run`` (matching the
pattern in github_sync.py). Handlers are imported lazily inside the task body
to avoid circular imports with the api.v1 webhook modules.

These run only when settings.USE_CELERY is true (see app/tasks/dispatch.py);
otherwise the same handlers run in-process via FastAPI BackgroundTasks.
"""
import asyncio
import logging

from celery import shared_task

logger = logging.getLogger(__name__)

# Retry transient failures (network, provider hiccups) with backoff, capped.
_RETRY_KW = dict(bind=True, max_retries=3, default_retry_delay=30)


@shared_task(**_RETRY_KW)
def process_whatsapp_message_task(self, phone, message, message_sid, media_url):
    from app.api.v1.whatsapp import _process_whatsapp_message
    try:
        asyncio.run(_process_whatsapp_message(phone, message, message_sid, media_url))
    except Exception as exc:
        logger.error("WhatsApp task failed (sid=%s): %s", message_sid, exc)
        raise self.retry(exc=exc)


@shared_task(**_RETRY_KW)
def process_telegram_message_task(self, chat_id, text, photo_file_id, update_id):
    from app.api.v1.telegram import _process_telegram_message
    try:
        asyncio.run(_process_telegram_message(chat_id, text, photo_file_id, update_id))
    except Exception as exc:
        logger.error("Telegram task failed (update=%s): %s", update_id, exc)
        raise self.retry(exc=exc)


@shared_task(**_RETRY_KW)
def notify_client_on_push_task(self, payload):
    from app.api.v1.github import notify_client_on_push
    try:
        asyncio.run(notify_client_on_push(payload))
    except Exception as exc:
        logger.error("Push-notify task failed: %s", exc)
        raise self.retry(exc=exc)


@shared_task(**_RETRY_KW)
def analyze_build_failure_task(self, payload):
    from app.api.v1.github import analyze_build_failure
    try:
        asyncio.run(analyze_build_failure(payload))
    except Exception as exc:
        logger.error("Build-failure task failed: %s", exc)
        raise self.retry(exc=exc)
