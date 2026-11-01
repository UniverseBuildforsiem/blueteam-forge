from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from core import db, now, now_iso, new_id, admin_only, get_current_user, audit
from routes_promo import IST, live_settings, safe_send, email_template, fmt_ist

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}
PRICE, MRP, HOLD_MIN, LEAD_HOURS = 99, 999, 15, 2
TOPICS = ["Choosing the right course", "Certification roadmap (EC-Council, CompTIA, OSCP)", "Incident response & SIEM certifications", "Career switch into SOC", "Resume & interview guidance", "Other"]


def day_slots(d, s):
    sh, sm = map(int, s["consult_start"].split(":"))
    eh, em = map(int, s["consult_end"].split(":"))
    t, end = datetime(d.year, d.month, d.day, sh, sm, tzinfo=IST), datetime(d.year, d.month, d.day, eh, em, tzinfo=IST)
    out = []
    while t + timedelta(minutes=30) <= end:
        out.append(t)
        t += timedelta(minutes=30)
    return out


async def taken_slots():
    n = now().isoformat()
    rows = await db.consultations.find({"$or": [{"status": {"$in": ["paid", "completed"]}}, {"status": "pending", "hold_until": {"$gt": n}}]}, {"_id": 0, "slot_at": 1}).to_list(5000)
    return {r["slot_at"] for r in rows}


@router.get("/public/consultation")
async def consultation_info():
    s = await live_settings()
    n, taken = now().astimezone(IST), await taken_slots()
    earliest = n + timedelta(hours=LEAD_HOURS)
    days = []
    for i in range(14):
        d = (n + timedelta(days=i)).date()
        if d.weekday() not in s["consult_days"]:
            continue
        slots = [{"at": t.isoformat(), "free": t.isoformat() not in taken} for t in day_slots(d, s) if t > earliest]
        if slots:
            days.append({"date": d.isoformat(), "slots": slots})
    return {"price": PRICE, "mrp": MRP, "minutes": 30, "topics": TOPICS, "timezone": "IST (UTC+05:30)", "days": days, "whatsapp": s["whatsapp_number"]}


class HoldIn(BaseModel):
    slot_at: str = Field(max_length=40)
    topic: str
    phone: str = Field(min_length=7, max_length=20, pattern=r"^[0-9+()\-\s]+$")
    notes: str = Field(default="", max_length=1000)


@router.post("/consultations/hold")
async def hold_slot(body: HoldIn, user=Depends(get_current_user)):
    if body.topic not in TOPICS:
        raise HTTPException(422, "Pick a topic from the list")
    info = await consultation_info()
    every = {x["at"]: x["free"] for d in info["days"] for x in d["slots"]}
    if body.slot_at not in every:
        raise HTTPException(400, "Invalid slot — please pick a time from the list")
    mine = await db.consultations.find_one({"user_id": user["id"], "slot_at": body.slot_at, "status": "pending"}, NO_ID)
    if not every[body.slot_at] and not mine:
        raise HTTPException(409, "That slot was just taken — please pick another time")
    await db.consultations.update_many({"user_id": user["id"], "status": "pending"}, {"$set": {"status": "abandoned"}})
    c = {"id": new_id(), "user_id": user["id"], "name": user["name"], "email": user["email"], **body.model_dump(), "status": "pending",
         "hold_until": (now() + timedelta(minutes=HOLD_MIN)).isoformat(), "amount": PRICE, "created_at": now_iso()}
    await db.consultations.insert_one(dict(c))
    return {"id": c["id"], "hold_minutes": HOLD_MIN, "when": fmt_ist(c["slot_at"])}


