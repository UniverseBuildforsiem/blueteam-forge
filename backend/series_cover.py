import asyncio
import base64
import io
import os
import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from PIL import Image
from emergentintegrations.llm.chat import LlmChat, UserMessage
from core import db, now_iso, new_id, logger, admin_only, audit

router = APIRouter(prefix="/api")
STORAGE_URL = ((os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com").rstrip("/") + "/objstore/api/v1/storage"
APP = "socpro"
SEM = asyncio.Semaphore(2)
TASKS = set()
CACHE = {}
_key = None

PROMPT = """Wide 16:9 cinematic digital illustration used as the cover of a cybersecurity blog post titled "{title}" (track: {section}).
Show a concrete visual metaphor for this specific topic (for example the tools, attack, logs, network or people involved), not a generic hacker.
Style: dark deep-navy background (#0B0F1A), glowing neon cyan (#00F0FF) and green (#00FF66) accents with one small warm highlight, crisp detailed shapes, subtle grid and light glow, professional security-operations mood.
Absolutely no text, letters, numbers, words, watermarks or brand logos anywhere in the image."""


def _storage_key(force=False):
    global _key
    if _key and not force:
        return _key
    r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": os.environ["EMERGENT_LLM_KEY"]}, timeout=30)
    r.raise_for_status()
    _key = r.json()["storage_key"]
    return _key


def _put(path, data, ctype):
    for attempt in (0, 1):
        r = requests.put(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": _storage_key(attempt == 1), "Content-Type": ctype}, data=data, timeout=120)
        if r.status_code == 404 and attempt == 0:
            continue
        r.raise_for_status()
        return r.json()["path"]


def _get(path):
    for attempt in (0, 1):
        r = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": _storage_key(attempt == 1)}, timeout=60)
        if r.status_code == 404 and attempt == 0:
            continue
        r.raise_for_status()
        return r.content


def to_webp(raw):
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    im.thumbnail((1280, 1280))
    out = io.BytesIO()
    im.save(out, "WEBP", quality=80)
    return out.getvalue()


async def make_cover(pid):
    async with SEM:
        p = await db.series_posts.find_one({"id": pid}, {"_id": 0, "id": 1, "title": 1, "section": 1})
        if not p:
            return
        await db.series_posts.update_one({"id": pid}, {"$set": {"cover_status": "generating"}})
        try:
            chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"cover-{pid}-{new_id()[:6]}", system_message="You create striking editorial illustrations.")
            chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(modalities=["image", "text"])
            _, images = await chat.send_message_multimodal_response(UserMessage(text=PROMPT.format(title=p["title"], section=p["section"])))
            if not images:
                raise ValueError("no image returned")
            data = await asyncio.to_thread(to_webp, base64.b64decode(images[0]["data"]))
            path = await asyncio.to_thread(_put, f"{APP}/series-covers/{pid}-{new_id()[:8]}.webp", data, "image/webp")
            await db.series_posts.update_one({"id": pid}, {"$set": {"ai_cover": path, "cover_status": "ready", "cover_at": now_iso()}})
            logger.info(f"Series cover made: {p['title']}")
        except Exception as e:
            logger.warning(f"Series cover failed '{p['title']}': {e}")
            await db.series_posts.update_one({"id": pid}, {"$set": {"cover_status": "failed"}})


def queue_cover(pid):
    t = asyncio.create_task(make_cover(pid))
    TASKS.add(t)
    t.add_done_callback(TASKS.discard)


def cover_url(p, section_cover):
    if p.get("cover"):
        return p["cover"]
    if p.get("ai_cover"):
        return f"/api/public/series-cover/{p['id']}?v={p['ai_cover'].rsplit('-', 1)[-1].split('.')[0]}"
    return section_cover


async def ensure_covers():
    await db.series_posts.update_many({"cover_status": "generating"}, {"$set": {"cover_status": None}})
    async for p in db.series_posts.find({"status": "ready", "ai_cover": {"$in": [None, ""]}, "cover_status": {"$ne": "failed"}}, {"_id": 0, "id": 1}):
        queue_cover(p["id"])


@router.get("/public/series-cover/{pid}")
async def serve_cover(pid: str):
    p = await db.series_posts.find_one({"id": pid}, {"_id": 0, "ai_cover": 1})
    if not p or not p.get("ai_cover"):
        raise HTTPException(404, "No cover")
    path = p["ai_cover"]
    if path not in CACHE:
        if len(CACHE) > 60:
            CACHE.pop(next(iter(CACHE)))
        CACHE[path] = await asyncio.to_thread(_get, path)
    return Response(CACHE[path], media_type="image/webp", headers={"Cache-Control": "public, max-age=604800"})


@router.post("/admin/series/{pid}/cover")
async def regen_cover(pid: str, user=Depends(admin_only)):
    p = await db.series_posts.find_one({"id": pid}, {"_id": 0, "title": 1, "cover_status": 1})
    if not p:
        raise HTTPException(404, "Post not found")
    if p.get("cover_status") != "generating":
        await db.series_posts.update_one({"id": pid}, {"$set": {"cover_status": "generating"}})
        queue_cover(pid)
        await audit(user, "series cover ai", p["title"][:80])
    return {"ok": True, "cover_status": "generating"}
