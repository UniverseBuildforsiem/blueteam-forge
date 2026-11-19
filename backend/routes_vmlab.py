import re
from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from core import db, get_current_user, now_iso, new_id, award
import copy
import vm_shell
import vm_m2
from vm_data import SEED, SEED_VERSION, MODULES, EVENTS, console_data

router = APIRouter(prefix="/api/vmlab")
NO_ID = {"_id": 0}
PRODUCT = "vm-lab"
CONSOLE = console_data()
CONSOLE_LISTS = {"key.created": "keys", "query.saved": "queries", "tag.created": "tags", "asset_group.created": "groups", "scan.launched": "scans", "scan.scheduled": "schedules", "report.generated": "reports", "user.created": "users",
                 "hosts.added": "hosts", "option_profile.created": "oprofiles", "auth.created": "auth", "searchlist.created": "searchlists", "searchlist.imported": "searchlists",
                 "template.created": "templates", "template.imported": "templates", "report.scheduled": "report_schedules", "remediation.policy_created": "policies"}


async def seed_vm():
    for it in SEED:
        cur = await db.vm_items.find_one({"id": it["id"]}, {"seed_version": 1})
        if not cur or cur.get("seed_version", 1) < SEED_VERSION:
            await db.vm_items.update_one({"id": it["id"]}, {"$set": {**it, "seed_version": SEED_VERSION}, "$setOnInsert": {"created_at": now_iso()}}, upsert=True)
    await db.vm_settings.update_one({"id": "main"}, {"$setOnInsert": {"id": "main", "price": 999, "course_ids": []}}, upsert=True)


async def settings():
    return await db.vm_settings.find_one({"id": "main"}, NO_ID) or {"price": 999, "course_ids": []}


async def has_access(user, s=None):
    if user["role"] in ("admin", "instructor"):
        return True
    if await db.purchases.find_one({"user_id": user["id"], "product_id": PRODUCT}):
        return True
    s = s or await settings()
    if s.get("course_ids"):
        from routes_academy import owns
        for cid in s["course_ids"]:
            c = await db.academy_courses.find_one({"id": cid}, NO_ID)
            if c and await owns(user, c):
                return True
    return False


async def get_item(iid, user, kind=None):
    it = await db.vm_items.find_one({"id": iid}, NO_ID)
    if not it or (kind and it["kind"] != kind) or (it.get("status") != "published" and user["role"] != "admin"):
        raise HTTPException(404, "Not found")
    if not it.get("free") and not await has_access(user):
        raise HTTPException(403, "Unlock the Vulnerability Management Lab to open this")
    return it


def public_task(t, prog):
    done = t["id"] in prog.get("done", [])
    shown = t["id"] in prog.get("solutions", [])
    return {"id": t["id"], "title": t["title"], "instruction": t["instruction"], "type": t["check"]["type"], "done": done,
            "hint": t["hint"] if t["id"] in prog.get("hints", []) else None, "solution": t["solution"] if shown or done else None}


async def progress(user, it):
    p = await db.vm_progress.find_one({"user_id": user["id"], "lab_id": it["id"]}, NO_ID)
    return p or {"user_id": user["id"], "lab_id": it["id"], "done": [], "hints": [], "solutions": [], "state": {"shell": vm_shell.fresh(it.get("preset")), "console": copy.deepcopy(it.get("console_preset") or {})}, "term": [], "started_at": now_iso()}


async def save(p):
    await db.vm_progress.update_one({"user_id": p["user_id"], "lab_id": p["lab_id"]}, {"$set": p}, upsert=True)


def lab_view(it, p):
    return {"awarded": p.pop("_awarded", False), **{k: it.get(k) for k in ("id", "kind", "module", "title", "summary", "intro", "minutes", "difficulty", "free")},
            "tasks": [public_task(t, p) for t in it["tasks"]], "state": {**{k: p["state"]["shell"].get(k) for k in ("installed", "running", "cwd", "selfprot")}, "console": p["state"]["console"]},
            "term": p.get("term", [])[-120:], "completed_at": p.get("completed_at"), "score": score(it, p)}


def score(it, p):
    n = len(it["tasks"]) or 1
    return max(0, round(100 * len(p["done"]) / n) - 5 * len(p.get("hints", [])) - 10 * len([s for s in p.get("solutions", []) if s not in p.get("done_clean", [])]))


