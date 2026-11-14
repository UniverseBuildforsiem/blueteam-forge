import asyncio
import csv
import io
import os
from datetime import timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from core import db, now, now_iso, staff, audit, send_email, email_template, rank_for
from routes_courses import enrich, notify_new_courses

router = APIRouter(prefix="/api/instructor")
NO_ID = {"_id": 0}
TASKS = set()


def bg(coro):
    t = asyncio.create_task(coro)
    TASKS.add(t)
    t.add_done_callback(TASKS.discard)


# ---------- Public catalog courses ----------
class CourseIn(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    type: str = Field(default="Videos", pattern="^(Videos|Tests|Files)$")
    price: int = Field(ge=0, le=1000000)
    mrp: int = Field(ge=0, le=1000000)
    image: str = Field(default="", max_length=600)
    url: str = Field(min_length=8, max_length=600, pattern=r"^https?://")
    videos: int = Field(default=0, ge=0)
    tests: int = Field(default=0, ge=0)
    files: int = Field(default=0, ge=0)
    tags: List[str] = Field(default_factory=list)
    order: int = 100
    active: bool = True


def course_doc(b: CourseIn):
    d = b.model_dump()
    d["mrp"] = max(d["mrp"], d["price"])
    d["content"] = {k: d.pop(k) for k in ("videos", "tests", "files")}
    d["tags"] = [t.strip()[:20] for t in d["tags"] if t.strip()][:4]
    return d


@router.get("/courses")
async def list_courses(user=Depends(staff)):
    cs = await db.courses.find({}, NO_ID).sort("order", 1).to_list(500)
    return [{**c, "editable": c.get("source") == "instructor"} for c in cs]


@router.post("/courses")
async def create_course(body: CourseIn, user=Depends(staff)):
    seq = await db.counters.find_one_and_update({"id": "instructor_course"}, {"$inc": {"n": 1}}, upsert=True, return_document=True, projection=NO_ID)
    last = await db.courses.find_one({"source": "instructor"}, {"_id": 0, "id": 1}, sort=[("id", -1)])
    nid = max(9000000 + seq["n"], (last["id"] + 1) if last else 0)
    if nid != 9000000 + seq["n"]:
        await db.counters.update_one({"id": "instructor_course"}, {"$set": {"n": nid - 9000000}})
    doc = {**course_doc(body), "id": nid, "source": "instructor", "created_by": user["email"], "created_at": now_iso(), "synced_at": None}
    await db.courses.insert_one(dict(doc))
    await audit(user, "create course", str(doc["id"]))
    if doc["active"]:
        bg(notify_new_courses([doc]))
    return doc


async def own_course(cid):
    c = await db.courses.find_one({"id": cid}, NO_ID)
    if not c:
        raise HTTPException(404, "Course not found")
    if c.get("source") != "instructor":
        raise HTTPException(403, "Synced courses are managed on socprofessionals.com")
    return c


@router.put("/courses/{cid}")
async def update_course(cid: int, body: CourseIn, user=Depends(staff)):
    await own_course(cid)
    await db.courses.update_one({"id": cid}, {"$set": {**course_doc(body), "updated_at": now_iso()}})
    await audit(user, "update course", str(cid))
    return await db.courses.find_one({"id": cid}, NO_ID)


@router.delete("/courses/{cid}")
async def delete_course(cid: int, user=Depends(staff)):
    await own_course(cid)
    await db.courses.delete_one({"id": cid})
    await audit(user, "delete course", str(cid))
    return {"ok": True}


@router.post("/courses/preview")
async def preview_course(body: CourseIn, user=Depends(staff)):
    return enrich({**course_doc(body), "id": 0})


# ---------- Grading with email ----------
class GradeIn(BaseModel):
    grade: int = Field(ge=0, le=100)
    feedback: str = Field(default="", max_length=2000)


async def grade_email(user_id, what, grade, feedback, link, grader):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "email": 1})
    if not u:
        return
    lines = [f"{grader} reviewed your report for {what}.", f"Grade: {grade}/100"]
    if feedback:
        lines.append(f"Feedback: {feedback}")
    lines.append("Open it in SOCProfessionals Academy to see the full review and try again if you like.")
    await send_email(to=u["email"], subject=f"Your report was graded: {grade}/100 · {what}"[:120], html=email_template(u["name"], lines, f"{os.environ['FRONTEND_URL']}{link}", "View your report"))


@router.post("/submissions/{sid}/grade")
async def grade_challenge(sid: str, body: GradeIn, user=Depends(staff)):
    s = await db.challenge_submissions.find_one({"id": sid}, NO_ID)
    if not s:
        raise HTTPException(404, "Submission not found")
    await db.challenge_submissions.update_one({"id": sid}, {"$set": {"instructor_grade": body.grade, "feedback": body.feedback, "status": "reviewed", "graded_by": user["name"], "graded_at": now_iso()}})
    await audit(user, "grade submission", sid)
    bg(grade_email(s["user_id"], f"the SOC challenge '{s['challenge_title']}'", body.grade, body.feedback, f"/app/challenges?case={s['challenge_id']}", user["name"]))
    return {"ok": True}


