import hashlib
import hmac
import html
import os
from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from pymongo.errors import DuplicateKeyError
from core import db, now, now_iso, logger, admin_only, send_email, email_template, get_current_user
from routes_series import all_posts

router = APIRouter(prefix="/api")


def unsub_token(uid):
    return hmac.new(os.environ["JWT_SECRET"].encode(), f"series-unsub:{uid}".encode(), hashlib.sha256).hexdigest()[:32]


def series_html(name, p, nxt, total, uid):
    base = os.environ["FRONTEND_URL"]
    url = f"{base}/soc-series/{p['slug']}"
    cover = p["cover"] if p["cover"].startswith("http") else base + p["cover"]
    lines = [f"This week's post in the SOC Analyst Technical Blog Series (#{p['number']:03d} of {total}, {p['section']}):",
             p["title"], p.get("excerpt") or "", f"About {p.get('read_min', 10)} minutes, with real log samples, SPL and KQL detections and a step-by-step investigation playbook."]
    if nxt:
        lines.append(f"Up next week: {nxt['title']}")
    body = email_template(name, [x for x in lines if x], url, "Read this week's post", image=(cover, url, p["title"]),
                          unsubscribe=f"{base}/api/public/unsubscribe/series?u={uid}&t={unsub_token(uid)}")
    return body.replace(f"<p style='margin:0 0 12px'>{html.escape(p['title'])}</p>",
                        f"<p style='margin:0 0 12px;font-size:18px;font-weight:bold;color:#00F0FF'>{html.escape(p['title'])}</p>", 1)


async def send_series_week(only_user=None):
    posts = await all_posts({"published": True, "status": "ready"}, {"_id": 0, "body": 0})
    total = await db.series_posts.count_documents({"published": True})
    if not posts:
        return 0
    week = now().strftime("%G-W%V")
    q = {"id": only_user["id"]} if only_user else {"role": "student", "status": "active", "series_emails": {"$ne": False}}
    sent = 0
    async for u in db.users.find(q, {"_id": 0, "id": 1, "name": 1, "email": 1}):
        done = set(await db.series_sends.distinct("post_id", {"user_id": u["id"]}))
        left = [p for p in posts if p["id"] not in done]
        if not left:
            continue
        p, nxt = left[0], (left[1] if len(left) > 1 else None)
        if not only_user:
            try:
                await db.series_sends.insert_one({"user_id": u["id"], "week": week, "post_id": p["id"], "at": now_iso()})
            except DuplicateKeyError:
                continue
        await send_email(to=u["email"], subject=f"SOC Series #{p['number']:03d}: {p['title'][:80]}", html=series_html(u["name"], p, nxt, total, u["id"]))
        sent += 1
    logger.info(f"Weekly series email sent: {sent}")
    return sent


@router.post("/admin/series/email-test")
async def email_test(user=Depends(admin_only)):
    return {"sent": await send_series_week(only_user=user)}


@router.get("/me/series/next")
async def my_next(user=Depends(get_current_user)):
    posts = await all_posts({"published": True, "status": "ready"}, {"_id": 0, "id": 1, "slug": 1, "title": 1, "section": 1, "order": 1})
    done = set(await db.series_sends.distinct("post_id", {"user_id": user["id"]}))
    left = [p for p in posts if p["id"] not in done]
    return {"next": left[0] if left else None, "received": len(done), "on": user.get("series_emails") is not False}


@router.get("/public/unsubscribe/series", response_class=HTMLResponse)
async def unsub(u: str = "", t: str = ""):
    ok = bool(u and t) and hmac.compare_digest(t, unsub_token(u))
    if ok:
        await db.users.update_one({"id": u}, {"$set": {"series_emails": False}})
    msg = "You're unsubscribed from the weekly SOC Analyst Series email. You can turn it back on from the series page." if ok else "This unsubscribe link is invalid or has expired."
    return HTMLResponse(f"<html><body style='background:#0B0F1A;color:#E2E8F0;font-family:monospace;padding:60px'><h2 style='color:#00F0FF'>SOCProfessionals Academy</h2><p>{msg}</p>"
                        f"<a style='color:#00FF66' href='{os.environ['FRONTEND_URL']}/soc-series'>Open the series</a></body></html>", status_code=200 if ok else 400)


async def ensure_series_email():
    await db.series_sends.create_index([("user_id", 1), ("week", 1)], unique=True)
