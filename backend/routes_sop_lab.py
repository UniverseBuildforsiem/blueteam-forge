import asyncio
import random
import os
from typing import List, Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from emergentintegrations.llm.chat import LlmChat, UserMessage
from core import db, now_iso, new_id, logger, get_current_user, award
from routes_sop import find_sop, owns_sops, FREE_IDS
from sop_writer import parse, take

router = APIRouter(prefix="/api")
SEM = asyncio.Semaphore(5)
TASKS = set()
SEVERITIES = ["Low", "Medium", "High", "Critical"]
PASS, XP = 70, 50

PROMPT = """You are building a realistic hands-on SOC practice lab for the SOP "{title}" ({category}, default severity {severity}).
SOP analysis checklist the student should apply:
{checks}
SOP phases: {phases}

Invent one realistic incident at a fictional company "Acme Corp" (domain acme-corp.com) that triggers this alert. Decide whether it is a TRUE POSITIVE (about 75% of labs) or a FALSE POSITIVE (benign explanation); choose: {kind}.
Reply with ONLY a JSON object (no markdown fences) with exactly these keys:
"alert": {{"title": product-style alert name, "source": product that raised it (e.g. Okta, Microsoft Entra ID Protection, Microsoft Defender for Endpoint, CrowdStrike Falcon, Cloudflare WAF, Palo Alto NGFW), "severity": "{severity}", "time": ISO8601 UTC timestamp in 2026, "entities": object of 4-7 key entity fields (user, host, src_ip, country, process, url, hash ... as relevant), "description": 2-3 sentences as the alert would describe it}},
"background": 2-3 sentences of context an analyst would know (user role, normal behaviour, change tickets) — include the detail that makes a false positive benign if applicable,
"logs": 14-20 objects {{"ts": ISO timestamp, "source": log source name, "line": realistic raw log line or event summary (max 220 characters) with real field names / event IDs, "evidence": true only for the 4-6 lines that are the key evidence}} in time order, mixing evidence with normal background noise."""

PROMPT_B = """Now write the graded walk-through for this same lab. Reply with ONLY a JSON object (no markdown fences) with exactly these keys:
"questions": 5-6 objects {{"q": a question that maps to one SOP analysis check and can be answered from the alert, background and logs, "options": 4 short distinct answers, "answer": index 0-3 of the correct option, "explain": 1-2 sentences citing the exact log evidence}},
"verdict": "true_positive" or "false_positive" (must match the scenario),
"verdict_explain": 2 sentences,
"severity": one of "Low", "Medium", "High", "Critical" — the correct final severity after investigation,
"containment": 6 objects {{"action": a possible response action, "correct": true/false}} with 2-4 correct actions appropriate for the verdict (for a false positive the correct ones are e.g. document and close, tune the rule),
"summary": 3-4 sentence model incident summary an L2 would write."""


def perm(sid, tag, n):
    p = list(range(n))
    random.Random(f"{sid}:{tag}").shuffle(p)
    return p


def shuffled(lab, sid):
    qs = []
    for i, q in enumerate(lab["questions"]):
        p = perm(sid, i, len(q["options"]))
        qs.append({**q, "options": [q["options"][j] for j in p], "answer": p.index(q["answer"])})
    pc = perm(sid, "c", len(lab["containment"]))
    return qs, [lab["containment"][j] for j in pc]


async def can_practise(user, sid):
    return sid in FREE_IDS or await owns_sops(user)


async def build_lab(sid):
    async with SEM:
        lab = await db.sop_labs.find_one({"sop_id": sid}, {"_id": 0, "status": 1})
        if lab and lab["status"] == "ready":
            return
        s = await find_sop(sid)
        if not s:
            return
        await db.sop_labs.update_one({"sop_id": sid}, {"$set": {"status": "generating", "error": None}}, upsert=True)
        kind = "FALSE POSITIVE" if sum(map(ord, sid)) % 4 == 0 else "TRUE POSITIVE"
        checks = "\n".join(f"- {a['check']}" for a in s.get("analysis", [])[:9]) or "\n".join(f"- {x}" for x in s["steps"][1]["actions"][:6])
        for attempt in (1, 2):
            try:
                chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"lab-{sid}-{new_id()[:6]}",
                               system_message="You design realistic, technically accurate SOC training labs. You reply with valid JSON only.").with_model("anthropic", "claude-sonnet-5-5").with_params(max_tokens=8000)
                a = take(parse(await chat.send_message(UserMessage(text=PROMPT.format(title=s["title"], category=s["category"], severity=s["severity"], checks=checks,
                                                                                      phases=", ".join(p["phase"] for p in s["steps"]), kind=kind)))), ["alert", "logs", "background"])
                b = take(parse(await chat.send_message(UserMessage(text=PROMPT_B))), ["questions", "verdict", "verdict_explain", "severity", "containment", "summary"])
                qs = [q for q in b["questions"] if len(q.get("options", [])) == 4 and q.get("answer") in (0, 1, 2, 3)]
                if len(qs) < 4 or len(a["logs"]) < 10 or b["verdict"] not in ("true_positive", "false_positive") or b["severity"] not in SEVERITIES or not any(c.get("correct") for c in b["containment"]):
                    raise ValueError("lab failed validation")
                await db.sop_labs.update_one({"sop_id": sid}, {"$set": {**a, **b, "questions": qs, "status": "ready", "created_at": now_iso()}})
                logger.info(f"SOP lab built: {s['title']}")
                return
            except Exception as e:
                logger.warning(f"SOP lab failed ({attempt}) '{s['title']}': {e}")
                if attempt == 2:
                    await db.sop_labs.update_one({"sop_id": sid}, {"$set": {"status": "failed", "error": str(e)[:200]}})


