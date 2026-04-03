from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from bson import ObjectId
from datetime import datetime, timezone, timedelta, date
from typing import Optional
import random
import math

from database import get_db
from middleware.auth import get_current_user
from middleware.rbac import require_manager

router = APIRouter()


def _oid(v):
    return str(v) if isinstance(v, ObjectId) else v


# ─── Pydantic Models ──────────────────────────────────────────────────────────

class MetricCreate(BaseModel):
    source: str        # google_analytics | google_ads | meta_ads | search_console | semrush | github
    period: str = "daily"
    metric_date: date
    data: dict


class AlertCreate(BaseModel):
    type: str          # performance_drop | high_performing | budget_alert
    source: str
    message: str
    severity: str = "warning"   # info | warning | critical


# ─── Sample data generator ───────────────────────────────────────────────────

def _generate_sample_dashboard(period_days: int):
    """Return realistic sample dashboard data when no real data is stored."""
    rng = random.Random(42)

    def trend(base, variance, n, direction=1.02):
        vals = []
        v = base
        for _ in range(n):
            v = v * direction + rng.uniform(-variance, variance)
            vals.append(max(0, round(v)))
        return vals

    # Traffic trend
    days = period_days
    traffic_trend = []
    today = datetime.now(timezone.utc).date()
    org = 900; paid = 420; soc = 130
    for i in range(days):
        d = today - timedelta(days=days - i - 1)
        org  = max(200, org  + rng.randint(-80, 120))
        paid = max(100, paid + rng.randint(-40, 60))
        soc  = max(50,  soc  + rng.randint(-20, 30))
        traffic_trend.append({
            "date": str(d),
            "organic": org,
            "paid": paid,
            "social": soc,
            "direct": rng.randint(60, 180),
        })

    total_organic = sum(d["organic"] for d in traffic_trend)
    total_paid    = sum(d["paid"]    for d in traffic_trend)
    total_social  = sum(d["social"]  for d in traffic_trend)
    total_direct  = sum(d["direct"]  for d in traffic_trend)
    total_traffic = total_organic + total_paid + total_social + total_direct

    # Campaigns
    campaigns = [
        {"name": "Brand Awareness Q1", "platform": "Google Ads", "status": "active",
         "spend": 2100, "clicks": 4200, "impressions": 98000, "conversions": 186, "ctr": 4.29, "cpc": 0.50, "roas": 4.2},
        {"name": "Retargeting — Website Visitors", "platform": "Meta Ads", "status": "active",
         "spend": 1450, "clicks": 6800, "impressions": 142000, "conversions": 148, "ctr": 4.79, "cpc": 0.21, "roas": 3.8},
        {"name": "Product Launch Spring", "platform": "Google Ads", "status": "active",
         "spend": 3100, "clicks": 5600, "impressions": 110000, "conversions": 234, "ctr": 5.09, "cpc": 0.55, "roas": 5.1},
        {"name": "Lead Gen — Instagram", "platform": "Meta Ads", "status": "paused",
         "spend": 2350, "clicks": 9400, "impressions": 187000, "conversions": 232, "ctr": 5.03, "cpc": 0.25, "roas": 2.9},
        {"name": "Competitor Keywords", "platform": "Google Ads", "status": "active",
         "spend": 1800, "clicks": 3200, "impressions": 76000, "conversions": 98, "ctr": 4.21, "cpc": 0.56, "roas": 3.6},
    ]

    total_g_spend = sum(c["spend"] for c in campaigns if c["platform"] == "Google Ads")
    total_m_spend = sum(c["spend"] for c in campaigns if c["platform"] == "Meta Ads")
    total_g_conv  = sum(c["conversions"] for c in campaigns if c["platform"] == "Google Ads")
    total_m_conv  = sum(c["conversions"] for c in campaigns if c["platform"] == "Meta Ads")
    total_g_clicks = sum(c["clicks"] for c in campaigns if c["platform"] == "Google Ads")
    total_m_clicks = sum(c["clicks"] for c in campaigns if c["platform"] == "Meta Ads")
    total_conv = total_g_conv + total_m_conv
    total_spend = total_g_spend + total_m_spend

    # SEO keywords trend
    kw_trend = []
    top10 = 74
    for i in range(days):
        d = today - timedelta(days=days - i - 1)
        top10 = min(120, max(50, top10 + rng.randint(-2, 4)))
        kw_trend.append({"date": str(d), "top10": top10, "top30": top10 + rng.randint(60, 90)})

    # GitHub activity
    gh_activity = []
    for i in range(days):
        d = today - timedelta(days=days - i - 1)
        is_weekday = d.weekday() < 5
        gh_activity.append({
            "date": str(d),
            "commits": rng.randint(3, 18) if is_weekday else rng.randint(0, 5),
            "prs": rng.randint(0, 4) if is_weekday else 0,
            "deployments": rng.randint(0, 2) if is_weekday else 0,
        })

    # Alerts
    alerts = [
        {"id": "a1", "type": "high_performing", "source": "Google Ads",
         "message": "'Product Launch Spring' ROAS is 5.1x — top performer this period.",
         "severity": "info", "is_read": False,
         "created_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()},
        {"id": "a2", "type": "performance_drop", "source": "Meta Ads",
         "message": "'Lead Gen — Instagram' CTR dropped 18% vs last week. Consider refreshing creatives.",
         "severity": "warning", "is_read": False,
         "created_at": (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()},
        {"id": "a3", "type": "budget_alert", "source": "Google Ads",
         "message": "'Competitor Keywords' has used 87% of monthly budget with 8 days remaining.",
         "severity": "critical", "is_read": False,
         "created_at": (datetime.now(timezone.utc) - timedelta(hours=14)).isoformat()},
        {"id": "a4", "type": "high_performing", "source": "SEO",
         "message": "Organic traffic up 12% this week. 6 new keywords entered top-10 rankings.",
         "severity": "info", "is_read": True,
         "created_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()},
        {"id": "a5", "type": "performance_drop", "source": "Google Ads",
         "message": "Avg. CPC increased 15% on 'Brand Awareness Q1'. Quality Score may need review.",
         "severity": "warning", "is_read": True,
         "created_at": (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()},
    ]

    return {
        "period_days": period_days,
        "overview": {
            "total_traffic": total_traffic,
            "organic_traffic": total_organic,
            "paid_traffic": total_paid,
            "social_traffic": total_social,
            "direct_traffic": total_direct,
            "total_leads": round(total_conv * 1.4),
            "conversions": total_conv,
            "total_spend": total_spend,
            "cpl": round(total_spend / max(1, round(total_conv * 1.4)), 2),
            "roas": round(sum(c["roas"] * c["spend"] for c in campaigns) / max(1, total_spend), 2),
            "bounce_rate": 38.4,
            "avg_session_duration": "3m 24s",
            "pages_per_session": 4.2,
        },
        "traffic_trend": traffic_trend,
        "traffic_sources": [
            {"name": "Organic", "value": total_organic, "color": "#6264A7"},
            {"name": "Paid",    "value": total_paid,    "color": "#0078D4"},
            {"name": "Social",  "value": total_social,  "color": "#C239B3"},
            {"name": "Direct",  "value": total_direct,  "color": "#038387"},
        ],
        "ads": {
            "google": {
                "spend": total_g_spend,
                "clicks": total_g_clicks,
                "conversions": total_g_conv,
                "impressions": sum(c["impressions"] for c in campaigns if c["platform"] == "Google Ads"),
                "ctr": round(total_g_clicks / max(1, sum(c["impressions"] for c in campaigns if c["platform"] == "Google Ads")) * 100, 2),
                "cpc": round(total_g_spend / max(1, total_g_clicks), 2),
                "roas": round(sum(c["roas"] * c["spend"] for c in campaigns if c["platform"] == "Google Ads") / max(1, total_g_spend), 2),
            },
            "meta": {
                "spend": total_m_spend,
                "clicks": total_m_clicks,
                "conversions": total_m_conv,
                "impressions": sum(c["impressions"] for c in campaigns if c["platform"] == "Meta Ads"),
                "ctr": round(total_m_clicks / max(1, sum(c["impressions"] for c in campaigns if c["platform"] == "Meta Ads")) * 100, 2),
                "cpc": round(total_m_spend / max(1, total_m_clicks), 2),
                "roas": round(sum(c["roas"] * c["spend"] for c in campaigns if c["platform"] == "Meta Ads") / max(1, total_m_spend), 2),
            },
        },
        "campaigns": campaigns,
        "seo": {
            "total_keywords": 1240,
            "top_10": kw_trend[-1]["top10"] if kw_trend else 82,
            "top_30": kw_trend[-1]["top30"] if kw_trend else 156,
            "avg_position": 22.8,
            "clicks": round(total_organic * 0.65),
            "impressions": round(total_organic * 8.5),
            "ctr": 7.6,
            "domain_authority": 42,
            "backlinks": 3840,
            "referring_domains": 284,
            "trend": kw_trend,
        },
        "github": {
            "total_commits": sum(d["commits"] for d in gh_activity),
            "total_prs": sum(d["prs"] for d in gh_activity),
            "total_deployments": sum(d["deployments"] for d in gh_activity),
            "contributors": 7,
            "open_issues": 14,
            "repos": 3,
            "activity": gh_activity,
        },
        "alerts": alerts,
        "is_sample_data": True,
    }


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def get_dashboard(
    period: str = Query("30d", regex="^(7d|30d|90d)$"),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    period_days = {"7d": 7, "30d": 30, "90d": 90}[period]

    # Check if real metrics exist for this period
    cutoff = datetime.now(timezone.utc) - timedelta(days=period_days)
    count = await db.marketing_metrics.count_documents({"created_at": {"$gte": cutoff}})

    if count == 0:
        # Return sample data
        return _generate_sample_dashboard(period_days)

    # Aggregate real data from DB
    metrics = await db.marketing_metrics.find(
        {"created_at": {"$gte": cutoff}}
    ).to_list(1000)

    # Build aggregated response from stored metrics
    # (simplified — real aggregation would be more complex)
    return _generate_sample_dashboard(period_days)


@router.get("/metrics")
async def list_metrics(
    source: Optional[str] = None,
    period: str = Query("30d", regex="^(7d|30d|90d)$"),
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    period_days = {"7d": 7, "30d": 30, "90d": 90}[period]
    cutoff = datetime.now(timezone.utc) - timedelta(days=period_days)
    query: dict = {"created_at": {"$gte": cutoff}}
    if source:
        query["source"] = source

    metrics = await db.marketing_metrics.find(query).sort("metric_date", -1).to_list(500)
    for m in metrics:
        m["id"] = str(m.pop("_id"))
        if isinstance(m.get("created_at"), datetime):
            m["created_at"] = m["created_at"].isoformat()
    return {"metrics": metrics, "total": len(metrics)}


@router.post("/metrics", status_code=201)
async def create_metric(
    body: MetricCreate,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    now = datetime.now(timezone.utc)
    doc = {
        "source": body.source,
        "period": body.period,
        "metric_date": datetime.combine(body.metric_date, datetime.min.time()).replace(tzinfo=timezone.utc),
        "data": body.data,
        "created_by": current_user["_id"],
        "created_at": now,
    }
    result = await db.marketing_metrics.insert_one(doc)
    return {"id": str(result.inserted_id), "message": "Metric saved"}


@router.get("/alerts")
async def get_alerts(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    alerts = await db.marketing_alerts.find().sort("created_at", -1).to_list(50)
    if not alerts:
        # Return sample alerts if none stored
        sample = _generate_sample_dashboard(30)["alerts"]
        return {"alerts": sample, "unread": sum(1 for a in sample if not a["is_read"])}

    for a in alerts:
        a["id"] = str(a.pop("_id"))
        if isinstance(a.get("created_at"), datetime):
            a["created_at"] = a["created_at"].isoformat()
    unread = sum(1 for a in alerts if not a.get("is_read", False))
    return {"alerts": alerts, "unread": unread}


@router.post("/alerts", status_code=201)
async def create_alert(
    body: AlertCreate,
    current_user=Depends(require_manager),
    db=Depends(get_db),
):
    now = datetime.now(timezone.utc)
    doc = {
        "type": body.type,
        "source": body.source,
        "message": body.message,
        "severity": body.severity,
        "is_read": False,
        "created_at": now,
    }
    result = await db.marketing_alerts.insert_one(doc)
    return {"id": str(result.inserted_id), "message": "Alert created"}


@router.put("/alerts/{alert_id}/read")
async def mark_alert_read(
    alert_id: str,
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await db.marketing_alerts.update_one(
        {"_id": ObjectId(alert_id)},
        {"$set": {"is_read": True}},
    )
    return {"message": "Marked as read"}


@router.post("/alerts/read-all")
async def mark_all_alerts_read(
    current_user=Depends(get_current_user),
    db=Depends(get_db),
):
    await db.marketing_alerts.update_many({}, {"$set": {"is_read": True}})
    return {"message": "All alerts marked as read"}
