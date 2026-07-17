from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.domain import AgentTask

router = APIRouter()

@router.get("")
def get_agents(db: Session = Depends(get_db)):
    tasks = db.query(AgentTask).all()
    return tasks

@router.post("/{agent_name}/trigger")
def trigger_agent(agent_name: str):
    """Manually trigger an agent task via Celery."""
    from app.services.tasks import run_discovery_agent
    if agent_name == "source-discovery":
        run_discovery_agent.delay()
    return {"status": "triggered", "agent": agent_name}