def queue(sid):
    t = asyncio.create_task(build_lab(sid))
    TASKS.add(t)
    t.add_done_callback(TASKS.discard)


async def ensure_sop_labs():
    await db.sop_labs.create_index("sop_id", unique=True)
    await db.sop_lab_attempts.create_index([("user_id", 1), ("sop_id", 1)])
    await db.sop_labs.update_many({"status": {"$in": ["generating", "failed"]}}, {"$set": {"status": "planned"}})
    have = set(await db.sop_labs.distinct("sop_id", {"status": "ready"}))
    async for s in db.sops_extra.find({"status": "ready"}, {"_id": 0, "id": 1}).sort("order", 1):
        if s["id"] not in have:
            queue(s["id"])


@router.get("/public/sop-labs")
async def lab_index():
    return {"ready": await db.sop_labs.distinct("sop_id", {"status": "ready"})}


@router.get("/sop-labs/{sid}")
async def get_lab(sid: str, user=Depends(get_current_user)):
    lab = await db.sop_labs.find_one({"sop_id": sid, "status": "ready"}, {"_id": 0})
    if not lab:
        raise HTTPException(404, "No practice lab for this SOP yet")
    s = await find_sop(sid)
    if not s:
        raise HTTPException(404, "No practice lab for this SOP yet")
    if not await can_practise(user, sid):
        raise HTTPException(403, "Unlock the SOP library to practise this lab")
    best = await db.sop_lab_attempts.find_one({"user_id": user["id"], "sop_id": sid}, {"_id": 0, "score": 1, "passed": 1}, sort=[("score", -1)])
    return {"sop_id": sid, "sop_title": s["title"], "category": s["category"], "alert": lab["alert"], "background": lab["background"],
            "logs": [{k: x.get(k) for k in ("ts", "source", "line")} for x in lab["logs"]], "questions": [{"q": q["q"], "options": q["options"]} for q in shuffled(lab, sid)[0]],
            "severities": SEVERITIES, "containment": [c["action"] for c in shuffled(lab, sid)[1]], "best": best}


class SubmitIn(BaseModel):
    answers: List[int] = Field(max_length=10)
    verdict: Literal["true_positive", "false_positive"]
    severity: Literal["Low", "Medium", "High", "Critical"]
    containment: List[int] = Field(max_length=10)


@router.post("/sop-labs/{sid}/submit")
async def submit_lab(sid: str, body: SubmitIn, user=Depends(get_current_user)):
    lab = await db.sop_labs.find_one({"sop_id": sid, "status": "ready"}, {"_id": 0})
    if not lab:
        raise HTTPException(404, "No practice lab for this SOP yet")
    if not await can_practise(user, sid):
        raise HTTPException(403, "Unlock the SOP library to practise this lab")
    qs, cont = shuffled(lab, sid)
    lab["containment"] = cont
    if len(body.answers) != len(qs) or any(not 0 <= a < len(q["options"]) for q, a in zip(qs, body.answers)):
        raise HTTPException(400, "Answer every question")
    q_res = [{"q": q["q"], "your": a, "answer": q["answer"], "correct": a == q["answer"], "explain": q["explain"], "options": q["options"]} for q, a in zip(qs, body.answers)]
    picked = set(i for i in body.containment if 0 <= i < len(lab["containment"]))
    right = {i for i, c in enumerate(lab["containment"]) if c.get("correct")}
    c_score = len(picked & right) / len(right) - 0.5 * len(picked - right) / max(1, len(lab["containment"]) - len(right))
    pts = sum(r["correct"] for r in q_res) * 10 + (20 if body.verdict == lab["verdict"] else 0) + (10 if body.severity == lab["severity"] else 0) + max(0, c_score) * 20
    total = len(qs) * 10 + 50
    score = round(100 * pts / total)
    passed = score >= PASS
    first = passed and not await db.sop_lab_attempts.find_one({"user_id": user["id"], "sop_id": sid, "passed": True})
    await db.sop_lab_attempts.insert_one({"id": new_id(), "user_id": user["id"], "sop_id": sid, "score": score, "passed": passed, "at": now_iso()})
    if first:
        await award(user["id"], XP, f"Passed SOP lab: {lab['alert']['title'][:60]}")
    return {"score": score, "passed": passed, "xp": XP if first else 0, "pass_mark": PASS, "questions": q_res,
            "verdict": {"your": body.verdict, "answer": lab["verdict"], "correct": body.verdict == lab["verdict"], "explain": lab["verdict_explain"]},
            "severity": {"your": body.severity, "answer": lab["severity"], "correct": body.severity == lab["severity"]},
            "containment": [{"action": c["action"], "correct": bool(c.get("correct")), "picked": i in picked} for i, c in enumerate(lab["containment"])],
            "evidence": [i for i, x in enumerate(lab["logs"]) if x.get("evidence")], "summary": lab["summary"]}
