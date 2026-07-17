from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.domain import Newsletter
from app.services import ai_service

router = APIRouter()

@router.get("")
def get_newsletters(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    return db.query(Newsletter).order_by(Newsletter.generated_at.desc()).offset(skip).limit(limit).all()

@router.post("/generate")
async def generate_newsletter(db: Session = Depends(get_db)):
    """Trigger the newsletter generation agent via Gemini."""
    content = await ai_service.generate_newsletter_content(db)
    nl = Newsletter(title="FMCG Weekly Digest", content_markdown=content)
    db.add(nl)
    db.commit()
    db.refresh(nl)
    return nl
