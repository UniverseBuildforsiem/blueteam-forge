import asyncio
import json
import os
import re
import secrets
from collections import Counter, defaultdict
from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from emergentintegrations.llm.chat import LlmChat, UserMessage
from core import db, now, now_iso, new_id, hash_password, admin_only, staff, audit, send_email, email_template, rank_for
from routes_sop import all_sops
from path_templates import BUILTIN_TEMPLATES

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")
GRANTS = {"sop": "sop-bundle", "book": "soc-interview-ebook"}
USER_COLLECTIONS = ["lesson_progress", "quiz_attempts", "lab_progress", "challenge_submissions", "challenge_hints", "drill_submissions", "drill_practice", "drill_freezes",
                    "drill_rescue", "ctf_solves", "ctf_hints", "activity", "certificates", "course_completions", "course_bonus", "course_alerts", "rsvps", "saved_searches",
                    "purchases", "interviews", "digest_sends", "rank_emails", "password_reset_tokens", "cases", "lesson_quiz_attempts", "toolkit_usage"]


# ---------- Users ----------
class InviteIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: str
    role: str = Field(default="student", pattern="^(student|instructor|admin)$")
    plan: str = Field(default="free", pattern="^(free|pro)$")


async def unique_username(email):
    base = re.sub(r"[^a-z0-9_.-]", "", email.split("@")[0].lower())[:18] or "user"
    name, i = base, 1
    while await db.users.find_one({"username": name}):
        i += 1
        name = f"{base}{i}"
    return name


async def send_invite(u, inviter):
    token = secrets.token_urlsafe(32)
    await db.password_reset_tokens.insert_one({"token": token, "user_id": u["id"], "used": False, "expires_at": now() + timedelta(hours=72), "kind": "invite"})
    lines = [f"{inviter} invited you to SOCProfessionals Academy as {'an' if u['role'] in ('instructor', 'admin') else 'a'} {u['role']}.",
             "Set your password with the button below to activate your account. The link works once and expires in 72 hours.",
             f"Your login email: {u['email']}"]
    await send_email(to=u["email"], subject="You're invited to SOCProfessionals Academy",
                     html=email_template(u["name"], lines, f"{os.environ['FRONTEND_URL']}/reset-password?token={token}", "Set your password"))


@router.post("/admin/users/invite")
async def invite(body: InviteIn, user=Depends(admin_only)):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Invalid email format")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "A user with that email already exists")
    u = {"id": new_id(), "name": body.name.strip(), "email": email, "username": await unique_username(email), "password_hash": hash_password(secrets.token_urlsafe(24)),
         "role": body.role, "status": "active", "plan": body.plan, "goal": None, "current_path": None, "onboarded": False, "xp": 0, "streak": 0,
         "last_active": None, "created_at": now_iso(), "invited_by": user["email"], "invite_pending": True}
    await db.users.insert_one(dict(u))
    await send_invite(u, user["name"])
    await audit(user, f"invite user as {body.role}", email)
    return {k: v for k, v in u.items() if k != "password_hash"}


@router.post("/admin/users/{uid}/resend-invite")
async def resend_invite(uid: str, user=Depends(admin_only)):
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "User not found")
    await db.password_reset_tokens.update_many({"user_id": uid, "kind": "invite", "used": False}, {"$set": {"used": True}})
    await send_invite(u, user["name"])
    await audit(user, "resend invite", u["email"])
    return {"ok": True}


async def owned(uid):
    return {k: bool(await db.purchases.find_one({"user_id": uid, "product_id": p})) for k, p in GRANTS.items()}


@router.get("/admin/users/{uid}")
async def user_detail(uid: str, user=Depends(admin_only)):
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "User not found")
    counts = {k: await db[c].count_documents({"user_id": uid}) for k, c in
              [("lessons", "lesson_progress"), ("quiz_attempts", "quiz_attempts"), ("labs", "lab_progress"), ("challenges", "challenge_submissions"),
               ("drills", "drill_submissions"), ("ctf_solves", "ctf_solves"), ("certificates", "certificates"), ("interviews", "interviews")]}
    return {"user": {**u, "rank": rank_for(u.get("xp", 0))}, "counts": counts, "access": await owned(uid),
            "purchases": await db.purchases.find({"user_id": uid}, NO_ID).to_list(50),
            "payments": await db.payments.find({"user_id": uid}, {"_id": 0, "id": 1, "plan": 1, "plan_name": 1, "amount": 1, "status": 1, "provider": 1, "created_at": 1}).sort("created_at", -1).to_list(50),
            "activity": await db.activity.find({"user_id": uid}, {"_id": 0, "text": 1, "xp": 1, "created_at": 1}).sort("created_at", -1).to_list(30),
            "audit": await db.audit_logs.find({"target": {"$in": [uid, u["email"]]}}, NO_ID).sort("created_at", -1).to_list(20)}


