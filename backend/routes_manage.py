import asyncio
import os
import uuid
from collections import Counter, defaultdict
from datetime import timedelta
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from core import db, now, now_iso, new_id, get_current_user, staff, admin_only, audit, rank_for

from toolkit import _cache as toolkit_cache
router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}
BG_TASKS = set()

KINDS = {"paths": ("paths", staff), "quizzes": ("quizzes", staff), "ctfs": ("ctfs", staff), "labs": ("labs", staff),
         "sessions": ("sessions", staff), "challenges": ("challenges", staff),
         "categories": ("categories", admin_only), "announcements": ("announcements", admin_only)}


def kind_dep(kind):
    if kind not in KINDS:
        raise HTTPException(404, "Unknown content type")
    return KINDS[kind]


async def guard(kind: str, user=Depends(get_current_user)):
    col, dep = kind_dep(kind)
    allowed = ("admin",) if dep is admin_only else ("instructor", "admin")
    if user["role"] not in allowed:
        raise HTTPException(403, "Insufficient permissions")
    return col, user


# ---------- Generic content CRUD (instructor/admin) ----------
REQUIRED = {"paths": ["title", "description", "level", "modules"], "quizzes": ["title", "questions"], "ctfs": ["title", "category", "points", "flag", "description", "hints"],
            "labs": ["title", "description", "difficulty", "tasks", "kali"], "sessions": ["title", "start", "join_link", "capacity", "instructor"],
            "challenges": ["title", "category", "severity", "points", "verdict", "alert", "evidence", "keywords"], "categories": ["name"], "announcements": ["title"]}


def validate(col, doc):
    missing = [k for k in REQUIRED[col] if doc.get(k) in (None, "")]
    if missing:
        raise HTTPException(422, f"Missing required fields: {', '.join(missing)}")
    try:
        if col == "paths":
            for m in doc["modules"]:
                m.setdefault("id", new_id())
                for l in m["lessons"]:
                    assert l.get("id") and l.get("title")
                    l.setdefault("content", ""); l.setdefault("video_url", ""); l.setdefault("resources", []); l.setdefault("minutes", 10)
                    assert not (l.get("quiz") or {}).get("required") or len(l["quiz"].get("questions") or []) >= 1
                    for q in (l.get("quiz") or {}).get("questions", []):
                        assert q["text"].strip() and len(q["options"]) == 4 and all(o.strip() for o in q["options"]) and 0 <= int(q["answer"]) < 4
        if col == "quizzes":
            doc.setdefault("pass_mark", 70); doc.setdefault("time_limit_sec", 0); doc.setdefault("topic", "General")
            for q in doc["questions"]:
                assert q.get("id") and q.get("text") and q["type"] in ("mcq", "multi", "tf") and q["options"] and q["answer"]
                q.setdefault("topic", doc["topic"]); q.setdefault("explanation", "")
        if col == "labs":
            for t in doc["tasks"]:
                assert t.get("id") and t.get("question") and t.get("answer")
        if col == "ctfs":
            for h in doc["hints"]:
                assert "text" in h and int(h["cost"]) >= 0
    except (AssertionError, KeyError, TypeError, ValueError):
        raise HTTPException(422, f"Invalid {col} structure: check modules/lessons, questions, tasks or hints")


@router.get("/manage/{kind}")
async def m_list(g=Depends(guard)):
    col, _ = g
    return await db[col].find({}, NO_ID).to_list(500)


@router.post("/manage/{kind}")
async def m_create(doc: dict, g=Depends(guard)):
    col, user = g
    doc.pop("_id", None)
    validate(col, doc)
    doc["id"] = doc.get("id") or new_id()
    if await db[col].find_one({"id": doc["id"]}):
        raise HTTPException(400, "ID already exists")
    doc.setdefault("published", True)
    doc["created_by"] = user["email"]
    await db[col].insert_one(dict(doc))
    await audit(user, f"create {col}", doc["id"])
    if col in ("challenges", "labs"):
        toolkit_cache["at"] = 0
    return doc


@router.put("/manage/{kind}/{iid}")
async def m_update(iid: str, doc: dict, g=Depends(guard)):
    col, user = g
    doc.pop("_id", None)
    validate(col, doc)
    doc["id"] = iid
    r = await db[col].replace_one({"id": iid}, dict(doc))
    if not r.matched_count:
        raise HTTPException(404, "Not found")
    await audit(user, f"update {col}", iid)
    if col in ("challenges", "labs"):
        toolkit_cache["at"] = 0
    return doc


