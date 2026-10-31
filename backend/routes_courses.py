import hashlib
import hmac
import os
import httpx
from fastapi import APIRouter, Depends, Request, BackgroundTasks, HTTPException
from fastapi.responses import HTMLResponse
from pymongo.errors import DuplicateKeyError
from core import db, now_iso, logger, get_current_user, send_email, email_template

router = APIRouter(prefix="/api")

STORE = "https://www.socprofessionals.com/courses"
SOURCE = "https://api.classplusapp.com/v2/course/preview/similar/eyJ0dXRvcklkIjpudWxsLCJvcmdJZCI6ODA1NzQ2LCJjYXRlZ29yeUlkIjpudWxsfQ=="
IMG = "https://cdn-wl-assets.classplus.co/production/single/jepxbq/"

# Last known catalogue, used only if the very first sync can't reach the store.
SEED = [
    (803635, "SOC Analyst Bundle (5 Courses)", "Videos", 4859, 14999, "cadd7065-f2a2-4c0e-99c8-11e395802a8d", []),
    (715800, "JN0-104 - Real Exam practice test with explanations - 2025", "Tests", 973, 1999, "0382be8b-0648-4ac8-8f5a-076ef59520b9", []),
    (715797, "ITIL 4 Foundation Certification Real Practice Exams 2025", "Tests", 973, 1999, "356fb762-23bf-4d72-8e01-f7a9dd69d387", []),
    (715790, "GMON - SEC511 Continuous Monitoring and Security practice", "Tests", 973, 1999, "8446f45a-b570-4442-b458-80e2d2bffeae", []),
    (715679, "CSA v1 - Exam Preparation (312-39)", "Tests", 973, 1999, "879f2370-de60-4f9b-9f66-1866152f123a", ["New"]),
    (715668, "CEH v13 - Certification Preparation Q&A", "Tests", 973, 1999, "7fc108e2-6221-4cbe-af99-0a54cae02137", ["New"]),
    (712610, "SOC Interview Preparation - Ebook", "Files", 973, 2999, "e7dc6c4a-c480-4904-9892-576b99fd98d9", []),
    (711866, "SOC Analyst Interview Preparation: 100+ Real-Time Scenarios", "Videos", 973, 4999, "14e4b66f-da7b-42af-abe0-5cea5e739236", ["Free content"]),
    (586238, "CSA - Certified SOC Analyst (Splunk, MDR, Qualys Guard, Kali Linux)", "Videos", 2000, 6999, "bf773c69-0cdc-4db3-9794-d3a87ec52d00", []),
    (585979, "Complete Wireshark Essentials with Kali Linux course", "Videos", 486, 2999, "b8ba3c3d-29a7-4c85-b8c8-161a80059a63", ["New"]),
    (585279, "CEH v13 - Certified Ethical Hacker | Zero to Hero", "Videos", 3892, 14999, "40794744-3f14-4f67-ac33-93bebe019c52", []),
    (584863, "Complete Kali Linux Command-Line & Shell Scripting", "Videos", 486, 2999, "590eb546-6ca3-4110-854f-3631ca157ae4", ["New"]),
    (584264, "Qualys Guard VMDR, Cloud Agent & Web Application Scanning", "Videos", 2054, 7009, "9805771e-4dc1-4387-9c1f-50889dfabddf", []),
]

P = {
    "drill": ("Drill", "Daily Alert Drill", "/app/drill"),
    "triage": ("Challenge", "SOC triage challenges", "/app/challenges"),
    "siem": ("Tool", "SIEM simulator", "/app/siem"),
    "kali": ("Tool", "Kali terminal", "/app/kali"),
    "tools": ("Tool", "Investigation toolkit", "/app/tools"),
    "lab-phish": ("Lab", "Phishing to Ransomware lab", "/app/labs/lab-phish-ransom"),
    "lab-brute": ("Lab", "Linux SSH Brute Force lab", "/app/labs/lab-bruteforce"),
    "ctf-log": ("CTF", "CTF: Log Analysis flags", "/app/ctf"),
    "ctf-net": ("CTF", "CTF: Network flags", "/app/ctf"),
    "ctf-web": ("CTF", "CTF: Web flags", "/app/ctf"),
    "ctf-for": ("CTF", "CTF: Forensics flags", "/app/ctf"),
    "path-ir": ("Path", "Incident Response path", "/app/paths/incident-response"),
    "path-int": ("Path", "SOC Interview Prep path", "/app/paths/interview-prep"),
    "quizzes": ("Quiz", "Topic quizzes", "/app/quizzes"),
}

