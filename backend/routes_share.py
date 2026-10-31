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
    u = await db.users.find_one({"share_token": token}, {"_id": 0, "id": 1, "name": 1, "xp": 1, "username": 1, "public_profile": 1})
    if not u:
        raise HTTPException(404, "Card not found")
    current, longest, total = await streak_stats(u["id"])
    return u, current, longest, total


def render(name, current, longest, total, xp, handle=None):
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
    if handle:
        d.text((w - 64, 560), f"socforge · /u/{handle}", font=font("LiberationMono-Bold.ttf", 20), fill=CYAN, anchor="ra")
    d.text((w - 64, 66), "blue team training", font=font("LiberationSans-Regular.ttf", 22), fill=MUTED, anchor="ra")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


@router.get("/public/streak/{token}.png")
async def streak_png(token: str):
    u, current, longest, total = await card_data(token)
    return StreamingResponse(render(u["name"], current, longest, total, u.get("xp"), u["username"] if u.get("public_profile") is not False else None), media_type="image/png", headers={"Cache-Control": "public, max-age=600"})


async def skills_for(uid):
    topics = {}
    for a in await db.quiz_attempts.find({"user_id": uid}, {"_id": 0, "topics": 1}).to_list(1000):
        for t, (c, n) in a["topics"].items():
            if t == "Final":
                continue
            x = topics.setdefault(t, [0, 0])
            x[0] += c
            x[1] += n
    for s in await db.challenge_submissions.find({"user_id": uid}, {"_id": 0, "category": 1, "verdict_correct": 1}).to_list(500):
        x = topics.setdefault(s["category"], [0, 0])
        x[0] += 1 if s["verdict_correct"] else 0
        x[1] += 1
    return sorted(t for t, (c, n) in topics.items() if n and c / n >= 0.7)


async def profile_summary(u):
    from routes_learn import compute_badges
    current, longest, total = await streak_stats(u["id"])
    certs = await db.certificates.find({"user_id": u["id"], "status": "valid"}, {"_id": 0, "id": 1, "path_title": 1, "score": 1, "issued_at": 1}).sort("issued_at", -1).to_list(50)
    return {"name": u["name"], "username": u["username"], "rank": rank_for(u.get("xp", 0)), "xp": u.get("xp", 0), "goal": u.get("goal"),
            "joined": u["created_at"][:10], "badges": [b for b in await compute_badges(u) if b["earned"]], "certificates": certs,
            "skills": await skills_for(u["id"]), "drill": {"current": current, "longest": longest, "total": total}}


@router.get("/public/profile/{username}")
async def public_profile(username: str):
    u = await db.users.find_one({"username": username.lower(), "status": "active"}, {"_id": 0, "password_hash": 0})
    if not u or u.get("public_profile") is False:
        raise HTTPException(404, "Profile not found")
    return await profile_summary(u)


@router.get("/public/talent")
async def talent(q: str = "", rank: str = "", cert: str = "", skill: str = ""):
    us = await db.users.find({"role": "student", "status": "active", "public_profile": {"$ne": False}, "onboarded": True},
                             {"_id": 0, "password_hash": 0}).sort("xp", -1).to_list(300)
    if cert:
        holders = set(await db.certificates.distinct("user_id", {"path_title": cert, "status": "valid"}))
        us = [u for u in us if u["id"] in holders]
    rows = []
    for u in us:
        if q and q.lower() not in f"{u['name']} {u['username']}".lower():
            continue
        if rank and rank_for(u.get("xp", 0)) != rank:
            continue
        p = await profile_summary(u)
        if cert and cert not in [c["path_title"] for c in p["certificates"]]:
            continue
        if skill and skill not in p["skills"]:
            continue
        rows.append({k: p[k] for k in ("name", "username", "rank", "xp", "goal", "skills", "drill")} | {"certificates": [c["path_title"] for c in p["certificates"]], "badge_count": len(p["badges"])})
    paths = await db.paths.find({"published": True}, {"_id": 0, "title": 1}).sort("order", 1).to_list(50)
    skills = sorted({s for r in rows for s in r["skills"]} | {"Phishing", "Malware", "Brute Force", "Ransomware", "Lateral Movement", "Network", "Windows Logs"})
    return {"results": rows[:60], "total": len(rows), "options": {"ranks": ["Recruit", "Analyst", "Hunter", "Elite"], "certificates": [p["title"] for p in paths], "skills": skills}}


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
    base = os.environ["FRONTEND_URL"].rstrip("/")
    home = escape(f"{base}/u/{u['username']}" if u.get("public_profile") is not False else base)
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>
<meta property="og:type" content="website"><meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:image" content="{img}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="627">
<meta property="og:url" content="{api_base()}/public/streak/{escape(token)}"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url={home}"></head>
<body style="background:#0B0F1A;color:#fff;font-family:monospace"><a href="{home}" style="color:#00F0FF">{title}</a></body></html>"""
