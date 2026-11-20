import os
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from core import db, get_current_user, now_iso, new_id, audit, admin_only, send_email, email_template, logger
from routes_academy import pricing, owns, card, maybe_user, parse_dt

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}


class BundleIn(BaseModel):
    title: str = Field(min_length=3, max_length=140)
    subtitle: str = Field(default="", max_length=240)
    description: str = Field(default="", max_length=4000)
    cover: str = Field(default="", max_length=1000)
    course_ids: list[str] = Field(default_factory=list, max_length=20)
    test_ids: list[str] = Field(default_factory=list, max_length=20)
    price: int = Field(ge=1, le=500000)
    sale_price: Optional[int] = Field(default=None, ge=1, le=500000)
    sale_ends_at: Optional[str] = None
    active: bool = True


async def bundle_courses(b):
    cs = await db.academy_courses.find({"id": {"$in": b["course_ids"]}, "status": "published"}, NO_ID).to_list(50)
    cs = [{**c, "kind": "course"} for c in sorted(cs, key=lambda c: b["course_ids"].index(c["id"]))]
    tids = b.get("test_ids") or []
    ts = await db.exams.find({"id": {"$in": tids}, "status": "published"}, NO_ID).to_list(50)
    return cs + [{**t, "kind": "test"} for t in sorted(ts, key=lambda t: tids.index(t["id"]))]


async def owns_item(user, c):
    if c.get("kind") == "test":
        from routes_exams import owns as owns_test
        return await owns_test(user, c)
    return await owns(user, c)


def item_key(c):
    return f"test:{c['id']}" if c.get("kind") == "test" else c["id"]


def bundle_pricing(b, cs):
    value = sum(pricing(c)["price"] for c in cs)
    ends = b.get("sale_ends_at")
    on_sale = bool(b.get("sale_price")) and b["sale_price"] < b["price"] and (not ends or parse_dt(ends) > datetime.now(timezone.utc))
    cur = b["sale_price"] if on_sale else b["price"]
    return {"price": cur, "regular": b["price"] if on_sale else None, "value": value, "off": round(100 * (value - cur) / value) if value > cur else 0,
            "sale_ends_at": ends if on_sale and ends else None}


async def personal(b, cs, user):
    bp = bundle_pricing(b, cs)
    owned = [c["id"] for c in cs if await owns_item(user, c)] if user else []
    left = sum(pricing(c)["price"] for c in cs if c["id"] not in owned)
    amount = 0 if not left else bp["price"] if not owned or not bp["value"] else max(1, round(bp["price"] * left / bp["value"]))
    return {**bp, "owned_courses": owned, "your_price": amount, "your_value": left, "your_off": round(100 * (left - amount) / left) if left > amount else 0}


async def find_bundle(bid, active=True):
    b = await db.academy_bundles.find_one({"id": bid, **({"active": True} if active else {})}, NO_ID)
    if not b:
        raise HTTPException(404, "Bundle not found")
    return b


async def bundle_item(key, user):
    b = await find_bundle(key[7:])
    cs = await bundle_courses(b)
    if len(cs) < 2:
        raise HTTPException(400, "This bundle isn't available right now")
    p = await personal(b, cs, user)
    if not p["your_price"]:
        raise HTTPException(400, "You already own everything in this bundle")
    return {"name": f"Bundle: {b['title']}"[:100], "amount": p["your_price"], "return": f"/bundle/{b['id']}", "courses": [item_key(c) for c in cs if c["id"] not in p["owned_courses"]]}


