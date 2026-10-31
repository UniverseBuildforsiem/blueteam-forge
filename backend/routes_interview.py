import asyncio
import json
import os
import random
import re
from datetime import timedelta
from pathlib import Path
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
from core import db, get_current_user, now, now_iso, new_id, logger
from routes_book import owns_book

router = APIRouter(prefix="/api/mock-interview")

POOL = json.loads((Path(__file__).parent / "assets" / "book" / "questions.json").read_text())
BY_ID = {q["id"]: q for q in POOL}
COUNT, MINUTES, PASS = 30, 30, 70
NO_ID = {"_id": 0}
TASKS = set()


async def require_owner(user):
    if not await owns_book(user):
        raise HTTPException(402, "The mock interview is included with the SOC Interview ebook")


def public_session(s):
    out = {k: v for k, v in s.items() if k != "user_id"}
    out["questions"] = [{"id": i, "q": BY_ID[i]["q"], "topic": BY_ID[i]["topic"]} for i in s["qids"]]
    if s["status"] == "graded":
        out["questions"] = [{**q, "reference": BY_ID[q["id"]]["a"]} for q in out["questions"]]
    return out


@router.post("/start")
async def start(user=Depends(get_current_user)):
    await require_owner(user)
    live = await db.interviews.find_one({"user_id": user["id"], "status": "in_progress", "expires_at": {"$gt": now_iso()}}, NO_ID)
    if live:
        return public_session(live)
    qids = random.sample([q["id"] for q in POOL], min(COUNT, len(POOL)))
    s = {"id": new_id(), "user_id": user["id"], "qids": qids, "answers": {}, "status": "in_progress", "started_at": now_iso(),
         "expires_at": (now() + timedelta(minutes=MINUTES)).isoformat(), "minutes": MINUTES, "pass_mark": PASS}
    await db.interviews.insert_one(dict(s))
    return public_session(s)


class AnswersIn(BaseModel):
    answers: Dict[str, str] = Field(default_factory=dict)


def clean(s, answers):
    return {k: (v or "")[:3000] for k, v in answers.items() if k in s["qids"]}


async def own_session(sid, user):
    s = await db.interviews.find_one({"id": sid, "user_id": user["id"]}, NO_ID)
    if not s:
        raise HTTPException(404, "Interview not found")
    return s


@router.put("/{sid}/draft")
async def draft(sid: str, body: AnswersIn, user=Depends(get_current_user)):
    s = await own_session(sid, user)
    if s["status"] != "in_progress":
        raise HTTPException(409, "Interview already submitted")
    await db.interviews.update_one({"id": sid}, {"$set": {"answers": clean(s, body.answers)}})
    return {"ok": True}


async def grade(sid):
    s = await db.interviews.find_one({"id": sid}, NO_ID)
    items = [{"id": i, "question": BY_ID[i]["q"], "reference": BY_ID[i]["a"], "answer": s["answers"].get(i, "").strip()} for i in s["qids"]]
    todo = [x for x in items if len(x["answer"]) >= 3]
    results = {x["id"]: {"score": 0, "feedback": "No answer given."} for x in items if len(x["answer"]) < 3}
    try:
        if todo:
            chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"interview-{sid}",
                           system_message="You are a senior SOC interviewer grading a candidate's typed answers against reference answers. Be fair: reward correct ideas in the candidate's own words, penalise wrong or missing key points. Reply with JSON only.").with_model("anthropic", "claude-sonnet-5-5")
            prompt = ('Grade each answer 0-10 and give one or two sentences of feedback naming what was good and the key point missed. '
                      'Return a JSON array of {"id","score","feedback"} in the same order.\n\n' + json.dumps(todo))
            out = ""
            async for ev in chat.stream_message(UserMessage(text=prompt)):
                if isinstance(ev, TextDelta):
                    out += ev.content
                elif isinstance(ev, StreamDone):
                    break
            for r in json.loads(re.search(r"\[.*\]", out, re.S).group(0)):
                if r.get("id") in BY_ID:
                    results[r["id"]] = {"score": max(0, min(10, int(r.get("score", 0)))), "feedback": str(r.get("feedback", ""))[:600]}
        for x in items:
            results.setdefault(x["id"], {"score": 0, "feedback": "Not graded."})
        pct = round(sum(r["score"] for r in results.values()) * 10 / len(items))
        await db.interviews.update_one({"id": sid}, {"$set": {"status": "graded", "results": results, "score": pct, "passed": pct >= PASS, "graded_at": now_iso()}})
    except Exception as e:
        logger.warning(f"Interview grading failed {sid}: {e}")
        await db.interviews.update_one({"id": sid}, {"$set": {"status": "error"}})


@router.post("/{sid}/submit")
async def submit(sid: str, body: AnswersIn, user=Depends(get_current_user)):
    s = await own_session(sid, user)
    if s["status"] not in ("in_progress", "error"):
        raise HTTPException(409, "Interview already submitted")
    answers = clean(s, body.answers) if s["status"] == "in_progress" else s["answers"]
    late = now_iso() > s["expires_at"]
    r = await db.interviews.update_one({"id": sid, "status": s["status"]}, {"$set": {"answers": answers, "status": "grading", "submitted_at": now_iso(), "timed_out": late}})
    if r.modified_count:
        t = asyncio.create_task(grade(sid))
        TASKS.add(t)
        t.add_done_callback(TASKS.discard)
    return {"status": "grading"}


@router.get("/history")
async def history(user=Depends(get_current_user)):
    rows = await db.interviews.find({"user_id": user["id"]}, {"_id": 0, "id": 1, "status": 1, "score": 1, "passed": 1, "started_at": 1, "submitted_at": 1}).sort("started_at", -1).to_list(50)
    return {"owned": await owns_book(user), "history": rows, "count": COUNT, "minutes": MINUTES, "pass_mark": PASS, "pool": len(POOL)}


@router.get("/{sid}")
async def get_session(sid: str, user=Depends(get_current_user)):
    return public_session(await own_session(sid, user))