@router.delete("/manage/{kind}/{iid}")
async def m_delete(iid: str, g=Depends(guard)):
    col, user = g
    await db[col].delete_one({"id": iid})
    await audit(user, f"delete {col}", iid)
    if col in ("challenges", "labs"):
        toolkit_cache["at"] = 0
    return {"ok": True}


# ---------- Instructor views ----------
@router.get("/instructor/students")
async def students(user=Depends(staff)):
    us = await db.users.find({"role": "student"}, {"_id": 0, "password_hash": 0}).to_list(1000)
    paths = await db.paths.find({}, NO_ID).to_list(100)
    total = sum(len([l for m in p["modules"] for l in m["lessons"]]) for p in paths) or 1
    out = []
    for u in us:
        done = await db.lesson_progress.count_documents({"user_id": u["id"]})
        att = await db.quiz_attempts.find({"user_id": u["id"]}, {"_id": 0, "score": 1}).to_list(500)
        out.append({**u, "rank": rank_for(u.get("xp", 0)), "completion": round(100 * done / total), "quiz_avg": round(sum(a["score"] for a in att) / len(att)) if att else None,
                    "certs": await db.certificates.count_documents({"user_id": u["id"]})})
    return out


@router.get("/instructor/quiz-analytics")
async def quiz_analytics(user=Depends(staff)):
    agg = defaultdict(lambda: {"attempts": 0, "sum": 0, "passed": 0})
    for a in await db.quiz_attempts.find({}, NO_ID).to_list(10000):
        g = agg[a["quiz_title"]]
        g["attempts"] += 1
        g["sum"] += a["score"]
        g["passed"] += a["passed"]
    return [{"quiz": k, "attempts": v["attempts"], "avg": round(v["sum"] / v["attempts"]), "pass_rate": round(100 * v["passed"] / v["attempts"])} for k, v in agg.items()]


@router.get("/instructor/submissions")
async def submissions(user=Depends(staff)):
    subs = await db.challenge_submissions.find({}, NO_ID).sort("created_at", -1).to_list(500)
    reports = await db.lab_progress.find({"report_submitted": True}, NO_ID).to_list(500)
    return {"challenges": subs, "lab_reports": reports}


class GradeIn(BaseModel):
    grade: int = Field(ge=0, le=100)
    feedback: str = Field(default="", max_length=2000)


@router.get("/instructor/sessions/{sid}/attendees")
async def attendees(sid: str, user=Depends(staff)):
    return await db.rsvps.find({"session_id": sid}, NO_ID).to_list(1000)


class AttendIn(BaseModel):
    user_id: str
    attended: bool


@router.post("/instructor/sessions/{sid}/attendance")
async def attendance(sid: str, body: AttendIn, user=Depends(staff)):
    await db.rsvps.update_one({"session_id": sid, "user_id": body.user_id}, {"$set": {"attended": body.attended}})
    return {"ok": True}


# ---------- Admin ----------
@router.get("/admin/users")
async def users(user=Depends(admin_only)):
    return await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(2000)


class UserUpdate(BaseModel):
    role: str | None = Field(default=None, pattern="^(student|instructor|admin)$")
    status: str | None = Field(default=None, pattern="^(active|suspended)$")


@router.patch("/admin/users/{uid}")
async def update_user(uid: str, body: UserUpdate, user=Depends(admin_only)):
    if uid == user["id"]:
        raise HTTPException(400, "You cannot change your own role or status")
    upd = {k: v for k, v in body.model_dump().items() if v}
    r = await db.users.update_one({"id": uid}, {"$set": upd})
    if not r.matched_count:
        raise HTTPException(404, "User not found")
    await audit(user, f"update user {upd}", uid)
    return {"ok": True}


