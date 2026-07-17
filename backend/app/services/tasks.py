"""
Agent Tasks — The 9-stage FMCG M&A Intelligence Pipeline
  1. Source Discovery (RSS + Tavily)
  2. Content Extraction (trafilatura)
  3. Semantic Deduplication (SentenceTransformers + pgvector)
  4. Relevance Classification (Gemini)
  5. Deal Extraction (Gemini)
  6. Credibility Verification
  7. Trend Analysis
  8. Newsletter Generation (Gemini)
"""
import os
import time
import asyncio
import feedparser
import httpx
import trafilatura
from datetime import datetime
from sqlalchemy.orm import Session
from celery import shared_task
from app.core.database import SessionLocal
from app.models.domain import Article, AgentTask


TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")

# ─── RSS Feeds (pre-seeded FMCG / Business sources) ──────────────────────────
RSS_FEEDS = [
    # Reuters Business
    "https://feeds.reuters.com/reuters/businessNews",
    # Economic Times FMCG/Companies
    "https://economictimes.indiatimes.com/industry/cons-products/fmcg/rssfeeds/13358575.cms",
    # Bloomberg Markets (via RSS bridge if needed)
    "https://feeds.bloomberg.com/markets/news.rss",
    # Financial Times Companies
    "https://www.ft.com/companies?format=rss",
    # Mint Markets
    "https://www.livemint.com/rss/markets",
    # YahooFinance FMCG
    "https://finance.yahoo.com/rss/topfinstories",
    # Business Standard
    "https://www.business-standard.com/rss/companies-101.rss",
    # Moneycontrol
    "https://www.moneycontrol.com/rss/businessnews.xml",
]


def _get_db() -> Session:
    return SessionLocal()


def _upsert_agent_log(db: Session, agent_name: str, status: str, queue: int = 0, processing_ms: int = 0, errors: int = 0):
    task = db.query(AgentTask).filter(AgentTask.agent_name == agent_name).first()
    if not task:
        task = AgentTask(agent_name=agent_name)
        db.add(task)
    task.status = status
    task.queue_size = queue
    task.processing_time_ms = processing_ms
    task.last_run = datetime.utcnow()
    task.error_count = errors
    db.commit()


# ─── AGENT 1: Source Discovery ────────────────────────────────────────────────
@shared_task(name="app.services.tasks.run_discovery_agent")
def run_discovery_agent():
    db = _get_db()
    start = time.time()
    discovered = 0
    errors = 0
    urls_to_process = []

    try:
        _upsert_agent_log(db, "Source Discovery", "Running")

        # 1a) RSS feeds
        for feed_url in RSS_FEEDS:
            try:
                parsed = feedparser.parse(feed_url)
                for entry in parsed.entries[:10]:
                    link = getattr(entry, "link", None)
                    if link:
                        urls_to_process.append({
                            "url": link,
                            "title": getattr(entry, "title", ""),
                            "published": getattr(entry, "published", ""),
                            "source": parsed.feed.get("title", feed_url),
                        })
                        discovered += 1
            except Exception:
                errors += 1

        # 1b) Tavily Search (FMCG M&A specific)
        if TAVILY_API_KEY:
            try:
                import httpx
                queries = [
                    "FMCG acquisition 2025",
                    "FMCG investment deal India 2025",
                    "food beverage merger 2025",
                ]
                for q in queries:
                    resp = httpx.post(
                        "https://api.tavily.com/search",
                        json={"api_key": TAVILY_API_KEY, "query": q, "max_results": 5},
                        timeout=15,
                    )
                    if resp.status_code == 200:
                        for item in resp.json().get("results", []):
                            urls_to_process.append({
                                "url": item["url"],
                                "title": item.get("title", ""),
                                "published": "",
                                "source": "Tavily",
                            })
                            discovered += 1
            except Exception:
                errors += 1

        # Queue extraction for each discovered URL
        for item in urls_to_process:
            run_extraction_agent.delay(item)

        ms = int((time.time() - start) * 1000)
        _upsert_agent_log(db, "Source Discovery", "Idle", queue=0, processing_ms=ms, errors=errors)
        return {"status": "success", "discovered": discovered, "errors": errors}

    except Exception as e:
        _upsert_agent_log(db, "Source Discovery", "Error", errors=1)
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


# ─── AGENT 2: Content Extraction ──────────────────────────────────────────────
@shared_task(name="app.services.tasks.run_extraction_agent")
def run_extraction_agent(item: dict):
    db = _get_db()
    start = time.time()
    try:
        _upsert_agent_log(db, "Content Extraction", "Running")
        url = item.get("url")

        # Skip if already exists
        existing = db.query(Article).filter(Article.url == url).first()
        if existing:
            return {"status": "skipped", "reason": "duplicate_url"}

        # Extract full text
        downloaded = trafilatura.fetch_url(url)
        text = trafilatura.extract(downloaded) if downloaded else None

        if not text or len(text) < 100:
            return {"status": "skipped", "reason": "no_content"}

        article = Article(
            title=item.get("title", ""),
            url=url,
            content=text,
            source=item.get("source", ""),
            published_date=datetime.utcnow(),
            verification_status="Pending",
            tags="",
            country="",
        )
        db.add(article)
        db.commit()
        db.refresh(article)

        # Queue deduplication
        run_deduplication_agent.delay(article.id)

        ms = int((time.time() - start) * 1000)
        _upsert_agent_log(db, "Content Extraction", "Idle", processing_ms=ms)
        return {"status": "success", "article_id": article.id}

    except Exception as e:
        _upsert_agent_log(db, "Content Extraction", "Error", errors=1)
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


