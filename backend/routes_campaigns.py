import asyncio
import hashlib
import hmac
import os
from datetime import datetime, timezone, timedelta
from html import escape
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from core import db, now_iso, new_id, audit, admin_only, send_email, email_template, logger
from routes_academy import parse_dt

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}
THEMES = ("diwali", "newyear", "christmas", "holi", "festive")


class CampaignIn(BaseModel):
    name: str = Field(min_length=3, max_length=80)
    theme: str = Field(pattern="^(" + "|".join(THEMES) + ")$")
    headline: str = Field(min_length=3, max_length=120)
    subtext: str = Field(default="", max_length=300)
    coupon_code: str = Field(min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    coupon_kind: str = Field(pattern="^(percent|flat)$")
    coupon_value: int = Field(ge=1, le=200000)
    starts_at: str
    ends_at: str
    active: bool = True
    email_blast: bool = True


async def check(body: CampaignIn, cid=None):
    d = body.model_dump()
    d["coupon_code"] = d["coupon_code"].upper()
    try:
        s, e = parse_dt(d["starts_at"]), parse_dt(d["ends_at"])
    except (ValueError, AttributeError):
        raise HTTPException(422, "Invalid campaign dates")
    if e <= s:
        raise HTTPException(422, "The campaign must end after it starts")
    if d["coupon_kind"] == "percent" and d["coupon_value"] > 99:
        raise HTTPException(422, "Percent off must be between 1 and 99")
    other = await db.academy_coupons.find_one({"code": d["coupon_code"]}, NO_ID)
    orphan = other and other.get("campaign_id") and not await db.campaigns.find_one({"id": other["campaign_id"]})
    if other and other.get("campaign_id") != cid and not orphan:
        raise HTTPException(409, "That coupon code is already used by another coupon")
    return d


async def sync_coupon(c):
    await db.academy_coupons.update_one({"code": c["coupon_code"]}, {"$set": {
        "code": c["coupon_code"], "kind": c["coupon_kind"], "value": c["coupon_value"], "course_id": "", "starts_at": c["starts_at"],
        "expires_at": c["ends_at"], "active": c["active"], "campaign_id": c["id"]}, "$setOnInsert": {"created_at": now_iso()}}, upsert=True)
    await db.academy_coupons.update_many({"campaign_id": c["id"], "code": {"$ne": c["coupon_code"]}}, {"$set": {"active": False}})


@router.get("/admin/campaigns")
async def list_campaigns(user=Depends(admin_only)):
    out = []
    for c in await db.campaigns.find({}, NO_ID).sort("starts_at", -1).to_list(200):
        out.append({**c, "uses": await db.coupon_redemptions.count_documents({"code": c["coupon_code"]}),
                    "emailed": await db.campaign_emails.count_documents({"campaign_id": c["id"], "ok": True})})
    return out


@router.post("/admin/campaigns")
async def create_campaign(body: CampaignIn, user=Depends(admin_only)):
    cid = new_id()
    c = {**await check(body, cid), "id": cid, "created_at": now_iso()}
    await db.campaigns.insert_one(dict(c))
    await sync_coupon(c)
    await audit(user, "campaign create", c["name"])
    c.pop("_id", None)
    return c


@router.put("/admin/campaigns/{cid}")
async def update_campaign(cid: str, body: CampaignIn, user=Depends(admin_only)):
    if not await db.campaigns.find_one({"id": cid}):
        raise HTTPException(404, "Campaign not found")
    c = {**await check(body, cid), "id": cid}
    await db.campaigns.update_one({"id": cid}, {"$set": c})
    await sync_coupon(c)
    await audit(user, "campaign update", c["name"])
    return c


@router.delete("/admin/campaigns/{cid}")
async def delete_campaign(cid: str, user=Depends(admin_only)):
    if not (await db.campaigns.delete_one({"id": cid})).deleted_count:
        raise HTTPException(404, "Campaign not found")
    await db.academy_coupons.update_many({"campaign_id": cid}, {"$set": {"active": False}})
    await audit(user, "campaign delete", cid)
    return {"ok": True}


@router.get("/public/campaign")
async def current_campaign():
    now = datetime.now(timezone.utc)
    for c in await db.campaigns.find({"active": True}, NO_ID).sort("starts_at", -1).to_list(50):
        if parse_dt(c["starts_at"]) <= now < parse_dt(c["ends_at"]):
            return {k: c[k] for k in ("id", "name", "theme", "headline", "subtext", "coupon_code", "coupon_kind", "coupon_value", "starts_at", "ends_at")}
    return None


# ---------- festival email blast ----------
EMAIL_THEME = {"diwali": ("#3b0a0a", "#FBBF24", "#FDE68A", "🪔 Happy Diwali"), "newyear": ("#0b1033", "#7DD3FC", "#E0F2FE", "🎆 Happy New Year"),
               "christmas": ("#052e16", "#FCA5A5", "#DCFCE7", "🎄 Merry Christmas"), "holi": ("#2a0a2e", "#F472B6", "#FDE68A", "🎨 Happy Holi"),
               "festive": ("#070d1a", "#22D3EE", "#E2E8F0", "✨ Festive offer")}


def promo_token(uid):
    return hmac.new(os.environ["JWT_SECRET"].encode(), f"promo-unsub:{uid}".encode(), hashlib.sha256).hexdigest()[:32]


def off_text(c):
    return f"{c['coupon_value']}% off" if c["coupon_kind"] == "percent" else f"₹{c['coupon_value']:,} off"


def banner_html(c):
    bg, accent, text, greet = EMAIL_THEME.get(c["theme"], EMAIL_THEME["festive"])
    ends = datetime.fromisoformat(c["ends_at"].replace("Z", "+00:00")).strftime("%d %b %Y, %H:%M UTC")
    return (f"<table role='presentation' width='100%' style='background:{bg};border:2px solid {accent};margin:8px 0 18px'><tr><td style='padding:22px;text-align:center;font-family:Arial,sans-serif'>"
            f"<div style='color:{accent};font-size:12px;letter-spacing:3px;text-transform:uppercase;font-family:monospace'>{escape(greet)} · {escape(c['name'])}</div>"
            f"<div style='color:#FFFFFF;font-size:24px;font-weight:bold;margin:10px 0 6px'>{escape(c['headline'])}</div>"
            f"<div style='color:{text};font-size:14px;margin-bottom:16px'>{escape(c.get('subtext') or '')}</div>"
            f"<div style='display:inline-block;border:2px dashed {accent};padding:10px 18px;background:#00000055'><span style='color:{text};font-size:11px;text-transform:uppercase;font-family:monospace'>{escape(off_text(c))} · use code</span><br>"
            f"<span style='color:{accent};font-size:26px;font-weight:bold;font-family:monospace;letter-spacing:2px'>{escape(c['coupon_code'])}</span></div>"
            f"<div style='color:{text};font-size:12px;margin-top:14px;font-family:monospace'>Offer ends {ends}</div></td></tr></table>")


async def blast(c):
    base = os.environ["FRONTEND_URL"].rstrip("/")
    sent = 0
    async for u in db.users.find({"role": "student", "status": "active", "promo_emails": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "email": 1}):
        try:
            await db.campaign_emails.insert_one({"campaign_id": c["id"], "user_id": u["id"], "at": now_iso()})
        except Exception:
            continue
        html = email_template(u["name"], [f"Our {c['name']} is live! Use code {c['coupon_code']} for {off_text(c)} on any course or bundle — and it works on gifts too.",
                                          "Gift a hands-on SOC course to a friend, or treat yourself. The offer ends soon."],
                              f"{base}/courses", "Browse courses & gifts", unsubscribe=f"{base}/api/public/unsubscribe/promos?u={u['id']}&t={promo_token(u['id'])}", banner=banner_html(c))
        ok = bool(await send_email(to=u["email"], subject=f"{EMAIL_THEME.get(c['theme'], EMAIL_THEME['festive'])[3]}: {c['headline']} — {off_text(c)}", html=html))
        await db.campaign_emails.update_one({"campaign_id": c["id"], "user_id": u["id"]}, {"$set": {"ok": ok}})
        sent += ok
        await asyncio.sleep(0.6)
    await db.campaigns.update_one({"id": c["id"]}, {"$set": {"blast_done_at": now_iso()}})
    logger.info(f"Festival blast {c['name']}: {sent} emails sent")


async def send_campaign_blasts():
    now = datetime.now(timezone.utc)
    stale = (now - timedelta(minutes=30)).isoformat()
    for c in await db.campaigns.find({"active": True, "email_blast": {"$ne": False}, "blast_done_at": None}, NO_ID).to_list(50):
        if not parse_dt(c["starts_at"]) <= now < parse_dt(c["ends_at"]):
            continue
        claim = {"id": c["id"], "blast_done_at": None, "$or": [{"blast_started_at": None}, {"blast_started_at": {"$lt": stale}}]}
        if (await db.campaigns.update_one(claim, {"$set": {"blast_started_at": now_iso()}})).modified_count:
            await blast(c)


@router.get("/public/unsubscribe/promos", response_class=HTMLResponse)
async def unsubscribe_promos(u: str = "", t: str = ""):
    ok = bool(u and t) and hmac.compare_digest(t, promo_token(u))
    if ok:
        await db.users.update_one({"id": u}, {"$set": {"promo_emails": False}})
    msg = "You're unsubscribed from festival and offer emails." if ok else "This unsubscribe link is invalid or has expired."
    return HTMLResponse(f"<html><body style='background:#0B0F1A;color:#E2E8F0;font-family:monospace;padding:60px'><h2 style='color:#00F0FF'>SOCProfessionals Academy</h2><p>{msg}</p>"
                        f"<a style='color:#00FF66' href='{os.environ['FRONTEND_URL']}/courses'>Browse courses</a></body></html>", status_code=200 if ok else 400)