def matches(check, data):
    return all(re.fullmatch(str(v), str(data.get(k, "")), re.I) for k, v in (check.get("match") or {}).items())


async def apply(it, p, events, data, user):
    new = []
    for t in it["tasks"]:
        c = t["check"]
        if t["id"] not in p["done"] and c["type"] == "event" and c["event"] in events and matches(c, data):
            p["done"].append(t["id"])
            if t["id"] not in p.get("solutions", []):
                p.setdefault("done_clean", []).append(t["id"])
            new.append(t["id"])
    if new:
        await finish(it, p, user)
    return new


async def finish(it, p, user):
    if len(p["done"]) == len(it["tasks"]) and not p.get("completed_at"):
        p["completed_at"] = now_iso()
        r = await db.vm_awards.update_one({"user_id": user["id"], "lab_id": it["id"]}, {"$setOnInsert": {"at": p["completed_at"]}}, upsert=True)
        if r.upserted_id:
            await award(user["id"], 100, f"Completed VM lab: {it['title']}")
            p["_awarded"] = True


@router.get("")
async def hub(user=Depends(get_current_user)):
    s = await settings()
    access = await has_access(user, s)
    q = {} if user["role"] == "admin" else {"status": "published"}
    items = await db.vm_items.find(q, {"_id": 0, "tasks": 0, "questions": 0, "challenges": 0}).sort([("module", 1), ("order", 1)]).to_list(500)
    progs = {p["lab_id"]: p for p in await db.vm_progress.find({"user_id": user["id"]}, NO_ID).to_list(500)}
    quiz = await db.vm_quiz_attempts.find({"user_id": user["id"]}, NO_ID).sort("at", -1).to_list(100)
    ctf = await db.vm_ctf_solves.find({"user_id": user["id"]}, NO_ID).to_list(500)
    full = {i["id"]: i for i in await db.vm_items.find({}, NO_ID).to_list(500)}
    titles = {i["id"]: i["title"] for i in items}
    out = []
    for it in items:
        f = full[it["id"]]
        if it["kind"] == "lab":
            p = progs.get(it["id"])
            pct = round(100 * len(p["done"]) / max(1, len(f["tasks"]))) if p else 0
            done = bool(p and p.get("completed_at"))
        elif it["kind"] == "quiz":
            best = max([a["score"] for a in quiz if a["item_id"] == it["id"]], default=None)
            pct, done = best or 0, best is not None and best >= 70
        else:
            n = len(f.get("challenges", [])) or 1
            got = len({c["index"] for c in ctf if c["item_id"] == it["id"]})
            pct, done = round(100 * got / n), got == n
        out.append({**it, "locked": not it.get("free") and not access, "percent": pct, "done": done})
    mods = [{**m, "items": [i for i in out if i["module"] == m["id"]]} for m in MODULES]
    badges = []
    for m in mods:
        if m["items"] and all(i["done"] for i in m["items"]):
            badges.append({"id": f"module-{m['id']}", "title": f"{m['title']} Specialist", "desc": f"Completed every item in Module {m['id']}"})
    if any(i["done"] and i["kind"] == "lab" for i in out):
        badges.insert(0, {"id": "first-lab", "title": "First Deployment", "desc": "Completed your first hands-on lab"})
    if any(a["score"] == 100 for a in quiz):
        badges.append({"id": "quiz-ace", "title": "Quiz Ace", "desc": "Scored 100% on a lab quiz"})
    if ctf:
        badges.append({"id": "flag-hunter", "title": "Flag Hunter", "desc": "Captured a CTF flag"})
    return {"access": access, "price": s["price"], "course_ids": s.get("course_ids", []), "modules": mods, "badges": badges,
            "quiz_history": [{**a, "title": titles.get(a["item_id"], a["item_id"])} for a in quiz[:20]],
            "stats": {"done": sum(1 for i in out if i["done"]), "total": len(out), "ctf_points": sum(c["points"] for c in ctf), "xp_labs": sum(1 for i in out if i["kind"] == "lab" and i["done"])}}


@router.get("/console-data")
async def console(user=Depends(get_current_user)):
    return CONSOLE


@router.get("/labs/{iid}")
async def lab(iid: str, user=Depends(get_current_user)):
    it = await get_item(iid, user, "lab")
    return lab_view(it, await progress(user, it))


