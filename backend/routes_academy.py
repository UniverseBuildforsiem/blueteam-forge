import io
import os
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from PIL import Image, ImageDraw
from pydantic import BaseModel, Field
from core import db, get_current_user, now_iso, new_id, audit

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}
LEVELS = ["Beginner", "Intermediate", "Advanced"]


def staff(user=Depends(get_current_user)):
    if user["role"] not in ("instructor", "admin"):
        raise HTTPException(403, "Insufficient permissions")
    return user


async def maybe_user(request: Request):
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


def lessons(c):
    return [l for m in c.get("modules", []) for l in m.get("lessons", [])]


def parse_dt(s):
    if not s:
        return None
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def pricing(c):
    price, mrp, ends = int(c.get("price") or 0), int(c.get("mrp") or 0), c.get("sale_ends_at")
    on_sale = mrp > price and (not ends or parse_dt(ends) > datetime.now(timezone.utc))
    cur = price if mrp <= price or on_sale else mrp
    return {"price": cur, "mrp": mrp if mrp > cur else None, "off": round(100 * (mrp - cur) / mrp) if mrp > cur else 0,
            "sale_ends_at": ends if on_sale and ends else None}


async def owns(user, c):
    if not user:
        return False
    if not pricing(c)["price"] or user["role"] == "admin" or c.get("instructor_id") == user["id"]:
        return True
    if await db.purchases.find_one({"user_id": user["id"], "product_id": f"course:{c['id']}"}):
        return True
    return bool(await db.lesson_progress.find_one({"user_id": user["id"], "path_id": c["id"]}))


def visible(c, user):
    return c and (c["status"] == "published" or (user and (user["role"] == "admin" or c.get("instructor_id") == user["id"])))


async def course_for(cid, user):
    c = await db.academy_courses.find_one({"id": cid}, NO_ID)
    if not visible(c, user):
        raise HTTPException(404, "Course not found")
    if not await owns(user, c):
        raise HTTPException(403, "Buy this course to start it")
    return {**c, "_course": True}


def stats(c):
    ls = lessons(c)
    att = [a["type"] for l in ls for a in l.get("attachments", [])]
    return {"modules_count": len(c.get("modules", [])), "lessons_count": len(ls), "minutes": sum(int(l.get("minutes") or 0) for l in ls),
            "videos": sum(bool(l.get("video_url")) for l in ls), "video_minutes": sum(int(l.get("minutes") or 0) for l in ls if l.get("video_url")),
            "quizzes": sum(bool((l.get("quiz") or {}).get("questions")) for l in ls) + att.count("quiz"),
            "labs": att.count("lab"), "ctfs": att.count("ctf"), "challenges": att.count("challenge"), "sops": att.count("sop"),
            "resources": sum(len([r for r in l.get("resources", []) if r.get("url")]) for l in ls), "previews": sum(bool(l.get("preview")) for l in ls),
            "final_exam": bool(c.get("final_quiz_id"))}


async def rating(cid):
    rows = await db.academy_reviews.find({"course_id": cid}, {"_id": 0, "rating": 1}).to_list(5000)
    return {"rating": round(sum(r["rating"] for r in rows) / len(rows), 1) if rows else None, "reviews_count": len(rows)}


async def students(cid):
    a = set(await db.purchases.distinct("user_id", {"product_id": f"course:{cid}"}))
    return len(a | set(await db.lesson_progress.distinct("user_id", {"path_id": cid})))


async def card(c, user):
    done = set(await db.lesson_progress.distinct("lesson_id", {"user_id": user["id"], "path_id": c["id"]})) if user else set()
    ids = {l["id"] for l in lessons(c)}
    return {k: c.get(k) for k in ("id", "title", "subtitle", "level", "category", "cover", "instructor_name", "updated_at")} | pricing(c) | stats(c) | await rating(c["id"]) | {
        "owned": await owns(user, c), "percent": round(100 * len(done & ids) / len(ids)) if ids else 0}


@router.get("/academy/courses")
async def list_courses(user=Depends(get_current_user)):
    return [await card(c, user) for c in await db.academy_courses.find({"status": "published"}, NO_ID).sort("published_at", -1).to_list(200)]


@router.get("/public/academy/courses")
async def public_courses(request: Request):
    user = await maybe_user(request)
    return [await card(c, user) for c in await db.academy_courses.find({"status": "published"}, NO_ID).sort("published_at", -1).to_list(200)]


def outline(c):
    return [{"id": m["id"], "title": m["title"], "lessons": [{"id": l["id"], "title": l["title"], "minutes": int(l.get("minutes") or 0), "video": bool(l.get("video_url")),
             "quiz": bool((l.get("quiz") or {}).get("questions")), "practice": len(l.get("attachments", [])), "preview": bool(l.get("preview")),
             **({"video_url": l.get("video_url", ""), "content": l.get("content", "")} if l.get("preview") else {})} for l in m["lessons"]]} for m in c.get("modules", [])]


