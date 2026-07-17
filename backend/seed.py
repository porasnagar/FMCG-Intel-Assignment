import sys
import os
import random
from datetime import datetime, timedelta

# Add current dir to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal, engine
from app.models.domain import Base, Company, Event, Deal, Article, AgentTask, Newsletter, event_source_table

def seed_db():
    print("Connecting to DB to seed data...")
    db = SessionLocal()
    
    # 1. Clear existing data to avoid duplicates if run multiple times
    try:
        db.query(Deal).delete()
        db.query(AgentTask).delete()
        db.query(Newsletter).delete()
        db.query(Company).delete()
        # To avoid foreign key issues with event_sources
        db.execute(event_source_table.delete())
        db.query(Event).delete()
        db.query(Article).delete()
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error clearing db: {e}")

    print("Adding Agents...")
    agents = [
        AgentTask(agent_name="News Ingestion Agent", status="Running", queue_size=12, processing_time_ms=450, last_run=datetime.utcnow() - timedelta(minutes=2), success_rate=99.2, error_count=0),
        AgentTask(agent_name="Event Extraction Agent", status="Running", queue_size=3, processing_time_ms=1200, last_run=datetime.utcnow() - timedelta(minutes=1), success_rate=95.5, error_count=2),
        AgentTask(agent_name="Financial Verification Agent", status="Idle", queue_size=0, processing_time_ms=850, last_run=datetime.utcnow() - timedelta(hours=1), success_rate=91.0, error_count=5),
        AgentTask(agent_name="Newsletter Writer Agent", status="Idle", queue_size=0, processing_time_ms=5000, last_run=datetime.utcnow() - timedelta(days=2), success_rate=100.0, error_count=0)
    ]
    db.add_all(agents)

    print("Adding Companies...")
    companies = [
        Company(name="Unilever", country="UK", industry="FMCG", description="Multinational consumer goods company.", total_deals=45, total_investments=12, total_acquisitions=33),
        Company(name="Nestlé", country="Switzerland", industry="Food & Beverage", description="Largest publicly held food company.", total_deals=60, total_investments=20, total_acquisitions=40),
        Company(name="ITC Limited", country="India", industry="Conglomerate", description="Indian conglomerate with a diversified presence in FMCG.", total_deals=15, total_investments=5, total_acquisitions=10),
        Company(name="PepsiCo", country="United States", industry="Food & Beverage", description="American multinational food, snack, and beverage corporation.", total_deals=38, total_investments=10, total_acquisitions=28),
    ]
    db.add_all(companies)

    print("Adding Events and Deals...")
    event1 = Event(title="Nestlé acquires Indian healthy snacking brand for $45M", event_type="Acquisition", confidence_score=0.95, ai_summary="Nestlé expands its footprint in the healthy snacking segment by acquiring a major Indian startup.", deal_value="$45M", industry="Snacks", country="India", status="Confirmed", business_impact="High", ai_insight="Strategic move to capture millennials.")
    event2 = Event(title="Unilever invests in sustainable packaging startup", event_type="Investment", confidence_score=0.88, ai_summary="Unilever leads a Series B funding round for a UK-based sustainable packaging company.", deal_value="£15M", industry="Packaging", country="UK", status="Confirmed", business_impact="Medium", ai_insight="Aligns with ESG goals.")
    event3 = Event(title="ITC rumored to acquire local dairy brand", event_type="Merger", confidence_score=0.60, ai_summary="Market rumors suggest ITC is in late-stage talks to acquire a regional dairy player to boost its FMCG portfolio.", deal_value="₹500Cr", industry="Dairy", country="India", status="Rumored", business_impact="High", ai_insight="Significant expansion of distribution network if true.")

    db.add_all([event1, event2, event3])
    db.commit() # Commit to get IDs

    deal1 = Deal(event_id=event1.id, acquirer="Nestlé", target_company="HealthySnack India", deal_value=45000000, currency="USD", industry="Snacks", country="India", deal_type="Acquisition")
    deal2 = Deal(event_id=event2.id, acquirer="Unilever", target_company="EcoPack UK", deal_value=15000000, currency="GBP", industry="Packaging", country="UK", deal_type="Investment")
    db.add_all([deal1, deal2])

    print("Adding Articles...")
    article1 = Article(title="Nestlé's major push into Indian snacking", url="https://example.com/1", content="...", summary="Nestlé buys Indian brand.", published_date=datetime.utcnow() - timedelta(hours=2), source="Financial Times", confidence_score=0.92, verification_status="Verified", tags="Acquisition,India", country="India")
    article2 = Article(title="Unilever backs green packaging", url="https://example.com/2", content="...", summary="Unilever invests in green tech.", published_date=datetime.utcnow() - timedelta(days=1), source="Reuters", confidence_score=0.89, verification_status="Verified", tags="Investment,ESG", country="UK")
    
    # Do not set embeddings in seed script to avoid needing the model locally
    db.add_all([article1, article2])
    db.commit()

    # Link articles to events
    try:
        db.execute(event_source_table.insert().values(event_id=event1.id, article_id=article1.id))
        db.execute(event_source_table.insert().values(event_id=event2.id, article_id=article2.id))
        db.commit()
    except Exception as e:
        print(f"Skipping association insert (already exists or error): {e}")
        db.rollback()

    print("Adding Newsletters...")
    nl1 = Newsletter(title="FMCG Weekly Digest #47", generated_at=datetime.utcnow() - timedelta(days=3), content_markdown="# Digest\nNestle's $45M deal.")
    nl2 = Newsletter(title="FMCG Weekly Digest #48", generated_at=datetime.utcnow(), content_markdown="# Upcoming\nWill be generated soon.")
    db.add_all([nl1, nl2])

    db.commit()
    db.close()
    print("Successfully seeded the production database with mock data!")

if __name__ == "__main__":
    seed_db()
