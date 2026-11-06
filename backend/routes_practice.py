import re
import shlex
from typing import Optional
from collections import Counter
from email.parser import Parser
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from core import db, now_iso, new_id, get_current_user, award, rank_for, frame_for
from seed_data import gen_logs, INTEL, SANDBOX, THREAT_FEED
from toolkit import intel_report, alert_iocs, sandbox_report
from siem_engine import run as siem_run, match, QueryError, timeline

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}
LOGS = gen_logs()


# ---------- SOC alert triage challenges ----------
@router.get("/challenges")
async def list_challenges(user=Depends(get_current_user)):
    cs = await db.challenges.find({"published": {"$ne": False}}, {"_id": 0, "verdict": 0, "keywords": 0}).to_list(200)
    subs = {s["challenge_id"]: s for s in await db.challenge_submissions.find({"user_id": user["id"]}, NO_ID).to_list(500)}
    unlocked = {(h["challenge_id"], h["idx"]) for h in await db.challenge_hints.find({"user_id": user["id"]}, NO_ID).to_list(1000)}
    full = {c["id"]: c for c in await db.challenges.find({}, {"_id": 0, "id": 1, "evidence": 1, "keywords": 1}).to_list(500)}
    for c in cs:
        c["submission"] = subs.get(c["id"])
        texts = challenge_hint_texts(full[c["id"]])
        c["hints"] = [{"idx": i, "cost": HINT_COST, "text": t if (c["id"], i) in unlocked else None} for i, t in enumerate(texts)]
    return cs


HINT_COST = 25


