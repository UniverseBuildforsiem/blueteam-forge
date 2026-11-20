import base64
from urllib.parse import quote
from pymongo.errors import DuplicateKeyError
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool
from core import db, get_current_user, now_iso, award  # noqa: F401
from routes_academy import maybe_user, pricing
import exam_engine as E

router = APIRouter(prefix="/api")
NO_ID = E.NO_ID


async def published(eid, user=None):
    e = await db.exams.find_one({"id": eid}, {"_id": 0})
    if not e or (e.get("status") != "published" and not (user and user["role"] == "admin")):
        raise HTTPException(404, "Test not found")
    return e


async def owns(user, e):
    if not user:
        return False
    if user["role"] == "admin":
        return True
    q = {"user_id": user["id"]}
    return bool(await db.purchases.find_one({**q, "product_id": f"test:{e['id']}"}) or await db.exam_enrollments.find_one({**q, "exam_id": e["id"]}))


async def rating(eid):
    rows = await db.exam_reviews.find({"exam_id": eid}, {"_id": 0, "rating": 1}).to_list(5000)
    return {"rating": round(sum(r["rating"] for r in rows) / len(rows), 1) if rows else None, "reviews_count": len(rows)}


async def q_count(e):
    sel = e.get("selection") or {}
    if sel.get("mode") == "fixed":
        return len(await E.latest(sel.get("ids") or []))
    return sum(int(d.get("count") or 0) for d in sel.get("domains") or [])


async def card(e, user):
    return {k: e.get(k) for k in ("id", "title", "subtitle", "vendor", "topic", "level", "cover", "kind", "duration_min", "pass_mark", "updated_at", "code")} | pricing(e) | await rating(e["id"]) | {
        "questions": await q_count(e), "owned": await owns(user, e), "attempts_max": e.get("attempts_max") if e.get("kind") == "certification" else None}


@router.get("/public/exams")
async def list_exams(request: Request):
    user = await maybe_user(request)
    return [await card(e, user) for e in await db.exams.find({"status": "published"}, NO_ID).sort("published_at", -1).to_list(300)]


async def status_for(e, user):
    if not user:
        return None
    prog = await db.exam_attempts.find({"exam_id": e["id"], "user_id": user["id"], "status": "in_progress"}, {"_id": 0, "id": 1, "mode": 1, "deadline": 1, "started_at": 1}).to_list(10)
    cert = await db.academy_certs.find_one({"user_id": user["id"], "course_id": f"exam:{e['id']}"}, {"_id": 0})
    used = await E.cert_count(e, user["id"])
    return {"in_progress": prog, "cert_attempts_used": used, "cert_attempts_left": max(0, int(e.get("attempts_max") or 3) - used) if e.get("kind") == "certification" else None,
            "cooldown_until": await E.cooldown_until(e, user["id"]) if e.get("kind") == "certification" else None, "certificate": cert,
            "attempts": await db.exam_attempts.count_documents({"exam_id": e["id"], "user_id": user["id"], "status": "submitted"})}


@router.get("/public/exams/{eid}")
async def landing(eid: str, request: Request):
    user = await maybe_user(request)
    e = await published(eid, user)
    sm = await E.latest(e.get("sample_qids") or [])
    samples = [E.public_q(sm[i], True) for i in e.get("sample_qids") or [] if i in sm][:3]
    sc = await E.scenarios_for(list(sm.values()))
    reviews = await db.exam_reviews.find({"exam_id": eid}, {"_id": 0, "user_id": 0}).sort("at", -1).to_list(50)
    mine = await db.exam_reviews.find_one({"exam_id": eid, "user_id": user["id"]}, {"_id": 0, "user_id": 0}) if user else None
    students = len(set(await db.exam_attempts.distinct("user_id", {"exam_id": eid})) | set(await db.purchases.distinct("user_id", {"product_id": f"test:{eid}"})))
    keys = ("id", "title", "subtitle", "description", "vendor", "topic", "level", "cover", "code", "kind", "duration_min", "pass_mark", "attempts_max", "cooldown_hours", "identity",
            "practice_enabled", "strict_mode", "outcomes", "requirements", "audience", "faqs", "domains", "related", "status", "updated_at", "published_at")
    return {**{k: e.get(k) for k in keys}, **pricing(e), **await rating(eid), "questions": await q_count(e), "samples": samples, "sample_scenarios": sc, "reviews": reviews,
            "my_review": mine, "students": students, "signed_in": bool(user), "owned": await owns(user, e), "me": await status_for(e, user),
            "can_review": bool(user and await db.exam_attempts.find_one({"exam_id": eid, "user_id": user["id"], "status": "submitted"}))}


