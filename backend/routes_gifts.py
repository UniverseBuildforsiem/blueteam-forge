import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from core import db, get_current_user, now_iso, new_id, send_email, email_template, logger
from routes_academy import maybe_user, parse_dt, owns

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}


class GiftIn(BaseModel):
    to_name: str = Field(min_length=1, max_length=80)
    to_email: EmailStr
    message: str = Field(default="", max_length=500)
    send_on: Optional[str] = None


def check_gift(g: GiftIn, plan):
    if not plan.startswith(("course:", "bundle:")):
        raise HTTPException(400, "Only courses and bundles can be gifted")
    if g.send_on:
        try:
            parse_dt(g.send_on)
        except ValueError:
            raise HTTPException(422, "Invalid delivery date")


def gift_link(g):
    return f"{os.environ['FRONTEND_URL'].rstrip('/')}/gift/{g['code']}"


async def safe_send(to, subject, name, lines, link, text):
    try:
        return await send_email(to=to, subject=subject, html=email_template(name, lines, link, text))
    except ValueError as e:
        logger.warning(f"Gift email blocked: {e}")
        return None


async def deliver(g, resend=False):
    stale = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    claim = {"status": "sent"} if resend else {"$or": [{"status": "scheduled"}, {"status": "sending", "claimed_at": {"$lt": stale}}]}
    if not (await db.gifts.update_one({"id": g["id"], **claim}, {"$set": {"status": "sending", "claimed_at": now_iso()}})).modified_count:
        return False
    lines = [f"{g['from_name']} sent you a gift on SOCProfessionals Academy: {g['title']}."]
    if g.get("message"):
        lines.append(f"Their message: “{g['message']}”")
    lines.append("Open the link, sign in or create a free account, and the course unlocks on your account.")
    ok = await safe_send(g["to_email"], f"🎁 {g['from_name']} gifted you {g['title']}", g["to_name"], lines, gift_link(g), "Redeem your gift")
    await db.gifts.update_one({"id": g["id"]}, {"$set": {"status": "sent" if ok or resend else "scheduled", **({"sent_at": now_iso()} if ok else {}),
                                                         "last_error": None if ok else "Email could not be delivered"}})
    return bool(ok)


async def create_gift(p):
    g = p["gift"]
    buyer = await db.users.find_one({"id": p["user_id"]}, {"_id": 0, "name": 1, "email": 1})
    if p["plan"].startswith("bundle:"):
        courses = p.get("courses") or []
    else:
        courses = [p["plan"][7:]]
    doc = {"id": new_id(), "code": secrets.token_urlsafe(12), "plan": p["plan"], "title": p["plan_name"].split(": ", 1)[-1], "courses": courses,
           "from_user_id": p["user_id"], "from_name": buyer["name"], "to_name": g["to_name"], "to_email": g["to_email"].lower(), "message": g.get("message", ""),
           "send_on": g.get("send_on"), "payment_id": p["id"], "amount": p["amount"], "status": "scheduled", "created_at": now_iso()}
    if await db.gifts.find_one({"payment_id": p["id"]}):
        return
    await db.gifts.insert_one(dict(doc))
    due = not doc["send_on"] or parse_dt(doc["send_on"]) <= datetime.now(timezone.utc)
    if due:
        await deliver(doc)
    when = "has been emailed to them" if due else f"will be emailed on {doc['send_on'][:10]}"
    await safe_send(buyer["email"], f"Your gift for {doc['to_name']} is confirmed", buyer["name"],
                    [f"Thanks! Your gift '{doc['title']}' for {doc['to_name']} ({doc['to_email']}) {when}.", "You can also copy the redeem link from Courses → My gifts and share it yourself."],
                    f"{os.environ['FRONTEND_URL'].rstrip('/')}/app/courses?tab=gifts", "View my gifts")


async def send_scheduled_gifts():
    now = datetime.now(timezone.utc)
    sent = 0
    for g in await db.gifts.find({"status": {"$in": ["scheduled", "sending"]}}, NO_ID).to_list(1000):
        if (not g.get("send_on") or parse_dt(g["send_on"]) <= now) and await deliver(g):
            sent += 1
    logger.info(f"Scheduled gifts delivered: {sent}")