# (title keywords, practice keys, skill topics the course strengthens)
RULES = [
    (("bundle",), ["lab-phish", "siem", "triage", "drill", "kali"], ["Phishing", "Malware", "Windows Logs", "Network", "Ransomware", "Brute Force", "Lateral Movement", "Fundamentals", "Incident Response"]),
    (("csa", "certified soc"), ["lab-phish", "siem", "triage", "drill"], ["Windows Logs", "Phishing", "Malware", "Incident Response", "Lateral Movement", "Fundamentals"]),
    (("interview",), ["path-int", "drill", "triage", "quizzes"], ["Fundamentals", "Phishing", "Incident Response"]),
    (("ceh", "ethical hack"), ["ctf-web", "lab-brute", "kali", "ctf-net"], ["Network", "Brute Force", "Malware"]),
    (("wireshark",), ["ctf-net", "kali", "siem"], ["Network"]),
    (("kali", "shell"), ["kali", "lab-brute", "ctf-for"], ["Brute Force", "Malware"]),
    (("qualys", "vmdr"), ["tools", "triage", "siem"], ["Malware", "Fundamentals"]),
    (("gmon", "monitoring"), ["siem", "drill", "ctf-log"], ["Windows Logs", "Lateral Movement", "Network"]),
    (("itil",), ["path-ir", "lab-phish", "drill"], ["Incident Response", "Ransomware"]),
    (("jn0", "juniper", "jncia"), ["ctf-net", "siem"], ["Network"]),
]


def enrich(c):
    t = c["title"].lower()
    keys, topics = [], []
    for words, ks, ts in RULES:
        if any(w in t for w in words):
            keys += [k for k in ks if k not in keys]
            topics += [x for x in ts if x not in topics]
    keys = keys or ["drill", "triage", "siem"]
    practice = [{"key": k, "kind": P[k][0], "title": P[k][1], "link": P[k][2]} for k in keys[:5]]
    return {**c, "off": int((1 - c["price"] / c["mrp"]) * 100) if c["mrp"] else 0, "practice": practice, "topics": topics or ["Fundamentals"]}


def from_store(c, order):
    labels = [(t.get("text") or "").upper() for t in c.get("courseTags") or []]
    ctype = next((l.title() for l in labels if l in ("VIDEOS", "TESTS", "FILES")), "Videos")
    tags = (["New"] if c.get("isNew") or "NEW" in labels else []) + (["Free content"] if c.get("freeResources") or "FREE CONTENT" in labels else [])
    return {"id": c["id"], "title": " ".join(c["name"].split()), "type": ctype, "price": c["finalPrice"], "mrp": c["price"],
            "image": c["imageUrl"], "url": c.get("shareableLink") or f"{STORE}/{c['id']}", "tags": tags, "order": order}


async def fetch_store():
    params = {"filterId": "[1]", "sortId": "[7]", "subCatList": "", "mainCategory": "0", "limit": "50", "offset": "0"}
    headers = {"User-Agent": "Mozilla/5.0", "Origin": "https://www.socprofessionals.com", "Referer": "https://www.socprofessionals.com/"}
    async with httpx.AsyncClient(timeout=25) as cx:
        r = await cx.get(SOURCE, params=params, headers=headers)
        r.raise_for_status()
        data = r.json()["data"]
    items = data.get("coursesData") if isinstance(data, dict) else data
    return [from_store(c, i) for i, c in enumerate(items or []) if c.get("isPublished", 1) and not c.get("isHidden")]


async def sync_courses():
    try:
        courses = await fetch_store()
        if not courses:
            raise ValueError("store returned no courses")
    except Exception as e:
        logger.warning(f"Course sync failed, keeping last synced list: {e}")
        await db.meta.update_one({"key": "course_sync"}, {"$set": {"last_error": str(e)[:300], "last_attempt": now_iso()}}, upsert=True)
        return False
    ts = now_iso()
    known = set(await db.courses.distinct("id"))
    fresh = [c for c in courses if known and c["id"] not in known]
    for c in courses:
        await db.courses.update_one({"id": c["id"]}, {"$set": {**c, "active": True, "synced_at": ts}}, upsert=True)
    await db.courses.update_many({"id": {"$nin": [c["id"] for c in courses]}}, {"$set": {"active": False}})
    await db.meta.update_one({"key": "course_sync"}, {"$set": {"last_ok": ts, "last_attempt": ts, "last_error": None, "count": len(courses)}}, upsert=True)
    logger.info(f"Course sync ok: {len(courses)} courses, {len(fresh)} new")
    if fresh:
        await notify_new_courses(fresh)
    return True


def unsub_token(uid):
    return hmac.new(os.environ["JWT_SECRET"].encode(), f"course-unsub:{uid}".encode(), hashlib.sha256).hexdigest()[:32]


