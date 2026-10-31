import os
import re
import secrets
from collections import Counter, defaultdict
from datetime import timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from core import db, now, now_iso, new_id, hash_password, admin_only, staff, audit, send_email, email_template, rank_for
from sop_data import SOPS

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")
GRANTS = {"sop": "sop-bundle", "book": "soc-interview-ebook"}
USER_COLLECTIONS = ["lesson_progress", "quiz_attempts", "lab_progress", "challenge_submissions", "challenge_hints", "drill_submissions", "drill_practice", "drill_freezes",
                    "drill_rescue", "ctf_solves", "ctf_hints", "activity", "certificates", "course_completions", "course_bonus", "course_alerts", "rsvps", "saved_searches",
                    "purchases", "interviews", "digest_sends", "rank_emails", "password_reset_tokens", "cases"]


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


# ---------- Path builder assets ----------
@router.get("/builder/assets")
async def path_assets(user=Depends(staff)):
    async def pick(coll, f=None):
        return await db[coll].find(f or {}, {"_id": 0, "id": 1, "title": 1}).sort("title", 1).to_list(500)
    return {"quiz": await pick("quizzes"), "lab": await pick("labs"), "challenge": await pick("challenges"), "ctf": await pick("ctfs"),
            "course": await db.courses.find({"active": True}, {"_id": 0, "id": 1, "title": 1, "url": 1}).sort("order", 1).to_list(200),
            "sop": [{"id": s["id"], "title": s["title"]} for s in SOPS]}
