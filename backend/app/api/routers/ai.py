from fastapi import APIRouter
from pydantic import BaseModel
from app.services import ai_service

router = APIRouter()

class SearchRequest(BaseModel):
    query: str

class AskRequest(BaseModel):
    event_id: int
    question: str

@router.post("/search")
async def ai_search(req: SearchRequest):
    """Natural language search powered by Gemini Flash Lite."""
    result = await ai_service.natural_language_search(req.query)
    return result

@router.post("/ask")
async def ask_ai_analyst(req: AskRequest):
    """AI Analyst Mode — ask follow-up questions about a specific event."""
    answer = await ai_service.ask_about_event(req.event_id, req.question)
    return {"answer": answer}