# ─── AGENT 3: Semantic Deduplication ──────────────────────────────────────────
@shared_task(name="app.services.tasks.run_deduplication_agent")
def run_deduplication_agent(article_id: int):
    db = _get_db()
    try:
        _upsert_agent_log(db, "Semantic Deduplication", "Running")
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article or not article.content:
            return {"status": "skipped"}

        # Use Gemini embedding API instead of sentence-transformers (no PyTorch needed)
        import google.generativeai as genai
        import os
        genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
        result = genai.embed_content(
            model="models/text-embedding-004",
            content=article.content[:2000],
            task_type="SEMANTIC_SIMILARITY",
        )
        embedding = result["embedding"]  # list of floats
        article.embedding = embedding
        db.commit()

        # Pass to classification
        run_classification_agent.delay(article_id)
        _upsert_agent_log(db, "Semantic Deduplication", "Idle")
        return {"status": "success", "article_id": article_id}

    except Exception as e:
        _upsert_agent_log(db, "Semantic Deduplication", "Error", errors=1)
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


# ─── AGENT 4: Relevance Classification ────────────────────────────────────────
@shared_task(name="app.services.tasks.run_classification_agent")
def run_classification_agent(article_id: int):
    db = _get_db()
    try:
        _upsert_agent_log(db, "Relevance Classification", "Running")
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article:
            return {"status": "skipped"}

        from app.services.ai_service import classify_relevance
        result = asyncio.run(classify_relevance(article.content or ""))

        if result.get("relevant"):
            article.confidence_score = result.get("confidence", 0) / 100.0
            db.commit()
            run_deal_extraction_agent.delay(article_id)
        else:
            db.delete(article)
            db.commit()

        _upsert_agent_log(db, "Relevance Classification", "Idle")
        return {"status": "success", "relevant": result.get("relevant")}

    except Exception as e:
        _upsert_agent_log(db, "Relevance Classification", "Error", errors=1)
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


# ─── AGENT 5: Deal Extraction ──────────────────────────────────────────────────
@shared_task(name="app.services.tasks.run_deal_extraction_agent")
def run_deal_extraction_agent(article_id: int):
    db = _get_db()
    try:
        _upsert_agent_log(db, "Deal Extraction", "Running")
        article = db.query(Article).filter(Article.id == article_id).first()
        if not article:
            return {"status": "skipped"}

        from app.services.ai_service import extract_deal_entities
        from app.models.domain import Event, Deal

        entities = asyncio.run(extract_deal_entities(article.content or ""))

        if entities.get("acquirer") or entities.get("target"):
            event = Event(
                title=f"{entities.get('acquirer', 'Unknown')} — {entities.get('target', 'Unknown')}",
                event_type=entities.get("deal_type", "Investment"),
                confidence_score=article.confidence_score or 0.8,
                ai_summary=article.content[:300] if article.content else "",
                deal_value=f"{entities.get('deal_value', '')} {entities.get('currency', '')}",
                industry=entities.get("industry", ""),
                country=entities.get("country", article.country or ""),
                status="Pending",
            )
            event.articles.append(article)
            db.add(event)
            db.commit()
            db.refresh(event)

            deal = Deal(
                event_id=event.id,
                acquirer=entities.get("acquirer"),
                target_company=entities.get("target"),
                deal_type=entities.get("deal_type"),
                country=entities.get("country"),
                industry=entities.get("industry"),
            )
            db.add(deal)
            db.commit()

        _upsert_agent_log(db, "Deal Extraction", "Idle")
        return {"status": "success"}

    except Exception as e:
        _upsert_agent_log(db, "Deal Extraction", "Error", errors=1)
        return {"status": "error", "message": str(e)}
    finally:
        db.close()


# ─── AGENT 6-8: Stubs (credibility, trend, newsletter) ────────────────────────
@shared_task(name="app.services.tasks.run_credibility_agent")
def run_credibility_agent():
    _upsert_agent_log(SessionLocal(), "Credibility Verification", "Idle")
    return {"status": "stub"}

@shared_task(name="app.services.tasks.run_trend_agent")
def run_trend_agent():
    _upsert_agent_log(SessionLocal(), "Trend Analysis", "Idle")
    return {"status": "stub"}

@shared_task(name="app.services.tasks.run_newsletter_agent")
def run_newsletter_agent():
    _upsert_agent_log(SessionLocal(), "Newsletter Generation", "Idle")
    return {"status": "stub"}
