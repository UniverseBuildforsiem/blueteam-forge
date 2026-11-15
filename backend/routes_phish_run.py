import hashlib
import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from core import db, get_current_user, now_iso, new_id, award
from routes_phish import get_case, norm, pick_score, XP, TYPES, SLA_MIN, artifacts
import intel_sources as S

router = APIRouter(prefix="/api/phish")
NO_ID = {"_id": 0}
HINT_COST = [5, 10, 15]
SLA_PENALTY = 10

GOOD = [(r"purge|search all|remove the event|remove all sticker", "{n} mailboxes purged · 0 copies left in inboxes"),
        (r"(?<!no )\bblock", "Gateway, proxy and DNS block rules created · {n} later attempts dropped"),
        (r"revoke|reset", "Sessions revoked and credentials reset · user re-prompted for MFA"),
        (r"isolate", "Host isolated by EDR · network contained in {n}s"),
        (r"hold|pause|stop the wire|freeze|don't upload|not to upload|stop", "Transaction held · finance confirms nothing left the account"),
        (r"verify|confirm with|call|contact the real", "Out-of-band check logged · the real person had sent nothing"),
        (r"takedown|report the|report to", "Takedown/abuse report filed · ticket #{n}"),
        (r"hunt|check|find|review|scope", "Hunt query returned {n} matching events · added to the case"),
        (r"tell|warn|remind|notify|alert|brief|thank|reply publicly|reassure|publish", "Notification sent · {n} people informed"),
        (r"release|close|leave", "Ticket closed as benign with your reasoning · user notified"),
        (r"enable|turn off|disable|enforce|add a|require|move the user", "Control change approved by CAB · applies to all users")]
BAD = [(r"\bonly\b|\bjust\b", "Partial fix · attacker persistence remains on the account"),
       (r"reply|dm the|ask .*confirm|ask (him|her|the user)", "The attacker now knows the mailbox is watched and switches infrastructure"),
       (r"open|click|scan|join|connect|download|upload|install|buy", "You touched live attacker infrastructure from a work device · logged as a policy violation"),
       (r"close|ignore|leave it|no action|trust|wait", "The threat stays active · {n} more users interact with it within the hour"),
       (r"forward", "The live link spread to {n}0 staff mailboxes"),
       (r"pay|make the wire|update the account", "Funds sent to an attacker-controlled account · recovery uncertain"),
       (r"block|purge|remove|freeze|reset", "A legitimate service was disrupted · {n} users raise tickets")]


def seed(*xs):
    return int(hashlib.md5("|".join(map(str, xs)).encode()).hexdigest()[:8], 16)


def effect(text, correct, s):
    n = 3 + s % 40
    for rx, msg in (GOOD if correct else BAD):
        if re.search(rx, text, re.I):
            return msg.format(n=n)
    return "Action completed and logged" if correct else "Time spent with no benefit · the threat stays active"


def hints(c):
    t = next(t for t in TYPES if t["id"] == c["type"])
    right = [f["text"] for f in c["red_flags"] if f["correct"]]
    kinds = sorted({"IP" if re.fullmatch(r"[\d.]+", i) else "URL" if "/" in i else "email" if "@" in i[1:] else "phone" if re.fullmatch(r"\+?\d+", i) else "handle" if i.startswith("@") else "domain/file" for i in c["iocs"]})
    return c.get("hints") or [t["checklist"][1], f"There are {len(c['iocs'])} indicators to extract ({', '.join(kinds) or 'none — think about the verdict'}).", f"Key finding: {right[0]}"]


def sandbox(c, art):
    if art in (c.get("sandbox") or {}):
        return c["sandbox"][art]
    s, host = seed(c["id"], art), (S.url_host(art) if "://" in art else "")
    hits = {norm(i) for i in c["iocs"]}
    bad = norm(art) in hits or (host and any(host == norm(i) or host.endswith("." + norm(i)) for i in hits))
    ext = art.rsplit(".", 1)[-1].lower() if "." in art and "://" not in art else ""
    net = [f"203.0.113.{s % 200 + 20}:443"] if bad else []
    if ext:
        if bad or ext in ("html", "htm", "iso", "lnk", "hta", "js") and c["verdict"].startswith("Phish"):
            return {"verdict": "malicious", "score": 80 + s % 19, "behaviours": [f"{ext.upper()} file executes script content on open", "Spawns a credential prompt or child process", "Beacons to remote infrastructure"], "network": net or [f"198.51.100.{s % 200 + 20}:443"]}
        return {"verdict": "clean", "score": s % 12, "behaviours": ["Static document · no macros or scripts", "No child processes"], "network": []}
    if bad:
        return {"verdict": "malicious", "score": 82 + s % 17, "behaviours": [f"Redirect chain: {1 + s % 3} hop(s) to {host}", "Page renders a login or payment form", "Form POSTs input to an attacker-controlled path"], "network": net}
    return {"verdict": "clean", "score": s % 15, "behaviours": ["Page loads normally · no credential forms", "No redirects to unrelated domains"], "network": []}


