"""
AI Service — powers Gemini Flash Lite for:
  - Natural language search
  - Deal extraction
  - AI analyst Q&A
  - Newsletter generation

Also calls NVIDIA NIM (DeepSeek V4 Flash) as a fallback for deal analysis.
"""
import os
import httpx
import google.generativeai as genai
from sqlalchemy.orm import Session
from app.models.domain import Event, Article

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
NVIDIA_NIM_API_KEY = os.getenv("NVIDIA_NIM_API_KEY", "")
NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"

genai.configure(api_key=GEMINI_API_KEY)
_gemini_model = genai.GenerativeModel("gemini-3.1-flash-lite")  # Gemini 3.1 Flash Lite


async def ask_gemini(prompt: str) -> str:
    """Call Gemini Flash Lite and return the text response."""
    try:
        response = _gemini_model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"[Gemini Error] {str(e)}"


async def ask_nvidia_nim(prompt: str, model: str = "deepseek/deepseek-v4-flash") -> str:
    """Call NVIDIA NIM (free tier) for heavy reasoning tasks."""
    if not NVIDIA_NIM_API_KEY:
        return "[NVIDIA NIM key not configured]"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{NVIDIA_NIM_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {NVIDIA_NIM_API_KEY}"},
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 1024,
                },
                timeout=30.0,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return f"[NIM Error] {str(e)}"


async def natural_language_search(query: str) -> dict:
    """Use Gemini to interpret a natural language query about FMCG M&A."""
    prompt = f"""You are an FMCG market intelligence analyst.
A user has searched: "{query}"

Respond in JSON with:
{{
  "summary": "2-3 sentence AI summary of what matches this query",
  "intent": "acquisition | investment | trend | company | general",
  "filters": {{ "deal_type": "...", "country": "...", "min_value": "..." }}
}}
Only return valid JSON."""
    raw = await ask_gemini(prompt)
    try:
        import json
        # Strip markdown code fences if Gemini wraps it
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(clean)
    except Exception:
        return {"summary": raw, "intent": "general", "filters": {}}


async def extract_deal_entities(article_text: str) -> dict:
    """Extract structured deal info from article text using Gemini Flash Lite."""
    prompt = f"""You are an FMCG M&A deal extraction engine.
Extract deal information from the article title and text below.
Pay special attention to the title — it often contains the key deal info.

Return a single JSON object with these exact fields:
{{
  "acquirer": "company name doing the buying/investing (string or null)",
  "target": "company being acquired/invested in (string or null)",
  "deal_value": "deal amount as string e.g. '$45M' or '₹500Cr' or 'Undisclosed' (string or null)",
  "currency": "USD/INR/GBP/EUR or null",
  "deal_type": "Acquisition, Investment, Merger, or Divestiture (string)",
  "country": "primary country discussed in the article (string, e.g., 'India', 'United States', or 'Global')",
  "industry": "FMCG sub-sector e.g. Snacks, Dairy, Beverages, Beauty (string)",
  "announcement_date": "date if found (string or null)"
}}

Always return all fields, even if the article is a general trend report. If an exact deal isn't described, set acquirer and target to null, but STILL provide the country, industry, and general deal_type discussed.

Article:
{article_text[:4000]}

Return ONLY the JSON object, no markdown, no explanation."""
    raw = await ask_gemini(prompt)
    try:
        import json
        clean = raw.strip()
        # Strip markdown fences
        if clean.startswith("```"):
            clean = clean.split("```")[1]
            if clean.startswith("json"):
                clean = clean[4:]
        clean = clean.strip().rstrip("```").strip()
        result = json.loads(clean)
        # Handle case where Gemini returns a list instead of dict
        if isinstance(result, list):
            result = result[0] if result else {}
        if not isinstance(result, dict):
            return {}
        return result
    except Exception:
        return {}


async def classify_relevance(article_text: str) -> dict:
    """Decide if article is relevant to FMCG M&A using Gemini."""
    prompt = f"""You are an FMCG M&A news classifier. 
Is the following article relevant to FMCG mergers, acquisitions, or investments?
Respond with JSON: {{"relevant": true/false, "confidence": 0-100, "reason": "brief explanation"}}

Article (first 500 chars):
{article_text[:500]}

Only return valid JSON."""
    raw = await ask_gemini(prompt)
    try:
        import json
        clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(clean)
    except Exception:
        return {"relevant": False, "confidence": 0, "reason": "parse error"}


async def ask_about_event(event_id: int, question: str) -> str:
    """AI Analyst Mode: answer a question about a specific deal event using NVIDIA NIM."""
    # In production, load event from DB. Here we demonstrate the prompt structure.
    prompt = f"""You are an elite FMCG M&A analyst. A user is asking about event ID {event_id}.

Their question: "{question}"

Provide a concise, insightful, executive-level answer. Be specific, data-driven where possible.
If you don't have direct data about this event, provide your best analysis based on FMCG market patterns."""
    # Use NVIDIA NIM for deeper analyst reasoning
    try:
        if not NVIDIA_NIM_API_KEY:
            raise Exception("NIM key missing")
        result = await ask_nvidia_nim(prompt)
        if result.startswith("[NVIDIA NIM key not configured]") or result.startswith("[NIM Error]"):
            raise Exception(result)
        return result
    except Exception as e:
        print(f"[AI Fallback] NIM failed ({e}), falling back to Gemini.")
        return await ask_gemini(prompt)


async def generate_newsletter_content(db: Session) -> str:
    """Generate weekly FMCG newsletter markdown using Gemini."""
    recent_events = db.query(Event).order_by(Event.created_at.desc()).limit(10).all()
    events_text = "\n".join([
        f"- {e.title}: {e.ai_summary or 'No summary'} (Value: {e.deal_value}, Country: {e.country})"
        for e in recent_events
    ]) or "No recent events in database."

    prompt = f"""Generate a professional weekly FMCG M&A intelligence newsletter in Markdown format.

Recent Events:
{events_text}

Include these sections:
# FMCG Weekly Intel Digest
## Top Deals This Week
## Investment Highlights
## Emerging Trends
## AI Market Outlook

Keep it executive-ready, data-driven, and under 800 words."""
    return await ask_gemini(prompt)