async def check_hold(ref, user):
    c = await db.consultations.find_one({"id": ref, "user_id": user["id"]}, NO_ID)
    if not c or c["status"] != "pending":
        raise HTTPException(400, "Your slot hold expired — please pick a time again")
    clash = await db.consultations.find_one({"slot_at": c["slot_at"], "id": {"$ne": ref}, "$or": [{"status": {"$in": ["paid", "completed"]}}, {"status": "pending", "hold_until": {"$gt": now().isoformat()}}]})
    if clash:
        raise HTTPException(409, "That slot was just taken — please pick another time")
    await db.consultations.update_one({"id": ref}, {"$set": {"hold_until": (now() + timedelta(minutes=HOLD_MIN)).isoformat()}})


@router.post("/consultations/{cid}/release")
async def release_hold(cid: str, user=Depends(get_current_user)):
    await db.consultations.update_one({"id": cid, "user_id": user["id"], "status": "pending"}, {"$set": {"status": "abandoned"}})
    return {"ok": True}


async def confirm_consultation(ref, payment_id):
    c = await db.consultations.find_one({"id": ref}, NO_ID)
    if not c or c["status"] not in ("pending", "abandoned"):
        return
    clash = await db.consultations.find_one({"slot_at": c["slot_at"], "id": {"$ne": ref}, "status": {"$in": ["paid", "completed"]}})
    status = "needs_reschedule" if clash else "paid"
    c = await db.consultations.find_one_and_update({"id": ref, "status": {"$in": ["pending", "abandoned"]}}, {"$set": {"status": status, "payment_id": payment_id, "paid_at": now_iso()}}, projection=NO_ID)
    if not c:
        return
    s, when = await live_settings(), fmt_ist(c["slot_at"])
    if status == "needs_reschedule":
        await safe_send(c["email"], "Consultation payment received — we'll confirm your time", email_template(c["name"], [
            f"We received your ₹{c['amount']} payment, but the {when} slot was booked by someone else moments earlier.", "Our team will contact you shortly to fix a new time that suits you."]))
        await safe_send(s["notify_email"], f"ACTION: reschedule paid consultation — {c['name']}", email_template("team", [
            f"Paid slot clash at {when}. Please call {c['name']} ({c['phone']}, {c['email']}) to reschedule.", f"Payment: {payment_id}"]))
        return
    await safe_send(c["email"], f"Consultation booked — {when}", email_template(c["name"], [
        f"Your 30-minute Cyber & SOC consultation is confirmed for {when}.", f"Topic: {c['topic']}. Amount paid: ₹{c['amount']}.",
        "Our expert will share the meeting link on your email and WhatsApp before the session. Keep your questions ready!"]))
    base = [f"Session: {when}", f"Name: {c['name']}", f"Email: {c['email']}", f"Phone: {c['phone']}", f"Topic: {c['topic']}", f"Paid: ₹{c['amount']} ({payment_id})"]
    await safe_send(s["notify_email"], f"New paid consultation: {c['name']} — {when}", email_template("team", base + [f"Notes: {c['notes'] or '—'}"]),
                    email_template("team", base + ["Notes: (hidden by the email safety filter — see Admin Panel)"]))


@router.get("/consultations/mine")
async def my_consultations(user=Depends(get_current_user)):
    return await db.consultations.find({"user_id": user["id"], "status": {"$in": ["paid", "completed", "needs_reschedule"]}}, NO_ID).sort("slot_at", -1).to_list(50)


@router.get("/admin/consultations")
async def admin_consultations(user=Depends(admin_only)):
    return await db.consultations.find({"status": {"$in": ["paid", "completed", "cancelled", "needs_reschedule"]}}, NO_ID).sort("slot_at", -1).to_list(2000)


class CStatusIn(BaseModel):
    status: str = Field(pattern="^(paid|completed|cancelled|needs_reschedule)$")


@router.patch("/admin/consultations/{cid}")
async def consultation_status(cid: str, body: CStatusIn, user=Depends(admin_only)):
    if not (await db.consultations.update_one({"id": cid, "status": {"$nin": ["pending", "abandoned"]}}, {"$set": {"status": body.status}})).matched_count:
        raise HTTPException(404, "Consultation not found")
    await audit(user, f"consultation {body.status}", cid)
    return {"ok": True}
