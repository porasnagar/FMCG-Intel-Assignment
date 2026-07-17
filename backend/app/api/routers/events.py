from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas.api import EventResponse, AIAssistantRequest, AIAssistantResponse
from app.models.domain import Event

router = APIRouter()

@router.get("", response_model=list[EventResponse])
def get_events(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    events = db.query(Event).offset(skip).limit(limit).all()
    return events

@router.get("/{event_id}", response_model=EventResponse)
def get_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    return event

@router.post("/{event_id}/ask", response_model=AIAssistantResponse)
def ask_ai_about_event(event_id: int, request: AIAssistantRequest, db: Session = Depends(get_db)):
    # Call to Gemini/LLM goes here
    return AIAssistantResponse(answer=f"AI Response to: {request.question} (Mock)")
