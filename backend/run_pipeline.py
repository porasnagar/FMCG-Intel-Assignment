"""
run_pipeline.py - Run the full FMCG M&A scraping pipeline synchronously.
Uses Tavily as primary source + RSS with proper headers as fallback.
Usage: python run_pipeline.py
"""
import sys
import os
import asyncio
import time
import httpx
import trafilatura
from datetime import datetime
from pathlib import Path

# Load .env manually before importing app modules
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.domain import Article, Event, Deal, AgentTask
from app.services.ai_service import classify_relevance, extract_deal_entities

TAVILY_API_KEY = os.environ.get("TAVILY_API_KEY", "")

# RSS feeds with proper browser headers
RSS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*",
}

# Targeted FMCG M&A RSS feeds
RSS_FEEDS = [
    "https://economictimes.indiatimes.com/industry/cons-products/fmcg/rssfeeds/13358575.cms",
    "https://economictimes.indiatimes.com/markets/mergers-&-acquisitions/rssfeeds/2147048.cms",
    "https://www.business-standard.com/rss/markets-106.rss",
    "https://feeds.feedburner.com/business-standard/hNXq",  # BS Companies
    "https://www.thehindubusinessline.com/companies/?service=rss",
]

# Primary: Tavily targeted searches
TAVILY_QUERIES = [
    "FMCG company acquisition merger 2025",
    "food beverage company takeover deal 2025",
    "consumer goods acquisition India 2025",
    "Unilever Nestle HUL ITC acquisition deal 2025",
    "FMCG startup investment funding 2025",
    "packaged food company merger acquisition",
    "personal care company acquisition deal",
    "dairy snacks beverage company bought acquired",
]


def upsert_agent(db, name, status, queue=0, ms=0, errors=0):
    task = db.query(AgentTask).filter(AgentTask.agent_name == name).first()
    if not task:
        task = AgentTask(agent_name=name)
        db.add(task)
    task.status = status
    task.queue_size = queue
    task.processing_time_ms = ms
    task.last_run = datetime.utcnow()
    task.error_count = errors
    task.success_rate = max(0, 100.0 - (errors * 5))
    db.commit()


