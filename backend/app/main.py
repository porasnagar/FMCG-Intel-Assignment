from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
import os
from app.core.config import settings
from app.core.database import engine
from app.models.domain import Base
from app.api.routers import dashboard, events, news, deals, analytics, companies, newsletters, agents, ai, pipeline

app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0")

# Allow frontend origin — set ALLOWED_ORIGINS in env for production
# e.g. ALLOWED_ORIGINS=https://benori.pages.dev,https://benori.com
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
allowed_origins = [o.strip() for o in _raw_origins.split(",")] if _raw_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            conn.commit()
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        print(f"[WARNING] DB startup failed (will retry on first request): {e}")

# Mount all routers
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(news.router,      prefix="/api/news",      tags=["News"])
app.include_router(events.router,    prefix="/api/events",    tags=["Events"])
app.include_router(deals.router,     prefix="/api/deals",     tags=["Deals"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])
app.include_router(companies.router, prefix="/api/companies", tags=["Companies"])
app.include_router(newsletters.router, prefix="/api/newsletters", tags=["Newsletters"])
app.include_router(agents.router,    prefix="/api/agents",    tags=["Agents"])
app.include_router(ai.router,        prefix="/api/ai",        tags=["AI"])
app.include_router(pipeline.router,  prefix="/api/pipeline",  tags=["Pipeline"])

@app.get("/api/health")
def health_check():
    return {"status": "ok", "service": settings.PROJECT_NAME}

@app.get("/")
def root():
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/docs")
