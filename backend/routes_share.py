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


def draw_logo(d):
    logo = font("LiberationMono-Bold.ttf", 40)
    d.text((64, 60), "> SOC", font=logo, fill=(248, 250, 252))
    x = 64 + d.textlength("> SOC", font=logo)
    d.text((x, 60), "Professionals", font=logo, fill=GREEN)
    d.text((x + d.textlength("Professionals", font=logo) + 14, 76), "ACADEMY", font=font("LiberationMono-Bold.ttf", 20), fill=MUTED)


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
    draw_logo(d)
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
        d.text((w - 64, 560), f"socpro academy · /u/{handle}", font=font("LiberationMono-Bold.ttf", 20), fill=CYAN, anchor="ra")
    d.text((w - 64, 66), "blue team training", font=font("LiberationSans-Regular.ttf", 22), fill=MUTED, anchor="ra")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


@router.get("/public/streak/{token}.png")
async def streak_png(token: str):
    u, current, longest, total = await card_data(token)
    return StreamingResponse(render(u["name"], current, longest, total, u.get("xp"), u["username"] if u.get("public_profile") is not False else None), media_type="image/png", headers={"Cache-Control": "public, max-age=600"})


async def ensure_token(user):
    token = user.get("share_token")
    if not token:
        token = secrets.token_urlsafe(10)
        await db.users.update_one({"id": user["id"]}, {"$set": {"share_token": token}})
    return token


@router.post("/me/courses/{cid}/share-card")
async def course_share_card(cid: int, user=Depends(get_current_user)):
    if not await db.course_completions.find_one({"user_id": user["id"], "course_id": cid}):
        raise HTTPException(404, "Mark this course as watched first")
    share_url = f"{api_base()}/public/course-badge/{await ensure_token(user)}/{cid}"
    return {"share_url": share_url, "image_url": f"{share_url}.png"}


async def badge_data(token, cid):
    from routes_learn import short_title
    u = await db.users.find_one({"share_token": token}, {"_id": 0, "id": 1, "name": 1, "username": 1, "public_profile": 1})
    done = u and await db.course_completions.find_one({"user_id": u["id"], "course_id": cid}, {"_id": 0})
    if not done:
        raise HTTPException(404, "Badge not found")
    return u, done, short_title(done["title"])


def wrap(d, text, fnt, width):
    lines, cur = [], ""
    for w in text.split():
        nxt = f"{cur} {w}".strip()
        if d.textlength(nxt, font=fnt) > width and cur:
            lines.append(cur)
            cur = w
        else:
            cur = nxt
    return lines + [cur] if cur else lines


LEVEL_COLOR = {"Recruit": (226, 232, 240), "Analyst": CYAN, "Hunter": (251, 146, 60), "Elite": (239, 68, 68)}
BADGE_DIR = Path(__file__).parent / "assets" / "badges"


def paste_character(img, art, color, cx=960, cy=320, r=170):
    ch = Image.open(BADGE_DIR / art).convert("RGB")
    side = min(ch.size)
    ch = ch.crop(((ch.width - side) // 2, (ch.height - side) // 2, (ch.width + side) // 2, (ch.height + side) // 2)).resize((2 * r, 2 * r))
    mask = Image.new("L", (2 * r, 2 * r), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, 2 * r - 1, 2 * r - 1], fill=255)
    img.paste(ch, (cx - r, cy - r), mask)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - r - 8, cy - r - 8, cx + r + 8, cy + r + 8], outline=color, width=8)
    d.ellipse([cx - r - 20, cy - r - 20, cx + r + 20, cy + r + 20], outline=(30, 41, 59), width=2)


def render_badge(name, badge, subtitle, stat, level, art, handle=None, kind="badge"):
    w, h = 1200, 627
    img = Image.new("RGB", (w, h), NAVY)
    d = ImageDraw.Draw(img)
    for x in range(0, w, 40):
        d.line([(x, 0), (x, h)], fill=(15, 24, 38))
    for y in range(0, h, 40):
        d.line([(0, y), (w, y)], fill=(15, 24, 38))
    color = LEVEL_COLOR[level]
    d.rectangle([24, 24, w - 24, h - 24], outline=color, width=3)
    draw_logo(d)
    paste_character(img, art, color)
    d = ImageDraw.Draw(img)
    d.text((960, 530), f"{level.upper()} LEVEL", font=font("LiberationMono-Bold.ttf", 22), fill=color, anchor="ma")
    d.text((64, 140), f"{kind.upper()} EARNED", font=font("LiberationMono-Bold.ttf", 22), fill=CYAN)
    big = font("LiberationSans-Bold.ttf", 64)
    y = 180
    for line in wrap(d, badge, big, 680)[:2]:
        d.text((64, y), line, font=big, fill=(248, 250, 252))
        y += 76
    small = font("LiberationSans-Regular.ttf", 24)
    for line in wrap(d, subtitle, small, 680)[:2]:
        d.text((64, y + 12), line, font=small, fill=MUTED)
        y += 32
    d.text((64, 478), "STUDENT", font=font("LiberationMono-Bold.ttf", 18), fill=MUTED)
    d.text((64, 504), name[:22], font=font("LiberationMono-Bold.ttf", 34), fill=(248, 250, 252))
    d.text((520, 478), stat[0], font=font("LiberationMono-Bold.ttf", 18), fill=MUTED)
    d.text((520, 504), stat[1], font=font("LiberationMono-Bold.ttf", 34), fill=GREEN)
    if handle:
        d.text((64, 560), f"socpro academy · /u/{handle}", font=font("LiberationMono-Bold.ttf", 20), fill=CYAN)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf


