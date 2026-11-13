import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from core import db, get_current_user, now_iso, new_id
from routes_sop import optional_user, owns_sops, FREE_IDS
from playbook_writer import reach, TERMINALS

router = APIRouter(prefix="/api")
NO_ID = {"_id": 0}
FREE_PB = {f"pb-{s}" for s in FREE_IDS}
LIVE = {"status": "ready", "published": {"$ne": False}}


def card(p, owned):
    return {k: p.get(k) for k in ("id", "title", "severity", "summary", "mitre", "categories", "labs", "source", "updated")} | {
        "free": p["id"] in FREE_PB, "locked": p["id"] not in FREE_PB and not owned, "node_count": len(p.get("nodes", [])),
        "question_count": len([n for n in p.get("nodes", []) if n["type"] == "question"])}


async def lab_info(ids):
    return await db.labs.find({"id": {"$in": ids or []}}, {"_id": 0, "id": 1, "title": 1, "difficulty": 1, "duration": 1, "category": 1}).to_list(10)


@router.get("/public/playbooks")
async def list_playbooks(user=Depends(optional_user)):
    owned = await owns_sops(user)
    pbs = await db.playbooks.find(LIVE, NO_ID).sort("order", 1).to_list(500)
    pending = await db.playbooks.count_documents({"status": {"$in": ["planned", "generating"]}})
    return {"owned": owned, "logged_in": bool(user), "pending": pending, "playbooks": [card(p, owned) for p in pbs]}


@router.get("/public/playbooks/{pid}")
async def get_playbook(pid: str, user=Depends(optional_user)):
    p = await db.playbooks.find_one({"id": pid, **LIVE}, NO_ID)
    if not p:
        raise HTTPException(404, "Playbook not found")
    owned = await owns_sops(user)
    base = {**card(p, owned), "triggers": p.get("triggers", []), "lab_info": await lab_info(p.get("labs")), "start": p["start"]}
    if base["locked"]:
        first = next(n for n in p["nodes"] if n["id"] == p["start"])
        return {**base, "preview": {"title": first["title"], "text": first["text"]}, "report_sections": [r["section"] for r in p.get("report", [])]}
    return {**base, "nodes": p["nodes"], "report": p.get("report", [])}


@router.get("/challenges/{cid}/playbooks")
async def challenge_playbooks(cid: str, user=Depends(get_current_user)):
    c = await db.challenges.find_one({"id": cid}, {"_id": 0, "category": 1, "title": 1, "alert": 1})
    if not c:
        raise HTTPException(404, "Challenge not found")
    words = set(re.findall(r"[a-z0-9]{4,}", f"{c['title']} {(c.get('alert') or {}).get('rule', '')}".lower()))
    pbs = await db.playbooks.find({**LIVE, "categories": c["category"]}, NO_ID).to_list(50)
    pbs.sort(key=lambda p: (-len(words & set(re.findall(r"[a-z0-9]{4,}", f"{p['title']} {' '.join(p.get('triggers', []))}".lower()))), p["source"]["type"] != "siem", p.get("order", 9999)))
    return [{**card(p, True), "triggers": p.get("triggers", []), "start": p["start"], "nodes": p["nodes"], "report": p.get("report", []), "lab_info": await lab_info(p.get("labs"))} for p in pbs[:8]]


class Step(BaseModel):
    node: str = Field(max_length=60)
    answer: Optional[int] = Field(default=None, ge=0, le=5)


class RunIn(BaseModel):
    path: list[Step] = Field(min_length=1, max_length=60)
    challenge_id: Optional[str] = Field(default=None, max_length=80)


def walk(p, path):
    nodes = {n["id"]: n for n in p["nodes"]}
    cur = p["start"]
    for s in path:
        n = nodes.get(cur)
        if not n or s.node != cur:
            raise HTTPException(400, "That path doesn't match this playbook")
        if n["type"] in TERMINALS:
            return n
        if n["type"] == "question":
            if s.answer is None or s.answer >= len(n["answers"]):
                raise HTTPException(400, "Missing answer for a question step")
            cur = n["answers"][s.answer]["next"]
        else:
            cur = n["next"]
    n = nodes.get(cur)
    if not n or n["type"] not in TERMINALS:
        raise HTTPException(400, "Finish the playbook before recording it")
    return n


def first_wrong(p, path, target):
    nodes = {n["id"]: n for n in p["nodes"]}
    r = reach(p)
    for s in path:
        n = nodes[s.node]
        if n["type"] == "question" and target not in r[n["answers"][s.answer]["next"]]:
            return {"node": n["id"], "title": n["title"], "answer": n["answers"][s.answer]["label"]}
    return None


def reveal(run):
    return {k: run.get(k) for k in ("playbook_id", "playbook_title", "outcome", "correct", "expected_outcome", "wrong_step", "created_at")}


@router.post("/playbooks/{pid}/run")
async def record_run(pid: str, body: RunIn, user=Depends(get_current_user)):
    p = await db.playbooks.find_one({"id": pid, **LIVE}, NO_ID)
    if not p:
        raise HTTPException(404, "Playbook not found")
    end = walk(p, body.path)
    run = {"id": new_id(), "user_id": user["id"], "user_name": user["name"], "playbook_id": pid, "playbook_title": p["title"], "outcome": end["type"],
           "outcome_title": end["title"], "steps": len(body.path), "created_at": now_iso()}
    if body.challenge_id:
        c = await db.challenges.find_one({"id": body.challenge_id}, {"_id": 0, "verdict": 1, "title": 1, "category": 1})
        if not c:
            raise HTTPException(404, "Challenge not found")
        if c["category"] not in p.get("categories", []):
            raise HTTPException(400, "This playbook doesn't cover this alert type")
        target = "escalate" if c["verdict"] == "TP" else "close"
        run.update(challenge_id=body.challenge_id, challenge_title=c["title"], expected_outcome=target, correct=end["type"] == target,
                   wrong_step=None if end["type"] == target else first_wrong(p, body.path, target))
        submitted = await db.challenge_submissions.find_one({"user_id": user["id"], "challenge_id": body.challenge_id}, {"_id": 1})
        prev = await db.playbook_runs.find_one({"user_id": user["id"], "challenge_id": body.challenge_id}, NO_ID)
        if submitted and prev:
            return {"recorded": False, "outcome": end["type"], "result": reveal(prev), "practice": reveal(run)}
        await db.playbook_runs.replace_one({"user_id": user["id"], "challenge_id": body.challenge_id}, {**run, "after_submit": bool(submitted)}, upsert=True)
        return {"recorded": True, "outcome": end["type"], **({"result": reveal(run)} if submitted else {})}
    await db.playbook_runs.insert_one(run)
    return {"recorded": True, "outcome": end["type"]}


async def run_for(uid, cid):
    r = await db.playbook_runs.find_one({"user_id": uid, "challenge_id": cid}, NO_ID)
    return reveal(r) if r else None


@router.get("/instructor/playbook-runs")
async def instructor_runs(user=Depends(get_current_user)):
    if user["role"] not in ("instructor", "admin"):
        raise HTTPException(403, "Insufficient permissions")
    return await db.playbook_runs.find({"challenge_id": {"$exists": True}}, NO_ID).sort("created_at", -1).to_list(300)
