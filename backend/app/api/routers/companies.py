from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.domain import Company

router = APIRouter()

@router.get("")
def get_companies(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    return db.query(Company).offset(skip).limit(limit).all()

@router.get("/{company_id}")
def get_company(company_id: int, db: Session = Depends(get_db)):
    return db.query(Company).filter(Company.id == company_id).first()
