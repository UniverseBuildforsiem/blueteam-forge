import re
import shlex
from collections import Counter
from email.parser import Parser
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from core import db, now_iso, new_id, get_current_user, award
from seed_data import gen_logs, INTEL, SANDBOX, THREAT_FEED

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}
LOGS = gen_logs()


# ---------- SOC alert triage challenges ----------
@router.get("/challenges")
async def list_challenges(user=Depends(get_current_user)):
    cs = await db.challenges.find({"published": {"$ne": False}}, {"_id": 0, "verdict": 0, "keywords": 0}).to_list(200)
    subs = {s["challenge_id"]: s for s in await db.challenge_submissions.find({"user_id": user["id"]}, NO_ID).to_list(500)}
    for c in cs:
        c["submission"] = subs.get(c["id"])
    return cs


class TriageIn(BaseModel):
    verdict: str = Field(pattern="^(TP|FP)$")
    report: str = Field(min_length=20, max_length=5000)


@router.post("/challenges/{cid}/submit")
async def submit_challenge(cid: str, body: TriageIn, user=Depends(get_current_user)):
    c = await db.challenges.find_one({"id": cid}, NO_ID)
    if not c:
        raise HTTPException(404, "Challenge not found")
    low = body.report.lower()
    hits = [k for k in c["keywords"] if k.lower() in low]
    vc = body.verdict == c["verdict"]
    score = (60 if vc else 0) + round(40 * len(hits) / len(c["keywords"]))
    prev = await db.challenge_submissions.find_one({"user_id": user["id"], "challenge_id": cid}, NO_ID)
    sub = {"id": prev["id"] if prev else new_id(), "user_id": user["id"], "user_name": user["name"], "challenge_id": cid, "challenge_title": c["title"],
           "category": c["category"], "verdict": body.verdict, "verdict_correct": vc, "report": body.report, "auto_score": score,
           "keywords_hit": hits, "status": "resubmitted" if prev else "auto-graded", "instructor_grade": (prev or {}).get("instructor_grade"),
           "feedback": (prev or {}).get("feedback", ""), "created_at": now_iso()}
    await db.challenge_submissions.replace_one({"user_id": user["id"], "challenge_id": cid}, dict(sub), upsert=True)
    if not prev:
        await award(user["id"], round(c["points"] * score / 100), f"Triaged alert '{c['title']}' ({score}/100)")
    return {**sub, "expected_verdict": c["verdict"], "missed_keywords": [k for k in c["keywords"] if k not in hits]}


# ---------- CTF ----------
@router.get("/ctf")
async def ctf_board(user=Depends(get_current_user)):
    cs = await db.ctfs.find({"published": {"$ne": False}}, {"_id": 0, "flag": 0}).to_list(200)
    solved = {s["ctf_id"] for s in await db.ctf_solves.find({"user_id": user["id"]}, NO_ID).to_list(500)}
    unlocked = {(h["ctf_id"], h["idx"]) for h in await db.ctf_hints.find({"user_id": user["id"]}, NO_ID).to_list(500)}
    for c in cs:
        c["solved"] = c["id"] in solved
        c["solves"] = await db.ctf_solves.count_documents({"ctf_id": c["id"]})
        c["hints"] = [{"idx": i, "cost": h["cost"], "text": h["text"] if (c["id"], i) in unlocked else None} for i, h in enumerate(c["hints"])]
    return cs


class FlagIn(BaseModel):
    flag: str


@router.post("/ctf/{cid}/submit")
async def ctf_submit(cid: str, body: FlagIn, user=Depends(get_current_user)):
    c = await db.ctfs.find_one({"id": cid}, NO_ID)
    if not c:
        raise HTTPException(404, "Challenge not found")
    if await db.ctf_solves.find_one({"user_id": user["id"], "ctf_id": cid}):
        return {"correct": True, "already": True}
    if body.flag.strip() != c["flag"]:
        return {"correct": False}
    spent = sum(h["cost"] for h in await db.ctf_hints.find({"user_id": user["id"], "ctf_id": cid}, NO_ID).to_list(20))
    pts = max(c["points"] - spent, 0)
    await db.ctf_solves.insert_one({"user_id": user["id"], "name": user["name"], "username": user["username"], "ctf_id": cid, "points": pts, "created_at": now_iso()})
    await award(user["id"], pts, f"Captured flag: {c['title']} (+{pts})")
    return {"correct": True, "points": pts}