@router.get("/public/academy/courses/{cid}")
async def landing(cid: str, request: Request):
    user = await maybe_user(request)
    c = await db.academy_courses.find_one({"id": cid}, NO_ID)
    if not visible(c, user):
        raise HTTPException(404, "Course not found")
    ins = await db.users.find_one({"id": c.get("instructor_id")}, {"_id": 0, "name": 1, "username": 1, "headline": 1, "bio": 1, "public_profile": 1}) or {}
    reviews = await db.academy_reviews.find({"course_id": cid}, {"_id": 0, "user_id": 0}).sort("at", -1).to_list(50)
    mine = await db.academy_reviews.find_one({"course_id": cid, "user_id": user["id"]}, {"_id": 0, "user_id": 0}) if user else None
    return {**{k: c.get(k) for k in ("id", "title", "subtitle", "description", "level", "category", "cover", "promo_video", "outcomes", "requirements", "audience",
                                    "instructor_name", "status", "updated_at", "published_at")},
            **pricing(c), **stats(c), **await rating(cid), "students": await students(cid), "modules": outline(c), "reviews": reviews,
            "instructor": {"name": ins.get("name") or c.get("instructor_name"), "headline": ins.get("headline"), "bio": ins.get("bio"),
                           "username": ins.get("username") if ins.get("public_profile") is not False else None},
            "signed_in": bool(user), "owned": await owns(user, c), "my_review": mine,
            "can_review": bool(user and await db.lesson_progress.find_one({"user_id": user["id"], "path_id": cid}))}


@router.get("/academy/courses/{cid}")
async def get_course(cid: str, user=Depends(get_current_user)):
    from routes_learn import path_view
    c = await course_for(cid, user)
    v = await path_view(c, user)
    cert = await db.academy_certs.find_one({"user_id": user["id"], "course_id": cid}, NO_ID)
    return {**v, **pricing(c), "kind": "course", "owned": True, "certificate": cert, "pending_changes": None}


async def issue_cert(user, c, score=None):
    cert = await db.academy_certs.find_one({"user_id": user["id"], "course_id": c["id"]}, NO_ID)
    if cert:
        return cert
    done = set(await db.lesson_progress.distinct("lesson_id", {"user_id": user["id"], "path_id": c["id"]}))
    if not all(l["id"] in done for l in lessons(c)):
        return None
    if c.get("final_quiz_id") and not await db.quiz_attempts.find_one({"user_id": user["id"], "quiz_id": c["final_quiz_id"], "passed": True}):
        return None
    cert = {"id": f"SOCP-C-{new_id()[:8].upper()}", "user_id": user["id"], "name": user["name"], "course_id": c["id"], "course_title": c["title"],
            "instructor_name": c.get("instructor_name"), "issued_at": now_iso(), **({"score": score} if score is not None else {})}
    await db.academy_certs.insert_one(dict(cert))
    cert.pop("_id", None)
    return cert


