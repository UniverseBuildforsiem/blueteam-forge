import hmac
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from pymongo.errors import DuplicateKeyError
from core import db, now, now_iso, send_email, email_template, logger

router = APIRouter(prefix="/api/cron")


def check_auth(request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not token or not hmac.compare_digest(token, os.environ["WEBHOOK_CRON_SECRET"]):
        raise HTTPException(401, "Unauthorized")


async def send_session_reminders():
    start, end = now().isoformat(), (now() + timedelta(minutes=60)).isoformat()
    sessions = await db.sessions.find({"start": {"$gt": start, "$lte": end}}, {"_id": 0}).to_list(100)
    sent = 0
    for s in sessions:
        for r in await db.rsvps.find({"session_id": s["id"], "reminded": {"$ne": True}}, {"_id": 0}).to_list(5000):
            claimed = await db.rsvps.update_one({"session_id": s["id"], "user_id": r["user_id"], "reminded": {"$ne": True}}, {"$set": {"reminded": True, "reminded_at": now_iso()}})
            if not claimed.modified_count:
                continue
            mins = max(1, round((datetime.fromisoformat(s["start"]) - now()).total_seconds() / 60))
            await send_email(to=r["email"], subject=f"Starting in {mins} min: {s['title']}",
                             html=email_template(r["name"], [f"Your live session '{s['title']}' with {s['instructor']} starts in about {mins} minutes.",
                                                             "Open your Live Sessions page to join when it starts."],
                                                 f"{os.environ['FRONTEND_URL']}/app/sessions", "Open Live Sessions"))
            sent += 1
    logger.info(f"Session reminders sent: {sent}")


async def send_streak_rescue():
    from routes_practice import drill_streak, apply_freeze
    today = now().date().isoformat()
    yesterday = (now().date() - timedelta(days=1)).isoformat()
    before = (now().date() - timedelta(days=2)).isoformat()
    for uid in set(await db.drill_submissions.distinct("user_id", {"date": before})) | set(await db.drill_freezes.distinct("user_id", {"date": before})):
        await apply_freeze(uid)
    alive = set(await db.drill_submissions.distinct("user_id", {"date": yesterday})) | set(await db.drill_freezes.distinct("user_id", {"date": yesterday}))
    done_today = set(await db.drill_submissions.distinct("user_id", {"date": today}))
    sent = 0
    for uid in alive:
        if uid in done_today:
            continue
        u = await db.users.find_one({"id": uid, "status": "active", "streak_emails": {"$ne": False}}, {"_id": 0, "name": 1, "email": 1})
        if not u:
            continue
        try:
            await db.drill_rescue.insert_one({"user_id": uid, "date": today, "at": now_iso()})
        except DuplicateKeyError:
            continue
        streak = await drill_streak(uid)
        await send_email(to=u["email"], subject=f"Your {streak}-day drill streak ends tonight",
                         html=email_template(u["name"], [f"You're on a {streak}-day Daily Alert Drill streak, but today's alert is still waiting in your queue.",
                                                         "It takes about five minutes to triage. Finish it before midnight UTC to keep your streak and earn the 50 XP bonus.",
                                                         "You can turn these reminders off on the Daily Drill page."],
                                             f"{os.environ['FRONTEND_URL']}/app/drill", "Triage today's alert"))
        sent += 1
    logger.info(f"Streak rescue emails sent: {sent}")


async def accept(request: Request, name: str):
    check_auth(request)
    try:
        env = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid body")
    run_id = request.headers.get("X-Webhook-Id") or (env or {}).get("run_id")
    if run_id:
        if await db.cron_runs.find_one({"run_id": run_id}):
            return False
        await db.cron_runs.insert_one({"run_id": run_id, "name": name, "at": now_iso()})
    return True


@router.post("/streak-rescue")
async def streak_rescue(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    if not await accept(request, "streak-rescue"):
        return {"ok": True, "duplicate": True}
    background.add_task(send_streak_rescue)
    return {"ok": True}


@router.post("/session-reminders")
async def session_reminders(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    if not await accept(request, "session-reminders"):
        return {"ok": True, "duplicate": True}
    background.add_task(send_session_reminders)
    return {"ok": True}
