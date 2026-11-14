import io
import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image, ImageDraw
from pydantic import BaseModel, Field
from core import db, get_current_user, now_iso, new_id, audit

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}
TYPES = {"video", "quiz", "lab", "scenario", "sop", "siem", "shift"}
LEVELS = ["Beginner", "Intermediate", "Advanced"]


def staff(user=Depends(get_current_user)):
    if user["role"] not in ("instructor", "admin"):
        raise HTTPException(403, "Insufficient permissions")
    return user


class Item(BaseModel):
    id: str = Field(default_factory=lambda: new_id()[:10], max_length=40)
    type: str
    title: str = Field(min_length=1, max_length=160)
    ref: str = Field(default="", max_length=80)
    url: str = Field(default="", max_length=3000)
    note: str = Field(default="", max_length=1000)
    minutes: int = Field(default=10, ge=1, le=600)


class Module(BaseModel):
    id: str = Field(default_factory=lambda: new_id()[:10], max_length=40)
    title: str = Field(min_length=1, max_length=160)
    items: list[Item] = Field(default_factory=list, max_length=40)


class CourseIn(BaseModel):
    title: str = Field(min_length=3, max_length=140)
    subtitle: str = Field(default="", max_length=240)
    description: str = Field(default="", max_length=6000)
    level: str = "Beginner"
    price: int = Field(default=0, ge=0, le=200000)
    cover: str = Field(default="", max_length=1000)
    modules: list[Module] = Field(default_factory=list, max_length=30)


def check(body: CourseIn):
    if body.level not in LEVELS:
        raise HTTPException(422, "Pick a valid level")
    for m in body.modules:
        for it in m.items:
            if it.type not in TYPES:
                raise HTTPException(422, f"Unknown item type '{it.type}'")
            if it.type == "video" and not it.url.strip():
                raise HTTPException(422, f"Video '{it.title}' needs a link")
            if it.type in ("quiz", "lab", "scenario", "sop") and not it.ref:
                raise HTTPException(422, f"Pick which {it.type} '{it.title}' uses")


def items(c):
    return [it for m in c.get("modules", []) for it in m.get("items", [])]


async def owns(user, c):
    if not c.get("price") or user["role"] == "admin" or c.get("instructor_id") == user["id"]:
        return True
    if await db.purchases.find_one({"user_id": user["id"], "product_id": f"course:{c['id']}"}):
        return True
    return bool(await db.academy_progress.find_one({"user_id": user["id"], "course_id": c["id"]}))


async def done_set(uid, cid, c=None):
    got = set(await db.academy_progress.distinct("item_id", {"user_id": uid, "course_id": cid}))
    return got & {i["id"] for i in items(c)} if c else got


def card(c, owned, done):
    total = len(items(c))
    return {k: c.get(k) for k in ("id", "title", "subtitle", "level", "price", "cover", "instructor_name", "updated_at")} | {
        "owned": owned, "modules_count": len(c.get("modules", [])), "items_count": total, "minutes": sum(i.get("minutes", 0) for i in items(c)),
        "percent": round(100 * len(done) / total) if total else 0, "types": sorted({i["type"] for i in items(c)})}


@router.get("/academy/courses")
async def list_courses(user=Depends(get_current_user)):
    out = []
    for c in await db.academy_courses.find({"status": "published"}, NO_ID).sort("published_at", -1).to_list(200):
        out.append(card(c, await owns(user, c), await done_set(user["id"], c["id"], c)))
    return out


@router.get("/academy/courses/{cid}")
async def get_course(cid: str, user=Depends(get_current_user)):
    c = await db.academy_courses.find_one({"id": cid}, NO_ID)
    if not c or (c["status"] != "published" and user["role"] != "admin" and c.get("instructor_id") != user["id"]):
        raise HTTPException(404, "Course not found")
    owned = await owns(user, c)
    done = await done_set(user["id"], cid, c)
    mods = [{"id": m["id"], "title": m["title"], "items": [it if owned else {k: it[k] for k in ("id", "type", "title", "minutes")} for it in m["items"]]} for m in c["modules"]]
    cert = await db.academy_certs.find_one({"user_id": user["id"], "course_id": cid}, NO_ID)
    return {**card(c, owned, done), "status": c["status"], "description": c.get("description", ""), "modules": mods, "done": sorted(done), "certificate": cert}


async def verify(uid, it):
    t, ref = it["type"], it.get("ref")
    if t == "quiz" and not await db.quiz_attempts.find_one({"user_id": uid, "quiz_id": ref}):
        raise HTTPException(400, "Take this quiz first, then mark it done")
    if t == "lab":
        lab = await db.labs.find_one({"id": ref}, {"_id": 0, "tasks": 1})
        prog = await db.lab_progress.find_one({"user_id": uid, "lab_id": ref}, NO_ID) or {}
        if lab and len(prog.get("answered", {})) < len(lab.get("tasks", [])):
            raise HTTPException(400, "Solve every task in this lab first")
    if t == "scenario" and not await db.challenge_submissions.find_one({"user_id": uid, "challenge_id": ref}):
        raise HTTPException(400, "Submit your verdict for this scenario first")


