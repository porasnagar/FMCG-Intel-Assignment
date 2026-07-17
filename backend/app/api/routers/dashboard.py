from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import Optional
from app.core.database import get_db
from app.schemas.api import DashboardMetrics, AIMarketInsight, LiveActivityFeedItem
from app.models.domain import Article, Event, Company, Deal

router = APIRouter()

@router.get("/metrics", response_model=DashboardMetrics)
def get_dashboard_metrics(db: Session = Depends(get_db)):
    try:
        total_articles = db.query(Article).count()
        verified_events = db.query(Event).count()
        acquisitions = db.query(Event).filter(Event.event_type == "Acquisition").count()
        investments = db.query(Event).filter(Event.event_type == "Investment").count()
        acquirers = db.query(Deal.acquirer).filter(Deal.acquirer.isnot(None), Deal.acquirer != "").distinct().count()
        targets = db.query(Deal.target_company).filter(Deal.target_company.isnot(None), Deal.target_company != "").distinct().count()
        companies = acquirers + targets
        countries = db.query(Event.country).filter(Event.country.isnot(None), Event.country != "").distinct().count()
        avg_conf_raw = db.query(func.avg(Article.confidence_score)).scalar()
        avg_conf = float(avg_conf_raw) if avg_conf_raw is not None else 0.0

        last_article = db.query(Article).order_by(Article.created_at.desc()).first()
        last_event = db.query(Event).order_by(Event.created_at.desc()).first()

        last_updated: Optional[datetime] = None
        if last_article and last_event:
            last_updated = max(last_article.created_at, last_event.created_at)
        elif last_article:
            last_updated = last_article.created_at
        elif last_event:
            last_updated = last_event.created_at
    except Exception:
        # Return safe defaults if DB is not ready yet
        return DashboardMetrics(
            total_articles_ingested=0, verified_news_events=0,
            acquisitions_detected=0, investments_detected=0,
            active_companies=0, active_countries=0,
            average_confidence_score=0.0, coverage_score=0.0,
            pipeline_health="Connecting...", last_updated=None
        )

    return DashboardMetrics(
        total_articles_ingested=total_articles,
        verified_news_events=verified_events,
        acquisitions_detected=acquisitions,
        investments_detected=investments,
        active_companies=companies,
        active_countries=countries,
        average_confidence_score=avg_conf,
        coverage_score=0.0,
        pipeline_health="Healthy",
        last_updated=last_updated
    )

@router.get("/insight", response_model=AIMarketInsight)
def get_market_insight(db: Session = Depends(get_db)):
    try:
        # Top Movement: Most recent event
        recent_event = db.query(Event).order_by(Event.created_at.desc()).first()
        top_movement = recent_event.title if recent_event else "No major movements detected."

        # Biggest Deal: Find a deal with a parsed value or just return the most recent deal
        recent_deal = db.query(Deal).order_by(Deal.created_at.desc()).first()
        biggest_deal = f"{recent_deal.acquirer} acquires {recent_deal.target_company}" if recent_deal else "No deals recorded yet."

        # Emerging Trends: Based on most active sector
        sector_counts = db.query(Event.industry, func.count(Event.id)).group_by(Event.industry).all()
        emerging_trends = f"Surge in {max(sector_counts, key=lambda x: x[1])[0]} sector activity." if sector_counts else "Awaiting more data to identify trends."

        return AIMarketInsight(
            top_market_movement=top_movement,
            biggest_deal=biggest_deal,
            emerging_trends=emerging_trends,
            overall_sentiment="Optimistic" if recent_deal else "Neutral"
        )
    except Exception:
        return AIMarketInsight(
            top_market_movement="Data gathering in progress...",
            biggest_deal="Data gathering in progress...",
            emerging_trends="Data gathering in progress...",
            overall_sentiment="Neutral"
        )


@router.get("/feed", response_model=list[LiveActivityFeedItem])
def get_live_feed(db: Session = Depends(get_db)):
    try:
        recent_articles = db.query(Article).order_by(Article.created_at.desc()).limit(10).all()
        recent_events = db.query(Event).order_by(Event.created_at.desc()).limit(10).all()

        feed = []
        for a in recent_articles:
            if a.title and a.created_at:
                feed.append(LiveActivityFeedItem(
                    timestamp=a.created_at,
                    message=f"New article: {a.title}",
                    event_type="discovery"
                ))
        for e in recent_events:
            if e.title and e.created_at:
                feed.append(LiveActivityFeedItem(
                    timestamp=e.created_at,
                    message=f"Event {'verified' if e.status == 'Verified' else 'detected'}: {e.title}",
                    event_type="verification"
                ))

        feed.sort(key=lambda x: x.timestamp, reverse=True)
        return feed[:10]
    except Exception:
        return []