class ExecIn(BaseModel):
    command: str = Field(max_length=600)


@router.post("/labs/{iid}/exec")
async def exec_cmd(iid: str, body: ExecIn, user=Depends(get_current_user)):
    it = await get_item(iid, user, "lab")
    p = await progress(user, it)
    out, events = vm_shell.run(body.command, p["state"]["shell"])
    prompt = p["state"]["shell"]["cwd"]
    if out == "\x0c":
        p["term"], out = [], ""
    else:
        p["term"] = (p.get("term", []) + [{"cmd": body.command, "cwd": prompt, "out": out}])[-200:]
    new = await apply(it, p, events, {"command": body.command}, user)
    await save(p)
    return {"output": out, "clear": body.command.strip().lower() in ("cls", "clear"), "new": new, "lab": lab_view(it, p)}


class EventIn(BaseModel):
    event: str = Field(max_length=60)
    data: dict[str, Any] = Field(default_factory=dict)


@router.post("/labs/{iid}/event")
async def event(iid: str, body: EventIn, user=Depends(get_current_user)):
    if body.event not in EVENTS:
        raise HTTPException(422, "Unknown event")
    it = await get_item(iid, user, "lab")
    p = await progress(user, it)
    data = {k: str(v)[:200] for k, v in list(body.data.items())[:16]}
    for k in ("ips", "target"):
        if k in data:
            data["ipset"] = vm_m2.ipset(data[k])
    con, sh = p["state"]["console"], p["state"]["shell"]
    if body.event == "user.activated":
        mine = [f"socp_new{i + 1}" for i in range(len(con.get("users", [])))]
        if data.get("login", "").strip().lower() not in mine or data.get("password", "") != vm_m2.PASSWORD:
            raise HTTPException(422, "Login failed: check the login and password in the registration email")
        con["activated"] = sorted(set(con.get("activated", [])) | {data["login"].strip().lower()})
        data.pop("password")
    if body.event == "storage.saved":
        con["storage"] = data.get("months", "6")
    if body.event == "remediation.policy_moved":
        pol = con.get("policies", [])
        i = next((n for n, x in enumerate(pol) if x.get("title", "").lower() == data.get("title", "").lower()), None)
        pos = int(data.get("position", "0")) if str(data.get("position", "")).isdigit() else 0
        if i is None or not 1 <= pos <= len(pol):
            raise HTTPException(422, "Policy not found")
        pol.insert(pos - 1, pol.pop(i))
    if body.event in ("selfprot.enabled", "selfprot.disabled"):
        sh["selfprot"] = body.event == "selfprot.enabled"
    if body.event in ("console.module_deactivated", "console.module_activated"):
        con.setdefault("modules", {})[data.get("module", "")] = body.event.endswith("activated") and not body.event.endswith("deactivated")
    if body.event == "console.agent_uninstall_requested":
        con["uninstall_requested"] = True
    if body.event in CONSOLE_LISTS:
        lst = p["state"]["console"].setdefault(CONSOLE_LISTS[body.event], [])
        if len(lst) < 50:
            lst.append({**data, "at": now_iso()})
    new = await apply(it, p, [body.event], data, user)
    await save(p)
    return {"new": new, "lab": lab_view(it, p)}


class AnswerIn(BaseModel):
    task_id: str = Field(max_length=40)
    answer: str = Field(max_length=300)


@router.post("/labs/{iid}/answer")
async def answer(iid: str, body: AnswerIn, user=Depends(get_current_user)):
    it = await get_item(iid, user, "lab")
    p = await progress(user, it)
    t = next((t for t in it["tasks"] if t["id"] == body.task_id and t["check"]["type"] == "answer"), None)
    if not t:
        raise HTTPException(404, "Task not found")
    ok = body.answer.strip().strip("{}").lower() in [a.strip().lower() for a in str(t["check"]["answer"]).split("|")]
    new = []
    if ok and t["id"] not in p["done"]:
        p["done"].append(t["id"])
        if t["id"] not in p.get("solutions", []):
            p.setdefault("done_clean", []).append(t["id"])
        new = [t["id"]]
        await finish(it, p, user)
        await save(p)
    return {"correct": ok, "new": new, "lab": lab_view(it, p)}