@router.post("/ctf/{cid}/hint/{idx}")
async def ctf_hint(cid: str, idx: int, user=Depends(get_current_user)):
    c = await db.ctfs.find_one({"id": cid}, NO_ID)
    if not c or idx >= len(c["hints"]):
        raise HTTPException(404, "Hint not found")
    if not await db.ctf_hints.find_one({"user_id": user["id"], "ctf_id": cid, "idx": idx}):
        await db.ctf_hints.insert_one({"user_id": user["id"], "ctf_id": cid, "idx": idx, "cost": c["hints"][idx]["cost"]})
    return {"text": c["hints"][idx]["text"]}


@router.get("/ctf/scoreboard")
async def scoreboard(user=Depends(get_current_user)):
    agg = await db.ctf_solves.aggregate([{"$group": {"_id": "$user_id", "name": {"$first": "$name"}, "username": {"$first": "$username"},
                                                     "points": {"$sum": "$points"}, "solves": {"$sum": 1}, "last": {"$max": "$created_at"}}},
                                         {"$sort": {"points": -1, "last": 1}}, {"$limit": 20}]).to_list(20)
    return [{"user_id": a["_id"], "name": a["name"], "username": a["username"], "points": a["points"], "solves": a["solves"]} for a in agg]


# ---------- Scenario labs ----------
def strip_lab(l, prog):
    answered = (prog or {}).get("answered", {})
    return {**{k: v for k, v in l.items() if k != "tasks"}, "tasks": [{k: v for k, v in t.items() if k != "answer"} | {"solved": t["id"] in answered} for t in l["tasks"]],
            "progress": {"answered": list(answered.keys()), "report": (prog or {}).get("report", ""), "report_submitted": (prog or {}).get("report_submitted", False)}}


@router.get("/labs")
async def list_labs(user=Depends(get_current_user)):
    labs = await db.labs.find({"published": {"$ne": False}}, {"_id": 0, "kali": 0}).to_list(100)
    progs = {p["lab_id"]: p for p in await db.lab_progress.find({"user_id": user["id"]}, NO_ID).to_list(100)}
    return [{"id": l["id"], "title": l["title"], "description": l["description"], "difficulty": l["difficulty"], "duration": l.get("duration"),
             "task_count": len(l["tasks"]), "solved": len(progs.get(l["id"], {}).get("answered", {}))} for l in labs]


@router.get("/labs/{lid}")
async def get_lab(lid: str, user=Depends(get_current_user)):
    l = await db.labs.find_one({"id": lid}, NO_ID)
    if not l:
        raise HTTPException(404, "Lab not found")
    return strip_lab(l, await db.lab_progress.find_one({"user_id": user["id"], "lab_id": lid}, NO_ID))


class AnswerIn(BaseModel):
    answer: str


@router.post("/labs/{lid}/tasks/{tid}")
async def answer_task(lid: str, tid: str, body: AnswerIn, user=Depends(get_current_user)):
    l = await db.labs.find_one({"id": lid}, NO_ID)
    t = next((t for t in (l or {}).get("tasks", []) if t["id"] == tid), None)
    if not t:
        raise HTTPException(404, "Task not found")
    ok = body.answer.strip().lower() == t["answer"].lower()
    if ok:
        prog = await db.lab_progress.find_one({"user_id": user["id"], "lab_id": lid}, NO_ID) or {}
        if tid not in prog.get("answered", {}):
            await db.lab_progress.update_one({"user_id": user["id"], "lab_id": lid}, {"$set": {f"answered.{tid}": now_iso()}}, upsert=True)
            await award(user["id"], 20, f"Lab '{l['title']}': solved task '{t['title']}'")
    return {"correct": ok}


class ReportIn(BaseModel):
    report: str = Field(min_length=20, max_length=8000)


@router.post("/labs/{lid}/report")
async def lab_report(lid: str, body: ReportIn, user=Depends(get_current_user)):
    l = await db.labs.find_one({"id": lid}, NO_ID)
    if not l:
        raise HTTPException(404, "Lab not found")
    prog = await db.lab_progress.find_one({"user_id": user["id"], "lab_id": lid}, NO_ID) or {}
    if len(prog.get("answered", {})) < len(l["tasks"]):
        raise HTTPException(400, "Solve all tasks before submitting the final report")
    await db.lab_progress.update_one({"user_id": user["id"], "lab_id": lid}, {"$set": {"report": body.report, "report_submitted": True, "user_name": user["name"], "lab_title": l["title"]}})
    if not prog.get("report_submitted"):
        await award(user["id"], 50, f"Submitted final report for lab '{l['title']}'")
    return {"ok": True}


# ---------- Daily alert drill ----------
from datetime import datetime, timedelta
from core import now
from drills import drill_for
from pymongo.errors import DuplicateKeyError


