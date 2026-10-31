import io
import os
import secrets
from html import escape
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel
from PIL import Image, ImageDraw, ImageFont
from core import db, get_current_user, rank_for
from routes_practice import streak_stats

router = APIRouter(prefix="/api")
FONTS = Path(__file__).parent / "assets" / "fonts"
CYAN, GREEN, NAVY, ORANGE, MUTED = (0, 240, 255), (0, 255, 102), (11, 15, 26), (255, 149, 0), (148, 163, 184)


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def api_base():
    return os.environ["FRONTEND_URL"].rstrip("/") + "/api"


@router.post("/me/share-card")
async def share_card(user=Depends(get_current_user)):
    token = user.get("share_token")
    if not token:
        token = secrets.token_urlsafe(10)
        await db.users.update_one({"id": user["id"]}, {"$set": {"share_token": token}})
    share_url = f"{api_base()}/public/streak/{token}"
    return {"share_url": share_url, "image_url": f"{share_url}.png"}


async def card_data(token):
    u = await db.users.find_one({"share_token": token}, {"_id": 0, "id": 1, "name": 1, "xp": 1})
    if not u:
        raise HTTPException(404, "Card not found")
    current, longest, total = await streak_stats(u["id"])
    return u, current, longest, total


def render(name, current, longest, total, xp):
    w, h = 1200, 627
    img = Image.new("RGB", (w, h), NAVY)
    d = ImageDraw.Draw(img)
    for x in range(0, w, 40):
        d.line([(x, 0), (x, h)], fill=(15, 24, 38))
    for y in range(0, h, 40):
        d.line([(0, y), (w, y)], fill=(15, 24, 38))
    d.rectangle([24, 24, w - 24, h - 24], outline=CYAN, width=3)
    d.text((64, 60), "> SOC", font=font("LiberationMono-Bold.ttf", 40), fill=(248, 250, 252))
    d.text((64 + d.textlength("> SOC", font=font("LiberationMono-Bold.ttf", 40)), 60), "Forge", font=font("LiberationMono-Bold.ttf", 40), fill=GREEN)
    d.text((64, 120), "DAILY ALERT DRILL", font=font("LiberationMono-Bold.ttf", 22), fill=CYAN)
    d.text((64, 190), name[:28], font=font("LiberationSans-Bold.ttf", 56), fill=(248, 250, 252))
    big = font("LiberationMono-Bold.ttf", 150)
    d.text((64, 270), str(current), font=big, fill=ORANGE)
    d.text((80 + d.textlength(str(current), font=big), 330), "day streak", font=font("LiberationMono-Bold.ttf", 44), fill=ORANGE)
    stats = [("LONGEST", f"{longest} days"), ("DRILLS", str(total)), ("RANK", rank_for(xp or 0)), ("XP", str(xp or 0))]
    for i, (k, v) in enumerate(stats):
        x = 64 + i * 270
        d.text((x, 478), k, font=font("LiberationMono-Bold.ttf", 18), fill=MUTED)
        d.text((x, 504), v, font=font("LiberationMono-Bold.ttf", 34), fill=GREEN if k == "RANK" else (248, 250, 252))
    d.text((w - 64, 66), "blue team training", font=font("LiberationSans-Regular.ttf", 22), fill=MUTED, anchor="ra")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


@router.get("/public/streak/{token}.png")
async def streak_png(token: str):
    u, current, longest, total = await card_data(token)
    return StreamingResponse(render(u["name"], current, longest, total, u.get("xp")), media_type="image/png", headers={"Cache-Control": "public, max-age=600"})


@router.get("/public/profile/{username}")
async def public_profile(username: str):
    from routes_learn import compute_badges
    u = await db.users.find_one({"username": username.lower(), "status": "active"}, {"_id": 0, "password_hash": 0})
    if not u or u.get("public_profile") is False:
        raise HTTPException(404, "Profile not found")
    current, longest, total = await streak_stats(u["id"])
    certs = await db.certificates.find({"user_id": u["id"], "status": "valid"}, {"_id": 0, "id": 1, "path_title": 1, "score": 1, "issued_at": 1}).sort("issued_at", -1).to_list(50)
    badges = [b for b in await compute_badges(u) if b["earned"]]
    return {"name": u["name"], "username": u["username"], "rank": rank_for(u.get("xp", 0)), "xp": u.get("xp", 0), "goal": u.get("goal"),
            "joined": u["created_at"][:10], "badges": badges, "certificates": certs,
            "drill": {"current": current, "longest": longest, "total": total}}


class ProfileVis(BaseModel):
    public_profile: bool


@router.patch("/me/profile-visibility")
async def profile_visibility(body: ProfileVis, user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"public_profile": body.public_profile}})
    return {"public_profile": body.public_profile}


@router.get("/public/streak/{token}", response_class=HTMLResponse)
async def streak_page(token: str):
    u, current, longest, _ = await card_data(token)
    title = escape(f"{u['name']} is on a {current}-day SOC drill streak on SOCForge")
    desc = escape(f"Daily alert triage practice. Longest streak: {longest} days. Train like a real SOC analyst.")
    img = f"{api_base()}/public/streak/{escape(token)}.png"
    home = escape(os.environ["FRONTEND_URL"])
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>
<meta property="og:type" content="website"><meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:image" content="{img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="627">
<meta property="og:url" content="{api_base()}/public/streak/{escape(token)}"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url={home}"></head>
<body style="background:#0B0F1A;color:#fff;font-family:monospace"><a href="{home}" style="color:#00F0FF">{title}</a></body></html>"""
