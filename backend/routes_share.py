import io
import os
import secrets
from html import escape
from pathlib import Path
from datetime import timedelta
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel, Field
from PIL import Image, ImageDraw, ImageFont
from core import db, get_current_user, rank_for, now, now_iso, send_email, email_template
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


async def skill_scores(uid):
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
    return sorted(({"topic": t, "accuracy": round(100 * c / n)} for t, (c, n) in topics.items() if n), key=lambda x: x["topic"])


async def skills_for(uid):
    return [s["topic"] for s in await skill_scores(uid) if s["accuracy"] >= 70]


JOB_FIELDS = ("open_to_work", "location", "work_mode")


async def profile_summary(u):
    from routes_learn import compute_badges
    current, longest, total = await streak_stats(u["id"])
    certs = await db.certificates.find({"user_id": u["id"], "status": "valid"}, {"_id": 0, "id": 1, "path_title": 1, "score": 1, "issued_at": 1}).sort("issued_at", -1).to_list(50)
    scores = await skill_scores(u["id"])
    return {"name": u["name"], "username": u["username"], "rank": rank_for(u.get("xp", 0)), "xp": u.get("xp", 0), "goal": u.get("goal"),
            "joined": u["created_at"][:10], "badges": [b for b in await compute_badges(u) if b["earned"]], "certificates": certs,
            "skills": [s["topic"] for s in scores if s["accuracy"] >= 70], "skill_scores": scores,
            "open_to_work": bool(u.get("open_to_work")), "location": u.get("location", ""), "work_mode": u.get("work_mode", ""),
            "drill": {"current": current, "longest": longest, "total": total}}


class JobPrefs(BaseModel):
    open_to_work: bool
    location: str = Field(default="", max_length=60)
    work_mode: str = Field(default="", pattern="^(|Remote|Hybrid|On-site)$")


@router.patch("/me/job-prefs")
async def job_prefs(body: JobPrefs, user=Depends(get_current_user)):
    data = {**body.model_dump(), "location": body.location.strip()}
    await db.users.update_one({"id": user["id"]}, {"$set": data})
    return data


class ContactIn(BaseModel):
    recruiter_name: str = Field(min_length=2, max_length=60)
    recruiter_email: str = Field(max_length=120)
    company: str = Field(min_length=2, max_length=80)
    role: str = Field(default="", max_length=80)
    message: str = Field(min_length=20, max_length=1500)


@router.post("/public/profile/{username}/contact")
async def contact(username: str, body: ContactIn, request: Request):
    from routes_auth import EMAIL_RE
    email = body.recruiter_email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid work email")
    u = await db.users.find_one({"username": username.lower(), "status": "active", "public_profile": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "email": 1, "open_to_work": 1})
    if not u or not u.get("open_to_work"):
        raise HTTPException(404, "This candidate is not accepting contact requests")
    fwd = request.headers.get("X-Forwarded-For", "")
    ip = fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "x")
    day_ago = (now() - timedelta(days=1)).isoformat()
    if await db.contact_requests.count_documents({"$or": [{"ip": ip}, {"recruiter_email": email}], "created_at": {"$gte": day_ago}}) >= 5:
        raise HTTPException(429, "Daily contact limit reached. Try again tomorrow.")
    if await db.contact_requests.find_one({"recruiter_email": email, "user_id": u["id"], "created_at": {"$gte": day_ago}}):
        raise HTTPException(429, "You already contacted this candidate today")
    lines = [f"{body.recruiter_name} from {body.company} would like to talk to you about a SOC role{f' ({body.role})' if body.role else ''}.",
             f"Their message: {body.message}", f"To reply, email them directly at {email}. Your email address has not been shared with them.",
             "Only reply if you are interested. SOCForge never asks you to share passwords or payment details."]
    try:
        html = email_template(u["name"], lines, f"{os.environ['FRONTEND_URL']}/app/certificates", "Manage job preferences")
        msg_id = await send_email(to=u["email"], subject=f"Recruiter contact: {body.company} via SOCForge", html=html)
    except ValueError:
        raise HTTPException(400, "Your message contains content we can't send. Please rephrase it.")
    if not msg_id:
        raise HTTPException(502, "We couldn't deliver your request right now. Please try again in a few minutes.")
    await db.contact_requests.insert_one({"user_id": u["id"], "recruiter_name": body.recruiter_name, "recruiter_email": email, "company": body.company,
                                          "role": body.role, "message": body.message, "ip": ip, "sent": bool(msg_id), "created_at": now_iso()})
    return {"ok": True, "message": "Your request was sent. The candidate will reply by email if interested."}


@router.get("/public/profile/{username}")
async def public_profile(username: str):
    u = await db.users.find_one({"username": username.lower(), "status": "active"}, {"_id": 0, "password_hash": 0})
    if not u or u.get("public_profile") is False:
        raise HTTPException(404, "Profile not found")
    return await profile_summary(u)


@router.get("/public/talent")
async def talent(q: str = "", rank: str = "", cert: str = "", skill: str = "", open: bool = False, location: str = ""):
    filt = {"role": "student", "status": "active", "public_profile": {"$ne": False}, "onboarded": True}
    if open:
        filt["open_to_work"] = True
    us = await db.users.find(filt, {"_id": 0, "password_hash": 0}).sort("xp", -1).to_list(300)
    if location:
        us = [u for u in us if location.lower() in (u.get("location") or "").lower() or (location.lower() == "remote" and u.get("work_mode") == "Remote")]
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
        rows.append({k: p[k] for k in ("name", "username", "rank", "xp", "goal", "skills", "drill", "open_to_work", "location", "work_mode")} | {"certificates": [c["path_title"] for c in p["certificates"]], "badge_count": len(p["badges"])})
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
