from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.domain import Article

router = APIRouter()

@router.get("")
def get_news(
    skip: int = 0,
    limit: int = 100,
    search: str = "",
    category: str = "All",
    country: str = "All",
    status: str = "Verified",
    db: Session = Depends(get_db)
):
    """Live news feed with filtering."""
    query = db.query(Article)
    if search:
        query = query.filter(Article.title.ilike(f"%{search}%"))
    if category != "All":
        query = query.filter(Article.tags.ilike(f"%{category}%"))
    if country != "All":
        query = query.filter(Article.country.ilike(f"%{country}%"))
    if status != "All":
        query = query.filter(Article.verification_status == status)
    articles = query.order_by(Article.created_at.desc()).offset(skip).limit(limit).all()
    return articles