class AccessIn(BaseModel):
    plan: Optional[str] = Field(default=None, pattern="^(free|pro)$")
    sop: Optional[bool] = None
    book: Optional[bool] = None
    reset_xp: bool = False
    name: Optional[str] = Field(default=None, min_length=2, max_length=60)


@router.patch("/admin/users/{uid}/access")
async def update_access(uid: str, body: AccessIn, user=Depends(admin_only)):
    u = await db.users.find_one({"id": uid}, {"_id": 0, "id": 1, "email": 1})
    if not u:
        raise HTTPException(404, "User not found")
    s = {k: v for k, v in (("plan", body.plan), ("name", body.name)) if v}
    if body.reset_xp:
        s.update({"xp": 0, "streak": 0})
    if s:
        await db.users.update_one({"id": uid}, {"$set": s})
    for k in GRANTS:
        v = getattr(body, k)
        if v is True:
            await db.purchases.update_one({"user_id": uid, "product_id": GRANTS[k]}, {"$setOnInsert": {"user_id": uid, "product_id": GRANTS[k], "at": now_iso()[:10], "granted_by": user["email"]}}, upsert=True)
        elif v is False:
            await db.purchases.delete_many({"user_id": uid, "product_id": GRANTS[k]})
    await audit(user, f"update access {body.model_dump(exclude_none=True)}", uid)
    return {"ok": True, "access": await owned(uid)}


@router.delete("/admin/users/{uid}")
async def delete_user(uid: str, user=Depends(admin_only)):
    if uid == user["id"]:
        raise HTTPException(400, "You cannot delete your own account")
    u = await db.users.find_one({"id": uid}, {"_id": 0, "email": 1, "role": 1})
    if not u:
        raise HTTPException(404, "User not found")
    if u["role"] == "admin" and await db.users.count_documents({"role": "admin"}) <= 1:
        raise HTTPException(400, "Cannot delete the last admin")
    removed = {}
    for c in USER_COLLECTIONS:
        r = await db[c].delete_many({"user_id": uid})
        if r.deleted_count:
            removed[c] = r.deleted_count
    await db.users.delete_one({"id": uid})
    await audit(user, f"delete user {u['email']} ({sum(removed.values())} records)", uid)
    return {"ok": True, "removed": removed}


# ---------- Analytics ----------
FUNNEL = ["Signed up", "Onboarded", "Started a lesson", "Took a quiz", "Finished a lab", "Paid"]


