import io
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel, Field
from core import db, now, now_iso, new_id, get_current_user, award, rank_for, send_email, email_template, frame_for, RANKS, FRAMES

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}


def lesson_ids(path):
    return [l["id"] for m in path["modules"] for l in m["lessons"]]


# ---------- Public ----------
@router.get("/public/paths")
async def public_paths():
    paths = await db.paths.find({"published": True}, NO_ID).sort("order", 1).to_list(100)
    return [{"id": p["id"], "title": p["title"], "description": p["description"], "level": p["level"], "category": p.get("category"),
             "modules": [m["title"] for m in p["modules"]], "lesson_count": len(lesson_ids(p))} for p in paths]


@router.get("/public/paths/{pid}/outline")
async def path_outline(pid: str):
    p = await db.paths.find_one({"id": pid, "published": True}, NO_ID)
    if not p:
        raise HTTPException(404, "Path not found")
    mods = [{"title": m["title"], "lessons": [{"title": l["title"], "minutes": l.get("minutes") or 10, "video": bool(l.get("video_url")),
                                               "quiz": bool((l.get("quiz") or {}).get("required"))} for l in m["lessons"]]} for m in p["modules"]]
    ls = [l for m in mods for l in m["lessons"]]
    return {"id": p["id"], "title": p["title"], "description": p["description"], "level": p["level"], "category": p.get("category"),
            "modules": mods, "lesson_count": len(ls), "minutes": sum(l["minutes"] for l in ls), "videos": sum(l["video"] for l in ls), "quizzes": sum(l["quiz"] for l in ls)}


@router.get("/public/stats")
async def public_stats():
    return {"learners": 12480 + await db.users.count_documents({}), "labs": await db.labs.count_documents({}) + 40,
            "challenges": await db.challenges.count_documents({}) + await db.ctfs.count_documents({}) + 120,
            "certificates": 3100 + await db.certificates.count_documents({})}


@router.get("/public/announcements")
async def public_announcements():
    return await db.announcements.find({"active": True}, NO_ID).sort("created_at", -1).to_list(5)