def og_page(title, desc, path, home):
    title, desc, home = escape(title), escape(desc), escape(home)
    url = f"{api_base()}{escape(path)}"
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>
<meta property="og:type" content="website"><meta property="og:title" content="{title}"><meta property="og:description" content="{desc}">
<meta property="og:image" content="{url}.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="627">
<meta property="og:url" content="{url}"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url={home}"></head>
<body style="background:#0B0F1A;color:#fff;font-family:monospace"><a href="{home}" style="color:#00F0FF">{title}</a></body></html>"""


def home_for(u, fallback="/"):
    base = os.environ["FRONTEND_URL"].rstrip("/")
    return f"{base}/u/{u['username']}" if u.get("public_profile") is not False else f"{base}{fallback}"


@router.get("/public/course-badge/{token}/{cid}.png")
async def course_badge_png(token: str, cid: int):
    u, done, badge = await badge_data(token, cid)
    handle = u["username"] if u.get("public_profile") is not False else None
    png = render_badge(u["name"], badge, f"Completed '{done['title']}' on SOC Professionals", ("WATCHED", done["at"][:10]), "Recruit", "course.jpg", handle, "course badge")
    return StreamingResponse(png, media_type="image/png", headers={"Cache-Control": "public, max-age=600"})


@router.get("/public/course-badge/{token}/{cid}", response_class=HTMLResponse)
async def course_badge_page(token: str, cid: int):
    u, done, badge = await badge_data(token, cid)
    return og_page(f"{u['name']} earned the {badge} course badge on SOCProfessionals Academy",
                   f"Completed '{done['title']}' on SOC Professionals and practised it in SOCProfessionals Academy labs.",
                   f"/public/course-badge/{token}/{cid}", home_for(u, "/courses"))


async def std_badge(token, bid):
    from routes_learn import compute_badges, BADGE_LEVEL
    u = await db.users.find_one({"share_token": token}, {"_id": 0, "password_hash": 0})
    b = u and bid in BADGE_LEVEL and next((x for x in await compute_badges(u) if x["id"] == bid and x["earned"]), None)
    if not b:
        raise HTTPException(404, "Badge not found")
    return u, b, BADGE_LEVEL[bid]


@router.post("/me/badges/{bid}/share-card")
async def badge_share_card(bid: str, user=Depends(get_current_user)):
    from routes_learn import compute_badges, BADGE_LEVEL
    if bid not in BADGE_LEVEL or not any(b["id"] == bid and b["earned"] for b in await compute_badges(user)):
        raise HTTPException(404, "Earn this badge first")
    share_url = f"{api_base()}/public/badge/{await ensure_token(user)}/{bid}"
    return {"share_url": share_url, "image_url": f"{share_url}.png"}


@router.get("/public/badge/{token}/{bid}.png")
async def badge_png(token: str, bid: str):
    u, b, (level, art) = await std_badge(token, bid)
    handle = u["username"] if u.get("public_profile") is not False else None
    png = render_badge(u["name"], b["name"], b["description"], ("RANK", rank_for(u.get("xp", 0))), level, art, handle)
    return StreamingResponse(png, media_type="image/png", headers={"Cache-Control": "public, max-age=600"})


@router.get("/public/badge/{token}/{bid}", response_class=HTMLResponse)
async def badge_page(token: str, bid: str):
    u, b, (level, _) = await std_badge(token, bid)
    return og_page(f"{u['name']} earned the {b['name']} badge ({level} level) on SOCProfessionals Academy",
                   f"{b['description']}. Hands-on SOC analyst training with real alert triage.", f"/public/badge/{token}/{bid}", home_for(u))


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
             "Only reply if you are interested. SOCProfessionals Academy never asks you to share passwords or payment details."]
    try:
        html = email_template(u["name"], lines, f"{os.environ['FRONTEND_URL']}/app/certificates", "Manage job preferences")
        msg_id = await send_email(to=u["email"], subject=f"Recruiter contact: {body.company} via SOCProfessionals Academy", html=html)
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
    title = escape(f"{u['name']} is on a {current}-day SOC drill streak on SOCProfessionals Academy")
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