@router.get("/admin/analytics/full")
async def full_analytics(days: int = 30, user=Depends(admin_only)):
    days = days if days in (7, 30, 90) else 30
    today = now().date()
    start = (today - timedelta(days=days - 1)).isoformat()
    prev = (today - timedelta(days=2 * days - 1)).isoformat()
    span = [(today - timedelta(days=i)).isoformat() for i in range(days - 1, -1, -1)]
    us = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "username": 1, "created_at": 1, "last_active": 1, "role": 1, "plan": 1, "onboarded": 1, "xp": 1}).to_list(20000)
    students = [u for u in us if u["role"] == "student"]
    pays = await db.payments.find({"status": "paid"}, {"_id": 0, "user_id": 1, "plan": 1, "plan_name": 1, "amount": 1, "created_at": 1}).to_list(20000)
    acts = await db.activity.find({"created_at": {"$gte": prev}}, {"_id": 0, "user_id": 1, "xp": 1, "created_at": 1}).to_list(200000)

    def in_period(d, a=start):
        return (d or "")[:10] >= a

    def kpi(cur, before):
        return {"value": cur, "change": None if not before else round(100 * (cur - before) / before)}
    sign_cur = len([u for u in us if in_period(u["created_at"])])
    sign_prev = len([u for u in us if prev <= u["created_at"][:10] < start])
    act_cur = len({a["user_id"] for a in acts if in_period(a["created_at"])})
    act_prev = len({a["user_id"] for a in acts if prev <= a["created_at"][:10] < start})
    rev_cur = sum(p["amount"] for p in pays if in_period(p["created_at"]))
    rev_prev = sum(p["amount"] for p in pays if prev <= p["created_at"][:10] < start)
    payers = {p["user_id"] for p in pays}
    daily_active = defaultdict(set)
    for a in acts:
        daily_active[a["created_at"][:10]].add(a["user_id"])
    signups, rev = Counter(u["created_at"][:10] for u in us), defaultdict(int)
    for p in pays:
        rev[p["created_at"][:10]] += p["amount"]
    by_product = defaultdict(lambda: {"revenue": 0, "orders": 0})
    for p in pays:
        if in_period(p["created_at"]):
            k = p.get("plan_name") or p.get("plan")
            by_product[k]["revenue"] += p["amount"]
            by_product[k]["orders"] += 1
    engagement = {}
    for label, coll, field in [("Lessons completed", "lesson_progress", "created_at"), ("Quiz attempts", "quiz_attempts", "created_at"), ("Lab reports", "lab_progress", "report_at"),
                               ("Challenge reports", "challenge_submissions", "created_at"), ("Daily drills", "drill_submissions", "created_at"), ("CTF solves", "ctf_solves", "created_at"),
                               ("Mock interviews", "interviews", "started_at"), ("Certificates", "certificates", "issued_at")]:
        engagement[label] = await db[coll].count_documents({field: {"$gte": start}})
    sids = [u["id"] for u in students]
    stage = [set(sids), {u["id"] for u in students if u.get("onboarded")}, set(await db.lesson_progress.distinct("user_id")),
             set(await db.quiz_attempts.distinct("user_id")), set(await db.lab_progress.distinct("user_id", {"report_submitted": True})), payers]
    funnel, base = [], set(sids)
    for name, s in zip(FUNNEL, stage):
        base = base & s
        funnel.append({"stage": name, "users": len(base), "pct": round(100 * len(base) / len(sids)) if sids else 0})
    xp_period = defaultdict(int)
    for a in acts:
        if in_period(a["created_at"]) and a.get("xp", 0) > 0:
            xp_period[a["user_id"]] += a["xp"]
    names = {u["id"]: u for u in us}
    top = [{"id": k, "name": names[k]["name"], "username": names[k].get("username"), "xp": v, "rank": rank_for(names[k].get("xp", 0))}
           for k, v in sorted(xp_period.items(), key=lambda x: -x[1]) if k in names and names[k]["role"] == "student"][:10]

    async def popular(coll, key, title_key, title_coll, match=None):
        rows = await db[coll].aggregate([{"$match": match or {}}, {"$group": {"_id": f"${key}", "n": {"$sum": 1}}}, {"$sort": {"n": -1}}, {"$limit": 5}]).to_list(5)
        titles = {d["id"]: d.get(title_key) for d in await db[title_coll].find({"id": {"$in": [r["_id"] for r in rows]}}, {"_id": 0, "id": 1, title_key: 1}).to_list(5)}
        return [{"title": titles.get(r["_id"], r["_id"]), "count": r["n"]} for r in rows]
    return {"days": days,
            "kpis": {"signups": kpi(sign_cur, sign_prev), "active_users": kpi(act_cur, act_prev), "revenue": kpi(rev_cur, rev_prev),
                     "total_users": {"value": len(us)}, "paying_users": {"value": len(payers)}, "conversion": {"value": round(100 * len(payers) / len(students), 1) if students else 0},
                     "pro_users": {"value": len([u for u in us if u.get("plan") == "pro"])}, "avg_daily_active": {"value": round(sum(len(daily_active[d]) for d in span) / days, 1)}},
            "series": [{"day": d[5:], "signups": signups.get(d, 0), "active": len(daily_active.get(d, ())), "revenue": rev.get(d, 0)} for d in span],
            "revenue_by_product": [{"product": k, **v} for k, v in sorted(by_product.items(), key=lambda x: -x[1]["revenue"])],
            "engagement": [{"name": k, "count": v} for k, v in engagement.items()], "funnel": funnel, "top_performers": top,
            "roles": dict(Counter(u["role"] for u in us)),
            "popular": {"labs": await popular("lab_progress", "lab_id", "title", "labs"), "challenges": await popular("challenge_submissions", "challenge_id", "title", "challenges"),
                        "quizzes": await popular("quiz_attempts", "quiz_id", "title", "quizzes")}}