@router.post("/labs/{iid}/{what}/{tid}")
async def reveal(iid: str, what: str, tid: str, user=Depends(get_current_user)):
    if what not in ("hint", "solution"):
        raise HTTPException(404, "Not found")
    it = await get_item(iid, user, "lab")
    p = await progress(user, it)
    if not any(t["id"] == tid for t in it["tasks"]):
        raise HTTPException(404, "Task not found")
    key = "hints" if what == "hint" else "solutions"
    if tid not in p[key]:
        p[key].append(tid)
        await save(p)
    return lab_view(it, p)


@router.post("/labs/{iid}/reset")
async def reset(iid: str, user=Depends(get_current_user)):
    it = await get_item(iid, user, "lab")
    await db.vm_progress.delete_one({"user_id": user["id"], "lab_id": iid})
    return lab_view(it, await progress(user, it))


@router.get("/quizzes/{iid}")
async def quiz(iid: str, user=Depends(get_current_user)):
    it = await get_item(iid, user, "quiz")
    hist = await db.vm_quiz_attempts.find({"user_id": user["id"], "item_id": iid}, NO_ID).sort("at", -1).to_list(20)
    return {**{k: it.get(k) for k in ("id", "title", "summary", "module", "minutes")}, "questions": [{"q": q["q"], "options": q["options"]} for q in it["questions"]], "history": hist}


class QuizIn(BaseModel):
    answers: list[Optional[int]] = Field(max_length=100)


@router.post("/quizzes/{iid}/submit")
async def quiz_submit(iid: str, body: QuizIn, user=Depends(get_current_user)):
    it = await get_item(iid, user, "quiz")
    qs = it["questions"]
    res = [{"correct": i < len(body.answers) and body.answers[i] == q["answer"], "answer": q["answer"], "explain": q.get("explain", "")} for i, q in enumerate(qs)]
    sc = round(100 * sum(r["correct"] for r in res) / max(1, len(qs)))
    first = sc >= 70 and not await db.vm_quiz_attempts.find_one({"user_id": user["id"], "item_id": iid, "score": {"$gte": 70}})
    await db.vm_quiz_attempts.insert_one({"id": new_id(), "user_id": user["id"], "item_id": iid, "score": sc, "at": now_iso()})
    if first:
        await award(user["id"], 50, f"Passed VM quiz: {it['title']}")
    return {"score": sc, "passed": sc >= 70, "results": res}


@router.get("/ctf/{iid}")
async def ctf(iid: str, user=Depends(get_current_user)):
    it = await get_item(iid, user, "ctf")
    solved = {c["index"] for c in await db.vm_ctf_solves.find({"user_id": user["id"], "item_id": iid}, NO_ID).to_list(100)}
    return {**{k: it.get(k) for k in ("id", "title", "summary", "module")},
            "challenges": [{"q": c["q"], "points": c["points"], "hint": c.get("hint"), "solved": i in solved, "answer": c["answer"] if i in solved else None} for i, c in enumerate(it["challenges"])]}


class FlagIn(BaseModel):
    index: int = Field(ge=0, le=99)
    flag: str = Field(max_length=200)


