import re
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from core import db, now, now_iso, new_id, admin_only, audit, send_email, email_template

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}
IST = timezone(timedelta(hours=5, minutes=30))
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")
UDEMY = "https://www.udemy.com/course/certified-soc-analyst-splunk-qualys-vmdr-ir-l1-l2-socprofessionals/?referralCode=261E04A0E06901725704"
DEFAULT_PROMOS = [
    {"id": "udemy-vmdr", "tag": "Udemy course", "title": "Qualys Guard VMDR", "text": "Vulnerability management, detection and response with Qualys — scan, prioritise and remediate like an enterprise SOC.", "price": "₹499", "cta": "Enrol on Udemy", "url": UDEMY, "accent": "#00F0FF", "icon": "shield", "img": ""},
    {"id": "udemy-csa", "tag": "Udemy course", "title": "Certified SOC Analyst", "text": "Splunk, Qualys VMDR and incident response for L1 & L2 analysts — the complete SOC analyst course.", "price": "₹499", "cta": "Enrol on Udemy", "url": UDEMY, "accent": "#00FF66", "icon": "play", "img": ""},
    {"id": "app", "tag": "Android app", "title": "SOCProfessionals Self-Learning", "text": "Learn SOC skills on the go — lessons, quizzes and practice in your pocket.", "price": "Free download", "cta": "Get it on Google Play", "url": "https://play.google.com/store/apps/details?id=co.lenord.utars&pcampaignid=web_share", "accent": "#FACC15", "icon": "phone", "img": ""},
    {"id": "paths", "tag": "On this platform", "title": "SOC Learning Paths", "text": "Structured tracks from SOC fundamentals to L2 hunting, with labs, quizzes and verifiable certificates.", "price": "Start free", "cta": "Explore learning paths", "url": "/catalog", "accent": "#00F0FF", "icon": "route", "img": ""},
    {"id": "book", "tag": "Ebook", "title": "SOC Interview Preparation", "text": "Real interview questions, scenario walkthroughs and answers that get SOC analysts hired.", "price": "Interview ready", "cta": "See the book", "url": "/book", "accent": "#FB923C", "icon": "book", "img": "/book/cover.jpg"},
]
LIVE_DEFAULTS = {"id": "live_classes", "demo_link": "https://teams.microsoft.com/meet/2291320368285614?p=clnHXl5ykhFkFphtCb", "demo_time": "16:00", "batch_time": "16:00",
                 "notify_email": "hr@socprofessionals.com", "title": "SOC Live Classes", "description": "Instructor-led SOC analyst training: live SIEM, triage, incident response and interview prep with real alerts."}


async def ensure_promos():
    if not await db.promos.count_documents({}):
        await db.promos.insert_many([{**p, "order": i, "active": True, "ends_at": None, "created_at": now_iso()} for i, p in enumerate(DEFAULT_PROMOS)])
    if not await db.settings.find_one({"id": "live_classes"}):
        await db.settings.insert_one(dict(LIVE_DEFAULTS))


# ---------- Promotions ----------
class PromoIn(BaseModel):
    tag: str = Field(default="", max_length=40)
    title: str = Field(min_length=2, max_length=80)
    text: str = Field(default="", max_length=300)
    price: str = Field(default="", max_length=40)
    cta: str = Field(min_length=2, max_length=40)
    url: str = Field(min_length=1, max_length=500, pattern=r"^(https://|/)")
    accent: str = Field(default="#00F0FF", pattern=r"^#[0-9a-fA-F]{6}$")
    icon: str = Field(default="shield", pattern="^(shield|play|phone|route|book|live)$")
    img: str = Field(default="", max_length=500, pattern=r"^(|https://.*|/.*)$")
    active: bool = True
    ends_at: Optional[str] = Field(default=None, max_length=40)