async def notify_new_courses(fresh):
    sent = 0
    async for u in db.users.find({"role": "student", "status": "active", "course_emails": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "email": 1}):
        todo = []
        for c in fresh:
            try:
                await db.course_alerts.insert_one({"user_id": u["id"], "course_id": c["id"], "at": now_iso()})
                todo.append(c)
            except DuplicateKeyError:
                pass
        if not todo:
            continue
        lines = ["A new self-paced course just landed on SOC Professionals:" if len(todo) == 1 else f"{len(todo)} new self-paced courses just landed on SOC Professionals:"]
        lines += [f"{c['title']} · {c['type']} · ₹{c['price']:,} (was ₹{c['mrp']:,})" for c in todo]
        lines.append("Open it in SOCForge to see the labs and drills that go with it.")
        unsub = f"{os.environ['FRONTEND_URL']}/api/public/unsubscribe/course-alerts?u={u['id']}&t={unsub_token(u['id'])}"
        subject = f"New course: {todo[0]['title']}" if len(todo) == 1 else f"{len(todo)} new SOC courses are live"
        await send_email(to=u["email"], subject=subject[:120],
                         html=email_template(u["name"], lines, f"{os.environ['FRONTEND_URL']}/courses", "See the new course" if len(todo) == 1 else "See the new courses", unsub))
        sent += 1
    logger.info(f"New course alerts sent: {sent}")


async def ensure_courses():
    if await db.courses.count_documents({}):
        return
    if not await sync_courses():
        for i, (cid, title, ctype, price, mrp, img, tags) in enumerate(SEED):
            await db.courses.insert_one({"id": cid, "title": title, "type": ctype, "price": price, "mrp": mrp, "image": f"{IMG}{img}.png",
                                         "url": f"{STORE}/{cid}", "tags": tags, "order": i, "active": True, "synced_at": None})


async def active_courses():
    return [enrich(c) for c in await db.courses.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(200)]


@router.get("/public/courses")
async def public_courses():
    meta = await db.meta.find_one({"key": "course_sync"}, {"_id": 0}) or {}
    return {"courses": await active_courses(), "synced_at": meta.get("last_ok"), "store_url": STORE}


@router.get("/courses/recommended")
async def recommended(user=Depends(get_current_user)):
    from routes_learn import analytics
    acc = (await analytics(user))["accuracy"]
    courses = await active_courses()
    if not courses:
        return {"course": None}
    for a in sorted(acc, key=lambda x: x["accuracy"]):
        matches = sorted((c for c in courses if a["topic"] in c["topics"]), key=lambda c: len(c["topics"]))
        if matches:
            acc_n = a["accuracy"]
            reason = (f"Your weakest skill is {a['topic']} at {acc_n}% accuracy." if acc_n < 70 else
                      f"{a['topic']} is your lowest score at {acc_n}%." if acc_n < 90 else
                      f"All your skills score 90% or more. Keep {a['topic']} sharp.")
            return {"course": matches[0], "topic": a["topic"], "accuracy": acc_n, "reason": reason}
    return {"course": courses[0], "topic": None, "accuracy": None,
            "reason": "Take a quiz or triage challenge and we'll match a course to your weakest skill. Until then, start with the full bundle."}


@router.get("/me/courses")
async def my_courses(user=Depends(get_current_user)):
    done = await db.course_completions.distinct("course_id", {"user_id": user["id"]})
    return {"completed": done, "course_emails": user.get("course_emails") is not False}


@router.post("/me/courses/{cid}/complete")
async def complete_course(cid: int, user=Depends(get_current_user)):
    c = await db.courses.find_one({"id": cid}, {"_id": 0, "title": 1})
    if not c:
        raise HTTPException(404, "Course not found")
    await db.course_completions.update_one({"user_id": user["id"], "course_id": cid},
                                           {"$setOnInsert": {"user_id": user["id"], "course_id": cid, "title": c["title"], "at": now_iso()}}, upsert=True)
    return {"completed": True}


@router.delete("/me/courses/{cid}/complete")
async def uncomplete_course(cid: int, user=Depends(get_current_user)):
    await db.course_completions.delete_one({"user_id": user["id"], "course_id": cid})
    return {"completed": False}


@router.get("/public/unsubscribe/course-alerts", response_class=HTMLResponse)
async def unsubscribe(u: str = "", t: str = ""):
    ok = bool(u and t) and hmac.compare_digest(t, unsub_token(u))
    if ok:
        await db.users.update_one({"id": u}, {"$set": {"course_emails": False}})
    msg = "You're unsubscribed from new course emails. You can turn them back on from your SOCForge dashboard." if ok else "This unsubscribe link is invalid or has expired."
    return HTMLResponse(f"<html><body style='background:#0B0F1A;color:#E2E8F0;font-family:monospace;padding:60px'><h2 style='color:#00F0FF'>SOCForge</h2><p>{msg}</p>"
                        f"<a style='color:#00FF66' href='{os.environ['FRONTEND_URL']}/app'>Open dashboard</a></body></html>", status_code=200 if ok else 400)


@router.post("/cron/course-sync")
async def course_sync_cron(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    from routes_cron import accept
    if not await accept(request, "course-sync"):
        return {"ok": True, "duplicate": True}
    background.add_task(sync_courses)
    return {"ok": True}
