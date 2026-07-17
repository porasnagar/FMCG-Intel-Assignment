"""
pipeline_service.py - The core autonomous FMCG M&A intelligence pipeline.
Designed to run as a FastAPI background task (no Celery needed).

Flow:
  1. Tavily search (full article content, 8 targeted queries)
  2. Gemini entity extraction (no classifier - search query = filter)
  3. Save Articles + Events + Deals to DB
  4. Update AgentTask status in real time
"""
import os
import asyncio
import httpx
import re
from datetime import datetime
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.domain import Article, Event, Deal, AgentTask, Company
from app.services.ai_service import extract_deal_entities

TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

TAVILY_QUERIES = [
    "FMCG company acquisition merger deal 2025",
    "food beverage company takeover acquisition 2025",
    "consumer goods company merger acquisition announced",
    "Unilever Nestle HUL ITC Dabur FMCG acquisition deal",
    "packaged food company bought acquired investment 2025",
    "personal care beauty company acquisition deal 2025",
    "dairy snacks beverage startup acquired FMCG",
    "D2C brand acquired by FMCG company 2025",
    "India FMCG merger acquisition deal crore rupees",
    "global food company acquires buys stake 2025",
]

TRUSTED_DOMAINS = [
    "reuters.com", "ft.com", "economictimes.indiatimes.com",
    "business-standard.com", "livemint.com", "moneycontrol.com",
    "bloomberg.com", "thehindubusinessline.com", "foodnavigator.com",
    "foodbusinessnews.net", "just-food.com", "yourstory.com",
    "techcrunch.com", "inc42.com", "vccircle.com", "dealstreetasia.com",
]

def _parse_deal_value(val_str: str) -> float:
    if not val_str or str(val_str).lower() in ["undisclosed", "n/a", "null", "none", "unknown", ""]:
        return 0.0
    match = re.search(r'[\d\.]+', str(val_str).replace(',', ''))
    if match:
        try:
            return float(match.group())
        except ValueError:
            return 0.0
    return 0.0

def _upsert_agent(db: Session, name: str, status: str, queue: int = 0, ms: int = 0, errors: int = 0):
    task = db.query(AgentTask).filter(AgentTask.agent_name == name).first()
    if not task:
        task = AgentTask(agent_name=name)
        db.add(task)
    task.status = status
    task.queue_size = queue
    task.processing_time_ms = ms
    task.last_run = datetime.utcnow()
    task.error_count = errors
    task.success_rate = max(0.0, 100.0 - (errors * 5.0))
    db.commit()


