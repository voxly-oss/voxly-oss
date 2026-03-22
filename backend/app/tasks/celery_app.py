from celery import Celery
from celery.schedules import crontab
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    'tasks',
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL
)

celery_app.conf.update(
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='Asia/Kolkata',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=300,  # 5 minutes max
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=100,
)

# Schedule: Sync GitHub repos every hour
celery_app.conf.beat_schedule = {
    'sync-github-repos-hourly': {
        'task': 'app.tasks.github_sync.sync_all_github_repos',
        'schedule': 3600.0,  # Every 1 hour
    },
}

# Import tasks to register them
celery_app.autodiscover_tasks(['app.tasks'])
