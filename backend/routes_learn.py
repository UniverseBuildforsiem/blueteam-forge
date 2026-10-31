import io
import os
from collections import defaultdict
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import PlainTextResponse, StreamingResponse
from pydantic import BaseModel
from core import db, now, now_iso, new_id, get_current_user, award, rank_for, send_email, email_template

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
    cv.setFillColor(HexColor("#00F0FF")); cv.setFont("Courier-Bold", 30); cv.drawString(60, h - 90, "> SOCFORGE")
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
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"inline; filename=SOCForge-{c['id']}.pdf"})


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
    return {**p, "completed_lessons": [i for i in ids if i in done], "final_quiz": final, "certificate": cert,
            "percent": round(100 * len([i for i in ids if i in done]) / len(ids)) if ids else 0}


@router.post("/paths/{pid}/lessons/{lid}/complete")
async def complete_lesson(pid: str, lid: str, user=Depends(get_current_user)):
    p = await db.paths.find_one({"id": pid}, NO_ID)
    if not p or lid not in lesson_ids(p):
        raise HTTPException(404, "Lesson not found")
    if not await db.lesson_progress.find_one({"user_id": user["id"], "lesson_id": lid}):
        await db.lesson_progress.insert_one({"user_id": user["id"], "lesson_id": lid, "path_id": pid, "minutes": 10, "created_at": now_iso()})
        title = next(l["title"] for m in p["modules"] for l in m["lessons"] if l["id"] == lid)
        await award(user["id"], 10, f"Completed lesson: {title}")
    return {"ok": True}


@router.get("/resources/{name}")
async def resource(name: str, user=Depends(get_current_user)):
    lid = name.replace(".txt", "")
    p = await db.paths.find_one({"modules.lessons.id": lid}, NO_ID)
    if not p:
        raise HTTPException(404, "Resource not found")
    l = next(l for m in p["modules"] for l in m["lessons"] if l["id"] == lid)
    return PlainTextResponse(f"SOCForge cheat-sheet — {l['title']}\n{'=' * 40}\n\n{l['content']}\n", headers={"Content-Disposition": f"attachment; filename={lid}.txt"})


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
    await send_email(to=user["email"], subject=f"Your SOCForge certificate: {p['title']}",
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
          ("drill-7", "Week Watch", "7-day daily drill streak"), ("drill-30", "Night Shift", "30-day daily drill streak")]


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
    }
    return [{"id": i, "name": n, "description": d, "earned": earned[i]} for i, n, d in BADGES] + await course_badges(uid)


def short_title(t):
    for sep in (" - ", " | ", ":", " ("):
        t = t.split(sep)[0]
    t = t.strip()
    return t if len(t) <= 30 else t[:30].rsplit(" ", 1)[0]


async def course_badges(uid):
    done = await db.course_completions.find({"user_id": uid}, {"_id": 0}).sort("at", 1).to_list(100)
    return [{"id": f"course-{c['course_id']}", "name": short_title(c["title"]), "description": f"Completed '{c['title']}' on SOC Professionals",
             "earned": True, "kind": "course"} for c in done]


@router.get("/leaderboard")
async def leaderboard(user=Depends(get_current_user)):
    us = await db.users.find({"role": "student", "status": "active"}, {"_id": 0, "id": 1, "name": 1, "username": 1, "xp": 1, "public_profile": 1}).sort("xp", -1).to_list(10)
    return [{**u, "rank": rank_for(u.get("xp", 0)), "public": u.pop("public_profile", True) is not False} for u in us]


@router.get("/dashboard")
async def dashboard(user=Depends(get_current_user)):
    from routes_courses import courses_progress
    bonus = await courses_progress(user)
    user = await db.users.find_one({"id": user["id"]}, {"_id": 0, "password_hash": 0})
    paths = await list_paths(user)
    xp = user.get("xp", 0)
    nxt = next((t for t in (500, 1500, 3000) if xp < t), None)
    upcoming = [s for s in await list_sessions(user) if not s["is_past"]][:3]
    return {"user": user, "xp": xp, "rank": rank_for(xp), "next_rank_xp": nxt, "streak": user.get("streak", 0), "course_bonus": bonus["awarded"], "bonus_xp": bonus["bonus_xp"],
            "badges": await compute_badges(user), "paths": paths, "current_path": next((p for p in paths if p["id"] == user.get("current_path")), paths[0] if paths else None),
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
