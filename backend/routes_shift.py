import random
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo.errors import DuplicateKeyError
from core import db, get_current_user, now, now_iso, new_id

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}
LENGTHS = {15: 5, 30: 8, 60: 14}
WEIGHT = {"Critical": 2, "High": 1.5, "Medium": 1, "Low": 1}
HIDE = {"_id": 0, "verdict": 0, "keywords": 0}


class StartIn(BaseModel):
    minutes: int


class TriageIn(BaseModel):
    verdict: str = Field(pattern="^(TP|FP)$")
    report: str = Field(min_length=20, max_length=5000)


def left(s):
    return (datetime.fromisoformat(s["ends_at"]) - now()).total_seconds()


async def pick(n):
    cs = await db.challenges.find({"published": {"$ne": False}}, {"_id": 0, "id": 1, "category": 1, "verdict": 1}).to_list(500)
    random.shuffle(cs)
    out, cats = [], set()
    for c in cs:
        if c["category"] not in cats or len(cats) >= len({x["category"] for x in cs}):
            out.append(c)
            cats.add(c["category"])
        if len(out) == n:
            break
    if not any(c["verdict"] == "FP" for c in out):
        fp = next((c for c in cs if c["verdict"] == "FP" and c not in out), None)
        if fp:
            out[-1] = fp
    return [c["id"] for c in out]


async def score(s):
    cs = {c["id"]: c for c in await db.challenges.find({"id": {"$in": s["alerts"]}}, NO_ID).to_list(50)}
    avail = set(s.get("pb_available", s["alerts"]))
    rows, tot_w, acc, rep, pbk, pb_w = [], 0, 0, 0, 0, 0
    for cid in [a for a in s["alerts"] if a in cs]:
        c, r = cs[cid], s["results"].get(cid) or {}
        w = WEIGHT.get(c["severity"], 1)
        tot_w += w
        pb_w += w if cid in avail else 0
        vc = bool(r.get("verdict_correct"))
        kw = r.get("kw_ratio", 0)
        pb = (r.get("playbook") or {}).get("correct")
        acc += w * vc
        rep += w * kw
        pbk += w * bool(pb) if cid in avail else 0
        rows.append({"id": cid, "title": c["title"], "severity": c["severity"], "category": c["category"], "expected": c["verdict"], "verdict": r.get("verdict"),
                     "verdict_correct": vc, "report_pct": round(100 * kw), "playbook": r.get("playbook"), "missed_keywords": [k for k in c["keywords"] if k not in r.get("hits", [])] if r else None})
    done = len([x for x in rows if x["verdict"]])
    total = s["minutes"] * 60
    speed = max(0, total - s.get("used_sec", total)) / total if done == len(rows) else 0
    parts = {"accuracy": round(55 * acc / tot_w), "report": round(20 * rep / tot_w), "playbook": round(15 * (pbk / pb_w if pb_w else acc / tot_w)), "speed": round(10 * speed)}
    return {"score": sum(parts.values()), "parts": parts, "rows": rows, "triaged": done}


async def finish(s):
    if s["status"] == "done":
        return s
    used = min(s["minutes"] * 60, (now() - datetime.fromisoformat(s["started_at"])).total_seconds())
    s.update(status="done", used_sec=round(used), finished_at=now_iso())
    s["result"] = await score(s)
    await db.shifts.update_one({"id": s["id"]}, {"$set": {k: s[k] for k in ("status", "used_sec", "finished_at", "result")}})
    return s


async def view(s):
    if s["status"] == "active" and left(s) <= 0:
        s = await finish(s)
    if s["status"] == "done":
        return {k: s[k] for k in ("id", "minutes", "status", "started_at", "finished_at", "used_sec", "result")}
    cs = {c["id"]: c for c in await db.challenges.find({"id": {"$in": s["alerts"]}}, HIDE).to_list(50)}
    return {"id": s["id"], "minutes": s["minutes"], "status": "active", "started_at": s["started_at"], "ends_at": s["ends_at"], "seconds_left": max(0, round(left(s))),
            "alerts": [{**cs[a], "triaged": a in s["results"] and bool(s["results"][a].get("verdict")), "playbook_used": bool((s["results"].get(a) or {}).get("playbook"))} for a in s["alerts"]]}


async def mine(sid, user):
    s = await db.shifts.find_one({"id": sid, "user_id": user["id"]}, NO_ID)
    if not s:
        raise HTTPException(404, "Shift not found")
    return s