async def check_bundle(body: BundleIn):
    d = body.model_dump()
    d["course_ids"] = list(dict.fromkeys(d["course_ids"]))
    d["test_ids"] = list(dict.fromkeys(d["test_ids"]))
    if len(d["course_ids"]) + len(d["test_ids"]) < 2:
        raise HTTPException(422, "Pick at least two courses or tests")
    if await db.academy_courses.count_documents({"id": {"$in": d["course_ids"]}, "status": "published"}) != len(d["course_ids"]):
        raise HTTPException(422, "Every course in a bundle must exist and be published")
    if await db.exams.count_documents({"id": {"$in": d["test_ids"]}, "status": "published"}) != len(d["test_ids"]):
        raise HTTPException(422, "Every test in a bundle must exist and be published")
    if d["sale_price"] and d["sale_price"] >= d["price"]:
        raise HTTPException(422, "Sale price must be lower than the bundle price")
    if d["sale_ends_at"]:
        try:
            parse_dt(d["sale_ends_at"])
        except ValueError:
            raise HTTPException(422, "Invalid sale end date")
    return d


@router.get("/admin/bundles")
async def list_bundles(user=Depends(admin_only)):
    out = []
    for b in await db.academy_bundles.find({}, NO_ID).sort("created_at", -1).to_list(200):
        out.append({**b, "pricing": bundle_pricing(b, await bundle_courses(b)), "buyers": await db.purchases.count_documents({"product_id": f"bundle:{b['id']}"})})
    return out


@router.post("/admin/bundles")
async def create_bundle(body: BundleIn, user=Depends(admin_only)):
    b = {**await check_bundle(body), "id": new_id(), "created_at": now_iso(), "updated_at": now_iso()}
    await db.academy_bundles.insert_one(dict(b))
    await audit(user, "bundle create", b["title"])
    b.pop("_id", None)
    return b


@router.put("/admin/bundles/{bid}")
async def update_bundle(bid: str, body: BundleIn, user=Depends(admin_only)):
    d = await check_bundle(body)
    if not (await db.academy_bundles.update_one({"id": bid}, {"$set": {**d, "updated_at": now_iso()}})).matched_count:
        raise HTTPException(404, "Bundle not found")
    return await find_bundle(bid, active=False)


@router.delete("/admin/bundles/{bid}")
async def delete_bundle(bid: str, user=Depends(admin_only)):
    if not (await db.academy_bundles.delete_one({"id": bid})).deleted_count:
        raise HTTPException(404, "Bundle not found")
    await audit(user, "bundle delete", bid)
    return {"ok": True}


async def test_card(t, user):
    from routes_exams import card as tcard
    return await tcard(t, user)


async def bundle_card(b, user):
    cs = await bundle_courses(b)
    return {k: b.get(k) for k in ("id", "title", "subtitle", "cover")} | await personal(b, cs, user) | {
        "courses": [{"id": c["id"], "title": c["title"], "kind": c["kind"]} for c in cs], "courses_count": len(cs)}


@router.get("/public/academy/bundles")
async def public_bundles(request: Request, course_id: Optional[str] = None):
    user = await maybe_user(request)
    q = {"active": True, **({"$or": [{"course_ids": course_id}, {"test_ids": course_id}]} if course_id else {})}
    out = [await bundle_card(b, user) for b in await db.academy_bundles.find(q, NO_ID).sort("created_at", -1).to_list(100)]
    return [b for b in out if b["courses_count"] >= 2]


@router.get("/public/academy/bundles/{bid}")
async def public_bundle(bid: str, request: Request):
    user = await maybe_user(request)
    b = await find_bundle(bid)
    cs = await bundle_courses(b)
    return {**{k: b.get(k) for k in ("id", "title", "subtitle", "description", "cover")}, **await personal(b, cs, user),
            "courses": [await (test_card(c, user) if c["kind"] == "test" else card(c, user)) | {"kind": c["kind"]} for c in cs], "signed_in": bool(user),
            "wishlisted": bool(user and await db.wishlists.find_one({"user_id": user["id"], "kind": "bundle", "item_id": bid}))}


# ---------- Wishlist ----------
async def current_price(kind, iid):
    if kind == "course":
        c = await db.academy_courses.find_one({"id": iid, "status": "published"}, NO_ID)
        return (c, pricing(c)) if c else (None, None)
    b = await db.academy_bundles.find_one({"id": iid, "active": True}, NO_ID)
    return (b, bundle_pricing(b, await bundle_courses(b))) if b else (None, None)