class ReviewBody(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: str = Field(default="", max_length=2000)


@router.post("/academy/courses/{cid}/reviews")
async def post_review(cid: str, body: ReviewBody, user=Depends(get_current_user)):
    c = await db.academy_courses.find_one({"id": cid, "status": "published"}, NO_ID)
    if not c or not await owns(user, c):
        raise HTTPException(403, "Only enrolled students can review this course")
    if not await db.lesson_progress.find_one({"user_id": user["id"], "path_id": cid}):
        raise HTTPException(400, "Complete at least one lesson before reviewing")
    doc = {"course_id": cid, "user_id": user["id"], "name": user["name"], "rating": body.rating, "text": body.text.strip(), "at": now_iso()}
    await db.academy_reviews.update_one({"course_id": cid, "user_id": user["id"]}, {"$set": doc}, upsert=True)
    doc.pop("user_id")
    return {"review": doc, **await rating(cid)}


@router.get("/academy/certificates/{cert_id}")
async def get_cert(cert_id: str):
    cert = await db.academy_certs.find_one({"id": cert_id}, NO_ID)
    if not cert:
        raise HTTPException(404, "Certificate not found")
    u = await db.users.find_one({"id": cert.pop("user_id")}, {"_id": 0, "username": 1, "public_profile": 1, "status": 1})
    cert["username"] = u["username"] if u and u.get("public_profile") is not False and u.get("status") == "active" else None
    cert["verify_url"] = f"{os.environ['FRONTEND_URL'].rstrip('/')}/verify/{cert_id}"
    return cert


def cert_png(c):
    from routes_share import font, draw_logo, CYAN, GREEN, NAVY, MUTED
    import qrcode
    img = Image.new("RGB", (1600, 1130), NAVY)
    d = ImageDraw.Draw(img)
    d.rectangle((24, 24, 1576, 1106), outline=CYAN, width=3)
    d.rectangle((36, 36, 1564, 1094), outline=GREEN, width=1)
    draw_logo(d)
    d.text((60, 170), "CERTIFICATE OF COURSE COMPLETION", font=font("LiberationMono-Bold.ttf", 28), fill=MUTED)
    d.text((60, 300), "This certifies that", font=font("LiberationSans-Regular.ttf", 32), fill=(248, 250, 252))
    d.text((60, 350), c["name"][:40], font=font("LiberationSans-Bold.ttf", 80), fill=(248, 250, 252))
    d.text((60, 480), "has successfully completed the course", font=font("LiberationSans-Regular.ttf", 32), fill=(248, 250, 252))
    d.text((60, 530), c["course_title"][:48], font=font("LiberationMono-Bold.ttf", 46), fill=GREEN)
    mono = font("LiberationSans-Regular.ttf", 26)
    url = f"{os.environ['FRONTEND_URL'].rstrip('/')}/verify/{c['id']}"
    for i, line in enumerate([f"Instructor: {c.get('instructor_name') or '-'}", f"Issued: {c['issued_at'][:10]}", f"Certificate ID: {c['id']}", f"Verify: {url}"]):
        d.text((60, 860 + i * 40), line, font=mono, fill=MUTED)
    img.paste(qrcode.make(url, border=2).get_image().convert("RGB").resize((260, 260)), (1270, 790))
    return img


async def find_cert(cert_id):
    c = await db.academy_certs.find_one({"id": cert_id}, NO_ID)
    if not c:
        raise HTTPException(404, "Certificate not found")
    return c


@router.get("/academy/certificates/{cert_id}/png")
async def get_cert_png(cert_id: str):
    buf = io.BytesIO()
    img = await run_in_threadpool(cert_png, await find_cert(cert_id))
    await run_in_threadpool(img.save, buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png", headers={"Content-Disposition": f"attachment; filename=SOCProfessionals-{cert_id}.png"})


@router.get("/academy/certificates/{cert_id}/pdf")
async def get_cert_pdf(cert_id: str):
    buf = io.BytesIO()
    img = await run_in_threadpool(cert_png, await find_cert(cert_id))
    await run_in_threadpool(img.save, buf, format="PDF", resolution=150)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=SOCProfessionals-{cert_id}.pdf"})


# ---------- instructor / admin ----------
class CourseIn(BaseModel):
    title: str = Field(min_length=3, max_length=140)
    subtitle: str = Field(default="", max_length=240)
    description: str = Field(default="", max_length=8000)
    level: str = "Beginner"
    category: str = Field(default="", max_length=60)
    price: int = Field(default=0, ge=0, le=200000)
    mrp: int = Field(default=0, ge=0, le=500000)
    sale_ends_at: Optional[str] = None
    cover: str = Field(default="", max_length=1000)
    promo_video: str = Field(default="", max_length=3000)
    outcomes: list[str] = Field(default_factory=list, max_length=30)
    requirements: list[str] = Field(default_factory=list, max_length=20)
    audience: list[str] = Field(default_factory=list, max_length=20)
    final_quiz_id: Optional[str] = None
    modules: list[dict] = Field(default_factory=list, max_length=40)


def check(body: CourseIn):
    from routes_manage import validate
    if body.level not in LEVELS:
        raise HTTPException(422, "Pick a valid level")
    if body.sale_ends_at:
        try:
            parse_dt(body.sale_ends_at)
        except ValueError:
            raise HTTPException(422, "Invalid sale end date")
    d = body.model_dump()
    for k in ("outcomes", "requirements", "audience"):
        d[k] = [x.strip()[:300] for x in d[k] if x.strip()]
    validate("paths", {"title": d["title"], "description": "-", "level": d["level"], "modules": d["modules"]})
    for l in lessons(d):
        l["preview"] = bool(l.get("preview"))
    return d


async def editable(cid, user):
    c = await db.academy_courses.find_one({"id": cid}, NO_ID)
    if not c or (user["role"] != "admin" and c["instructor_id"] != user["id"]):
        raise HTTPException(404, "Course not found")
    return c


@router.get("/academy/manage")
async def manage_list(user=Depends(staff)):
    q = {} if user["role"] == "admin" else {"instructor_id": user["id"]}
    return await db.academy_courses.find(q, NO_ID).sort("updated_at", -1).to_list(300)


@router.post("/academy/manage")
async def create(body: CourseIn, user=Depends(staff)):
    c = {**check(body), "id": new_id(), "instructor_id": user["id"], "instructor_name": user["name"], "status": "draft", "created_at": now_iso(), "updated_at": now_iso()}
    await db.academy_courses.insert_one(dict(c))
    await audit(user, "academy course create", c["title"])
    return c


@router.put("/academy/manage/{cid}")
async def update(cid: str, body: CourseIn, user=Depends(staff)):
    c = await editable(cid, user)
    d = check(body)
    if c["status"] == "published" and user["role"] != "admin":
        await db.academy_courses.update_one({"id": cid}, {"$set": {"pending_changes": d, "changes_at": now_iso(), "updated_at": now_iso()}})
    else:
        await db.academy_courses.update_one({"id": cid}, {"$set": {**d, "updated_at": now_iso()}, "$unset": {"pending_changes": "", "changes_submitted": ""}})
    return await db.academy_courses.find_one({"id": cid}, NO_ID)


@router.post("/academy/manage/{cid}/submit")
async def submit(cid: str, user=Depends(staff)):
    c = await editable(cid, user)
    if c["status"] == "published":
        if not c.get("pending_changes"):
            raise HTTPException(400, "No changes to submit")
        await db.academy_courses.update_one({"id": cid}, {"$set": {"changes_submitted": True, "review_note": ""}})
        return {"status": "published", "changes": "pending"}
    if not lessons(c):
        raise HTTPException(400, "Add at least one lesson before submitting")
    await db.academy_courses.update_one({"id": cid}, {"$set": {"status": "pending", "review_note": "", "submitted_at": now_iso()}})
    return {"status": "pending"}


class ReviewIn(BaseModel):
    action: str = Field(pattern="^(approve|reject|unpublish)$")
    note: Optional[str] = Field(default="", max_length=1000)


@router.post("/academy/manage/{cid}/review")
async def review(cid: str, body: ReviewIn, user=Depends(staff)):
    if user["role"] != "admin":
        raise HTTPException(403, "Only admins can review courses")
    c = await editable(cid, user)
    if c["status"] == "published" and c.get("pending_changes") and body.action in ("approve", "reject"):
        upd = {**c["pending_changes"]} if body.action == "approve" else {}
        await db.academy_courses.update_one({"id": cid}, {"$set": {**upd, "review_note": body.note or "", "updated_at": now_iso()}, "$unset": {"pending_changes": "", "changes_submitted": ""}})
        await audit(user, f"academy course changes {body.action}", c["title"])
        return {"status": "published", "changes": body.action}
    if body.action == "approve" and not lessons(c):
        raise HTTPException(400, "This course has no lessons yet")
    status = {"approve": "published", "reject": "rejected", "unpublish": "draft"}[body.action]
    await db.academy_courses.update_one({"id": cid}, {"$set": {"status": status, "review_note": body.note or "", "reviewed_by": user["name"],
                                                               **({"published_at": c.get("published_at") or now_iso()} if status == "published" else {})}})
    await audit(user, f"academy course {body.action}", c["title"])
    return {"status": status}


@router.delete("/academy/manage/{cid}")
async def delete(cid: str, user=Depends(staff)):
    c = await editable(cid, user)
    if c["status"] == "published" and user["role"] != "admin":
        raise HTTPException(400, "Ask an admin to unpublish this course first")
    await db.academy_courses.delete_one({"id": cid})
    return {"ok": True}


OLD_ATTACH = {"quiz": "quiz", "lab": "lab", "scenario": "challenge", "sop": "sop", "siem": "siem", "shift": "shift"}


def old_to_lesson(it):
    t = it["type"]
    att = [{"type": OLD_ATTACH[t], "id": it.get("ref") or t, "title": it["title"]}] if t in OLD_ATTACH else []
    return {"id": it["id"], "title": it["title"], "content": it.get("note", ""), "video_url": it.get("url", "") if t == "video" else "",
            "minutes": it.get("minutes", 10), "resources": [], "attachments": att, "preview": False}


async def migrate_courses():
    async for c in db.academy_courses.find({"modules.items": {"$exists": True}}, NO_ID):
        mods = [{"id": m["id"], "title": m["title"], "lessons": [old_to_lesson(i) for i in m.get("items", [])]} for m in c["modules"]]
        await db.academy_courses.update_one({"id": c["id"]}, {"$set": {"modules": mods}, "$unset": {"pending_changes": ""}})
        async for p in db.academy_progress.find({"course_id": c["id"]}, NO_ID):
            await db.lesson_progress.update_one({"user_id": p["user_id"], "lesson_id": p["item_id"]},
                                                {"$setOnInsert": {"path_id": c["id"], "minutes": 10, "created_at": p.get("at") or now_iso()}}, upsert=True)
    await db.academy_reviews.create_index([("course_id", 1), ("user_id", 1)], unique=True)