@router.post("/shift/start")
async def start(body: StartIn, user=Depends(get_current_user)):
    if body.minutes not in LENGTHS:
        raise HTTPException(400, "Pick a 15, 30 or 60 minute shift")
    from routes_playbooks import unlocked_categories
    await db.shifts.create_index("user_id", unique=True, partialFilterExpression={"status": "active"}, name="one_active_shift")
    active = await db.shifts.find_one({"user_id": user["id"], "status": "active"}, NO_ID)
    if active:
        v = await view(active)
        if v["status"] == "active":
            return v
    t = now()
    alerts = await pick(LENGTHS[body.minutes])
    cats = await unlocked_categories(user)
    avail = [c["id"] for c in await db.challenges.find({"id": {"$in": alerts}, "category": {"$in": list(cats)}}, {"_id": 0, "id": 1}).to_list(50)]
    s = {"id": new_id(), "user_id": user["id"], "user_name": user["name"], "minutes": body.minutes, "alerts": alerts, "pb_available": avail, "results": {},
         "status": "active", "started_at": t.isoformat(), "ends_at": (t + timedelta(minutes=body.minutes)).isoformat()}
    try:
        await db.shifts.insert_one(dict(s))
    except DuplicateKeyError:
        return await view(await db.shifts.find_one({"user_id": user["id"], "status": "active"}, NO_ID))
    return await view(s)


@router.get("/shift/active")
async def active_shift(user=Depends(get_current_user)):
    s = await db.shifts.find_one({"user_id": user["id"], "status": "active"}, NO_ID)
    return await view(s) if s else None


@router.post("/shift/{sid}/triage/{cid}")
async def triage(sid: str, cid: str, body: TriageIn, user=Depends(get_current_user)):
    s = await mine(sid, user)
    if s["status"] != "active" or left(s) < -5:
        await finish(s)
        raise HTTPException(400, "This shift has ended")
    if cid not in s["alerts"]:
        raise HTTPException(404, "That alert isn't in this shift")
    if (s["results"].get(cid) or {}).get("verdict"):
        raise HTTPException(400, "You already triaged this alert")
    c = await db.challenges.find_one({"id": cid}, NO_ID)
    hits = [k for k in c["keywords"] if k.lower() in body.report.lower()]
    prev = s["results"].get(cid) or {}
    r = {**prev, "verdict": body.verdict, "verdict_correct": body.verdict == c["verdict"], "hits": hits, "kw_ratio": len(hits) / max(1, len(c["keywords"])), "report": body.report, "at": now_iso()}
    await db.shifts.update_one({"id": sid}, {"$set": {f"results.{cid}": r}})
    s["results"][cid] = r
    if all((s["results"].get(a) or {}).get("verdict") for a in s["alerts"]):
        return {"saved": True, "finished": True, "shift": await view(await finish(s))}
    return {"saved": True, "finished": False}


async def record_shift_playbook(sid, cid, user, run):
    s = await mine(sid, user)
    if s["status"] != "active" or left(s) < -5 or cid not in s["alerts"]:
        raise HTTPException(400, "This shift has ended")
    if (s["results"].get(cid) or {}).get("playbook"):
        return False
    await db.shifts.update_one({"id": sid}, {"$set": {f"results.{cid}.playbook": {k: run.get(k) for k in ("playbook_id", "playbook_title", "outcome", "correct", "expected_outcome", "wrong_step")}}})
    return True


@router.post("/shift/{sid}/finish")
async def end_shift(sid: str, user=Depends(get_current_user)):
    return await view(await finish(await mine(sid, user)))


@router.get("/shift/history")
async def history(user=Depends(get_current_user)):
    rows = await db.shifts.find({"user_id": user["id"], "status": "done"}, {"_id": 0, "id": 1, "minutes": 1, "finished_at": 1, "result.score": 1, "result.triaged": 1, "alerts": 1}).sort("finished_at", -1).to_list(20)
    return [{"id": r["id"], "minutes": r["minutes"], "finished_at": r["finished_at"], "score": r["result"]["score"], "triaged": r["result"]["triaged"], "total": len(r["alerts"])} for r in rows]


@router.get("/shift/{sid}")
async def get_shift(sid: str, user=Depends(get_current_user)):
    return await view(await mine(sid, user))

