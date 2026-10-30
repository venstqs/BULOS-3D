"""
Optional Celery worker for the background hydrodynamic forecast (concept paper:
"Python (FastAPI / Celery) ... background hydrodynamic analytics tasks").

    pip install celery redis
    set REDIS_URL=redis://localhost:6379/0
    celery -A backend.tasks worker --loglevel=info          # terminal 1
    set BULOS_CELERY=1 && npm start                          # terminal 2

Without BULOS_CELERY=1 the same compute_forecast() runs inside the API process,
so the platform works out of the box on a laptop.
"""
import os

from celery import Celery

from .twin import compute_forecast

app = Celery("bulos3d", broker=os.getenv("REDIS_URL", "redis://localhost:6379/0"),
             backend=os.getenv("REDIS_URL", "redis://localhost:6379/0"))
app.conf.update(task_serializer="json", result_serializer="json", accept_content=["json"],
                result_expires=3600, worker_prefetch_multiplier=1)


@app.task(name="bulos3d.forecast")
def forecast_task(snapshot):
    """4-hour advection-dispersion forecast; returns per-station series (JSON)."""
    return compute_forecast(snapshot)