@router.post("/exams/{eid}/enroll")
async def enroll(eid: str, user=Depends(get_current_user)):
    e = await published(eid)
    if pricing(e)["price"]:
        raise HTTPException(402, "This is a paid test — buy it to start")
    await db.exam_enrollments.update_one({"user_id": user["id"], "exam_id": eid}, {"$setOnInsert": {"at": now_iso()}}, upsert=True)
    return {"ok": True}


@router.get("/me/exams")
async def my_exams(user=Depends(get_current_user)):
    ids = set(await db.exam_enrollments.distinct("exam_id", {"user_id": user["id"]})) | set(await db.exam_attempts.distinct("exam_id", {"user_id": user["id"]}))
    ids |= {p[5:] for p in await db.purchases.distinct("product_id", {"user_id": user["id"], "product_id": {"$regex": "^test:"}})}
    out = []
    for e in await db.exams.find({"id": {"$in": list(ids)}, "status": "published"}, NO_ID).to_list(200):
        last = await db.exam_attempts.find_one({"exam_id": e["id"], "user_id": user["id"], "status": "submitted"}, {"_id": 0, "percent": 1, "passed": 1, "submitted_at": 1}, sort=[("submitted_at", -1)])
        out.append({**await card(e, user), "last": last})
    return out


class StartIn(BaseModel):
    mode: str = Field(pattern="^(practice|exam|certification)$")
    timed: bool = False
    domain: Optional[str] = Field(default=None, max_length=80)
    name: Optional[str] = Field(default=None, max_length=80)
    agree: bool = False
    photo: Optional[str] = Field(default=None, max_length=900_000)


async def save_photo(aid, data_url):
    from series_cover import _put
    raw = base64.b64decode(data_url.split(",", 1)[-1])
    if len(raw) < 2000:
        raise HTTPException(400, "Webcam photo is empty — allow camera access and try again")
    return await run_in_threadpool(_put, f"socpro/exam-id/{aid}.jpg", raw, "image/jpeg")


@router.post("/exams/{eid}/start")
async def start(eid: str, body: StartIn, user=Depends(get_current_user)):
    e = await published(eid, user)
    if not await owns(user, e):
        raise HTTPException(403, "Enroll in or buy this test first")
    kind = e.get("kind") or "exam"
    allowed = (["practice"] if e.get("practice_enabled", True) or kind == "practice" else []) + ([kind] if kind != "practice" else [])
    if body.mode not in allowed:
        raise HTTPException(400, f"{body.mode.title()} mode isn't available for this test")
    cur = await db.exam_attempts.find_one({"exam_id": eid, "user_id": user["id"], "mode": body.mode, "status": "in_progress"}, NO_ID)
    if cur:
        cur = await E.maybe_expire(cur)
        if cur["status"] == "in_progress":
            return {"id": cur["id"], "resumed": True}
    identity = {"method": "account", "user_id": user["id"], "email": user["email"], "at": now_iso()}
    if body.mode == "certification":
        if await db.academy_certs.find_one({"user_id": user["id"], "course_id": f"exam:{eid}"}):
            raise HTTPException(400, "You've already passed this certification")
        if await E.cert_count(e, user["id"]) >= int(e.get("attempts_max") or 3):
            raise HTTPException(400, "No certification attempts left")
        cd = await E.cooldown_until(e, user["id"])
        if cd:
            raise HTTPException(400, f"Cooldown active until {cd[:16].replace('T', ' ')} UTC")
        method = e.get("identity") or "name"
        if method in ("name", "webcam"):
            if not body.agree or not (body.name or "").strip() or len(body.name.strip()) < 3:
                raise HTTPException(400, "Confirm your full legal name and accept the exam rules")
            identity |= {"method": method, "name": body.name.strip()}
        if method == "webcam" and not body.photo:
            raise HTTPException(400, "Take a webcam photo to verify your identity")
    try:
        att = await E.build_attempt(e, user, body.mode, body.timed, body.domain, identity)
    except DuplicateKeyError:
        cur = await db.exam_attempts.find_one({"exam_id": eid, "user_id": user["id"], "mode": body.mode, "status": "in_progress"}, {"_id": 0, "id": 1})
        return {"id": cur["id"], "resumed": True}
    if not att:
        raise HTTPException(400, "This test has no questions yet")
    if body.mode == "certification" and (e.get("identity") == "webcam"):
        try:
            path = await save_photo(att["id"], body.photo)
        except HTTPException:
            await db.exam_attempts.delete_one({"id": att["id"]})
            raise
        await db.exam_attempts.update_one({"id": att["id"]}, {"$set": {"identity.photo_path": path}})
    return {"id": att["id"], "resumed": False}


