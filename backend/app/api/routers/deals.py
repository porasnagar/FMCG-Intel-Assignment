from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.domain import Deal

router = APIRouter()

@router.get("")
def get_deals(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    deals = db.query(Deal).offset(skip).limit(limit).all()
    return deals

@router.get("/{deal_id}")
def get_deal(deal_id: int, db: Session = Depends(get_db)):
    deal = db.query(Deal).filter(Deal.id == deal_id).first()
    return deal