async def run_pipeline():
    """
    Main pipeline. Runs fully async. Safe to call from FastAPI BackgroundTasks.
    """
    db = SessionLocal()
    total_saved = 0
    total_events = 0
    ingestion_errors = 0
    extraction_errors = 0

    try:
        print("[PIPELINE] Starting autonomous FMCG M&A pipeline...")

        # ── STAGE 1: News Ingestion via Tavily ────────────────────────────────
        _upsert_agent(db, "News Ingestion Agent", "Running", queue=len(TAVILY_QUERIES))
        raw_items = []

        if not TAVILY_API_KEY:
            print("[PIPELINE] ERROR: TAVILY_API_KEY not set!")
            _upsert_agent(db, "News Ingestion Agent", "Error", errors=1)
            return

        print(f"[PIPELINE] Querying Tavily with {len(TAVILY_QUERIES)} targeted searches...")

        async with httpx.AsyncClient(timeout=30) as client:
            for i, query in enumerate(TAVILY_QUERIES):
                try:
                    resp = await client.post(
                        "https://api.tavily.com/search",
                        json={
                            "api_key": TAVILY_API_KEY,
                            "query": query,
                            "max_results": 8,
                            "search_depth": "advanced",
                            "include_raw_content": True,  # Get FULL article text
                            "include_domains": TRUSTED_DOMAINS,
                        },
                    )
                    if resp.status_code == 200:
                        results = resp.json().get("results", [])
                        raw_items.extend(results)
                        print(f"[PIPELINE]   Query {i+1}/{len(TAVILY_QUERIES)}: '{query[:50]}' -> {len(results)} results")
                    else:
                        print(f"[PIPELINE]   Query {i+1} failed: HTTP {resp.status_code}")
                        ingestion_errors += 1
                except Exception as e:
                    print(f"[PIPELINE]   Query {i+1} error: {e}")
                    ingestion_errors += 1

        print(f"[PIPELINE] Total raw results: {len(raw_items)}")

        # Deduplicate by URL
        seen_urls = set()
        deduped = []
        for item in raw_items:
            url = item.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                deduped.append(item)

        print(f"[PIPELINE] After dedup: {len(deduped)} unique articles")
        _upsert_agent(db, "News Ingestion Agent", "Idle", queue=0, ms=3000, errors=ingestion_errors)

        # ── STAGE 2: Content Extraction & Save ────────────────────────────────
        _upsert_agent(db, "Event Extraction Agent", "Running", queue=len(deduped))
        new_articles = []

        for item in deduped:
            url = item.get("url", "")
            # Use raw_content (full text) if available, fall back to content snippet
            content = item.get("raw_content") or item.get("content") or ""
            title = item.get("title", "")

            if not content or len(content) < 80:
                continue

            # Skip if already in DB
            existing = db.query(Article).filter(Article.url == url).first()
            if existing:
                continue

            try:
                article = Article(
                    title=title,
                    url=url,
                    content=content[:8000],  # Cap to avoid DB bloat
                    source=item.get("published_date", "Tavily"),
                    published_date=datetime.utcnow(),
                    verification_status="Pending",
                    tags="FMCG,M&A",
                    country="",
                    confidence_score=item.get("score", 0.5),
                )
                db.add(article)
                db.commit()
                db.refresh(article)
                new_articles.append(article)
                total_saved += 1
                print(f"[PIPELINE]   Saved: {title[:70]}")
            except Exception as e:
                print(f"[PIPELINE]   Save error for {url[:60]}: {e}")
                db.rollback()

        print(f"[PIPELINE] Articles saved: {total_saved}")
        _upsert_agent(db, "Event Extraction Agent", "Idle", queue=0, ms=1500, errors=0)

        # ── STAGE 3: AI Deal Entity Extraction ────────────────────────────────
        _upsert_agent(db, "Financial Verification Agent", "Running", queue=len(new_articles))
        print(f"[PIPELINE] Running Gemini entity extraction on {len(new_articles)} articles...")

        for article in new_articles:
            try:
                # Feed title + content to Gemini
                text_for_extraction = f"Title: {article.title}\n\n{article.content}"
                entities = await extract_deal_entities(text_for_extraction)

                if entities:
                    # Always update the article with extracted category and country
                    article.verification_status = "Verified"
                    article.confidence_score = min(1.0, (article.confidence_score or 0.5) + 0.3)
                    article.country = entities.get("country", "")
                    deal_type = entities.get("deal_type", "Acquisition")
                    if deal_type == "Unknown" or not deal_type:
                        deal_type = "Acquisition"
                    article.tags = f"FMCG,M&A,{deal_type}"
                    db.commit()

                    acquirer = entities.get("acquirer")
                    target = entities.get("target")

                    if acquirer and target and acquirer.lower() not in ["unknown", "null", "none", "n/a"] \
                            and target.lower() not in ["unknown", "null", "none", "n/a"]:

                        # Check if event already exists for same deal
                        event_title = f"{acquirer} acquires {target}"
                        existing_event = db.query(Event).filter(Event.title == event_title).first()
                        if existing_event:
                            print(f"[PIPELINE]   Skip dup event: {event_title[:60]}")
                            if article not in existing_event.articles:
                                existing_event.articles.append(article)
                            
                            # Still update company stats even if it's a dup event
                            co = db.query(Company).filter(Company.name == acquirer).first()
                            if co:
                                co.total_deals = (co.total_deals or 0) + 1
                                if entities.get("deal_type") == "Acquisition":
                                    co.total_acquisitions = (co.total_acquisitions or 0) + 1
                                else:
                                    co.total_investments = (co.total_investments or 0) + 1
                            db.commit()
                            continue

                        event = Event(
                            title=event_title,
                            event_type=entities.get("deal_type", "Acquisition"),
                            confidence_score=article.confidence_score,
                            ai_summary=article.content[:500],
                            deal_value=str(entities.get("deal_value", "Undisclosed")),
                            industry=entities.get("industry", "FMCG"),
                            country=entities.get("country", ""),
                            status="Confirmed" if (article.confidence_score or 0) > 0.7 else "Rumored",
                            business_impact="",
                            ai_insight="",
                        )
                        event.articles.append(article)
                        db.add(event)
                        db.commit()
                        db.refresh(event)

                        deal = Deal(
                            event_id=event.id,
                            acquirer=acquirer,
                            target_company=target,
                            deal_value=_parse_deal_value(entities.get("deal_value", "")),
                            currency=entities.get("currency", "USD"),
                            deal_type=entities.get("deal_type", "Acquisition"),
                            country=entities.get("country", ""),
                            industry=entities.get("industry", "FMCG"),
                        )
                        db.add(deal)

                        # Upsert acquiring company
                        co = db.query(Company).filter(Company.name == acquirer).first()
                        if not co:
                            co = Company(
                                name=acquirer,
                                country=entities.get("country", ""),
                                industry=entities.get("industry", "FMCG"),
                                description=f"FMCG company involved in {entities.get('deal_type', 'acquisition')} deals.",
                                total_deals=1,
                                total_acquisitions=1 if entities.get("deal_type") == "Acquisition" else 0,
                                total_investments=1 if entities.get("deal_type") == "Investment" else 0,
                            )
                            db.add(co)
                        else:
                            co.total_deals = (co.total_deals or 0) + 1
                            if entities.get("deal_type") == "Acquisition":
                                co.total_acquisitions = (co.total_acquisitions or 0) + 1
                            else:
                                co.total_investments = (co.total_investments or 0) + 1

                        db.commit()
                    total_events += 1
                    print(f"[PIPELINE]   Deal: {acquirer} -> {target} ({entities.get('deal_value', '?')})")
                else:
                    # Relevant article but no specific deal (trend piece)
                    article.verification_status = "Verified"
                    db.commit()
                    print(f"[PIPELINE]   No specific deal in: {article.title[:60]}")

            except Exception as e:
                print(f"[PIPELINE]   Extraction error: {e}")
                extraction_errors += 1
                db.rollback()

        _upsert_agent(db, "Financial Verification Agent", "Idle", queue=0, ms=2000, errors=extraction_errors)

        # ── STAGE 4: Newsletter Writer (stub — generates on demand) ───────────
        _upsert_agent(db, "Newsletter Writer Agent", "Idle", queue=0, ms=0, errors=0)

        print(f"[PIPELINE] ============================================")
        print(f"[PIPELINE] Pipeline complete!")
        print(f"[PIPELINE]   Articles saved: {total_saved}")
        print(f"[PIPELINE]   Deals/Events created: {total_events}")
        print(f"[PIPELINE]   Errors: {ingestion_errors + extraction_errors}")
        print(f"[PIPELINE] ============================================")

    except Exception as e:
        print(f"[PIPELINE] FATAL: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()