async def mine(aid, user):
    a = await db.exam_attempts.find_one({"id": aid, "user_id": user["id"]}, NO_ID)
    if not a:
        raise HTTPException(404, "Attempt not found")
    return await E.maybe_expire(a)


def view(a, e):
    done = a["status"] == "submitted"
    practice = a["mode"] == "practice"
    qs = []
    for q in a["questions"]:
        rev = done or (practice and q["qid"] in a["checked"])
        pq = E.public_q(q, rev)
        if practice and q["qid"] in a["hints"]:
            pq["hint"] = q.get("hint")
        if rev:
            pq["is_correct"] = E.is_right(q, a["answers"].get(q["qid"]))
        qs.append(pq)
    return {k: a.get(k) for k in ("id", "exam_id", "exam_title", "mode", "domain", "status", "number", "started_at", "deadline", "answers", "flags", "checked", "hints", "last_index",
                                  "score", "total", "percent", "passed", "pass_mark", "time_taken", "submitted_at", "certificate_id", "strict", "focus_count")} | {
        "questions": qs, "scenarios": a.get("scenarios") or {}, "server_now": E.now().isoformat(), "hints_allowed": practice, "kind": e.get("kind") if e else None}


@router.get("/exam-attempts/{aid}")
async def get_attempt(aid: str, user=Depends(get_current_user)):
    a = await mine(aid, user)
    return view(a, await db.exams.find_one({"id": a["exam_id"]}, NO_ID))


class AnswerIn(BaseModel):
    qid: str
    answer: list[str] = Field(default_factory=list, max_length=10)
    flagged: Optional[bool] = None
    check: bool = False
    index: int = 0


@router.put("/exam-attempts/{aid}/answer")
async def answer(aid: str, body: AnswerIn, user=Depends(get_current_user)):
    a = await mine(aid, user)
    if a["status"] != "in_progress":
        raise HTTPException(409, "This attempt was already submitted")
    q = next((x for x in a["questions"] if x["qid"] == body.qid), None)
    if not q:
        raise HTTPException(404, "Question not in this attempt")
    locked = body.qid in a["checked"]
    if locked and (body.check or body.flagged is None):
        raise HTTPException(409, "Answer already checked")
    ids = {o["id"] for o in q["options"]}
    ans = list(dict.fromkeys(x for x in body.answer if x in ids))[:q.get("choose") or 1]
    upd = {"last_index": body.index, "last_seen": now_iso(), **({} if locked else {f"answers.{body.qid}": ans})}
    ops = {"$set": upd}
    if body.flagged is not None:
        ops["$addToSet" if body.flagged else "$pull"] = {"flags": body.qid}
    if body.check:
        if a["mode"] != "practice":
            raise HTTPException(400, "Feedback is shown after you submit")
        ops.setdefault("$addToSet", {})["checked"] = body.qid
    await db.exam_attempts.update_one({"id": aid}, ops)
    out = {"ok": True, "saved_at": now_iso()}
    if body.check:
        out["question"] = {**E.public_q(q, True), "is_correct": E.is_right(q, ans)}
    return out


class FocusIn(BaseModel):
    event: str = Field(pattern="^(hidden|blur|fullscreen_exit)$")
    away_seconds: int = Field(default=0, ge=0, le=86400)
    question: int = Field(default=0, ge=0, le=1000)


@router.post("/exam-attempts/{aid}/focus")
async def focus(aid: str, body: FocusIn, user=Depends(get_current_user)):
    a = await mine(aid, user)
    if a["status"] != "in_progress" or not a.get("strict"):
        return {"ok": False, "focus_count": a.get("focus_count", 0)}
    ev = {**body.model_dump(), "at": now_iso()}
    await db.exam_attempts.update_one({"id": aid}, {"$push": {"focus_events": {"$each": [ev], "$slice": -300}}, "$inc": {"focus_count": 1, "away_seconds": body.away_seconds}})
    return {"ok": True, "focus_count": a.get("focus_count", 0) + 1}


@router.post("/exam-attempts/{aid}/hint/{qid}")
async def hint(aid: str, qid: str, user=Depends(get_current_user)):
    a = await mine(aid, user)
    if a["mode"] != "practice" or a["status"] != "in_progress":
        raise HTTPException(400, "Hints are only available during practice mode")
    q = next((x for x in a["questions"] if x["qid"] == qid), None)
    if not q:
        raise HTTPException(404, "Question not found")
    await db.exam_attempts.update_one({"id": aid}, {"$addToSet": {"hints": qid}})
    return {"hint": q.get("hint") or "No hint for this question."}