class WishIn(BaseModel):
    kind: str = Field(pattern="^(course|bundle)$")
    id: str = Field(min_length=1, max_length=60)


@router.post("/wishlist/toggle")
async def toggle_wish(body: WishIn, user=Depends(get_current_user)):
    q = {"user_id": user["id"], "kind": body.kind, "item_id": body.id}
    if (await db.wishlists.delete_one(q)).deleted_count:
        return {"wishlisted": False}
    item, p = await current_price(body.kind, body.id)
    if not item:
        raise HTTPException(404, "Not found")
    await db.wishlists.insert_one({**q, "last_price": p["price"], "at": now_iso()})
    return {"wishlisted": True}


@router.get("/wishlist")
async def my_wishlist(user=Depends(get_current_user)):
    out = []
    for w in await db.wishlists.find({"user_id": user["id"]}, NO_ID).sort("at", -1).to_list(200):
        if w["kind"] == "course":
            c = await db.academy_courses.find_one({"id": w["item_id"], "status": "published"}, NO_ID)
            if c:
                out.append({"kind": "course", **await card(c, user)})
        else:
            b = await db.academy_bundles.find_one({"id": w["item_id"], "active": True}, NO_ID)
            if b:
                out.append({"kind": "bundle", **await bundle_card(b, user)})
    return out


def inr(n):
    return f"₹{n:,}"


async def still_wanted(w, item, user):
    if w["kind"] == "course":
        return not await owns(user, item)
    return bool((await personal(item, await bundle_courses(item), user))["your_price"])


async def send_wishlist_reminders():
    soon = datetime.now(timezone.utc) + timedelta(hours=24)
    sent = 0
    for w in await db.wishlists.find({}, NO_ID).to_list(20000):
        item, p = await current_price(w["kind"], w["item_id"])
        user = await db.users.find_one({"id": w["user_id"], "status": "active"}, {"_id": 0, "password_hash": 0})
        if not item or not user:
            continue
        key = {"user_id": w["user_id"], "kind": w["kind"], "item_id": w["item_id"]}
        link = f"{os.environ['FRONTEND_URL']}/{w['kind']}/{w['item_id']}"
        lines = None
        if p["price"] < w.get("last_price", p["price"]):
            if (await db.wishlists.update_one({**key, "last_price": w["last_price"]}, {"$set": {"last_price": p["price"]}})).modified_count and await still_wanted(w, item, user):
                subj = f"Price drop: {item['title']} is now {inr(p['price'])}"
                lines = [f"Good news — '{item['title']}' on your wishlist dropped from {inr(w['last_price'])} to {inr(p['price'])}."]
        elif p["price"] != w.get("last_price"):
            await db.wishlists.update_one(key, {"$set": {"last_price": p["price"]}})
        ends = p.get("sale_ends_at")
        if not lines and ends and parse_dt(ends) <= soon and w.get("sale_end_notified") != ends:
            if (await db.wishlists.update_one({**key, "sale_end_notified": {"$ne": ends}}, {"$set": {"sale_end_notified": ends}})).modified_count and await still_wanted(w, item, user):
                hrs = max(1, round((parse_dt(ends) - datetime.now(timezone.utc)).total_seconds() / 3600))
                subj = f"Sale ends in {hrs}h: {item['title']}"
                lines = [f"The sale on '{item['title']}' from your wishlist ends in about {hrs} hours.", f"Today's price is {inr(p['price'])} — after the sale it goes back up."]
        if lines and w["kind"] == "bundle":
            mine = (await personal(item, await bundle_courses(item), user))["your_price"]
            if mine != p["price"]:
                lines.append(f"Because you already own some of its courses, your price is just {inr(mine)}.")
        if lines and await send_email(to=user["email"], subject=subj, html=email_template(user["name"], lines + ["Remove it from your wishlist to stop these reminders."], link, "View on SOCProfessionals Academy")):
            sent += 1
    logger.info(f"Wishlist reminders sent: {sent}")