# ---------- Path templates ----------
def tpl_card(t):
    lessons = [l for m in t["modules"] for l in m["lessons"]]
    return {k: t.get(k) for k in ("id", "title", "level", "category", "duration", "description", "builtin", "created_by", "created_at")} | {
        "module_count": len(t["modules"]), "lesson_count": len(lessons), "minutes": sum(int(l.get("minutes") or 0) for l in lessons),
        "outline": [{"title": m["title"], "lessons": [l["title"] for l in m["lessons"]]} for m in t["modules"]]}


async def find_template(tid):
    t = next((x for x in BUILTIN_TEMPLATES if x["id"] == tid), None) or await db.path_templates.find_one({"id": tid}, NO_ID)
    if not t:
        raise HTTPException(404, "Template not found")
    return t


@router.get("/builder/templates")
async def list_templates(user=Depends(staff)):
    custom = await db.path_templates.find({}, NO_ID).sort("created_at", -1).to_list(200)
    return [tpl_card(t) for t in BUILTIN_TEMPLATES + custom]


@router.post("/builder/templates/{tid}/use")
async def use_template(tid: str, user=Depends(staff)):
    t = await find_template(tid)
    mods = [{"id": f"m-{new_id()[:7]}", "title": m["title"], "lessons": [{"id": f"l-{new_id()[:7]}", "title": l["title"], "minutes": int(l.get("minutes") or 10),
             "content": l.get("content", ""), "video_url": l.get("video_url", ""), "resources": l.get("resources", []), "attachments": l.get("attachments", [])}
             for l in m["lessons"]]} for m in t["modules"]]
    return {"title": t["title"], "level": t.get("level", "Beginner"), "category": t.get("category", ""), "description": t.get("description", ""),
            "order": 50, "published": False, "modules": mods, "from_template": tid}


class SaveTemplateIn(BaseModel):
    path_id: str
    title: str = Field(min_length=3, max_length=120)
    description: str = Field(default="", max_length=600)


@router.post("/builder/templates")
async def save_template(body: SaveTemplateIn, user=Depends(admin_only)):
    p = await db.paths.find_one({"id": body.path_id}, NO_ID)
    if not p:
        raise HTTPException(404, "Path not found")
    t = {"id": f"tpl-{new_id()}", "title": body.title, "description": body.description or p.get("description", ""), "level": p.get("level"), "category": p.get("category"),
         "duration": None, "builtin": False, "created_by": user["email"], "created_at": now_iso(),
         "modules": [{"title": m["title"], "lessons": [{k: l.get(k) for k in ("title", "minutes", "content", "video_url", "resources", "attachments") if l.get(k) is not None} for l in m["lessons"]]} for m in p["modules"]]}
    await db.path_templates.insert_one(dict(t))
    await audit(user, "save path template", t["id"])
    return tpl_card(t)


@router.delete("/builder/templates/{tid}")
async def delete_template(tid: str, user=Depends(admin_only)):
    if any(x["id"] == tid for x in BUILTIN_TEMPLATES):
        raise HTTPException(400, "Built-in templates can't be deleted")
    r = await db.path_templates.delete_one({"id": tid})
    if not r.deleted_count:
        raise HTTPException(404, "Template not found")
    await audit(user, "delete path template", tid)
    return {"ok": True}


