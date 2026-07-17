from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Boolean, Table
from sqlalchemy.orm import relationship
from datetime import datetime
from pgvector.sqlalchemy import Vector
from app.core.database import Base

# Association table for Many-to-Many between Event and Article
event_source_table = Table(
    'event_sources',
    Base.metadata,
    Column('event_id', Integer, ForeignKey('events.id'), primary_key=True),
    Column('article_id', Integer, ForeignKey('articles.id'), primary_key=True)
)

class Article(Base):
    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    url = Column(String, unique=True, index=True)
    content = Column(Text)
    summary = Column(Text)
    published_date = Column(DateTime)
    source = Column(String)
    confidence_score = Column(Float, default=0.0)
    verification_status = Column(String, default="Pending") # Pending, Verified, Rejected
    tags = Column(String) # Comma separated for MVP
    country = Column(String)
    
    # Vector embedding for semantic deduplication
    embedding = Column(Vector(384)) # Assuming sentence-transformers all-MiniLM-L6-v2 size
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    events = relationship("Event", secondary=event_source_table, back_populates="articles")

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    event_type = Column(String) # M&A, Investment, etc.
    confidence_score = Column(Float)
    ai_summary = Column(Text)
    deal_value = Column(String)
    industry = Column(String)
    country = Column(String)
    status = Column(String)
    business_impact = Column(Text)
    ai_insight = Column(Text)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    articles = relationship("Article", secondary=event_source_table, back_populates="events")
    deal = relationship("Deal", back_populates="event", uselist=False)

class Deal(Base):
    __tablename__ = "deals"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey('events.id'))
    acquirer = Column(String)
    target_company = Column(String)
    deal_value = Column(Float)
    currency = Column(String, default="USD")
    industry = Column(String)
    country = Column(String)
    announcement_date = Column(DateTime)
    expected_closing_date = Column(DateTime)
    deal_type = Column(String)
    
    # AI Generated fields
    executive_summary = Column(Text)
    business_impact = Column(Text)
    strategic_analysis = Column(Text)
    future_outlook = Column(Text)
    competitor_impact = Column(Text)
    trust_score = Column(Float)
    
    event = relationship("Event", back_populates="deal")

class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    logo_url = Column(String)
    country = Column(String)
    industry = Column(String)
    description = Column(Text)
    
    total_deals = Column(Integer, default=0)
    total_investments = Column(Integer, default=0)
    total_acquisitions = Column(Integer, default=0)

class Newsletter(Base):
    __tablename__ = "newsletters"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    generated_at = Column(DateTime, default=datetime.utcnow)
    content_markdown = Column(Text)
    pdf_url = Column(String)

class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id = Column(Integer, primary_key=True, index=True)
    agent_name = Column(String, index=True)
    status = Column(String) # Running, Idle, Error
    queue_size = Column(Integer, default=0)
    processing_time_ms = Column(Integer, default=0)
    last_run = Column(DateTime)
    success_rate = Column(Float, default=100.0)
    error_count = Column(Integer, default=0)
