import asyncio
import io
import os
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response, HTMLResponse
from PIL import Image, ImageDraw
from routes_share import font, wrap, draw_logo, og_page, CYAN, GREEN, MUTED
from routes_series import all_posts
from series_cover import _get

router = APIRouter(prefix="/api")
CACHE = {}


async def share_post(slug):
    posts = await all_posts({"published": True}, {"_id": 0, "body": 0})
    p = next((x for x in posts if x["slug"] == slug and x["status"] == "ready"), None)
    if not p:
        raise HTTPException(404, "Post not found")
    return p, len(posts)


async def cover_bytes(p):
    if p["cover"].startswith("/api/") and p.get("ai_cover"):
        return await asyncio.to_thread(_get, p["ai_cover"])
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as c:
        r = await c.get(p["cover"])
        r.raise_for_status()
        return r.content


def render(p, total, raw):
    w, h = 1200, 627
    try:
        bg = Image.open(io.BytesIO(raw)).convert("RGB")
        s = max(w / bg.width, h / bg.height)
        bg = bg.resize((int(bg.width * s) + 1, int(bg.height * s) + 1))
        bg = bg.crop(((bg.width - w) // 2, (bg.height - h) // 2, (bg.width - w) // 2 + w, (bg.height - h) // 2 + h))
    except Exception:
        bg = Image.new("RGB", (w, h), (11, 15, 26))
    shade = Image.new("L", (w, h))
    sd = ImageDraw.Draw(shade)
    for x in range(w):
        sd.line([(x, 0), (x, h)], fill=int(max(70, 245 - 175 * max(0, x - 380) / 820)))
    img = Image.composite(Image.new("RGB", (w, h), (11, 15, 26)), bg, shade)
    d = ImageDraw.Draw(img)
    d.rectangle([24, 24, w - 24, h - 24], outline=CYAN, width=3)
    draw_logo(d)
    d.text((64, 150), f"SOC ANALYST SERIES  #{p['number']:03d} / {total}", font=font("LiberationMono-Bold.ttf", 22), fill=CYAN)
    big = font("LiberationSans-Bold.ttf", 56)
    lines = wrap(d, p["title"], big, 760)
    if len(lines) > 4:
        big = font("LiberationSans-Bold.ttf", 46)
        lines = wrap(d, p["title"], big, 780)[:4]
    y = 196
    for line in lines[:4]:
        d.text((64, y), line, font=big, fill=(248, 250, 252))
        y += big.size + 12
    d.text((64, 520), p["section"].upper(), font=font("LiberationMono-Bold.ttf", 20), fill=GREEN)
    d.text((64, 552), f"{p.get('read_min', 10)} MIN READ  ·  LOGS · SPL · KQL · PLAYBOOK", font=font("LiberationMono-Bold.ttf", 18), fill=MUTED)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


@router.get("/public/series-share/{slug}.png")
async def share_png(slug: str):
    p, total = await share_post(slug)
    key = (slug, p["cover"], p["title"], p["number"], total)
    if key not in CACHE:
        try:
            raw = await cover_bytes(p)
        except Exception:
            raw = b""
        if len(CACHE) > 40:
            CACHE.pop(next(iter(CACHE)))
        CACHE[key] = await asyncio.to_thread(render, p, total, raw)
    return Response(CACHE[key], media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@router.get("/public/series-share/{slug}", response_class=HTMLResponse)
async def share_page(slug: str):
    p, _ = await share_post(slug)
    home = f"{os.environ['FRONTEND_URL'].rstrip('/')}/soc-series/{slug}"
    desc = p.get("excerpt") or "Hands-on SOC analyst guide with real logs, SPL and KQL detections and an investigation playbook."
    return HTMLResponse(og_page(f"{p['title']} | SOC Analyst Series #{p['number']:03d}", desc, f"/public/series-share/{slug}", home))
