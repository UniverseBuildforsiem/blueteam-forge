import hmac
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
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


@router.post("/session-reminders")
async def session_reminders(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    check_auth(request)
    try:
        env = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid body")
    run_id = request.headers.get("X-Webhook-Id") or (env or {}).get("run_id")
    if run_id:
        if await db.cron_runs.find_one({"run_id": run_id}):
            return {"ok": True, "duplicate": True}
        await db.cron_runs.insert_one({"run_id": run_id, "name": "session-reminders", "at": now_iso()})
    background.add_task(send_session_reminders)
    return {"ok": True}