@router.get("/drill/today")
async def drill_today(user=Depends(get_current_user)):
    d = drill_for(now().date().isoformat())
    sub = await db.drill_submissions.find_one({"user_id": user["id"], "date": d["date"]}, NO_ID)
    streak = await drill_streak(user["id"])
    public = {k: v for k, v in d.items() if k not in ("verdict", "keywords")}
    return {**public, "submission": sub, "drill_streak": streak, "streak_emails": user.get("streak_emails", True)}


@router.post("/drill/today/submit")
async def drill_submit(body: TriageIn, user=Depends(get_current_user)):
    d = drill_for(now().date().isoformat())
    if await db.drill_submissions.find_one({"user_id": user["id"], "date": d["date"]}):
        raise HTTPException(400, "You already completed today's drill. Come back tomorrow!")
    low = body.report.lower()
    hits = [k for k in d["keywords"] if k.lower() in low]
    vc = body.verdict == d["verdict"]
    score = (60 if vc else 0) + round(40 * len(hits) / len(d["keywords"]))
    xp = round(d["points"] * score / 100) + d["bonus_xp"]
    sub = {"user_id": user["id"], "date": d["date"], "verdict": body.verdict, "verdict_correct": vc, "report": body.report,
           "auto_score": score, "keywords_hit": hits, "xp": xp, "expected_verdict": d["verdict"],
           "missed_keywords": [k for k in d["keywords"] if k not in hits], "created_at": now_iso()}
    try:
        await db.drill_submissions.insert_one(dict(sub))
    except DuplicateKeyError:
        raise HTTPException(400, "You already completed today's drill. Come back tomorrow!")
    await award(user["id"], xp, f"Daily drill '{d['title']}' ({score}/100, +{d['bonus_xp']} bonus)")
    return sub


async def drill_streak(uid):
    return (await streak_stats(uid))[0]


async def streak_stats(uid):
    dates = sorted({s["date"] for s in await db.drill_submissions.find({"user_id": uid}, {"_id": 0, "date": 1}).to_list(2000)})
    days = set(dates)
    day = now().date()
    if day.isoformat() not in days:
        day -= timedelta(days=1)
    current = 0
    while day.isoformat() in days:
        current += 1
        day -= timedelta(days=1)
    longest, run, prev = 0, 0, None
    for ds in dates:
        d = datetime.strptime(ds, "%Y-%m-%d").date()
        run = run + 1 if prev and (d - prev).days == 1 else 1
        longest = max(longest, run)
        prev = d
    return current, longest, len(dates)


def past_day(date: str):
    try:
        d = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid date")
    if not (now().date() - timedelta(days=30) <= d < now().date()):
        raise HTTPException(404, "Archived drill not available")
    return d.isoformat()


@router.get("/drill/archive")
async def drill_archive(user=Depends(get_current_user)):
    days = [(now().date() - timedelta(days=i)).isoformat() for i in range(1, 15)]
    subs = {s["date"]: s for s in await db.drill_submissions.find({"user_id": user["id"], "date": {"$in": days}}, NO_ID).to_list(20)}
    prac = {p["date"]: p for p in await db.drill_practice.find({"user_id": user["id"], "date": {"$in": days}}, NO_ID).to_list(20)}
    out = []
    for day in days:
        d = drill_for(day)
        out.append({"date": day, "title": d["title"], "category": d["category"], "severity": d["severity"],
                    "live_score": subs.get(day, {}).get("auto_score"), "practice_best": prac.get(day, {}).get("best")})
    return out


@router.get("/drill/leaderboard")
async def drill_leaderboard(user=Depends(get_current_user)):
    week = (now().date() - timedelta(days=6)).isoformat()
    agg = await db.drill_submissions.aggregate([{"$match": {"date": {"$gte": week}}}, {"$group": {"_id": "$user_id", "week": {"$sum": 1}, "xp": {"$sum": "$xp"}}}]).to_list(500)
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": [a["_id"] for a in agg]}}, {"_id": 0, "id": 1, "name": 1, "username": 1}).to_list(500)}
    rows = [{"user_id": a["_id"], "name": users.get(a["_id"], {}).get("name", "?"), "username": users.get(a["_id"], {}).get("username", ""),
             "streak": await drill_streak(a["_id"]), "week_drills": a["week"], "week_xp": a["xp"]} for a in agg if a["_id"] in users]
    rows.sort(key=lambda r: (-r["streak"], -r["week_drills"], -r["week_xp"]))
    return {"week_start": week, "rows": rows[:20]}


