from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from core import db, now_iso, new_id, audit, admin_only
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
        out.append({**c, "uses": await db.coupon_redemptions.count_documents({"code": c["coupon_code"]})})
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
