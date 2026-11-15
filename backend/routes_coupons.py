from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from routes_academy import parse_dt
from core import db, get_current_user, now_iso, audit, admin_only

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}


class CouponIn(BaseModel):
    code: str = Field(min_length=3, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    kind: str = Field(pattern="^(percent|flat)$")
    value: int = Field(ge=1, le=200000)
    course_id: str = Field(default="", max_length=60)
    expires_at: Optional[str] = None
    active: bool = True


def expired(c):
    return bool(c.get("expires_at")) and datetime.fromisoformat(c["expires_at"].replace("Z", "+00:00")) < datetime.now(timezone.utc)


async def clean(body: CouponIn, new=True):
    if body.kind == "percent" and body.value > 99:
        raise HTTPException(422, "Percent off must be between 1 and 99")
    if body.expires_at:
        try:
            datetime.fromisoformat(body.expires_at.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(422, "Invalid expiry date")
    if new and body.course_id and not await db.academy_courses.find_one({"id": body.course_id}, {"_id": 1}):
        raise HTTPException(422, "Course not found")
    return {**body.model_dump(), "code": body.code.upper()}


async def with_uses(cs):
    for c in cs:
        c["uses"] = await db.coupon_redemptions.count_documents({"code": c["code"]})
    return cs


@router.get("/admin/coupons")
async def list_coupons(user=Depends(admin_only)):
    return await with_uses(await db.academy_coupons.find({}, NO_ID).sort("created_at", -1).to_list(500))


@router.post("/admin/coupons")
async def create_coupon(body: CouponIn, user=Depends(admin_only)):
    c = await clean(body)
    if await db.academy_coupons.find_one({"code": c["code"]}):
        raise HTTPException(409, "A coupon with this code already exists")
    c["created_at"] = now_iso()
    await db.academy_coupons.insert_one(dict(c))
    await audit(user, "coupon create", c["code"])
    return c


@router.put("/admin/coupons/{code}")
async def update_coupon(code: str, body: CouponIn, user=Depends(admin_only)):
    c = await clean(body, new=False)
    if c["code"] != code.upper():
        raise HTTPException(422, "Coupon code can't be changed")
    r = await db.academy_coupons.update_one({"code": c["code"]}, {"$set": c})
    if not r.matched_count:
        raise HTTPException(404, "Coupon not found")
    return c


@router.delete("/admin/coupons/{code}")
async def delete_coupon(code: str, user=Depends(admin_only)):
    if not (await db.academy_coupons.delete_one({"code": code.upper()})).deleted_count:
        raise HTTPException(404, "Coupon not found")
    await audit(user, "coupon delete", code.upper())
    return {"ok": True}


async def apply_coupon(plan_key, plan, code, user):
    if not code:
        return plan
    if not plan_key.startswith(("course:", "bundle:")):
        raise HTTPException(400, "Coupons only work on courses and bundles")
    c = await db.academy_coupons.find_one({"code": code.strip().upper(), "active": True}, NO_ID)
    target = plan_key[7:] if plan_key.startswith("course:") else None
    if not c or c.get("course_id") not in ("", target):
        raise HTTPException(400, "This coupon isn't valid for this " + ("course" if target else "bundle"))
    if c.get("starts_at") and parse_dt(c["starts_at"]) > datetime.now(timezone.utc):
        raise HTTPException(400, "This coupon isn't active yet")
    if expired(c):
        raise HTTPException(400, "This coupon has expired")
    if await db.coupon_redemptions.find_one({"code": c["code"], "user_id": user["id"]}):
        raise HTTPException(400, "You've already used this coupon")
    if await db.payments.find_one({"user_id": user["id"], "coupon": c["code"], "plan": {"$ne": plan_key}, "status": {"$in": ["created", "paid"]}}):
        raise HTTPException(400, "You've already used this coupon on another course")
    price = plan["amount"]
    off = round(price * c["value"] / 100) if c["kind"] == "percent" else c["value"]
    return {**plan, "amount": max(1, price - off), "original": price, "coupon": c["code"]}


class CheckIn(BaseModel):
    code: str = Field(min_length=1, max_length=30)
    course_id: Optional[str] = None
    plan: Optional[str] = Field(default=None, pattern=r"^(course|bundle):[\w-]+$")
    gift: bool = False


@router.post("/academy/coupons/check")
async def check_coupon(body: CheckIn, user=Depends(get_current_user)):
    from routes_manage import item_for
    key = body.plan or f"course:{body.course_id}"
    plan = await apply_coupon(key, await item_for(key, None if body.gift else user), body.code, user)
    return {"code": plan["coupon"], "original": plan["original"], "amount": plan["amount"], "off": plan["original"] - plan["amount"]}


async def redeem(p):
    if p.get("coupon"):
        await db.coupon_redemptions.update_one({"code": p["coupon"], "user_id": p["user_id"]},
                                               {"$setOnInsert": {"code": p["coupon"], "user_id": p["user_id"], "payment_id": p["id"], "at": now_iso()}}, upsert=True)
