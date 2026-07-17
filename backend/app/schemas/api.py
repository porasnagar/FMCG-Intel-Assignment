from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

class ArticleBase(BaseModel):
    title: str
    url: str
    published_date: datetime
    source: str
    confidence_score: float
    verification_status: str
    tags: str
    country: str

class ArticleResponse(ArticleBase):
    id: int
    content: Optional[str] = None
    summary: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)

class DealBase(BaseModel):
    acquirer: Optional[str] = None
    target_company: Optional[str] = None
    deal_value: Optional[float] = None
    currency: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    deal_type: Optional[str] = None

class DealResponse(DealBase):
    id: int
    executive_summary: Optional[str] = None
    business_impact: Optional[str] = None
    strategic_analysis: Optional[str] = None
    future_outlook: Optional[str] = None
    competitor_impact: Optional[str] = None
    trust_score: Optional[float] = None
    model_config = ConfigDict(from_attributes=True)

class EventBase(BaseModel):
    title: str
    event_type: str
    confidence_score: float
    deal_value: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    status: Optional[str] = None

class EventResponse(EventBase):
    id: int
    ai_summary: Optional[str] = None
    business_impact: Optional[str] = None
    ai_insight: Optional[str] = None
    articles: List[ArticleResponse] = []
    deal: Optional[DealResponse] = None
    model_config = ConfigDict(from_attributes=True)

class CompanyBase(BaseModel):
    name: str
    logo_url: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None

class CompanyResponse(CompanyBase):
    id: int
    total_deals: int
    total_investments: int
    total_acquisitions: int
    model_config = ConfigDict(from_attributes=True)

class NewsletterResponse(BaseModel):
    id: int
    title: str
    generated_at: datetime
    pdf_url: Optional[str] = None
    content_markdown: str
    model_config = ConfigDict(from_attributes=True)

class AgentTaskResponse(BaseModel):
    id: int
    agent_name: str
    status: str
    queue_size: int
    processing_time_ms: int
    last_run: Optional[datetime] = None
    success_rate: float
    error_count: int
    model_config = ConfigDict(from_attributes=True)

class DashboardMetrics(BaseModel):
    total_articles_ingested: int
    verified_news_events: int
    acquisitions_detected: int
    investments_detected: int
    active_companies: int
    active_countries: int
    average_confidence_score: float
    coverage_score: float
    pipeline_health: str
    last_updated: Optional[datetime] = None

class AIMarketInsight(BaseModel):
    top_market_movement: str
    biggest_deal: str
    emerging_trends: str
    overall_sentiment: str

class LiveActivityFeedItem(BaseModel):
    timestamp: datetime
    message: str
    event_type: str

class AIAssistantRequest(BaseModel):
    question: str

class AIAssistantResponse(BaseModel):
    answer: str