# ---------- Practice suggestions & AI lesson writer ----------
STOP = set("a an the and or of to in for on with from your you what how why is are it its by as at vs into using use day week · & - ( ) l1 l2 101 basics essentials fundamentals introduction review final next steps".split())
SYN = {"phishing": ["email", "phish", "bec"], "email": ["phishing"], "brute": ["password", "spray", "logon"], "spray": ["brute", "password"], "password": ["brute", "spray", "credential"],
       "kerberos": ["kerberoasting", "ticket"], "kerberoasting": ["kerberos"], "ransomware": ["encryption", "shadow"], "malware": ["endpoint", "edr", "beacon"],
       "endpoint": ["malware", "edr", "sysmon"], "powershell": ["script"], "dns": ["tunneling", "tunnel"], "tunneling": ["dns", "exfiltration"], "exfiltration": ["exfil", "data"],
       "web": ["shell", "sql", "iis"], "siem": ["splunk", "sentinel", "log", "spl", "kql"], "splunk": ["siem", "spl"], "sentinel": ["siem", "kql"], "logs": ["log", "event"],
       "cloud": ["azure", "m365", "microsoft", "entra"], "m365": ["microsoft", "cloud", "bec"], "lateral": ["movement", "psexec"], "privilege": ["admin", "escalation"],
       "incident": ["response", "ir"], "triage": ["alert", "verdict"], "intel": ["ioc", "threat"], "linux": ["ssh", "cron", "sudo"], "windows": ["event"], "hunting": ["hunt"], "c2": ["beacon", "beaconing"],
       "networking": ["network", "port", "firewall"], "network": ["networking", "port", "firewall"], "firewall": ["networking", "port"], "proxy": ["firewall", "beaconing"],
       "tiers": ["escalation", "triage"], "escalating": ["escalation"], "escalation": ["triage"], "ticketing": ["ticket", "triage"], "lifecycle": ["triage", "ticketing"],
       "positive": ["triage", "detections"], "reporting": ["ticketing", "report"], "handover": ["escalation", "ticketing"], "shift": ["handover", "escalation"],
       "detections": ["detection", "detections"], "detection": ["detections"], "mitre": ["att", "foundations"], "cia": ["triad", "foundations"], "quiz": ["exam", "essentials"],
       "sysmon": ["process", "edr"], "edr": ["process"], "scenario": ["lab"],
       "url": ["phishing", "link"], "attachment": ["phishing", "macro", "invoice"], "hypothesis": ["hunting", "beaconing"], "picerl": ["incident", "response", "ransomware"]}


def words(s):
    ws = {w for w in re.findall(r"[a-z0-9]+", (s or "").lower()) if len(w) > 2 and w not in STOP}
    return ws | {x for w in ws for x in SYN.get(w, [])}


class SuggestIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(default="", max_length=20000)


@router.post("/builder/suggest")
async def suggest_practice(body: SuggestIn, user=Depends(staff)):
    q = words(body.title) | words(body.content[:400])
    if not q:
        return []
    pools = {"lab": [(l, f"{l['title']} {l.get('category', '')} {l.get('description', '')}") for l in await db.labs.find({}, {"_id": 0, "id": 1, "title": 1, "category": 1, "description": 1}).to_list(200)],
             "quiz": [(x, x["title"]) for x in await db.quizzes.find({}, {"_id": 0, "id": 1, "title": 1}).to_list(200)],
             "challenge": [(c, f"{c['title']} {c.get('category', '')}") for c in await db.challenges.find({}, {"_id": 0, "id": 1, "title": 1, "category": 1}).to_list(500)],
             "sop": [(s, f"{s['title']} {s['category']} {' '.join(s['triggers'])}") for s in await all_sops()]}
    out = []
    for typ, items in pools.items():
        scored = []
        for it, text in items:
            tw, title_w = words(text), words(it["title"])
            score = 2 * len(q & title_w) + len(q & (tw - title_w))
            if score >= 2:
                scored.append((score, it))
        scored.sort(key=lambda x: -x[0])
        out += [{"type": typ, "id": it["id"], "title": it["title"], "score": sc} for sc, it in scored[:2]]
    return sorted(out, key=lambda x: -x["score"])[:6]


class WriteIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    path_title: str = Field(default="", max_length=200)
    module_title: str = Field(default="", max_length=200)
    level: str = Field(default="Beginner", max_length=30)
    minutes: int = Field(default=15, ge=1, le=240)


WRITE_PROMPT = """Write the lesson "{title}" for the {level} learning path "{path}" (module: "{module}") on SOCProfessionals Academy, a training platform for SOC analysts.
Target reading/working time: about {minutes} minutes.
Format: plain text only (no markdown headings, no ** or #). Use short paragraphs, and lines starting with "- " for bullet lists. Use UPPERCASE short labels on their own line for sections.
Include: a 1-2 sentence intro, the core concepts explained simply, a concrete real-world SOC example (log lines, Event IDs, commands or SPL/KQL where relevant), common mistakes analysts make, and a "KEY TAKEAWAYS" list of 3-5 bullets.
Keep it between 600 and 900 words. Be accurate and practical. Do not mention that you are an AI."""
JOBS = set()