def challenge_hint_texts(c):
    kws = c.get("keywords", [])
    ev = c.get("evidence", [])
    best = max(range(len(ev)), key=lambda i: sum(k.lower() in ev[i].lower() for k in kws)) if ev else 0
    kw = next((k for k in kws if ev and k.lower() in ev[best].lower()), kws[0] if kws else "")
    first = f"Key evidence is line #{best + 1}" + (f" — pay close attention to '{kw}'." if kw else ".")
    second = "A strong report mentions: " + ", ".join(kws[: max(1, len(kws) // 2)]) + "."
    return [first, second]


@router.post("/challenges/{cid}/hint/{idx}")
async def challenge_hint(cid: str, idx: int, user=Depends(get_current_user)):
    c = await db.challenges.find_one({"id": cid}, NO_ID)
    texts = challenge_hint_texts(c) if c else []
    if idx < 0 or idx >= len(texts):
        raise HTTPException(404, "Hint not found")
    if await db.challenge_hints.find_one({"user_id": user["id"], "challenge_id": cid, "idx": idx}):
        return {"text": texts[idx], "already": True}
    if idx > 0 and not await db.challenge_hints.find_one({"user_id": user["id"], "challenge_id": cid, "idx": idx - 1}):
        raise HTTPException(400, "Unlock the previous hint first")
    res = await db.users.update_one({"id": user["id"], "xp": {"$gte": HINT_COST}}, {"$inc": {"xp": -HINT_COST}})
    if not res.modified_count:
        raise HTTPException(400, f"You need at least {HINT_COST} points to unlock a hint")
    await db.challenge_hints.insert_one({"user_id": user["id"], "challenge_id": cid, "idx": idx, "cost": HINT_COST, "created_at": now_iso()})
    await db.activity.insert_one({"id": new_id(), "user_id": user["id"], "text": f"Unlocked hint {idx + 1} on '{c['title']}'", "xp": -HINT_COST, "created_at": now_iso()})
    return {"text": texts[idx]}


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
           "feedback": (prev or {}).get("feedback", ""), "created_at": now_iso(), "first_at": (prev or {}).get("first_at") or (prev or {}).get("created_at") or now_iso(),
           "investigated": bool((prev or {}).get("investigated")) if prev else bool(await db.toolkit_usage.find_one({"user_id": user["id"], "challenge_id": cid}, {"_id": 1}))}
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
        if not c["solved"]:
            c.pop("writeup", None)
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
    if body.flag.strip().lower() != c["flag"].strip().lower():
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
    us = {u["id"]: u for u in await db.users.find({"id": {"$in": [a["_id"] for a in agg]}}, {"_id": 0, "id": 1, "public_profile": 1, "xp": 1, "avatar_frame": 1}).to_list(50)}
    return [{"user_id": a["_id"], "name": a["name"], "username": a["username"], "points": a["points"], "solves": a["solves"],
             "public": us.get(a["_id"], {}).get("public_profile") is not False, "rank": rank_for(us.get(a["_id"], {}).get("xp", 0)), "frame": frame_for(us.get(a["_id"], {}))} for a in agg]


# ---------- Scenario labs ----------
def strip_lab(l, prog):
    answered = (prog or {}).get("answered", {})
    p = prog or {}
    return {**{k: v for k, v in l.items() if k not in ("tasks", "report_keywords")}, "tasks": [{k: v for k, v in t.items() if k != "answer"} | {"solved": t["id"] in answered} for t in l["tasks"]],
            "keyword_count": len(l.get("report_keywords", [])),
            "progress": {"answered": list(answered.keys()), "report": p.get("report", ""), "report_submitted": p.get("report_submitted", False),
                         "report_score": p.get("report_score"), "keywords_hit": p.get("keywords_hit", []), "keywords_missed": p.get("keywords_missed", []),
                         "instructor_grade": p.get("instructor_grade"), "feedback": p.get("feedback", "")}}


@router.get("/labs")
async def list_labs(user=Depends(get_current_user)):
    labs = await db.labs.find({"published": {"$ne": False}}, {"_id": 0, "kali": 0}).to_list(100)
    progs = {p["lab_id"]: p for p in await db.lab_progress.find({"user_id": user["id"]}, NO_ID).to_list(100)}
    return [{"id": l["id"], "title": l["title"], "description": l["description"], "difficulty": l["difficulty"], "duration": l.get("duration"), "category": l.get("category", "Incident"),
             "phases": list(dict.fromkeys(t.get("phase", "Investigation") for t in l["tasks"])), "report_score": progs.get(l["id"], {}).get("report_score"),
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


KW_VARIANTS = {"brute force": ["brute force", "bruteforce", "brute forcing"], "dns tunneling": ["dns tunneling", "dns tunnel"], "isolate": ["isolate", "isolation", "isolated"],
               "reset": ["reset", "rotate", "rotation"], "rotate": ["rotate", "rotation", "reset"], "block": ["block", "blocked", "blocking"], "revoke": ["revoke", "revoked", "revocation"],
               "web shell": ["web shell", "webshell"], "sql injection": ["sql injection", "sqli"], "kerberoasting": ["kerberoast"], "password spray": ["password spray", "spraying"],
               "inbox rule": ["inbox rule", "mailbox rule"], "recall": ["recall", "reversal", "reverse the transfer"], "backup": ["backup", "back up", "restore"], "patch": ["patch", "update"]}


@router.post("/labs/{lid}/report")
async def lab_report(lid: str, body: ReportIn, user=Depends(get_current_user)):
    l = await db.labs.find_one({"id": lid}, NO_ID)
    if not l:
        raise HTTPException(404, "Lab not found")
    prog = await db.lab_progress.find_one({"user_id": user["id"], "lab_id": lid}, NO_ID) or {}
    if len(prog.get("answered", {})) < len(l["tasks"]):
        raise HTTPException(400, "Solve all tasks before submitting the final report")
    kws = l.get("report_keywords", [])
    low = body.report.lower().replace("tunnelling", "tunneling").replace("-", " ")
    hits = [k for k in kws if any(v.lower().replace("-", " ") in low for v in KW_VARIANTS.get(k, [k]))]
    score = round(100 * len(hits) / len(kws)) if kws else 100
    best = max(score, prog.get("report_score") or 0)
    await db.lab_progress.update_one({"user_id": user["id"], "lab_id": lid}, {"$set": {"report": body.report, "report_submitted": True, "report_at": prog.get("report_at") or now_iso(),
                                                                                      "report_score": best, "keywords_hit": hits, "keywords_missed": [k for k in kws if k not in hits],
                                                                                      "user_name": user["name"], "lab_title": l["title"],
                                                                                      **({"review_status": "resubmitted"} if prog.get("report_submitted") else {})}})
    if not prog.get("report_submitted"):
        await award(user["id"], 20 + round(80 * score / 100), f"Final report for lab '{l['title']}' ({score}/100)")
    return {"ok": True, "score": score, "best": best, "keywords_hit": hits, "keywords_missed": [k for k in kws if k not in hits]}


# ---------- Daily alert drill ----------
from datetime import datetime, timedelta
from core import now
from drills import drill_for
from pymongo.errors import DuplicateKeyError


@router.get("/drill/today")
async def drill_today(user=Depends(get_current_user)):
    d = drill_for(now().date().isoformat())
    sub = await db.drill_submissions.find_one({"user_id": user["id"], "date": d["date"]}, NO_ID)
    await apply_freeze(user["id"])
    streak = await drill_streak(user["id"])
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "streak_freezes": 1, "xp": 1})
    frozen = [f["date"] for f in await db.drill_freezes.find({"user_id": user["id"]}, {"_id": 0, "date": 1}).sort("date", -1).to_list(5)]
    public = {k: v for k, v in d.items() if k not in ("verdict", "keywords")}
    return {**public, "submission": sub, "drill_streak": streak, "streak_emails": user.get("streak_emails", True),
            "streak_freezes": fresh.get("streak_freezes", 0), "freeze_cost": FREEZE_COST, "freeze_max": FREEZE_MAX, "xp": fresh.get("xp", 0), "frozen_days": frozen}


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


FREEZE_COST, FREEZE_MAX = 100, 2


async def apply_freeze(uid):
    today = now().date()
    y, y2 = (today - timedelta(days=1)).isoformat(), (today - timedelta(days=2)).isoformat()
    if await db.drill_submissions.find_one({"user_id": uid, "date": y}) or await db.drill_freezes.find_one({"user_id": uid, "date": y}):
        return
    if not (await db.drill_submissions.find_one({"user_id": uid, "date": y2}) or await db.drill_freezes.find_one({"user_id": uid, "date": y2})):
        return
    r = await db.users.update_one({"id": uid, "streak_freezes": {"$gt": 0}}, {"$inc": {"streak_freezes": -1}})
    if r.modified_count:
        try:
            await db.drill_freezes.insert_one({"user_id": uid, "date": y, "at": now_iso()})
            await db.activity.insert_one({"id": new_id(), "user_id": uid, "text": f"Streak freeze used for {y}", "xp": 0, "created_at": now_iso()})
        except DuplicateKeyError:
            await db.users.update_one({"id": uid}, {"$inc": {"streak_freezes": 1}})


async def streak_stats(uid):
    real = {s["date"] for s in await db.drill_submissions.find({"user_id": uid}, {"_id": 0, "date": 1}).to_list(2000)}
    frozen = {f["date"] for f in await db.drill_freezes.find({"user_id": uid}, {"_id": 0, "date": 1}).to_list(500)}
    days = real | frozen
    y, y2 = (now().date() - timedelta(days=1)).isoformat(), (now().date() - timedelta(days=2)).isoformat()
    if y not in days and y2 in days and ((await db.users.find_one({"id": uid}, {"_id": 0, "streak_freezes": 1})) or {}).get("streak_freezes", 0) > 0:
        days.add(y)
    dates = sorted(days)
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
    return current, longest, len(real)


@router.post("/drill/freeze/buy")
async def buy_freeze(user=Depends(get_current_user)):
    r = await db.users.update_one({"id": user["id"], "xp": {"$gte": FREEZE_COST}, "$or": [{"streak_freezes": {"$lt": FREEZE_MAX}}, {"streak_freezes": {"$exists": False}}]},
                                  {"$inc": {"xp": -FREEZE_COST, "streak_freezes": 1}})
    if not r.modified_count:
        if (user.get("streak_freezes") or 0) >= FREEZE_MAX:
            raise HTTPException(400, f"You can hold at most {FREEZE_MAX} streak freezes")
        raise HTTPException(400, f"You need {FREEZE_COST} XP to buy a streak freeze")
    await db.activity.insert_one({"id": new_id(), "user_id": user["id"], "text": "Bought a streak freeze", "xp": -FREEZE_COST, "created_at": now_iso()})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "streak_freezes": 1, "xp": 1})
    return {"streak_freezes": u["streak_freezes"], "xp": u["xp"]}


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
    frozen = {f["date"] for f in await db.drill_freezes.find({"user_id": user["id"], "date": {"$in": days}}, NO_ID).to_list(20)}
    out = []
    for day in days:
        d = drill_for(day)
        out.append({"date": day, "title": d["title"], "category": d["category"], "severity": d["severity"],
                    "live_score": subs.get(day, {}).get("auto_score"), "frozen": day in frozen, "practice_best": prac.get(day, {}).get("best")})
    return out