async def own_run(rid, user):
    r = await db.phish_runs.find_one({"id": rid, "user_id": user["id"]}, NO_ID)
    if not r:
        raise HTTPException(404, "Investigation not found")
    if r.get("submitted"):
        raise HTTPException(409, "This investigation is already submitted")
    return r, await get_case(r["case_id"], user)


def state(r, c):
    hs = hints(c)
    used = [{"i": i, "text": hs[i], "cost": HINT_COST[i]} for i in r["hints"]]
    wrong = sum(1 for a in r["actions"] if not a["good"])
    right = sum(1 for o in c["response"] if o["correct"]) or 1
    return {"id": r["id"], "case_id": r["case_id"], "started_at": r["started_at"], "sla_minutes": r["sla_minutes"], "hints_total": len(hs), "hints": used,
            "next_hint_cost": HINT_COST[len(r["hints"])] if len(r["hints"]) < len(hs) else None, "actions": r["actions"], "events": r["events"][-60:], "reported": r.get("reported", False),
            "max_score": max(0, 100 - sum(u["cost"] for u in used) - round(20 * wrong / right))}


def log(kind, text):
    return {"at": now_iso(), "kind": kind, "text": text[:240]}


@router.post("/cases/{cid}/run")
async def start(cid: str, user=Depends(get_current_user)):
    c = await get_case(cid, user)
    r = await db.phish_runs.find_one({"user_id": user["id"], "case_id": cid, "submitted": False}, NO_ID, sort=[("started_at", -1)])
    if not r:
        r = {"id": new_id(), "user_id": user["id"], "case_id": cid, "started_at": now_iso(), "sla_minutes": SLA_MIN.get(c["difficulty"], 15),
             "hints": [], "actions": [], "events": [log("start", "Case opened from the triage queue")], "submitted": False}
        await db.phish_runs.insert_one(dict(r))
        r.pop("_id", None)
    return state(r, c)


@router.post("/runs/{rid}/restart")
async def restart(rid: str, user=Depends(get_current_user)):
    r = await db.phish_runs.find_one({"id": rid, "user_id": user["id"]}, NO_ID)
    if not r:
        raise HTTPException(404, "Investigation not found")
    await db.phish_runs.update_one({"id": rid, "submitted": False}, {"$set": {"submitted": True, "abandoned": True}})
    return await start(r["case_id"], user)


class EventIn(BaseModel):
    kind: str = Field(pattern="^(report|pin|unpin|step|tool|verdict)$")
    text: str = Field(min_length=1, max_length=240)


@router.post("/runs/{rid}/event")
async def event(rid: str, body: EventIn, user=Depends(get_current_user)):
    r, c = await own_run(rid, user)
    upd = {"$push": {"events": {"$each": [log(body.kind, body.text)], "$slice": -200}}}
    if body.kind == "report":
        upd["$set"] = {"reported": True}
    await db.phish_runs.update_one({"id": rid}, upd)
    return {"ok": True}


@router.post("/runs/{rid}/hint")
async def hint(rid: str, user=Depends(get_current_user)):
    r, c = await own_run(rid, user)
    i = len(r["hints"])
    if i >= len(hints(c)):
        raise HTTPException(400, "No more hints")
    r["hints"].append(i)
    r["events"].append(log("hint", f"Hint {i + 1} used (−{HINT_COST[i]} pts)"))
    await db.phish_runs.update_one({"id": rid}, {"$set": {"hints": r["hints"], "events": r["events"][-200:]}})
    return state(r, c)


class ActIn(BaseModel):
    index: int = Field(ge=0, le=19)