async def run_write_job(job_id, body: WriteIn):
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"lesson-{job_id}",
                   system_message="You are a senior SOC analyst and instructional designer who writes clear, practical cybersecurity lessons.").with_model("anthropic", "claude-sonnet-5-5")
    try:
        text = await chat.send_message(UserMessage(text=WRITE_PROMPT.format(title=body.title, level=body.level, path=body.path_title or "SOC Analyst",
                                                                             module=body.module_title or "General", minutes=body.minutes)))
        text = re.sub(r"^#+\s*", "", re.sub(r"\*\*(.+?)\*\*", r"\1", text.strip()), flags=re.M)
        await db.lesson_jobs.update_one({"id": job_id}, {"$set": {"status": "done", "content": text, "done_at": now_iso()}})
    except Exception as e:
        await db.lesson_jobs.update_one({"id": job_id}, {"$set": {"status": "error", "error": f"The lesson writer is unavailable right now: {str(e)[:120]}"}})


@router.post("/builder/write-lesson")
async def write_lesson(body: WriteIn, user=Depends(staff)):
    job_id = new_id()
    await db.lesson_jobs.insert_one({"id": job_id, "user_id": user["id"], "title": body.title, "status": "running", "created_at": now_iso()})
    t = asyncio.create_task(run_write_job(job_id, body))
    JOBS.add(t)
    t.add_done_callback(JOBS.discard)
    await audit(user, "ai write lesson", body.title[:80])
    return {"job_id": job_id, "status": "running"}


class QuizGenIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(min_length=150, max_length=20000)
    level: str = Field(default="Beginner", max_length=30)


QUIZ_PROMPT = """Create a 5-question multiple-choice quiz that checks understanding of this {level} SOC analyst lesson.
Rules: exactly 5 questions, each with exactly 4 short options and one correct answer; base every question only on the lesson text; mix recall and applied "what would you do" questions;
plausible distractors; a one-sentence explanation of why the answer is correct. Vary the position of the correct answer.
Return ONLY JSON, no prose, in this shape: {{"questions": [{{"text": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "..."}}]}}

LESSON TITLE: {title}
LESSON CONTENT:
{content}"""


def parse_quiz(text):
    m = re.search(r"\{.*\}", text, re.S)
    qs = json.loads(m.group(0))["questions"] if m else []
    out = [{"id": f"lq-{new_id()[:7]}", "text": str(q["text"]).strip(), "options": [str(o).strip() for o in q["options"]][:4],
            "answer": int(q["answer"]), "explanation": str(q.get("explanation", "")).strip()} for q in qs[:5]]
    if len(out) != 5 or any(not q["text"] or len(set(q["options"])) != 4 or not all(q["options"]) or not 0 <= q["answer"] < 4 for q in out):
        raise ValueError("the AI returned an incomplete quiz — please try again")
    return out


async def run_quiz_job(job_id, body: QuizGenIn):
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"lquiz-{job_id}",
                   system_message="You are a senior SOC analyst who writes fair, accurate assessment questions. You always reply with valid JSON only.").with_model("anthropic", "claude-sonnet-5-5")
    try:
        text = await chat.send_message(UserMessage(text=QUIZ_PROMPT.format(title=body.title, level=body.level, content=body.content[:12000])))
        await db.lesson_jobs.update_one({"id": job_id}, {"$set": {"status": "done", "questions": parse_quiz(text), "done_at": now_iso()}})
    except Exception as e:
        await db.lesson_jobs.update_one({"id": job_id}, {"$set": {"status": "error", "error": f"The quiz generator is unavailable right now: {str(e)[:120]}"}})


@router.post("/builder/lesson-quiz")
async def lesson_quiz(body: QuizGenIn, user=Depends(staff)):
    job_id = new_id()
    await db.lesson_jobs.insert_one({"id": job_id, "user_id": user["id"], "kind": "quiz", "title": body.title, "status": "running", "created_at": now_iso()})
    t = asyncio.create_task(run_quiz_job(job_id, body))
    JOBS.add(t)
    t.add_done_callback(JOBS.discard)
    await audit(user, "ai lesson quiz", body.title[:80])
    return {"job_id": job_id, "status": "running"}


class CtfGenIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(default="", max_length=20000)
    level: str = Field(default="Beginner", max_length=30)


