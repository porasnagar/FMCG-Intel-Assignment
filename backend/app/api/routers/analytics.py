from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from app.core.database import get_db
from app.models.domain import Article, Event, Deal, Company

router = APIRouter()

@router.get("")
def get_analytics(db: Session = Depends(get_db)):
    total_deals = db.query(Deal).count()
    total_articles = db.query(Article).count()
    total_acquisitions = db.query(Event).filter(Event.event_type == "Acquisition").count()
    total_investments = db.query(Event).filter(Event.event_type == "Investment").count()

    # Calculate AREA_DATA (articles per day for last 7 days)
    area_data = []
    today = datetime.utcnow().date()
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        count = db.query(Article).filter(func.date(Article.created_at) == day).count()
        area_data.append({"date": day.strftime("%b %d"), "articles": count})
    
    # Calculate DEAL_MONTHLY_DATA (last 6 months)
    monthly_data = []
    for i in range(5, -1, -1):
        month_date = today.replace(day=1) - timedelta(days=30*i)
        m_str = month_date.strftime("%b")
        acq_count = db.query(Event).filter(
            Event.event_type == "Acquisition",
            func.extract('month', Event.created_at) == month_date.month
        ).count()
        inv_count = db.query(Event).filter(
            Event.event_type == "Investment",
            func.extract('month', Event.created_at) == month_date.month
        ).count()
        monthly_data.append({"month": m_str, "acquisitions": acq_count, "investments": inv_count})

    # Sector Data
    sector_counts = db.query(Event.industry, func.count(Event.id)).group_by(Event.industry).all()
    colors = ["#FF3B30", "#FF9F0A", "#FFD60A", "#34C759", "#0071E3", "#5E5CE6", "#FF2D55"]
    sector_data = []
    total_sectors = sum([c[1] for c in sector_counts])
    if total_sectors > 0:
        for i, (ind, count) in enumerate(sector_counts):
            if not ind: ind = "Other"
            sector_data.append({
                "name": ind, 
                "value": round((count/total_sectors)*100), 
                "color": colors[i % len(colors)]
            })
    
    # Country Data
    country_counts = db.query(Event.country, func.count(Event.id)).group_by(Event.country).all()
    country_data = []
    total_countries = sum([c[1] for c in country_counts])
    if total_countries > 0:
        for i, (c, count) in enumerate(country_counts):
            if not c: c = "Unknown"
            country_data.append({
                "country": c, 
                "deals": count, 
                "color": colors[i % len(colors)]
            })
    
    # Top active sector & country
    most_active_sector = "N/A"
    most_active_country = "N/A"
    if sector_counts:
        most_active_sector = max(sector_counts, key=lambda x: x[1])[0] or "N/A"
    if country_counts:
        most_active_country = max(country_counts, key=lambda x: x[1])[0] or "N/A"

    events_with_deals = db.query(Event).filter(Event.deal_value != "Undisclosed", Event.deal_value != None).all()
    
    total_funding = 0.0
    max_deal = 0.0
    valid_deals = 0
    import re
    for e in events_with_deals:
        val_str = str(e.deal_value).lower().replace(',', '')
        match = re.search(r'[\d\.]+', val_str)
        if match:
            val = float(match.group())
            if "bn" in val_str or "billion" in val_str or "b" in val_str:
                total_funding += val
                max_deal = max(max_deal, val)
                valid_deals += 1
            elif "m" in val_str or "million" in val_str:
                total_funding += val / 1000.0
                max_deal = max(max_deal, val / 1000.0)
                valid_deals += 1

    funding_volume_str = f"${total_funding:,.1f}B" if total_funding > 0 else "$0"
    largest_deal_str = f"${max_deal:,.1f}B" if max_deal > 0 else "$0"
    avg_deal_size_str = f"${(total_funding / valid_deals):,.1f}B" if valid_deals > 0 else "$0"

    return {
        "total_deals": total_deals,
        "total_articles": total_articles,
        "acquisitions_count": total_acquisitions,
        "investments_count": total_investments,
        "funding_volume": funding_volume_str,
        "avg_deal_size": avg_deal_size_str,
        "largest_deal": largest_deal_str,
        "most_active_sector": most_active_sector,
        "most_active_country": most_active_country,
        "chart_area": area_data,
        "chart_monthly": monthly_data,
        "chart_sector": sector_data,
        "chart_country": country_data
    }