@router.get("/drill/day/{date}")
async def drill_day(date: str, user=Depends(get_current_user)):
    day = past_day(date)
    d = drill_for(day)
    prac = await db.drill_practice.find_one({"user_id": user["id"], "date": day}, NO_ID)
    return {**{k: v for k, v in d.items() if k not in ("verdict", "keywords")}, "practice": prac}


@router.post("/drill/day/{date}/practice")
async def drill_practice(date: str, body: TriageIn, user=Depends(get_current_user)):
    day = past_day(date)
    d = drill_for(day)
    low = body.report.lower()
    hits = [k for k in d["keywords"] if k.lower() in low]
    vc = body.verdict == d["verdict"]
    score = (60 if vc else 0) + round(40 * len(hits) / len(d["keywords"]))
    prev = await db.drill_practice.find_one({"user_id": user["id"], "date": day}, NO_ID) or {}
    await db.drill_practice.update_one({"user_id": user["id"], "date": day},
                                       {"$set": {"last": score, "best": max(score, prev.get("best", 0)), "updated_at": now_iso()}, "$inc": {"attempts": 1}}, upsert=True)
    return {"verdict": body.verdict, "verdict_correct": vc, "auto_score": score, "keywords_hit": hits, "xp": 0, "practice": True,
            "expected_verdict": d["verdict"], "missed_keywords": [k for k in d["keywords"] if k not in hits]}


class PrefsIn(BaseModel):
    streak_emails: bool


@router.patch("/me/preferences")
async def prefs(body: PrefsIn, user=Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"streak_emails": body.streak_emails}})
    return {"streak_emails": body.streak_emails}


# ---------- SIEM ----------
def match(e, tok):
    m = re.match(r"^([a-z_]+)(!=|=)(.+)$", tok, re.I)
    if m:
        f, op, v = m.group(1).lower(), m.group(2), m.group(3).lower()
        val = str(e.get(f, "")).lower()
        rx = "^" + re.escape(v).replace("\\*", ".*") + "$"
        hit = re.match(rx, val) is not None
        return hit if op == "=" else not hit
    t = tok.lower().strip("*")
    return any(t in str(v).lower() for v in e.values())


@router.get("/siem/search")
async def siem_search(q: str = "", start: str = "", end: str = "", user=Depends(get_current_user)):
    main, _, pipe = q.partition("|")
    try:
        toks = [t for t in shlex.split(main) if t.upper() != "AND"]
    except ValueError:
        toks = main.split()
    res = [e for e in LOGS if (not start or e["_time"] >= start) and (not end or e["_time"] <= end) and all(match(e, t) for t in toks)]
    stats = None
    sm = re.match(r"\s*stats\s+count\s+by\s+([a-z_]+)", pipe, re.I)
    if sm:
        f = sm.group(1)
        stats = {"field": f, "rows": [{"value": k, "count": v} for k, v in Counter(str(e.get(f, "-")) for e in res).most_common(20)]}
    fields = {}
    for f in ["sourcetype", "host", "user", "event_id", "src_ip", "dest_ip", "action", "query"]:
        c = Counter(str(e[f]) for e in res if f in e)
        if c:
            fields[f] = [{"value": k, "count": v} for k, v in c.most_common(8)]
    return {"total": len(res), "events": list(reversed(res))[:300], "fields": fields, "stats": stats}


@router.get("/siem/alerts")
async def siem_alerts(user=Depends(get_current_user)):
    out = []
    for a in await db.siem_alerts.find({}, NO_ID).to_list(100):
        try:
            toks = shlex.split(a["query"])
        except ValueError:
            toks = a["query"].split()
        n = len([e for e in LOGS if all(match(e, t) for t in toks)])
        out.append({**a, "matches": n, "triggered": n >= a["threshold"]})
    return out


@router.get("/siem/dashboard")
async def siem_dash(user=Depends(get_current_user)):
    by = lambda f: [{"name": k, "value": v} for k, v in Counter(str(e.get(f)) for e in LOGS if f in e).most_common(6)]
    return {"total": len(LOGS), "by_sourcetype": by("sourcetype"), "by_host": by("host"), "by_action": by("action"),
            "failed_logons": len([e for e in LOGS if e.get("event_id") == 4625])}


class SavedIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    query: str = Field(max_length=500)


@router.get("/siem/saved")
async def saved_list(user=Depends(get_current_user)):
    return await db.saved_searches.find({"$or": [{"user_id": user["id"]}, {"user_id": "system"}]}, NO_ID).to_list(100)