@router.get("/public/verify/{cert_id}")
async def verify(cert_id: str):
    c = await db.certificates.find_one({"id": cert_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Certificate not found")
    u = await db.users.find_one({"id": c.pop("user_id")}, {"_id": 0, "username": 1, "public_profile": 1, "status": 1})
    c["username"] = u["username"] if u and u.get("public_profile") is not False and u.get("status") == "active" else None
    return c


@router.get("/public/certificates/{cert_id}/pdf")
async def cert_pdf(cert_id: str):
    c = await db.certificates.find_one({"id": cert_id}, NO_ID)
    if not c:
        raise HTTPException(404, "Certificate not found")
    import qrcode
    from reportlab.lib.pagesizes import landscape, A4
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    from reportlab.lib.colors import HexColor
    buf = io.BytesIO()
    w, h = landscape(A4)
    cv = canvas.Canvas(buf, pagesize=landscape(A4))
    cv.setFillColor(HexColor("#0B0F1A")); cv.rect(0, 0, w, h, fill=1, stroke=0)
    cv.setStrokeColor(HexColor("#00F0FF")); cv.setLineWidth(2); cv.rect(24, 24, w - 48, h - 48)
    cv.setStrokeColor(HexColor("#00FF66")); cv.setLineWidth(0.5); cv.rect(32, 32, w - 64, h - 64)
    cv.setFillColor(HexColor("#00F0FF")); cv.setFont("Courier-Bold", 30); cv.drawString(60, h - 90, "> SOCPROFESSIONALS ACADEMY")
    cv.setFillColor(HexColor("#94A3B8")); cv.setFont("Courier", 12); cv.drawString(60, h - 112, "CERTIFICATE OF COMPLETION")
    cv.setFillColor(HexColor("#F8FAFC")); cv.setFont("Helvetica", 14); cv.drawString(60, h - 190, "This certifies that")
    cv.setFont("Helvetica-Bold", 36); cv.drawString(60, h - 240, c["name"])
    cv.setFont("Helvetica", 14); cv.drawString(60, h - 280, "has successfully completed the learning path")
    cv.setFillColor(HexColor("#00FF66")); cv.setFont("Courier-Bold", 24); cv.drawString(60, h - 320, c["path_title"])
    cv.setFillColor(HexColor("#94A3B8")); cv.setFont("Courier", 11)
    cv.drawString(60, 110, f"Final exam score: {c['score']}%")
    cv.drawString(60, 92, f"Issued: {c['issued_at'][:10]}")
    cv.drawString(60, 74, f"Certificate ID: {c['id']}")
    url = f"{os.environ['FRONTEND_URL']}/verify/{c['id']}"
    cv.drawString(60, 56, f"Verify: {url}")
    qr = qrcode.make(url)
    qb = io.BytesIO(); qr.save(qb, format="PNG"); qb.seek(0)
    cv.drawImage(ImageReader(qb), w - 200, 60, 140, 140)
    cv.showPage(); cv.save(); buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename=SOCProfessionals-Academy-{c['id']}.pdf"})


# ---------- Paths & lessons ----------
async def completed_set(uid):
    return {d["lesson_id"] for d in await db.lesson_progress.find({"user_id": uid}, NO_ID).to_list(5000)}


@router.get("/paths")
async def list_paths(user=Depends(get_current_user)):
    done = await completed_set(user["id"])
    paths = await db.paths.find({"published": True}, NO_ID).sort("order", 1).to_list(100)
    out = []
    for p in paths:
        ids = lesson_ids(p)
        c = len([i for i in ids if i in done])
        out.append({"id": p["id"], "title": p["title"], "description": p["description"], "level": p["level"], "category": p.get("category"),
                    "module_count": len(p["modules"]), "lesson_count": len(ids), "completed": c, "percent": round(100 * c / len(ids)) if ids else 0})
    return out


@router.get("/paths/{pid}")
async def get_path(pid: str, user=Depends(get_current_user)):
    p = await db.paths.find_one({"id": pid}, NO_ID)
    if not p or (not p.get("published") and user["role"] == "student"):
        raise HTTPException(404, "Path not found")
    done = await completed_set(user["id"])
    final = await db.quizzes.find_one({"path_id": pid}, {"_id": 0, "id": 1, "title": 1, "pass_mark": 1})
    cert = await db.certificates.find_one({"user_id": user["id"], "path_id": pid}, NO_ID)
    ids = lesson_ids(p)
    vids = [l["id"] for m in p["modules"] for l in m["lessons"] if tracked_video(l)]
    vp = {v["lesson_id"]: v for v in await db.video_progress.find({"user_id": user["id"], "path_id": pid}, NO_ID).to_list(1000)}
    passed = set(await db.lesson_quiz_attempts.distinct("lesson_id", {"user_id": user["id"], "path_id": pid, "passed": True}))
    for m in p["modules"]:
        for l in m["lessons"]:
            if (l.get("quiz") or {}).get("required"):
                l["quiz"] = {"required": True, "pass_count": pass_count(l["quiz"]), "questions": [{"id": q.get("id"), "text": q["text"], "options": q["options"]} for q in l["quiz"]["questions"]]}
    return {**p, "completed_lessons": [i for i in ids if i in done], "final_quiz": final, "certificate": cert,
            "percent": round(100 * len([i for i in ids if i in done]) / len(ids)) if ids else 0,
            "video_lessons": vids, "watched_lessons": [i for i in vids if vp.get(i, {}).get("watched")],
            "video_percent": {i: vp[i]["percent"] for i in vids if i in vp}, "quiz_passed_lessons": [i for i in ids if i in passed]}


def tracked_video(l):
    return bool(re.search(r"https?://[^\s\"'<>]*(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com)/[^\s\"'<>]*", l.get("video_url") or "", re.I))


def merge_spans(spans):
    out = []
    for a, b in sorted(spans):
        if out and a <= out[-1][1] + 1:
            out[-1][1] = max(out[-1][1], b)
        else:
            out.append([a, b])
    return out


class VideoIn(BaseModel):
    duration: float = Field(gt=0, le=86400)
    segments: list[list[float]] = Field(max_length=200)


@router.post("/paths/{pid}/lessons/{lid}/video")
async def video_progress(pid: str, lid: str, body: VideoIn, user=Depends(get_current_user)):
    p, l = await find_lesson(pid, lid)
    if not tracked_video(l):
        raise HTTPException(400, "This lesson has no trackable video")
    rec = await db.video_progress.find_one({"user_id": user["id"], "lesson_id": lid}, NO_ID) or {}
    dur = rec.get("duration") or round(body.duration, 1)
    new = [[max(0.0, min(a, dur)), max(0.0, min(b, dur))] for a, b in (s[:2] for s in body.segments if len(s) >= 2) if b > a]
    old = rec.get("spans", [])
    spans = merge_spans(old + new)
    added = sum(b - a for a, b in spans) - sum(b - a for a, b in old)
    last = rec.get("last_at")
    allowed = 30 + (2.2 * (now() - datetime.fromisoformat(last)).total_seconds() if last else 0)
    if added > allowed:
        spans = old
    covered = sum(b - a for a, b in spans)
    percent = min(100, round(100 * covered / dur))
    watched = rec.get("watched") or percent >= 90
    await db.video_progress.update_one({"user_id": user["id"], "lesson_id": lid}, {"$set": {
        "path_id": pid, "duration": dur, "spans": spans, "percent": percent, "watched": watched, "last_at": now_iso(),
        **({"watched_at": now_iso()} if watched and not rec.get("watched") else {})}}, upsert=True)
    return {"percent": percent, "watched": watched, "newly": watched and not rec.get("watched")}


async def video_ok(uid, l):
    return not tracked_video(l) or bool(await db.video_progress.find_one({"user_id": uid, "lesson_id": l["id"], "watched": True}))


def pass_count(quiz):
    return -(-len(quiz["questions"]) * 3 // 5)


async def find_lesson(pid, lid):
    p = await db.paths.find_one({"id": pid}, NO_ID)
    l = next((l for m in (p or {}).get("modules", []) for l in m["lessons"] if l["id"] == lid), None)
    if not l:
        raise HTTPException(404, "Lesson not found")
    return p, l


async def mark_complete(uid, pid, l):
    if await db.lesson_progress.find_one({"user_id": uid, "lesson_id": l["id"]}):
        return False
    await db.lesson_progress.insert_one({"user_id": uid, "lesson_id": l["id"], "path_id": pid, "minutes": 10, "created_at": now_iso()})
    await award(uid, 10, f"Completed lesson: {l['title']}")
    return True


@router.post("/paths/{pid}/lessons/{lid}/complete")
async def complete_lesson(pid: str, lid: str, user=Depends(get_current_user)):
    p, l = await find_lesson(pid, lid)
    if (l.get("quiz") or {}).get("required") and not await db.lesson_quiz_attempts.find_one({"user_id": user["id"], "lesson_id": lid, "passed": True}) \
            and not await db.lesson_progress.find_one({"user_id": user["id"], "lesson_id": lid}):
        raise HTTPException(400, "Pass this lesson's quiz to complete it")
    if not await db.lesson_progress.find_one({"user_id": user["id"], "lesson_id": lid}) and not await video_ok(user["id"], l):
        raise HTTPException(400, "Watch at least 90% of the lesson video to complete it")
    await mark_complete(user["id"], pid, l)
    return {"ok": True}


class LessonQuizIn(BaseModel):
    answers: list[int]


@router.post("/paths/{pid}/lessons/{lid}/quiz")
async def lesson_quiz_submit(pid: str, lid: str, body: LessonQuizIn, user=Depends(get_current_user)):
    p, l = await find_lesson(pid, lid)
    q = l.get("quiz") or {}
    if not q.get("required"):
        raise HTTPException(400, "This lesson has no graded quiz")
    qs = q["questions"]
    if len(body.answers) != len(qs):
        raise HTTPException(422, f"Answer all {len(qs)} questions")
    marks = [a == int(x["answer"]) for a, x in zip(body.answers, qs)]
    score, need = sum(marks), pass_count(q)
    passed = score >= need
    await db.lesson_quiz_attempts.insert_one({"id": new_id(), "user_id": user["id"], "path_id": pid, "lesson_id": lid, "score": score, "total": len(qs), "passed": passed, "created_at": now_iso()})
    newly = passed and await video_ok(user["id"], l) and await mark_complete(user["id"], pid, l)
    return {"score": score, "total": len(qs), "pass_count": need, "passed": passed, "completed": bool(newly), "xp": 10 if newly else 0,
            "results": [{"correct": ok, **({"answer": int(x["answer"]), "explanation": x.get("explanation", "")} if passed or ok else {})} for ok, x in zip(marks, qs)]}


@router.get("/resources/{name}")
async def resource(name: str, user=Depends(get_current_user)):
    lid = name.replace(".txt", "")
    p = await db.paths.find_one({"modules.lessons.id": lid}, NO_ID)
    if not p:
        raise HTTPException(404, "Resource not found")
    l = next(l for m in p["modules"] for l in m["lessons"] if l["id"] == lid)
    return PlainTextResponse(f"SOCProfessionals Academy cheat-sheet — {l['title']}\n{'=' * 40}\n\n{l['content']}\n", headers={"Content-Disposition": f"attachment; filename={lid}.txt"})


# ---------- Quizzes ----------
def strip_q(q):
    return {k: v for k, v in q.items() if k not in ("answer", "explanation")}


@router.get("/quizzes")
async def list_quizzes(user=Depends(get_current_user)):
    qs = await db.quizzes.find({"published": True}, NO_ID).to_list(200)
    best = defaultdict(int)
    for a in await db.quiz_attempts.find({"user_id": user["id"]}, NO_ID).to_list(2000):
        best[a["quiz_id"]] = max(best[a["quiz_id"]], a["score"])
    return [{"id": q["id"], "title": q["title"], "topic": q["topic"], "time_limit_sec": q["time_limit_sec"], "path_id": q.get("path_id"),
             "pass_mark": q["pass_mark"], "question_count": len(q["questions"]), "best_score": best.get(q["id"])} for q in qs]


@router.get("/quizzes/{qid}")
async def get_quiz(qid: str, user=Depends(get_current_user)):
    q = await db.quizzes.find_one({"id": qid}, NO_ID)
    if not q or (not q.get("published") and user["role"] == "student"):
        raise HTTPException(404, "Quiz not found")
    return {**q, "questions": [strip_q(x) for x in q["questions"]]}


class CheckIn(BaseModel):
    question_id: str
    answer: list[int]


class SubmitIn(BaseModel):
    answers: dict[str, list[int]]
    time_spent: int = 0


@router.post("/quizzes/{qid}/check")
async def check_question(qid: str, body: CheckIn, user=Depends(get_current_user)):
    q = await db.quizzes.find_one({"id": qid}, NO_ID)
    if q and q.get("path_id"):
        raise HTTPException(403, "Instant feedback is disabled for final exams")
    qu = next((x for x in (q or {}).get("questions", []) if x["id"] == body.question_id), None)
    if not qu:
        raise HTTPException(404, "Question not found")
    return {"correct": sorted(body.answer) == sorted(qu["answer"]), "answer": qu["answer"], "explanation": qu["explanation"]}


@router.post("/quizzes/{qid}/submit")
async def submit_quiz(qid: str, body: SubmitIn, user=Depends(get_current_user)):
    q = await db.quizzes.find_one({"id": qid}, NO_ID)
    if not q:
        raise HTTPException(404, "Quiz not found")
    results, correct, topics = [], 0, defaultdict(lambda: [0, 0])
    for qu in q["questions"]:
        ok = sorted(body.answers.get(qu["id"], [])) == sorted(qu["answer"])
        correct += ok
        topic = qu.get("topic") or q.get("topic") or "General"
        topics[topic][0] += ok
        topics[topic][1] += 1
        results.append({"question_id": qu["id"], "correct": ok, "answer": qu["answer"], "explanation": qu["explanation"]})
    total = len(q["questions"])
    score = round(100 * correct / total) if total else 0
    passed = score >= q["pass_mark"]
    await db.quiz_attempts.insert_one({"id": new_id(), "user_id": user["id"], "quiz_id": qid, "quiz_title": q["title"], "score": score, "correct": correct,
                                       "total": total, "passed": passed, "topics": {k: v for k, v in topics.items()}, "time_spent": body.time_spent, "created_at": now_iso()})
    await award(user["id"], correct * 10 + (20 if passed else 0), f"Quiz '{q['title']}' scored {score}%")
    cert = None
    if passed and q.get("path_id"):
        cert = await maybe_issue_cert(user, q["path_id"], score)
    return {"score": score, "correct": correct, "total": total, "passed": passed, "results": results, "certificate": cert}


async def maybe_issue_cert(user, pid, score):
    existing = await db.certificates.find_one({"user_id": user["id"], "path_id": pid}, NO_ID)
    if existing:
        return existing
    p = await db.paths.find_one({"id": pid}, NO_ID)
    done = await completed_set(user["id"])
    if not all(i in done for i in lesson_ids(p)):
        return {"pending": True, "message": "Exam passed! Complete all lessons in this path to unlock your certificate."}
    cert = {"id": f"SOCF-{now().year}-{new_id().upper()[:8]}", "user_id": user["id"], "name": user["name"], "path_id": pid,
            "path_title": p["title"], "score": score, "issued_at": now_iso(), "status": "valid"}
    await db.certificates.insert_one(dict(cert))
    await award(user["id"], 200, f"Earned certificate: {p['title']}")
    await send_email(to=user["email"], subject=f"Your SOCProfessionals Academy certificate: {p['title']}",
                     html=email_template(user["name"], [f"Congratulations on completing {p['title']}.", f"Certificate ID: {cert['id']}"],
                                         f"{os.environ['FRONTEND_URL']}/verify/{cert['id']}", "View certificate"))
    return cert


@router.get("/certificates/mine")
async def my_certs(user=Depends(get_current_user)):
    return await db.certificates.find({"user_id": user["id"]}, NO_ID).to_list(50)


# ---------- Live sessions ----------
@router.get("/sessions")
async def list_sessions(user=Depends(get_current_user)):
    ss = await db.sessions.find({}, NO_ID).sort("start", 1).to_list(200)
    mine = {r["session_id"] for r in await db.rsvps.find({"user_id": user["id"]}, NO_ID).to_list(500)}
    for s in ss:
        s["rsvp_count"] = await db.rsvps.count_documents({"session_id": s["id"]})
        s["registered"] = s["id"] in mine
        s["is_past"] = s["start"] < now_iso()
    return ss


@router.post("/sessions/{sid}/rsvp")
async def rsvp(sid: str, user=Depends(get_current_user)):
    s = await db.sessions.find_one({"id": sid}, NO_ID)
    if not s:
        raise HTTPException(404, "Session not found")
    if await db.rsvps.find_one({"session_id": sid, "user_id": user["id"]}):
        await db.rsvps.delete_one({"session_id": sid, "user_id": user["id"]})
        return {"registered": False}
    if await db.rsvps.count_documents({"session_id": sid}) >= s["capacity"]:
        raise HTTPException(400, "Session is full")
    await db.rsvps.insert_one({"session_id": sid, "user_id": user["id"], "name": user["name"], "email": user["email"], "attended": False, "created_at": now_iso()})
    await send_email(to=user["email"], subject=f"You're registered: {s['title']}",
                     html=email_template(user["name"], [f"You're registered for '{s['title']}' with {s['instructor']}.", f"Starts (UTC): {s['start'][:16].replace('T', ' ')}",
                                                        "The join link is available on your Live Sessions page. See you there!"],
                                         f"{os.environ['FRONTEND_URL']}/app/sessions", "Open Live Sessions"))
    await award(user["id"], 5, f"Registered for live session: {s['title']}")
    return {"registered": True}


# ---------- Dashboard & analytics ----------
BADGES = [("first-blood", "First Blood", "Solve your first CTF"), ("triage-pro", "Triage Pro", "3 correct alert verdicts"),
          ("quiz-master", "Quiz Master", "Score 100% on a quiz"), ("pathfinder", "Pathfinder", "Earn a certificate"),
          ("on-fire", "On Fire", "3-day streak"), ("lab-rat", "Lab Rat", "Finish a scenario lab"),
          ("drill-7", "Week Watch", "7-day daily drill streak"), ("drill-30", "Night Shift", "30-day daily drill streak"),
          ("interview-ready", "Interview Ready", "Buy the SOC Interview Preparation ebook"),
          ("evidence-bronze", "Evidence Seeker", "Use the investigation toolkit on 3 alerts before your verdict"),
          ("evidence-silver", "Evidence First", "Use the investigation toolkit on 10 alerts before your verdict"),
          ("evidence-gold", "Master Investigator", "Use the investigation toolkit on 25 alerts before your verdict")]
EVIDENCE_TIERS = {"evidence-bronze": 3, "evidence-silver": 10, "evidence-gold": 25}
BADGE_LEVEL = {"first-blood": ("Recruit", "first-blood.jpg"), "on-fire": ("Recruit", "on-fire.jpg"),
               "triage-pro": ("Analyst", "triage-pro.jpg"), "quiz-master": ("Analyst", "quiz-master.jpg"), "interview-ready": ("Analyst", "interview-ready.jpg"),
               "lab-rat": ("Hunter", "lab-rat.jpg"), "drill-7": ("Hunter", "drill-7.jpg"),
               "pathfinder": ("Elite", "pathfinder.jpg"), "drill-30": ("Elite", "drill-30.jpg"),
               "evidence-bronze": ("Recruit", "evidence-bronze.jpg"), "evidence-silver": ("Analyst", "evidence-silver.jpg"), "evidence-gold": ("Hunter", "evidence-gold.jpg")}
SOP_CATS = [("Identity", "Hunter"), ("Cloud Identity", "Hunter"), ("Endpoint", "Elite"), ("Network", "Hunter"), ("Application", "Hunter"), ("Email Security", "Analyst"), ("Data Protection", "Analyst")]
SOP_BADGE = {f"sop-{c.lower().replace(' ', '-')}": c for c, _ in SOP_CATS}
BADGE_LEVEL.update({f"sop-{c.lower().replace(' ', '-')}": (lvl, f"sop-{c.lower().replace(' ', '-')}.jpg") for c, lvl in SOP_CATS})
REVEAL_LEVELS = ("Elite", "Hunter")


async def sop_badges(uid):
    labs = set(await db.sop_labs.distinct("sop_id", {"status": "ready"}))
    by_cat = {}
    async for s in db.sops_extra.find({"status": "ready", "id": {"$in": list(labs)}}, {"_id": 0, "id": 1, "category": 1}):
        by_cat.setdefault(s["category"], set()).add(s["id"])
    passed = set(await db.sop_lab_attempts.distinct("sop_id", {"user_id": uid, "passed": True}))
    out = []
    for bid, cat in SOP_BADGE.items():
        ids = by_cat.get(cat, set())
        if ids:
            done = len(ids & passed)
            out.append({"id": bid, "name": f"{cat} Master", "description": f"Pass every {cat} SOP practice lab ({len(ids)} labs)", "earned": done == len(ids),
                        "progress": [done, len(ids)], "kind": "sop"})
    return out


def pending_level_up(user, badges):
    seen = set(user.get("levelups_seen") or [])
    for lvl in REVEAL_LEVELS:
        b = next((b for b in badges if b["earned"] and BADGE_LEVEL.get(b["id"], ("",))[0] == lvl), None)
        if b and lvl not in seen:
            return {"level": lvl, "badge_id": b["id"], "badge_name": b["name"], "description": b["description"]}
    return None


@router.post("/me/level-up/{level}/seen")
async def level_up_seen(level: str, user=Depends(get_current_user)):
    if level not in REVEAL_LEVELS:
        raise HTTPException(400, "Unknown level")
    await db.users.update_one({"id": user["id"]}, {"$addToSet": {"levelups_seen": level}})
    return {"ok": True}


async def compute_badges(u):
    from routes_practice import streak_stats
    uid = u["id"]
    _, longest, _ = await streak_stats(uid)
    earned = {
        "drill-7": longest >= 7,
        "drill-30": longest >= 30,
        "first-blood": await db.ctf_solves.count_documents({"user_id": uid}) > 0,
        "triage-pro": await db.challenge_submissions.count_documents({"user_id": uid, "verdict_correct": True}) >= 3,
        "quiz-master": await db.quiz_attempts.count_documents({"user_id": uid, "score": 100}) > 0,
        "pathfinder": await db.certificates.count_documents({"user_id": uid}) > 0,
        "on-fire": (u.get("streak") or 0) >= 3,
        "lab-rat": await db.lab_progress.count_documents({"user_id": uid, "report_submitted": True}) > 0,
        "interview-ready": bool(await db.purchases.find_one({"user_id": uid, "product_id": "soc-interview-ebook"})),
    }
    investigated = await db.challenge_submissions.count_documents({"user_id": uid, "investigated": True})
    earned.update({k: investigated >= n for k, n in EVIDENCE_TIERS.items()})
    return [{"id": i, "name": n, "description": d, "earned": earned[i], **({"progress": [min(investigated, EVIDENCE_TIERS[i]), EVIDENCE_TIERS[i]]} if i in EVIDENCE_TIERS else {})}
            for i, n, d in BADGES] + await sop_badges(uid) + await course_badges(uid)


def short_title(t):
    for sep in (" - ", " | ", ":", " ("):
        t = t.split(sep)[0]
    t = t.strip()
    return t if len(t) <= 30 else t[:30].rsplit(" ", 1)[0]


async def course_badges(uid):
    done = await db.course_completions.find({"user_id": uid}, {"_id": 0}).sort("at", 1).to_list(100)
    return [{"id": f"course-{c['course_id']}", "name": short_title(c["title"]), "description": f"Completed '{c['title']}' on SOC Professionals",
             "earned": True, "kind": "course"} for c in done]


@router.get("/leaderboard/investigators")
async def investigator_board(user=Depends(get_current_user)):
    today = now().date()
    start = today - timedelta(days=today.weekday())
    prev = start - timedelta(days=7)

    async def week(a, b):
        rng = {"$gte": a.isoformat(), "$lt": b.isoformat()}
        rows = await db.challenge_submissions.aggregate([{"$match": {"investigated": True, "$or": [{"first_at": rng}, {"first_at": {"$exists": False}, "created_at": rng}]}},
                                                         {"$group": {"_id": "$user_id", "n": {"$sum": 1}, "last": {"$max": "$created_at"}}}, {"$sort": {"n": -1, "last": 1}}]).to_list(500)
        us = {u["id"]: u for u in await db.users.find({"id": {"$in": [r["_id"] for r in rows]}, "role": "student", "status": "active"},
                                                      {"_id": 0, "id": 1, "name": 1, "username": 1, "xp": 1, "public_profile": 1, "avatar_frame": 1}).to_list(500)}
        return [{"id": k, "name": u["name"], "username": u["username"], "count": r["n"], "rank": rank_for(u.get("xp", 0)), "frame": frame_for(u),
                 "public": u.get("public_profile", True) is not False} for r in rows if (k := r["_id"]) in us and (u := us[k])]
    cur, last = await week(start, start + timedelta(days=7)), await week(prev, start)
    pos = next((i for i, r in enumerate(cur) if r["id"] == user["id"]), None)
    return {"week_start": start.isoformat(), "resets_on": (start + timedelta(days=7)).isoformat(), "top": cur[:10],
            "me": {"count": cur[pos]["count"] if pos is not None else 0, "position": pos + 1 if pos is not None else None},
            "last_champion": last[0] if last else None}


@router.get("/leaderboard")
async def leaderboard(user=Depends(get_current_user)):
    us = await db.users.find({"role": "student", "status": "active"}, {"_id": 0, "id": 1, "name": 1, "username": 1, "xp": 1, "public_profile": 1, "avatar_frame": 1}).sort("xp", -1).to_list(10)
    return [{**{k: v for k, v in u.items() if k != "avatar_frame"}, "rank": rank_for(u.get("xp", 0)), "frame": frame_for(u), "public": u.pop("public_profile", True) is not False} for u in us]


def pending_rank_up(user):
    rank = rank_for(user.get("xp", 0))
    if rank == "Recruit" or rank in (user.get("rankups_seen") or []):
        return None
    return {"rank": rank, "xp": user.get("xp", 0)}


@router.post("/me/rank-up/{rank}/seen")
async def rank_up_seen(rank: str, user=Depends(get_current_user)):
    names = [n for _, n in RANKS]
    if rank not in names[1:]:
        raise HTTPException(400, "Unknown rank")
    await db.users.update_one({"id": user["id"]}, {"$addToSet": {"rankups_seen": {"$each": names[1:names.index(rank) + 1]}}})
    return {"ok": True}


class FrameIn(BaseModel):
    frame: Optional[str] = None


@router.patch("/me/avatar-frame")
async def set_frame(body: FrameIn, user=Depends(get_current_user)):
    if rank_for(user.get("xp", 0)) != "Elite":
        raise HTTPException(403, "Avatar frames unlock at Elite rank")
    if body.frame is not None and body.frame not in FRAMES:
        raise HTTPException(400, "Unknown frame")
    await db.users.update_one({"id": user["id"]}, {"$set": {"avatar_frame": body.frame}})
    return {"frame": body.frame}


@router.get("/me/badges")
async def my_badges(user=Depends(get_current_user)):
    badges = await compute_badges(user)
    for b in badges:
        b["level"] = BADGE_LEVEL.get(b["id"], ("Recruit",))[0]
    return {"badges": badges, "rank": rank_for(user.get("xp", 0)), "xp": user.get("xp", 0), "frame": frame_for(user), "frames": list(FRAMES)}


@router.get("/dashboard")
async def dashboard(user=Depends(get_current_user)):
    from routes_courses import courses_progress
    bonus = await courses_progress(user)
    user = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    badges = await compute_badges(user)
    paths = await list_paths(user)
    xp = user.get("xp", 0)
    nxt = next((t for t in (500, 1500, 3000) if xp < t), None)
    upcoming = [s for s in await list_sessions(user) if not s["is_past"]][:3]
    return {"user": user, "xp": xp, "rank": rank_for(xp), "next_rank_xp": nxt, "streak": user.get("streak", 0), "course_bonus": bonus["awarded"], "bonus_xp": bonus["bonus_xp"],
            "badges": badges, "level_up": pending_level_up(user, badges), "rank_up": pending_rank_up(user), "paths": paths, "current_path": next((p for p in paths if p["id"] == user.get("current_path")), paths[0] if paths else None),
            "upcoming_sessions": upcoming, "activity": await db.activity.find({"user_id": user["id"]}, NO_ID).sort("created_at", -1).to_list(8),
            "leaderboard": await leaderboard(user),
            "counts": {"ctf": await db.ctf_solves.count_documents({"user_id": user["id"]}), "challenges": await db.challenge_submissions.count_documents({"user_id": user["id"]}),
                       "quizzes": await db.quiz_attempts.count_documents({"user_id": user["id"]})}}


@router.get("/me/analytics")
async def analytics(user=Depends(get_current_user)):
    attempts = await db.quiz_attempts.find({"user_id": user["id"]}, NO_ID).sort("created_at", 1).to_list(1000)
    topics = defaultdict(lambda: [0, 0])
    for a in attempts:
        for t, (c, n) in a["topics"].items():
            topics[t][0] += c
            topics[t][1] += n
    for s in await db.challenge_submissions.find({"user_id": user["id"]}, NO_ID).to_list(500):
        topics[s["category"]][0] += 1 if s["verdict_correct"] else 0
        topics[s["category"]][1] += 1
    acc = [{"topic": t, "accuracy": round(100 * c / n)} for t, (c, n) in topics.items() if n]
    lessons = await db.lesson_progress.count_documents({"user_id": user["id"]})
    paths = await list_paths(user)
    total_lessons = sum(p["lesson_count"] for p in paths) or 1
    minutes = lessons * 10 + sum(a.get("time_spent", 0) for a in attempts) // 60
    return {"quiz_scores": [{"name": a["quiz_title"][:18], "score": a["score"], "date": a["created_at"][:10]} for a in attempts[-12:]],
            "accuracy": acc, "weak_topics": [a["topic"] for a in sorted(acc, key=lambda x: x["accuracy"]) if a["accuracy"] < 70][:4],
            "time_spent_min": minutes, "completion": round(100 * lessons / total_lessons), "attempts": len(attempts),
            "avg_score": round(sum(a["score"] for a in attempts) / len(attempts)) if attempts else 0, "updated_at": now_iso()}
