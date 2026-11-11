import html
import re
from datetime import timedelta
import httpx
from core import db, now, now_iso

YT = re.compile(r"(?:youtu\.be/|youtube(?:-nocookie)?\.com/(?:watch\?(?:[^\s\"'<>]*&)?v=|embed/|shorts/|live/|v/))([A-Za-z0-9_-]{11})", re.I)
VM = re.compile(r"vimeo\.com/(?:video/|channels/[^/\s\"'<>]+/|groups/[^/\s\"'<>]+/videos/)?(\d+)(?:/([A-Fa-f0-9]{6,}))?", re.I)
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "Accept-Language": "en-US,en;q=0.9"}


def parse_video(raw):
    s = html.unescape(raw or "")
    m = YT.search(s)
    if m:
        return "yt", m.group(1), ""
    m = VM.search(s)
    if m:
        h = re.search(r"[?&]h=([A-Za-z0-9]+)", s)
        return "vm", m.group(1), m.group(2) or (h.group(1) if h else "")
    return None


async def fetch_meta(kind, vid, hsh):
    async with httpx.AsyncClient(timeout=7, follow_redirects=True, headers=UA) as c:
        if kind == "vm":
            r = await c.get("https://vimeo.com/api/oembed.json", params={"url": f"https://vimeo.com/{vid}{f'/{hsh}' if hsh else ''}"})
            if r.status_code == 404:
                return {"available": False, "duration": None}
            return {"available": True, "duration": r.json().get("duration") if r.status_code == 200 else None}
        o = await c.get("https://www.youtube.com/oembed", params={"url": f"https://www.youtube.com/watch?v={vid}", "format": "json"})
        if o.status_code in (401, 403, 404):
            return {"available": False, "duration": None}
        page = await c.get(f"https://www.youtube.com/watch?v={vid}")
        m = re.search(r'"lengthSeconds":"(\d+)"', page.text)
        return {"available": True, "duration": int(m.group(1)) if m else None}


async def video_meta(raw):
    v = parse_video(raw)
    if not v:
        return None
    key = f"{v[0]}:{v[1]}:{v[2]}"
    cached = await db.video_meta.find_one({"key": key}, {"_id": 0})
    if cached and cached["checked_at"] > (now() - timedelta(hours=12)).isoformat():
        return cached
    try:
        m = await fetch_meta(*v)
    except (httpx.HTTPError, ValueError):
        return cached or {"key": key, "available": True, "duration": None}
    m.update(key=key, checked_at=now_iso())
    await db.video_meta.update_one({"key": key}, {"$set": m}, upsert=True)
    return m