@router.post("/academy/courses/{cid}/items/{iid}/done")
async def mark_done(cid: str, iid: str, user=Depends(get_current_user)):
    c = await db.academy_courses.find_one({"id": cid, "status": "published"}, NO_ID)
    if not c:
        raise HTTPException(404, "Course not found")
    if not await owns(user, c):
        raise HTTPException(403, "Buy this course to start it")
    it = next((i for i in items(c) if i["id"] == iid), None)
    if not it:
        raise HTTPException(404, "Item not found")
    await verify(user["id"], it)
    await db.academy_progress.update_one({"user_id": user["id"], "course_id": cid, "item_id": iid}, {"$setOnInsert": {"at": now_iso()}}, upsert=True)
    done = await done_set(user["id"], cid, c)
    cert = None
    if all(i["id"] in done for i in items(c)):
        cert = await db.academy_certs.find_one({"user_id": user["id"], "course_id": cid}, NO_ID)
        if not cert:
            cert = {"id": f"SOCP-C-{new_id()[:8].upper()}", "user_id": user["id"], "name": user["name"], "course_id": cid, "course_title": c["title"],
                    "instructor_name": c.get("instructor_name"), "issued_at": now_iso()}
            await db.academy_certs.insert_one(dict(cert))
            cert.pop("_id", None)
    return {"done": sorted(done), "percent": round(100 * len(done) / len(items(c))), "certificate": cert}


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
    cert_png(await find_cert(cert_id)).save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png", headers={"Content-Disposition": f"attachment; filename=SOCProfessionals-{cert_id}.png"})


@router.get("/academy/certificates/{cert_id}/pdf")
async def get_cert_pdf(cert_id: str):
    buf = io.BytesIO()
    cert_png(await find_cert(cert_id)).save(buf, format="PDF", resolution=150)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=SOCProfessionals-{cert_id}.pdf"})


# ---------- instructor / admin ----------
async def editable(cid, user):
    c = await db.academy_courses.find_one({"id": cid}, NO_ID)
    if not c or (user["role"] != "admin" and c["instructor_id"] != user["id"]):
        raise HTTPException(404, "Course not found")
    return c


@router.get("/academy/manage")
async def manage_list(user=Depends(staff)):
    q = {} if user["role"] == "admin" else {"instructor_id": user["id"]}
    return await db.academy_courses.find(q, NO_ID).sort("updated_at", -1).to_list(300)


@router.get("/academy/manage/options")
async def options(user=Depends(staff)):
    from routes_sop import all_sops
    pick = lambda rows: [{"id": r["id"], "title": r["title"]} for r in rows]  # noqa: E731
    return {"quiz": pick(await db.quizzes.find({}, {"_id": 0, "id": 1, "title": 1}).to_list(500)), "lab": pick(await db.labs.find({}, {"_id": 0, "id": 1, "title": 1}).to_list(200)),
            "scenario": pick(await db.challenges.find({}, {"_id": 0, "id": 1, "title": 1}).to_list(500)), "sop": pick(await all_sops())}


@router.post("/academy/manage")
async def create(body: CourseIn, user=Depends(staff)):
    check(body)
    c = {**body.model_dump(), "id": new_id(), "instructor_id": user["id"], "instructor_name": user["name"], "status": "draft", "created_at": now_iso(), "updated_at": now_iso()}
    await db.academy_courses.insert_one(dict(c))
    await audit(user, "academy course create", c["title"])
    return c


@router.put("/academy/manage/{cid}")
async def update(cid: str, body: CourseIn, user=Depends(staff)):
    c = await editable(cid, user)
    check(body)
    if c["status"] == "published" and user["role"] != "admin":
        await db.academy_courses.update_one({"id": cid}, {"$set": {"pending_changes": body.model_dump(), "changes_at": now_iso(), "updated_at": now_iso()}})
    else:
        await db.academy_courses.update_one({"id": cid}, {"$set": {**body.model_dump(), "updated_at": now_iso()}, "$unset": {"pending_changes": ""}})
    return await db.academy_courses.find_one({"id": cid}, NO_ID)


@router.post("/academy/manage/{cid}/submit")
async def submit(cid: str, user=Depends(staff)):
    c = await editable(cid, user)
    if c["status"] == "published":
        if not c.get("pending_changes"):
            raise HTTPException(400, "No changes to submit")
        await db.academy_courses.update_one({"id": cid}, {"$set": {"changes_submitted": True, "review_note": ""}})
        return {"status": "published", "changes": "pending"}
    if not items(c):
        raise HTTPException(400, "Add at least one module item before submitting")
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
    if body.action == "approve" and not items(c):
        raise HTTPException(400, "This course has no content yet")
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
