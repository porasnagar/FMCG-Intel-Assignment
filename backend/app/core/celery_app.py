from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "fmcg_worker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.services.tasks"]
)

celery_app.conf.update(
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='UTC',
    enable_utc=True,
)

# Example schedule for beat
celery_app.conf.beat_schedule = {
    'run-discovery-every-10-minutes': {
        'task': 'app.services.tasks.run_discovery_agent',
        'schedule': 600.0, # 10 minutes
    },
}
