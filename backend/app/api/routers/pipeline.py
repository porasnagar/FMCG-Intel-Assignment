"""
pipeline.py - FastAPI router for triggering the autonomous pipeline.
Protected by X-Pipeline-Secret header.
"""
import asyncio
import os
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException

router = APIRouter()

PIPELINE_SECRET = os.getenv("PIPELINE_SECRET", "")


def _verify_secret(x_pipeline_secret: str = Header(default="")):
    if PIPELINE_SECRET and x_pipeline_secret != PIPELINE_SECRET:
        raise HTTPException(status_code=403, detail="Invalid pipeline secret")


@router.post("/run")
async def run_pipeline(
    background_tasks: BackgroundTasks,
    x_pipeline_secret: str = Header(default=""),
):
    """
    Trigger the full FMCG M&A intelligence pipeline.
    Called by GitHub Actions cron every 6 hours.
    Returns immediately; pipeline runs in background.
    """
    _verify_secret(x_pipeline_secret)

    from app.services.pipeline_service import run_pipeline as _run_pipeline

    # Run in a true background asyncio task so the response returns immediately
    async def _background():
        await _run_pipeline()

    background_tasks.add_task(_background)

    return {
        "status": "started",
        "message": "Pipeline triggered. Check /api/agents for live status."
    }


@router.get("/status")
def pipeline_status():
    """Quick check — is a pipeline run in progress?"""
    from app.core.database import SessionLocal
    from app.models.domain import AgentTask
    db = SessionLocal()
    try:
        running = db.query(AgentTask).filter(AgentTask.status == "Running").count()
        agents = db.query(AgentTask).all()
        return {
            "running": running > 0,
            "agents": [
                {
                    "name": a.agent_name,
                    "status": a.status,
                    "last_run": a.last_run.isoformat() if a.last_run else None,
                    "error_count": a.error_count,
                }
                for a in agents
            ]
        }
    finally:
        db.close()