@router.get("/drill/leaderboard")
async def drill_leaderboard(user=Depends(get_current_user)):
    week = (now().date() - timedelta(days=6)).isoformat()
    agg = await db.drill_submissions.aggregate([{"$match": {"date": {"$gte": week}}}, {"$group": {"_id": "$user_id", "week": {"$sum": 1}, "xp": {"$sum": "$xp"}}}]).to_list(500)
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": [a["_id"] for a in agg]}}, {"_id": 0, "id": 1, "name": 1, "username": 1, "public_profile": 1, "xp": 1, "avatar_frame": 1}).to_list(500)}
    rows = [{"user_id": a["_id"], "name": users.get(a["_id"], {}).get("name", "?"), "username": users.get(a["_id"], {}).get("username", ""),
             "rank": rank_for(users.get(a["_id"], {}).get("xp", 0)), "frame": frame_for(users.get(a["_id"], {})),
             "public": users.get(a["_id"], {}).get("public_profile") is not False,
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
    streak_emails: Optional[bool] = None
    course_emails: Optional[bool] = None
    digest_emails: Optional[bool] = None
    series_emails: Optional[bool] = None


def prefs_out(u):
    return {k: u.get(k) is not False for k in ("streak_emails", "course_emails", "digest_emails", "series_emails")}


@router.get("/me/preferences")
async def get_prefs(user=Depends(get_current_user)):
    return prefs_out(user)


@router.patch("/me/preferences")
async def prefs(body: PrefsIn, user=Depends(get_current_user)):
    upd = body.model_dump(exclude_none=True)
    if upd:
        await db.users.update_one({"id": user["id"]}, {"$set": upd})
    u = await db.users.find_one({"id": user["id"]}, {"_id": 0, "streak_emails": 1, "course_emails": 1, "digest_emails": 1, "series_emails": 1})
    return prefs_out(u)


# ---------- SIEM ----------
@router.get("/siem/search")
async def siem_search(q: str = "", lang: str = "spl", start: str = "", end: str = "", user=Depends(get_current_user)):
    try:
        return siem_run(LOGS, q, "kql" if lang == "kql" else "spl", start, end)
    except QueryError as e:
        raise HTTPException(400, str(e))


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
    return {"total": len(LOGS), "by_sourcetype": by("sourcetype"), "by_host": by("host"), "by_action": by("action"), "by_country": by("country"),
            "failed_logons": len([e for e in LOGS if e.get("event_id") == 4625 or e.get("result_code") == 50126]),
            "timeline": [{"t": t["t"][5:].replace("T", " ") + "h", "c": t["c"]} for t in timeline(LOGS)]}


class SavedIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    query: str = Field(max_length=1500)
    lang: str = Field(default="spl", pattern="^(spl|kql)$")


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
async def intel(q: str = Query(min_length=3, max_length=300), kind: Optional[str] = None, id: Optional[str] = None, user=Depends(get_current_user)):
    r = await intel_report(q, kind, id)
    await log_toolkit(user, kind, id)
    return r


async def log_toolkit(user, kind, cid):
    if kind == "challenge" and cid and await db.challenges.find_one({"id": cid}, {"_id": 1}):
        await db.toolkit_usage.update_one({"user_id": user["id"], "challenge_id": cid}, {"$setOnInsert": {"first_at": now_iso()}, "$inc": {"uses": 1}}, upsert=True)


@router.get("/tools/alert-iocs")
async def iocs_for_alert(kind: str = Query(pattern="^(challenge|lab)$"), id: str = Query(max_length=80), user=Depends(get_current_user)):
    r = await alert_iocs(kind, id)
    if not r:
        raise HTTPException(404, "Alert not found")
    return r


@router.get("/tools/sandbox/report")
async def sandbox_for_file(file: str = Query(max_length=300), kind: str = Query(pattern="^(challenge|lab)$"), id: str = Query(max_length=80), user=Depends(get_current_user)):
    r = await sandbox_report(file, kind, id)
    if not r:
        raise HTTPException(404, "File not found in this alert")
    await log_toolkit(user, kind, id)
    return r


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