@router.post("/runs/{rid}/act")
async def act(rid: str, body: ActIn, user=Depends(get_current_user)):
    r, c = await own_run(rid, user)
    if body.index >= len(c["response"]):
        raise HTTPException(422, "Unknown action")
    if any(a["i"] == body.index for a in r["actions"]):
        raise HTTPException(409, "Action already executed")
    o = c["response"][body.index]
    a = {"i": body.index, "text": o["text"], "good": bool(o["correct"]), "effect": effect(o["text"], o["correct"], seed(c["id"], body.index)), "at": now_iso()}
    r["actions"].append(a)
    r["events"].append(log("action", f"{o['text']} → {a['effect']}"))
    await db.phish_runs.update_one({"id": rid}, {"$set": {"actions": r["actions"], "events": r["events"][-200:]}})
    return state(r, c)


class DetIn(BaseModel):
    artifact: str = Field(min_length=1, max_length=600)


@router.post("/runs/{rid}/detonate")
async def detonate(rid: str, body: DetIn, user=Depends(get_current_user)):
    r, c = await own_run(rid, user)
    if body.artifact not in artifacts(c):
        raise HTTPException(422, "That artifact isn't part of this case")
    res = sandbox(c, body.artifact)
    await db.phish_runs.update_one({"id": rid}, {"$push": {"events": {"$each": [log("sandbox", f"Detonated {body.artifact[:120]} → {res['verdict']} ({res['score']}/100)")], "$slice": -200}}})
    return {"artifact": body.artifact, **res, "simulated": True}


class PinIn(BaseModel):
    ref: str = Field(max_length=40)
    text: str = Field(max_length=400)
    finding: int = Field(ge=0, le=19)
    note: str = Field(default="", max_length=300)


class RunSubmitIn(BaseModel):
    verdict: str = Field(max_length=80)
    pins: list[PinIn] = Field(default_factory=list, max_length=30)
    iocs: list[str] = Field(default_factory=list, max_length=30)
    summary: str = Field(default="", max_length=3000)


@router.post("/runs/{rid}/submit")
async def submit(rid: str, body: RunSubmitIn, user=Depends(get_current_user)):
    r, c = await own_run(rid, user)
    given = {norm(x) for x in body.iocs if x.strip()}
    hits = [i for i in c["iocs"] if norm(i) in given]
    findings = sorted({p.finding for p in body.pins})
    elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(r["started_at"])).total_seconds()
    over = elapsed > r["sla_minutes"] * 60
    hint_pen = sum(HINT_COST[i] for i in r["hints"])
    parts = {"verdict": 30 if body.verdict == c["verdict"] else 0, "evidence": pick_score(c["red_flags"], findings, 30),
             "iocs": round(20 * len(hits) / len(c["iocs"])) if c["iocs"] else (20 if not given else 10), "response": pick_score(c["response"], [a["i"] for a in r["actions"]], 20)}
    penalties = {"hints": hint_pen, "sla": SLA_PENALTY if over else 0}
    score = max(0, sum(parts.values()) - sum(penalties.values()))
    passed = score >= 70
    first = passed and not await db.phish_attempts.find_one({"user_id": user["id"], "case_id": c["id"], "passed": True})
    xp = XP.get(c["difficulty"], 50) if first else 0
    events = r["events"] + [log("verdict", f"Verdict: {body.verdict}"), log("submit", f"Report submitted · {len(body.pins)} pins · {len(given)} IOCs")]
    await db.phish_runs.update_one({"id": rid}, {"$set": {"submitted": True, "events": events[-200:], "summary": body.summary, "score": score}})
    await db.phish_attempts.insert_one({"id": new_id(), "user_id": user["id"], "case_id": c["id"], "run_id": rid, "score": score, "parts": parts, "penalties": penalties,
                                        "passed": passed, "created_at": now_iso()})
    if xp:
        await award(user["id"], xp, f"Solved phishing case: {c['title']}")
    return {"score": score, "parts": parts, "penalties": penalties, "passed": passed, "xp": xp, "verdict": c["verdict"], "verdict_ok": body.verdict == c["verdict"],
            "debrief": c["debrief"], "iocs": c["iocs"], "ioc_hits": hits, "ioc_extra": sorted(given - {norm(i) for i in hits}),
            "findings": [{"text": f["text"], "correct": f["correct"], "pinned": i in findings} for i, f in enumerate(c["red_flags"])],
            "pins": [{**p.model_dump(), "correct": c["red_flags"][p.finding]["correct"] if p.finding < len(c["red_flags"]) else False} for p in body.pins],
            "response": [{"text": o["text"], "correct": o["correct"], "done": any(a["i"] == i for a in r["actions"])} for i, o in enumerate(c["response"])],
            "timeline": events, "elapsed_seconds": round(elapsed), "sla_minutes": r["sla_minutes"], "summary": body.summary, "playbook": "/sops/sop-phishing"}