def check_end(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except ValueError:
        raise HTTPException(422, "Invalid offer end date")


@router.get("/public/promos")
async def public_promos():
    t = now().isoformat()
    ps = await db.promos.find({"active": True}, NO_ID).sort("order", 1).to_list(50)
    return [p for p in ps if not p.get("ends_at") or p["ends_at"] > t]


@router.get("/admin/promos")
async def list_promos(user=Depends(admin_only)):
    return await db.promos.find({}, NO_ID).sort("order", 1).to_list(100)


@router.post("/admin/promos")
async def create_promo(body: PromoIn, user=Depends(admin_only)):
    last = await db.promos.find_one({}, {"_id": 0, "order": 1}, sort=[("order", -1)])
    p = {"id": new_id(), **body.model_dump(), "ends_at": check_end(body.ends_at), "order": (last or {}).get("order", -1) + 1, "created_at": now_iso()}
    await db.promos.insert_one(dict(p))
    await audit(user, "create promo", p["id"])
    return p


@router.put("/admin/promos/{pid}")
async def update_promo(pid: str, body: PromoIn, user=Depends(admin_only)):
    r = await db.promos.update_one({"id": pid}, {"$set": {**body.model_dump(), "ends_at": check_end(body.ends_at)}})
    if not r.matched_count:
        raise HTTPException(404, "Promotion not found")
    await audit(user, "update promo", pid)
    return await db.promos.find_one({"id": pid}, NO_ID)


@router.delete("/admin/promos/{pid}")
async def delete_promo(pid: str, user=Depends(admin_only)):
    if not (await db.promos.delete_one({"id": pid})).deleted_count:
        raise HTTPException(404, "Promotion not found")
    await audit(user, "delete promo", pid)
    return {"ok": True}


class OrderIn(BaseModel):
    ids: list[str]


@router.post("/admin/promos/reorder")
async def reorder_promos(body: OrderIn, user=Depends(admin_only)):
    for i, pid in enumerate(body.ids):
        await db.promos.update_one({"id": pid}, {"$set": {"order": i}})
    return await db.promos.find({}, NO_ID).sort("order", 1).to_list(100)


# ---------- Live classes ----------
def fridays(start, count, only=None):
    d, out = start, []
    while len(out) < count:
        if d.weekday() == 4 and (not only or (d.day - 1) // 7 + 1 in only):
            out.append(d)
        d += timedelta(days=1)
    return out


def at(d, hhmm):
    h, m = map(int, hhmm.split(":"))
    return datetime(d.year, d.month, d.day, h, m, tzinfo=IST)


async def live_settings():
    return {**LIVE_DEFAULTS, **(await db.settings.find_one({"id": "live_classes"}, NO_ID) or {})}


async def schedule():
    s = await live_settings()
    n = now().astimezone(IST)
    demos = [x for x in (at(d, s["demo_time"]) for d in fridays(n.date(), 5)) if x > n][:4]
    batches = [x for x in (at(d, s["batch_time"]) for d in fridays(n.date(), 6, (2, 4))) if x > n][:4]
    return s, demos, batches


@router.get("/public/live-classes")
async def live_public():
    s, demos, batches = await schedule()
    return {"title": s["title"], "description": s["description"], "timezone": "IST (UTC+05:30)",
            "demos": [d.isoformat() for d in demos], "batches": [{"start": b.isoformat(), "label": f"{'2nd' if (b.day - 1) // 7 == 1 else '4th'} Friday batch"} for b in batches]}


class EnquiryIn(BaseModel):
    kind: str = Field(pattern="^(demo|batch)$")
    session_at: str = Field(max_length=40)
    name: str = Field(min_length=2, max_length=80)
    email: str = Field(max_length=120)
    phone: str = Field(min_length=7, max_length=20, pattern=r"^[0-9+()\-\s]+$")
    experience: str = Field(pattern="^(Student / fresher|0-1 years IT|1-3 years IT|3+ years IT|Already in a SOC)$")
    message: str = Field(default="", max_length=1000)


def fmt_ist(iso):
    return datetime.fromisoformat(iso).astimezone(IST).strftime("%A, %d %B %Y, %I:%M %p IST")


@router.post("/public/live-classes/enquiry")
async def live_enquiry(body: EnquiryIn):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Please enter a valid email address")
    s, demos, batches = await schedule()
    valid = [d.isoformat() for d in (demos if body.kind == "demo" else batches)]
    if body.session_at not in valid:
        raise HTTPException(400, "That session is no longer available — please pick another date")
    if await db.live_enquiries.count_documents({"email": email, "created_at": {"$gte": (now() - timedelta(days=1)).isoformat()}}) >= 5:
        raise HTTPException(429, "You've already sent several requests today — we'll be in touch soon")
    e = {"id": new_id(), **body.model_dump(), "email": email, "name": body.name.strip(), "status": "new", "created_at": now_iso()}
    await db.live_enquiries.insert_one(dict(e))
    when = fmt_ist(body.session_at)
    what = "free demo class" if body.kind == "demo" else "new batch"
    lines = ([f"You're registered for the SOC Live Classes free demo on {when}.", "Join from the button below at the scheduled time. It opens Microsoft Teams in your browser or app."]
             if body.kind == "demo" else [f"Thanks for your interest in the SOC Live Classes batch starting {when}.", "Our team will contact you shortly with the schedule, fees and enrolment steps."])
    await send_email(to=email, subject=f"SOC Live Classes — {what} on {when[:-4]}",
                     html=email_template(e["name"], lines, s["demo_link"] if body.kind == "demo" and s.get("demo_link", "").startswith("https://") else None, "Join the demo" if body.kind == "demo" else None))
    await send_email(to=s["notify_email"], subject=f"New live class {body.kind} enquiry: {e['name']}",
                     html=email_template("team", [f"Type: {what}", f"Session: {when}", f"Name: {e['name']}", f"Email: {email}", f"Phone: {body.phone}",
                                                  f"Experience: {body.experience}", f"Message: {body.message or '—'}"]))
    return {"ok": True, "when": when}


@router.get("/admin/live-enquiries")
async def list_enquiries(user=Depends(admin_only)):
    return await db.live_enquiries.find({}, NO_ID).sort("created_at", -1).to_list(2000)


class StatusIn(BaseModel):
    status: str = Field(pattern="^(new|contacted|enrolled|closed)$")


@router.patch("/admin/live-enquiries/{eid}")
async def enquiry_status(eid: str, body: StatusIn, user=Depends(admin_only)):
    if not (await db.live_enquiries.update_one({"id": eid}, {"$set": {"status": body.status}})).matched_count:
        raise HTTPException(404, "Enquiry not found")
    return {"ok": True}


class LiveSettingsIn(BaseModel):
    demo_link: str = Field(default="", max_length=500, pattern=r"^(|https://.*)$")
    demo_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    batch_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    notify_email: str = Field(max_length=120)
    title: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=400)


@router.get("/admin/live-classes/settings")
async def get_live_settings(user=Depends(admin_only)):
    return await live_settings()


@router.put("/admin/live-classes/settings")
async def put_live_settings(body: LiveSettingsIn, user=Depends(admin_only)):
    if not EMAIL_RE.match(body.notify_email.strip()):
        raise HTTPException(400, "Invalid notification email")
    await db.settings.update_one({"id": "live_classes"}, {"$set": body.model_dump()}, upsert=True)
    await audit(user, "update live class settings", "live_classes")
    return await live_settings()