async def owns_all(user, g):
    from routes_exams import owns as owns_test
    cs = await db.academy_courses.find({"id": {"$in": g["courses"]}}, NO_ID).to_list(50)
    ts = await db.exams.find({"id": {"$in": [c[5:] for c in g["courses"] if c.startswith("test:")]}}, NO_ID).to_list(50)
    return bool(cs or ts) and all([await owns(user, c) for c in cs] + [await owns_test(user, t) for t in ts])


@router.get("/public/gifts/{code}")
async def view_gift(code: str, request: Request):
    user = await maybe_user(request)
    g = await db.gifts.find_one({"code": code}, NO_ID)
    if not g:
        raise HTTPException(404, "Gift not found")
    titles = [c["title"] for c in await db.academy_courses.find({"id": {"$in": g["courses"]}}, {"_id": 0, "title": 1}).to_list(50)]
    titles += [t["title"] for t in await db.exams.find({"id": {"$in": [c[5:] for c in g["courses"] if c.startswith("test:")]}}, {"_id": 0, "title": 1}).to_list(50)]
    kind, iid = g["plan"].split(":", 1)
    return {"title": g["title"], "kind": kind, "item_id": iid, "from_name": g["from_name"], "to_name": g["to_name"], "message": g["message"],
            "courses": titles, "redeemed": g["status"] == "redeemed", "signed_in": bool(user),
            "redeemed_by_you": bool(user and g.get("redeemed_by") == user["id"]), "owns_all": bool(user and g["status"] != "redeemed" and await owns_all(user, g))}


@router.post("/gifts/{code}/redeem")
async def redeem_gift(code: str, user=Depends(get_current_user)):
    g = await db.gifts.find_one({"code": code}, NO_ID)
    if not g:
        raise HTTPException(404, "Gift not found")
    if g["status"] == "redeemed":
        raise HTTPException(400, "This gift has already been redeemed")
    if await owns_all(user, g):
        raise HTTPException(400, "You already own everything in this gift — forward the link to a friend instead")
    if not (await db.gifts.update_one({"code": code, "status": {"$ne": "redeemed"}}, {"$set": {"status": "redeemed", "redeemed_by": user["id"], "redeemed_at": now_iso()}})).modified_count:
        raise HTTPException(400, "This gift has already been redeemed")
    for pid in ([g["plan"]] if g["plan"].startswith("bundle:") else []) + [c if ":" in c else f"course:{c}" for c in g["courses"]]:
        await db.purchases.update_one({"user_id": user["id"], "product_id": pid},
                                      {"$setOnInsert": {"user_id": user["id"], "product_id": pid, "gift_id": g["id"], "at": now_iso()}}, upsert=True)
    one = g["courses"][0] if len(g["courses"]) == 1 else None
    return {"ok": True, "go": (f"/app/tests/{one[5:]}" if one.startswith("test:") else f"/app/courses/{one}") if one else "/app/courses"}


@router.get("/gifts/sent")
async def sent_gifts(user=Depends(get_current_user)):
    gs = await db.gifts.find({"from_user_id": user["id"]}, {"_id": 0, "redeemed_by": 0}).sort("created_at", -1).to_list(200)
    return [{**g, "link": gift_link(g)} for g in gs]


@router.post("/gifts/{gid}/send-now")
async def send_now(gid: str, user=Depends(get_current_user)):
    g = await db.gifts.find_one({"id": gid, "from_user_id": user["id"]}, NO_ID)
    if not g:
        raise HTTPException(404, "Gift not found")
    if g["status"] == "redeemed":
        raise HTTPException(400, "This gift has already been redeemed")
    if g["status"] == "sending":
        await db.gifts.update_one({"id": gid, "status": "sending"}, {"$set": {"status": "scheduled"}})
    if not await deliver(g, resend=g["status"] == "sent"):
        raise HTTPException(502, "We couldn't email the recipient — copy the link and share it yourself")
    return {"ok": True}