@router.post("/siem/saved")
async def saved_create(body: SavedIn, user=Depends(get_current_user)):
    doc = {"id": new_id(), "user_id": user["id"], **body.model_dump(), "created_at": now_iso()}
    await db.saved_searches.insert_one(dict(doc))
    return doc


@router.delete("/siem/saved/{sid}")
async def saved_delete(sid: str, user=Depends(get_current_user)):
    await db.saved_searches.delete_one({"id": sid, "user_id": user["id"]})
    return {"ok": True}


# ---------- Investigation tools ----------
@router.get("/tools/intel")
async def intel(q: str, user=Depends(get_current_user)):
    k = q.strip().lower().replace("[.]", ".").replace("hxxp", "http")
    k = re.sub(r"^https?://", "", k).split("/")[0] if not re.fullmatch(r"[a-f0-9]{32,64}", k) else k
    r = INTEL.get(k)
    if not r:
        return {"indicator": k, "verdict": "unknown", "detections": "0/90", "tags": [], "note": "No records in the simulated intel database."}
    return {"indicator": k, **r}


@router.get("/tools/sandbox")
async def sandbox(user=Depends(get_current_user)):
    return SANDBOX


@router.get("/tools/feed")
async def feed(user=Depends(get_current_user)):
    return THREAT_FEED


class HeaderIn(BaseModel):
    raw: str = Field(max_length=20000)


@router.post("/tools/email-header")
async def email_header(body: HeaderIn, user=Depends(get_current_user)):
    msg = Parser().parsestr(body.raw, headersonly=True)
    auth = (msg.get("Authentication-Results") or "").lower()
    frm, rp, reply = msg.get("From", ""), msg.get("Return-Path", ""), msg.get("Reply-To", "")
    dom = lambda s: (re.search(r"@([\w.-]+)", s or "") or [None, ""])[1].lower()
    findings = []
    for k in ("spf", "dkim", "dmarc"):
        m = re.search(rf"{k}=(\w+)", auth)
        if m and m.group(1) != "pass":
            findings.append({"severity": "High", "text": f"{k.upper()} result: {m.group(1)}"})
    if rp and dom(rp) != dom(frm):
        findings.append({"severity": "Medium", "text": f"Return-Path domain ({dom(rp)}) differs from From ({dom(frm)})"})
    if reply and dom(reply) != dom(frm):
        findings.append({"severity": "Medium", "text": f"Reply-To domain ({dom(reply)}) differs from From"})
    if re.search(r"[0o]ff[i1]ce|paypa1|rnicrosoft|g00gle", frm.lower()):
        findings.append({"severity": "Critical", "text": "Sender domain looks like a typosquat"})
    ips = re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", body.raw)
    return {"from": frm, "to": msg.get("To", ""), "subject": msg.get("Subject", ""), "return_path": rp, "reply_to": reply,
            "received": msg.get_all("Received") or [], "ips": sorted(set(ips)), "findings": findings,
            "verdict": "suspicious" if findings else "no obvious issues"}


class CaseIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    severity: str = Field(pattern="^(Critical|High|Medium|Low)$")
    description: str = Field(default="", max_length=4000)


class CaseUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(Open|In Progress|Escalated|Closed)$")
    note: str | None = Field(default=None, max_length=4000)


@router.get("/cases")
async def cases(user=Depends(get_current_user)):
    return await db.cases.find({"user_id": user["id"]}, NO_ID).sort("created_at", -1).to_list(200)


@router.post("/cases")
async def case_create(body: CaseIn, user=Depends(get_current_user)):
    doc = {"id": f"CASE-{new_id()[:6].upper()}", "user_id": user["id"], **body.model_dump(), "status": "Open",
           "timeline": [{"at": now_iso(), "text": "Case opened"}], "created_at": now_iso()}
    await db.cases.insert_one(dict(doc))
    return doc


@router.patch("/cases/{cid}")
async def case_update(cid: str, body: CaseUpdate, user=Depends(get_current_user)):
    c = await db.cases.find_one({"id": cid, "user_id": user["id"]}, NO_ID)
    if not c:
        raise HTTPException(404, "Case not found")
    upd, entries = {}, []
    if body.status and body.status != c["status"]:
        upd["status"] = body.status
        entries.append({"at": now_iso(), "text": f"Status changed to {body.status}"})
    if body.note:
        entries.append({"at": now_iso(), "text": body.note})
    await db.cases.update_one({"id": cid}, {"$set": upd, "$push": {"timeline": {"$each": entries}}} if upd else {"$push": {"timeline": {"$each": entries}}})
    updated = await db.cases.find_one({"id": cid}, NO_ID)
    return updated