@router.get("/admin/analytics")
async def admin_analytics(user=Depends(admin_only)):
    us = await db.users.find({}, {"_id": 0, "created_at": 1, "last_active": 1, "role": 1, "plan": 1}).to_list(5000)
    days = [(now().date() - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    signups = Counter(u["created_at"][:10] for u in us)
    att = await db.quiz_attempts.find({}, {"_id": 0, "score": 1, "quiz_title": 1}).to_list(10000)
    pays = await db.payments.find({"status": "paid"}, NO_ID).to_list(5000)
    rev = Counter(p["created_at"][:10] for p in pays for _ in range(1))
    rev_amt = defaultdict(int)
    for p in pays:
        rev_amt[p["created_at"][:10]] += p["amount"]
    week = (now().date() - timedelta(days=7)).isoformat()
    return {"total_users": len(us), "active_7d": len([u for u in us if (u.get("last_active") or "") >= week]),
            "roles": dict(Counter(u["role"] for u in us)), "pro_users": len([u for u in us if u.get("plan") == "pro"]),
            "completions": await db.certificates.count_documents({}), "quiz_avg": round(sum(a["score"] for a in att) / len(att)) if att else 0,
            "quiz_attempts": len(att), "revenue_total": sum(p["amount"] for p in pays), "payments": len(pays),
            "series": [{"day": d[5:], "signups": signups.get(d, 0), "revenue": rev_amt.get(d, 0) + (0 if rev.get(d) else 0)} for d in days]}


@router.get("/admin/certificates")
async def certs(user=Depends(admin_only)):
    return await db.certificates.find({}, NO_ID).sort("issued_at", -1).to_list(2000)


class CertStatus(BaseModel):
    status: str = Field(pattern="^(valid|revoked)$")


@router.patch("/admin/certificates/{cid}")
async def cert_status(cid: str, body: CertStatus, user=Depends(admin_only)):
    await db.certificates.update_one({"id": cid}, {"$set": {"status": body.status}})
    await audit(user, f"certificate {body.status}", cid)
    return {"ok": True}


@router.get("/admin/audit-logs")
async def logs(user=Depends(admin_only)):
    return await db.audit_logs.find({}, NO_ID).sort("created_at", -1).to_list(300)


@router.get("/admin/settings")
async def get_settings(user=Depends(admin_only)):
    s = await db.settings.find_one({"id": "platform"}, NO_ID)
    return s or {"id": "platform", "platform_name": "SOCProfessionals Academy", "allow_signups": True, "pass_mark": 70, "support_email": "support@socprofessionals.academy"}


@router.put("/admin/settings")
async def put_settings(body: dict, user=Depends(admin_only)):
    body.pop("_id", None)
    body["id"] = "platform"
    await db.settings.replace_one({"id": "platform"}, dict(body), upsert=True)
    await audit(user, "update settings")
    return body


# ---------- Payments (Razorpay / Cashfree) ----------
PLANS = {"pro_monthly": {"name": "Pro Monthly", "amount": 999}, "pro_yearly": {"name": "Pro Yearly", "amount": 7999}}
PRODUCTS = {"soc-interview-ebook": {"name": "SOC Interview Preparation - Ebook", "amount": 973, "return": "/book"},
            "sop-bundle": {"name": "SOC SOP Library - Full Access", "amount": 499, "return": "/sops"}}


def item_for(key):
    item = PLANS.get(key) or PRODUCTS.get(key)
    if not item:
        raise HTTPException(400, "Invalid plan")
    return item


class PlanIn(BaseModel):
    plan: str
    phone: str = Field(default="9999999999", pattern=r"^\d{10}$")


def rzp():
    import razorpay
    if not os.environ.get("RAZORPAY_KEY_ID") or not os.environ.get("RAZORPAY_KEY_SECRET"):
        raise HTTPException(503, "Razorpay is not configured yet")
    return razorpay.Client(auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"]))


@router.get("/payments/config")
async def pay_config():
    return {"plans": PLANS, "razorpay": bool(os.environ.get("RAZORPAY_KEY_ID") and os.environ.get("RAZORPAY_KEY_SECRET")),
            "cashfree": bool(os.environ.get("CASHFREE_CLIENT_ID") and os.environ.get("CASHFREE_CLIENT_SECRET")),
            "cashfree_mode": "production" if "api.cashfree.com" in os.environ.get("CASHFREE_BASE_URL", "") else "sandbox"}


async def activate(user_id, pid):
    p = await db.payments.find_one_and_update({"id": pid, "status": {"$ne": "paid"}}, {"$set": {"status": "paid", "paid_at": now_iso()}}, projection=NO_ID)
    if p:
        if p["plan"] in PRODUCTS:
            await db.purchases.update_one({"user_id": user_id, "product_id": p["plan"]},
                                          {"$setOnInsert": {"user_id": user_id, "product_id": p["plan"], "payment_id": pid, "at": now_iso()}}, upsert=True)
            from routes_book import send_book_receipt
            from routes_sop import send_sop_receipt
            t = asyncio.create_task((send_sop_receipt if p["plan"] == "sop-bundle" else send_book_receipt)(user_id, p))
            BG_TASKS.add(t)
            t.add_done_callback(BG_TASKS.discard)
        else:
            await db.users.update_one({"id": user_id}, {"$set": {"plan": "pro", "plan_name": p["plan_name"]}})


@router.post("/payments/razorpay/order")
async def rzp_order(body: PlanIn, user=Depends(get_current_user)):
    plan = item_for(body.plan)
    o = rzp().order.create({"amount": plan["amount"] * 100, "currency": "INR", "receipt": f"rcpt_{new_id()}", "payment_capture": 1})
    await db.payments.insert_one({"id": o["id"], "provider": "razorpay", "user_id": user["id"], "plan": body.plan, "plan_name": plan["name"],
                                  "amount": plan["amount"], "status": "created", "created_at": now_iso()})
    return {"order_id": o["id"], "amount": o["amount"], "key_id": os.environ["RAZORPAY_KEY_ID"], "name": user["name"], "email": user["email"]}


class RzpVerify(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/payments/razorpay/verify")
async def rzp_verify(body: RzpVerify, user=Depends(get_current_user)):
    try:
        rzp().utility.verify_payment_signature(body.model_dump())
    except Exception:
        raise HTTPException(400, "Payment signature verification failed")
    p = await db.payments.find_one({"id": body.razorpay_order_id, "user_id": user["id"]}, NO_ID)
    if not p:
        raise HTTPException(404, "Order not found")
    await activate(user["id"], body.razorpay_order_id)
    return {"ok": True, "plan": p["plan"]}


def cf_headers(idem=None):
    h = {"Content-Type": "application/json", "x-client-id": os.environ.get("CASHFREE_CLIENT_ID", ""), "x-client-secret": os.environ.get("CASHFREE_CLIENT_SECRET", ""),
         "x-api-version": "2025-01-01", "x-request-id": str(uuid.uuid4())}
    if idem:
        h["x-idempotency-key"] = idem
    return h


def cf_base():
    if not os.environ.get("CASHFREE_CLIENT_ID"):
        raise HTTPException(503, "Cashfree is not configured yet")
    return os.environ.get("CASHFREE_BASE_URL") or "https://sandbox.cashfree.com/pg"


@router.post("/payments/cashfree/order")
async def cf_order(body: PlanIn, user=Depends(get_current_user)):
    plan = item_for(body.plan)
    base = cf_base()
    oid = f"order_{uuid.uuid4().hex[:20]}"
    payload = {"order_id": oid, "order_amount": float(plan["amount"]), "order_currency": "INR",
               "customer_details": {"customer_id": user["id"], "customer_name": user["name"], "customer_email": user["email"], "customer_phone": body.phone},
               "order_meta": {"return_url": f"{os.environ['FRONTEND_URL']}{plan.get('return', '/app/billing')}?cf_order={oid}"}}
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.post(f"{base}/orders", headers=cf_headers(oid), json=payload)
    if r.status_code >= 400:
        raise HTTPException(502, "Cashfree order creation failed")
    await db.payments.insert_one({"id": oid, "provider": "cashfree", "user_id": user["id"], "plan": body.plan, "plan_name": plan["name"],
                                  "amount": plan["amount"], "status": "created", "created_at": now_iso()})
    return {"order_id": oid, "payment_session_id": r.json()["payment_session_id"]}


@router.get("/payments/cashfree/{oid}")
async def cf_status(oid: str, user=Depends(get_current_user)):
    p = await db.payments.find_one({"id": oid, "user_id": user["id"]}, NO_ID)
    if not p:
        raise HTTPException(404, "Order not found")
    async with httpx.AsyncClient(timeout=15) as c:
        r = await c.get(f"{cf_base()}/orders/{oid}", headers=cf_headers())
    status = r.json().get("order_status") if r.status_code < 400 else "UNKNOWN"
    if status == "PAID":
        await activate(user["id"], oid)
    return {"status": status}


@router.get("/payments/mine")
async def my_payments(user=Depends(get_current_user)):
    return await db.payments.find({"user_id": user["id"]}, NO_ID).sort("created_at", -1).to_list(100)