@router.post("/exam-attempts/{aid}/submit")
async def submit(aid: str, user=Depends(get_current_user)):
    a = await E.finish(await mine(aid, user))
    return {"id": a["id"], "percent": a["percent"], "passed": a["passed"]}


async def recommendations(a, e):
    doms = {d["name"]: d for d in (e or {}).get("domains") or []}
    out = []
    for d in a.get("domains") or []:
        if d["percent"] >= max(80, a["pass_mark"]):
            continue
        links = list(doms.get(d["domain"], {}).get("links") or [])
        seen = {x.get("link") for x in links}
        for q in a["questions"]:
            if q["domain"] == d["domain"] and q.get("ref_url") and q["ref_url"] not in seen and not E.is_right(q, a["answers"].get(q["qid"])):
                links.append({"title": q.get("ref_label") or "Related lecture / lab", "link": q["ref_url"]})
                seen.add(q["ref_url"])
        out.append({**d, "links": links[:5], "practice": f"/app/tests/{a['exam_id']}?practice={quote(d['domain'])}"})
    return out


@router.get("/exam-attempts/{aid}/result")
async def result(aid: str, user=Depends(get_current_user)):
    a = await mine(aid, user)
    if a["status"] != "submitted":
        raise HTTPException(409, "Submit the attempt to see results")
    e = await db.exams.find_one({"id": a["exam_id"]}, NO_ID)
    return {**view(a, e), "domains": a.get("domains"), "recommendations": await recommendations(a, e)}


@router.get("/me/exams/{eid}/dashboard")
async def dashboard(eid: str, user=Depends(get_current_user)):
    e = await published(eid, user)
    rows = await db.exam_attempts.find({"exam_id": eid, "user_id": user["id"], "status": "submitted"},
                                       {"_id": 0, "id": 1, "mode": 1, "number": 1, "percent": 1, "score": 1, "total": 1, "passed": 1, "time_taken": 1, "submitted_at": 1, "domains": 1, "domain": 1}).sort("submitted_at", 1).to_list(500)
    full = [r for r in rows if not r.get("domain")]
    graded = [r for r in full if r["mode"] != "practice"] or full
    recent = graded[-3:]
    avg = round(sum(r["percent"] for r in recent) / len(recent)) if recent else None
    agg = {}
    for r in full[-5:]:
        for d in r.get("domains") or []:
            x = agg.setdefault(d["domain"], {"domain": d["domain"], "correct": 0, "total": 0})
            x["correct"] += d["correct"]
            x["total"] += d["total"]
    for x in agg.values():
        x["percent"] = round(100 * x["correct"] / x["total"]) if x["total"] else 0
    pm = int(e.get("pass_mark") or 70)
    return {"attempts": [{k: v for k, v in r.items() if k != "domains"} for r in rows], "recent_average": avg, "readiness": E.readiness(avg, pm), "pass_mark": pm,
            "domains": sorted(agg.values(), key=lambda x: x["percent"]), "status": await status_for(e, user), "kind": e.get("kind"), "title": e["title"],
            "domain_names": [d["name"] for d in e.get("domains") or []], "practice_enabled": e.get("practice_enabled", True), "duration_min": e.get("duration_min"),
            "identity": e.get("identity"), "attempts_max": e.get("attempts_max"), "cooldown_hours": e.get("cooldown_hours")}


class ReviewBody(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: str = Field(default="", max_length=2000)


@router.post("/exams/{eid}/reviews")
async def post_review(eid: str, body: ReviewBody, user=Depends(get_current_user)):
    await published(eid)
    if not await db.exam_attempts.find_one({"exam_id": eid, "user_id": user["id"], "status": "submitted"}):
        raise HTTPException(400, "Finish at least one attempt before reviewing")
    doc = {"exam_id": eid, "user_id": user["id"], "name": user["name"], "rating": body.rating, "text": body.text.strip(), "at": now_iso()}
    await db.exam_reviews.update_one({"exam_id": eid, "user_id": user["id"]}, {"$set": doc}, upsert=True)
    return {"ok": True}


@router.get("/admin/exam-attempts/{aid}/photo")
async def photo(aid: str, user=Depends(get_current_user)):
    from series_cover import _get
    if user["role"] != "admin":
        raise HTTPException(403, "Admins only")
    a = await db.exam_attempts.find_one({"id": aid}, {"_id": 0, "identity": 1})
    path = ((a or {}).get("identity") or {}).get("photo_path")
    if not path:
        raise HTTPException(404, "No photo")
    return Response(await run_in_threadpool(_get, path), media_type="image/jpeg")
