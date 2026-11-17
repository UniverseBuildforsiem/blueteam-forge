import io
from html import escape
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from core import db, get_current_user, now_iso

router = APIRouter(prefix="/api/notes")
NO_ID = {"_id": 0}


async def find_path(pid):
    c = await db.academy_courses.find_one({"id": pid}, NO_ID)
    if c:
        return c, "course"
    return await db.paths.find_one({"id": pid}, NO_ID), "path"


def locate(p, lid):
    for mi, m in enumerate(p.get("modules", [])):
        for li, l in enumerate(m.get("lessons", [])):
            if l["id"] == lid:
                return mi, li, m, l
    return None


async def collect(user, path_id=None):
    q = {"user_id": user["id"], **({"path_id": path_id} if path_id else {})}
    notes = await db.lesson_notes.find(q, {"_id": 0, "user_id": 0}).to_list(2000)
    cache, out = {}, []
    for n in notes:
        if n["path_id"] not in cache:
            cache[n["path_id"]] = await find_path(n["path_id"])
        p, kind = cache[n["path_id"]]
        hit = p and locate(p, n["lesson_id"])
        if not hit:
            continue
        mi, li, m, l = hit
        out.append({**n, "kind": kind, "path_title": p["title"], "module_title": m.get("title", ""), "lesson_title": l.get("title", ""), "order": [mi, li]})
    return sorted(out, key=lambda n: (n["path_title"].lower(), n["order"]))


@router.get("")
async def list_notes(path_id: Optional[str] = None, user=Depends(get_current_user)):
    return await collect(user, path_id)


class NoteIn(BaseModel):
    text: str = Field(default="", max_length=20000)


@router.put("/{path_id}/{lesson_id}")
async def save_note(path_id: str, lesson_id: str, body: NoteIn, user=Depends(get_current_user)):
    p, _ = await find_path(path_id)
    if not p or not locate(p, lesson_id):
        raise HTTPException(404, "Lesson not found")
    key = {"user_id": user["id"], "path_id": path_id, "lesson_id": lesson_id}
    if not body.text.strip():
        await db.lesson_notes.delete_one(key)
        return {"ok": True, "deleted": True}
    at = now_iso()
    await db.lesson_notes.update_one(key, {"$set": {"text": body.text, "updated_at": at}, "$setOnInsert": {"created_at": at}}, upsert=True)
    return {"ok": True, "updated_at": at}


def as_text(notes, name):
    lines, cur = [f"# My SOC Notes — {name}", ""], None
    for n in notes:
        if n["path_title"] != cur:
            cur = n["path_title"]
            lines += [f"## {cur}", ""]
        lines += [f"### {n['module_title']} › {n['lesson_title']}", n["text"].strip(), ""]
    return "\n".join(lines)


def as_pdf(notes, name):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.colors import HexColor
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    buf, ss = io.BytesIO(), getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=ss["Title"], textColor=HexColor("#0E7490"), fontSize=20)
    h2 = ParagraphStyle("h2", parent=ss["Heading2"], textColor=HexColor("#0F172A"), spaceBefore=14)
    h3 = ParagraphStyle("h3", parent=ss["Heading4"], textColor=HexColor("#0891B2"), spaceBefore=8)
    body = ParagraphStyle("b", parent=ss["BodyText"], fontSize=10.5, leading=15)
    story, cur = [Paragraph("My SOC Notes", h1), Paragraph(escape(f"{name} · SOCProfessionals Academy"), ss["Italic"]), Spacer(1, 10)], None
    for n in notes:
        if n["path_title"] != cur:
            cur = n["path_title"]
            story.append(Paragraph(escape(cur), h2))
        story.append(Paragraph(escape(f"{n['module_title']} › {n['lesson_title']}"), h3))
        story.append(Paragraph(escape(n["text"].strip()).replace("\n", "<br/>"), body))
    SimpleDocTemplate(buf, pagesize=A4, title="My SOC Notes", leftMargin=48, rightMargin=48, topMargin=48, bottomMargin=48).build(story)
    buf.seek(0)
    return buf


@router.get("/export")
async def export(format: str = "pdf", path_id: Optional[str] = None, user=Depends(get_current_user)):
    notes = await collect(user, path_id)
    if not notes:
        raise HTTPException(404, "No notes to download yet")
    slug = "".join(ch if ch.isalnum() else "-" for ch in (notes[0]["path_title"] if path_id else "all-courses"))[:60].strip("-").lower()
    if format == "md":
        return StreamingResponse(io.BytesIO(as_text(notes, user["name"]).encode()), media_type="text/markdown; charset=utf-8",
                                 headers={"Content-Disposition": f'attachment; filename="notes-{slug}.md"'})
    if format != "pdf":
        raise HTTPException(422, "format must be pdf or md")
    buf = await run_in_threadpool(as_pdf, notes, user["name"])
    return StreamingResponse(buf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="notes-{slug}.pdf"'})