@router.post("/lab-reports/{uid}/{lid}/grade")
async def grade_lab(uid: str, lid: str, body: GradeIn, user=Depends(staff)):
    p = await db.lab_progress.find_one({"user_id": uid, "lab_id": lid, "report_submitted": True}, NO_ID)
    if not p:
        raise HTTPException(404, "Lab report not found")
    await db.lab_progress.update_one({"user_id": uid, "lab_id": lid}, {"$set": {"instructor_grade": body.grade, "feedback": body.feedback, "review_status": "reviewed", "graded_by": user["name"], "graded_at": now_iso()}})
    await audit(user, "grade lab report", f"{uid}:{lid}")
    bg(grade_email(uid, f"the lab '{p.get('lab_title', lid)}'", body.grade, body.feedback, f"/app/labs/{lid}", user["name"]))
    return {"ok": True}


# ---------- Student monitoring ----------
async def student_rows(q=None):
    us = await db.users.find({"role": "student", **(q or {})}, {"_id": 0, "password_hash": 0}).to_list(2000)
    paths = await db.paths.find({}, NO_ID).to_list(100)
    total = sum(len([l for m in p["modules"] for l in m["lessons"]]) for p in paths) or 1
    out = []
    for u in us:
        uid = u["id"]
        att = await db.quiz_attempts.find({"user_id": uid}, {"_id": 0, "score": 1, "passed": 1}).to_list(500)
        out.append({"id": uid, "name": u["name"], "email": u["email"], "username": u.get("username"), "goal": u.get("goal"), "plan": u.get("plan", "free"),
                    "xp": u.get("xp", 0), "rank": rank_for(u.get("xp", 0)), "streak": u.get("streak", 0), "last_active": u.get("last_active"), "created_at": u.get("created_at"),
                    "completion": round(100 * await db.lesson_progress.count_documents({"user_id": uid, "path_id": {"$in": [p["id"] for p in paths]}}) / total),
                    "quiz_attempts": len(att), "quiz_avg": round(sum(a["score"] for a in att) / len(att)) if att else None, "quiz_fails": len([a for a in att if not a.get("passed")]),
                    "challenges": await db.challenge_submissions.count_documents({"user_id": uid}),
                    "labs_done": await db.lab_progress.count_documents({"user_id": uid, "report_submitted": True}),
                    "drills": await db.drill_submissions.count_documents({"user_id": uid}),
                    "certs": await db.certificates.count_documents({"user_id": uid})})
    return out


def risk_reasons(r):
    why = []
    cutoff = (now().date() - timedelta(days=7)).isoformat()
    if not r["last_active"]:
        why.append("Never active since sign-up")
    elif r["last_active"] < cutoff:
        why.append(f"Inactive since {r['last_active']}")
    if r["quiz_avg"] is not None and r["quiz_avg"] < 60:
        why.append(f"Quiz average {r['quiz_avg']}%")
    if r["quiz_fails"] >= 2:
        why.append(f"Failed {r['quiz_fails']} quiz attempts")
    return why


@router.get("/at-risk")
async def at_risk(user=Depends(staff)):
    out = [{**r, "reasons": risk_reasons(r)} for r in await student_rows()]
    return sorted([r for r in out if r["reasons"]], key=lambda r: (-len(r["reasons"]), r["last_active"] or ""))


@router.get("/students.csv")
async def students_csv(user=Depends(staff)):
    rows = await student_rows()
    cols = ["name", "email", "username", "plan", "goal", "rank", "xp", "streak", "last_active", "completion", "quiz_attempts", "quiz_avg", "challenges", "labs_done", "drills", "certs", "at_risk"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        r["at_risk"] = "; ".join(risk_reasons(r))
        w.writerow([r.get(c, "") if r.get(c) is not None else "" for c in cols])
    await audit(user, "export student progress", str(len(rows)))
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="student-progress-{now_iso()[:10]}.csv"'})


@router.get("/students/{uid}")
async def student_detail(uid: str, user=Depends(staff)):
    u = await db.users.find_one({"id": uid, "role": "student"}, {"_id": 0, "password_hash": 0})
    if not u:
        raise HTTPException(404, "Student not found")
    row = (await student_rows({"id": uid}))[0]
    labs = {l["id"]: l for l in await db.labs.find({}, {"_id": 0, "id": 1, "title": 1, "tasks": 1}).to_list(100)}
    lab_rows = [{"lab_id": p["lab_id"], "title": labs.get(p["lab_id"], {}).get("title", p["lab_id"]), "solved": len(p.get("answered", {})),
                 "tasks": len(labs.get(p["lab_id"], {}).get("tasks", [])), "report_submitted": p.get("report_submitted", False), "report": p.get("report", ""),
                 "report_score": p.get("report_score"), "instructor_grade": p.get("instructor_grade"), "feedback": p.get("feedback", "")}
                for p in await db.lab_progress.find({"user_id": uid}, NO_ID).to_list(100)]
    subs = await db.challenge_submissions.find({"user_id": uid}, NO_ID).sort("created_at", -1).to_list(200)
    quizzes = await db.quiz_attempts.find({"user_id": uid}, {"_id": 0, "quiz_title": 1, "score": 1, "passed": 1, "created_at": 1}).sort("created_at", -1).to_list(100)
    drills = await db.drill_submissions.find({"user_id": uid}, {"_id": 0, "date": 1, "verdict_correct": 1, "score": 1}).sort("date", -1).to_list(30)
    activity = await db.activity.find({"user_id": uid}, {"_id": 0, "text": 1, "xp": 1, "created_at": 1}).sort("created_at", -1).to_list(25)
    return {"student": {**row, "location": u.get("location"), "open_to_work": u.get("open_to_work")}, "reasons": risk_reasons(row), "labs": lab_rows,
            "challenges": subs, "quizzes": quizzes, "drills": drills, "activity": activity}