@router.post("/ctf/{iid}/submit")
async def ctf_submit(iid: str, body: FlagIn, user=Depends(get_current_user)):
    it = await get_item(iid, user, "ctf")
    if body.index >= len(it["challenges"]):
        raise HTTPException(404, "Challenge not found")
    c = it["challenges"][body.index]
    ok = body.flag.strip().lower() == str(c["answer"]).strip().lower()
    if ok and not await db.vm_ctf_solves.find_one({"user_id": user["id"], "item_id": iid, "index": body.index}):
        await db.vm_ctf_solves.insert_one({"user_id": user["id"], "item_id": iid, "index": body.index, "points": c["points"], "at": now_iso()})
        await award(user["id"], c["points"] // 5, f"VM CTF flag: {it['title']}")
    return {"correct": ok}


def admin_only(user):
    if user["role"] != "admin":
        raise HTTPException(403, "Admins only")


class TaskIn(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=160)
    instruction: str = Field(max_length=2000)
    hint: str = Field(default="", max_length=600)
    solution: str = Field(default="", max_length=1500)
    check: dict[str, Any]


class QIn(BaseModel):
    q: str = Field(min_length=1, max_length=600)
    options: list[str] = Field(min_length=2, max_length=6)
    answer: int = Field(ge=0, le=5)
    explain: str = Field(default="", max_length=600)


class CIn(BaseModel):
    q: str = Field(min_length=1, max_length=600)
    answer: str = Field(min_length=1, max_length=200)
    points: int = Field(default=100, ge=10, le=1000)
    hint: str = Field(default="", max_length=400)


class ItemIn(BaseModel):
    kind: str = Field(pattern="^(lab|quiz|ctf)$")
    module: int = Field(ge=1, le=4)
    order: int = Field(default=1, ge=1, le=99)
    title: str = Field(min_length=3, max_length=160)
    summary: str = Field(default="", max_length=600)
    intro: str = Field(default="", max_length=4000)
    minutes: int = Field(default=15, ge=1, le=600)
    difficulty: str = Field(default="Beginner", max_length=20)
    free: bool = False
    agent_preinstalled: bool = False
    status: str = Field(default="draft", pattern="^(draft|published)$")
    tasks: list[TaskIn] = Field(default_factory=list, max_length=40)
    questions: list[QIn] = Field(default_factory=list, max_length=60)
    challenges: list[CIn] = Field(default_factory=list, max_length=30)


def validate(b):
    for t in b.tasks:
        c = t.check
        if c.get("type") == "event" and c.get("event") not in EVENTS:
            raise HTTPException(422, f"Task '{t.title}': unknown event")
        if c.get("type") == "answer" and not str(c.get("answer", "")).strip():
            raise HTTPException(422, f"Task '{t.title}': answer is required")
        if c.get("type") not in ("event", "answer"):
            raise HTTPException(422, f"Task '{t.title}': check type must be event or answer")
        for v in (c.get("match") or {}).values():
            try:
                re.compile(str(v))
            except re.error:
                raise HTTPException(422, f"Task '{t.title}': invalid match pattern")
    if b.status == "published" and ((b.kind == "lab" and not b.tasks) or (b.kind == "quiz" and not b.questions) or (b.kind == "ctf" and not b.challenges)):
        raise HTTPException(422, "Add at least one task/question/challenge before publishing")
    for q in b.questions:
        if q.answer >= len(q.options):
            raise HTTPException(422, f"Question '{q.q[:40]}': correct option out of range")


def item_doc(b):
    d = b.model_dump()
    d["preset"] = {"installed": True, "running": True, "cwd": vm_shell.DL} if d.pop("agent_preinstalled") else None
    return d


@router.get("/admin/items")
async def admin_items(user=Depends(get_current_user)):
    admin_only(user)
    return {"items": await db.vm_items.find({}, NO_ID).sort([("module", 1), ("order", 1)]).to_list(500), "events": EVENTS, "modules": MODULES, "settings": await settings()}


@router.post("/admin/items")
async def admin_create(body: ItemIn, user=Depends(get_current_user)):
    admin_only(user)
    validate(body)
    doc = {**item_doc(body), "id": f"vm-{new_id()}", "created_at": now_iso()}
    await db.vm_items.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


@router.put("/admin/items/{iid}")
async def admin_update(iid: str, body: ItemIn, user=Depends(get_current_user)):
    admin_only(user)
    validate(body)
    r = await db.vm_items.update_one({"id": iid}, {"$set": {**item_doc(body), "updated_at": now_iso()}})
    if not r.matched_count:
        raise HTTPException(404, "Not found")
    return await db.vm_items.find_one({"id": iid}, NO_ID)


@router.delete("/admin/items/{iid}")
async def admin_delete(iid: str, user=Depends(get_current_user)):
    admin_only(user)
    if not (await db.vm_items.delete_one({"id": iid})).deleted_count:
        raise HTTPException(404, "Not found")
    await db.vm_progress.delete_many({"lab_id": iid})
    await db.vm_quiz_attempts.delete_many({"item_id": iid})
    await db.vm_ctf_solves.delete_many({"item_id": iid})
    return {"ok": True}


class SettingsIn(BaseModel):
    price: int = Field(ge=0, le=100000)
    course_ids: list[str] = Field(default_factory=list, max_length=50)


@router.put("/admin/settings")
async def admin_settings(body: SettingsIn, user=Depends(get_current_user)):
    admin_only(user)
    await db.vm_settings.update_one({"id": "main"}, {"$set": body.model_dump()}, upsert=True)
    return await settings()