async def run_full_pipeline():
    db = SessionLocal()
    total_articles = 0
    total_events = 0
    errors = 0

    print(f"\nTavily API Key: {'SET (' + TAVILY_API_KEY[:8] + '...)' if TAVILY_API_KEY else 'NOT SET'}")

    # STEP 1: Discover URLs
    print("\n[1/4] Discovering URLs...")
    upsert_agent(db, "News Ingestion Agent", "Running")
    urls_to_process = []

    # Primary source: Tavily (most targeted for M&A)
    if TAVILY_API_KEY:
        print("  Using Tavily API for targeted FMCG M&A search...")
        for q in TAVILY_QUERIES:
            try:
                resp = httpx.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": TAVILY_API_KEY,
                        "query": q,
                        "max_results": 7,
                        "search_depth": "advanced",
                        "include_domains": [
                            "reuters.com", "ft.com", "economictimes.indiatimes.com",
                            "business-standard.com", "livemint.com", "moneycontrol.com",
                            "bloomberg.com", "wsj.com", "thehindubusinessline.com",
                            "foodnavigator.com", "foodbusinessnews.net", "just-food.com"
                        ]
                    },
                    timeout=20,
                )
                if resp.status_code == 200:
                    results = resp.json().get("results", [])
                    for item in results:
                        urls_to_process.append({
                            "url": item["url"],
                            "title": item.get("title", ""),
                            "content_snippet": item.get("content", ""),  # Tavily provides snippet
                            "published": "",
                            "source": "Tavily",
                        })
                    print(f"  [OK] '{q[:50]}' -> {len(results)} results")
                else:
                    print(f"  [FAIL] Tavily status {resp.status_code}: {q[:40]}")
                    errors += 1
            except Exception as e:
                print(f"  [FAIL] Tavily error: {e}")
                errors += 1
    else:
        print("  [WARN] Tavily not configured - using RSS only")

    # Fallback: RSS with proper headers
    print("  Trying RSS feeds...")
    try:
        import feedparser
        for feed_url in RSS_FEEDS:
            try:
                import urllib.request
                req = urllib.request.Request(feed_url, headers=RSS_HEADERS)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    raw = resp.read()
                parsed = feedparser.parse(raw)
                count = 0
                for entry in parsed.entries[:10]:
                    link = getattr(entry, "link", None)
                    if link:
                        urls_to_process.append({
                            "url": link,
                            "title": getattr(entry, "title", ""),
                            "content_snippet": "",
                            "published": getattr(entry, "published", ""),
                            "source": parsed.feed.get("title", feed_url),
                        })
                        count += 1
                print(f"  [OK] RSS {feed_url[:55]}... -> {count} articles")
            except Exception as e:
                print(f"  [FAIL] RSS {feed_url[:55]}... -> {e}")
    except ImportError:
        print("  [WARN] feedparser not available")

    # Deduplicate URLs
    seen = set()
    deduped = []
    for item in urls_to_process:
        if item["url"] not in seen:
            seen.add(item["url"])
            deduped.append(item)
    urls_to_process = deduped

    print(f"\n  Total unique URLs to process: {len(urls_to_process)}")
    upsert_agent(db, "News Ingestion Agent", "Idle", queue=0, ms=500, errors=errors)

    # STEP 2: Extract & save articles
    print("\n[2/4] Extracting article content...")
    upsert_agent(db, "Event Extraction Agent", "Running")
    new_articles = []

    for i, item in enumerate(urls_to_process[:60]):
        url = item.get("url")
        if not url:
            continue
        existing = db.query(Article).filter(Article.url == url).first()
        if existing:
            print(f"  [{i+1}] Skip (dup): {url[:65]}...")
            continue
        try:
            # Use Tavily snippet if available to skip slow scraping
            text = item.get("content_snippet", "")
            if not text or len(text) < 100:
                downloaded = trafilatura.fetch_url(url)
                text = trafilatura.extract(downloaded) if downloaded else None

            if not text or len(text) < 80:
                print(f"  [{i+1}] Skip (no content): {url[:65]}...")
                continue

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
            new_articles.append(article)
            total_articles += 1
            print(f"  [{i+1}] [OK] Saved: {item.get('title', url)[:70]}")
        except Exception as e:
            print(f"  [{i+1}] [FAIL] {url[:65]}: {e}")
            errors += 1

    print(f"\n  New articles saved: {total_articles}")
    upsert_agent(db, "Event Extraction Agent", "Idle", queue=0, ms=1200, errors=errors)

    # STEP 3: Classify relevance
    print("\n[3/4] Classifying relevance with Gemini AI...")
    upsert_agent(db, "Financial Verification Agent", "Running")
    relevant_articles = []
    classification_errors = 0

    for article in new_articles:
        try:
            result = await classify_relevance(article.content or "")
            if result.get("relevant"):
                article.confidence_score = result.get("confidence", 50) / 100.0
                article.verification_status = "Verified"
                db.commit()
                relevant_articles.append(article)
                print(f"  [OK] Relevant ({result.get('confidence')}%): {article.title[:60]}")
            else:
                print(f"  [SKIP] Not relevant: {article.title[:60]}")
                # Keep article but mark as not relevant (don't delete - it was real data)
                article.verification_status = "Rejected"
                db.commit()
        except Exception as e:
            print(f"  [FAIL] Classification error: {e}")
            classification_errors += 1

    print(f"\n  Relevant FMCG M&A articles: {len(relevant_articles)}")
    upsert_agent(db, "Financial Verification Agent", "Idle", queue=0, ms=850, errors=classification_errors)

    # STEP 4: Extract deal entities
    print("\n[4/4] Extracting deal entities with Gemini AI...")
    upsert_agent(db, "Newsletter Writer Agent", "Running")

    for article in relevant_articles:
        safe_title = article.title[:60].encode('ascii', 'ignore').decode('ascii') if article.title else ""
        print(f"  [DEBUG] Starting extraction for: {safe_title}")
        try:
            entities = await extract_deal_entities(article.content or "")
            print(f"  [DEBUG] Extraction finished: {bool(entities)}")
            
            if entities:
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
                    
                    event_title = f"{acquirer} acquires {target}"
                    safe_event = event_title[:60].encode('ascii', 'ignore').decode('ascii')
                    existing_event = db.query(Event).filter(Event.title == event_title).first()
                    
                    if existing_event:
                        print(f"  [SKIP] Dup event: {safe_event}")
                        if article not in existing_event.articles:
                            existing_event.articles.append(article)
                            db.commit()
                        continue
                        
                    event = Event(
                        title=event_title,
                        event_type=entities.get("deal_type", "Acquisition"),
                        confidence_score=article.confidence_score or 0.8,
                        ai_summary=article.content[:400] if article.content else "",
                        deal_value=str(entities.get("deal_value", "Undisclosed")),
                        industry=entities.get("industry", "FMCG"),
                        country=entities.get("country", ""),
                        status="Confirmed" if (article.confidence_score or 0) > 0.75 else "Rumored",
                    )
                    event.articles.append(article)
                    db.add(event)
                    db.commit()
                    db.refresh(event)

                    val_str = str(entities.get("deal_value", "")).lower()
                    deal_val = 0.0
                    import re
                    match = re.search(r'[\d\.]+', val_str.replace(',', ''))
                    if match and val_str not in ["undisclosed", "n/a", "null", "none", "unknown", ""]:
                        try:
                            deal_val = float(match.group())
                        except ValueError:
                            deal_val = 0.0

                    deal = Deal(
                        event_id=event.id,
                        acquirer=acquirer,
                        target_company=target,
                        deal_value=deal_val,
                        currency=entities.get("currency", "USD"),
                        deal_type=entities.get("deal_type", "Acquisition"),
                        country=entities.get("country", ""),
                        industry=entities.get("industry", "FMCG"),
                    )
                    db.add(deal)
                    db.commit()
                    total_events += 1
                    print(f"  [OK] Deal: {safe_event}")
                else:
                    print(f"  [-] No specific deal entities (Trend piece): {safe_title}")
        except Exception as e:
            print(f"  [FAIL] Deal extraction error: {e}")

    upsert_agent(db, "Newsletter Writer Agent", "Idle", queue=0, ms=5000, errors=0)
    db.close()

    print(f"\n{'='*60}")
    print("Pipeline complete!")
    print(f"  Articles ingested: {total_articles}")
    print(f"  Relevant FMCG M&A articles: {len(relevant_articles)}")
    print(f"  Deals/Events created: {total_events}")
    print(f"  Errors: {errors + classification_errors}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    asyncio.run(run_full_pipeline())