CTF_CATS = ["Log Analysis", "Forensics", "Network", "Malware", "Web"]
CTF_PROMPT = """Design one jeopardy-style CTF challenge for SOC analysts ({level} level) that practises the lesson "{title}".
The description must contain a realistic artifact the player analyses (log lines, a command, headers, a decoded payload, packet notes...) and end with one clear question.
The answer (flag) is a short exact plain value such as an IP, port, Event ID, filename or one lowercase word. Never wrap it in a flag format like SOCF{{}} or FLAG{{}} and never mention a flag format.
Return ONLY JSON in this shape: {{"category": one of {cats}, "title": "short catchy title", "points": 100 or 150 or 200, "flag": "...", "description": "...", "hints": [{{"text": "...", "cost": 20}}, {{"text": "...", "cost": 40}}]}}

LESSON CONTENT (may be empty):
{content}"""


def parse_ctf(text):
    m = re.search(r"\{.*\}", text, re.S)
    d = json.loads(m.group(0)) if m else {}
    flag = re.sub(r"^\s*[A-Za-z]+\{(.*)\}\s*$", r"\1", str(d.get("flag", ""))).strip()
    out = {"category": d.get("category") if d.get("category") in CTF_CATS else "Log Analysis", "title": str(d.get("title", "")).strip()[:80],
           "points": int(d.get("points", 100)) if int(d.get("points", 100)) in (100, 150, 200) else 100, "flag": flag,
           "description": str(d.get("description", "")).strip(), "hints": [{"text": str(h["text"]).strip(), "cost": int(h.get("cost", 20))} for h in d.get("hints", [])[:3] if h.get("text")]}
    if not (out["title"] and out["flag"] and out["description"]):
        raise ValueError("the AI returned an incomplete challenge — please try again")
    return out


async def run_ctf_job(job_id, body: CtfGenIn):
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"lctf-{job_id}",
                   system_message="You are a senior SOC analyst who designs accurate, solvable CTF challenges. You always reply with valid JSON only.").with_model("anthropic", "claude-sonnet-5-5")
    try:
        text = await chat.send_message(UserMessage(text=CTF_PROMPT.format(title=body.title, level=body.level, cats=json.dumps(CTF_CATS), content=body.content[:8000])))
        await db.lesson_jobs.update_one({"id": job_id}, {"$set": {"status": "done", "ctf": parse_ctf(text), "done_at": now_iso()}})
    except Exception as e:
        await db.lesson_jobs.update_one({"id": job_id}, {"$set": {"status": "error", "error": f"The CTF writer is unavailable right now: {str(e)[:120]}"}})


@router.post("/builder/ctf-draft")
async def ctf_draft(body: CtfGenIn, user=Depends(staff)):
    job_id = new_id()
    await db.lesson_jobs.insert_one({"id": job_id, "user_id": user["id"], "kind": "ctf", "title": body.title, "status": "running", "created_at": now_iso()})
    t = asyncio.create_task(run_ctf_job(job_id, body))
    JOBS.add(t)
    t.add_done_callback(JOBS.discard)
    await audit(user, "ai ctf draft", body.title[:80])
    return {"job_id": job_id, "status": "running"}


@router.get("/builder/write-lesson/{job_id}")
@router.get("/builder/jobs/{job_id}")
async def write_lesson_status(job_id: str, user=Depends(staff)):
    j = await db.lesson_jobs.find_one({"id": job_id, "user_id": user["id"]}, {"_id": 0, "status": 1, "content": 1, "questions": 1, "ctf": 1, "error": 1})
    if not j:
        raise HTTPException(404, "Job not found")
    return j


# ---------- Path builder assets ----------
@router.get("/builder/assets")
async def path_assets(user=Depends(staff)):
    async def pick(coll, f=None):
        return await db[coll].find(f or {}, {"_id": 0, "id": 1, "title": 1}).sort("title", 1).to_list(500)
    return {"quiz": await pick("quizzes"), "lab": await pick("labs"), "challenge": await pick("challenges"), "ctf": await pick("ctfs"),
            "course": await db.courses.find({"active": True}, {"_id": 0, "id": 1, "title": 1, "url": 1}).sort("order", 1).to_list(200),
            "sop": [{"id": s["id"], "title": s["title"]} for s in await all_sops()]}
