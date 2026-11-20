import csv
import re
import io
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from core import db, now_iso, new_id, audit, admin_only
from routes_academy import parse_dt, LEVELS
import exam_engine as E

router = APIRouter(prefix="/api/admin")
NO_ID = {"_id": 0}


# ---------- question bank ----------
def clean_q(d):
    t = d.get("type") or "single"
    if t not in E.QTYPES:
        raise ValueError(f"type must be one of {', '.join(E.QTYPES)}")
    stem = (d.get("stem") or "").strip()
    if len(stem) < 5:
        raise ValueError("question text is too short")
    opts = d.get("options") or []
    if t == "tf" and not opts:
        opts = [{"text": "True"}, {"text": "False"}]
    opts = [o if isinstance(o, dict) else {"text": str(o)} for o in opts]
    opts = [{"id": o.get("id") or "abcdef"[i], "text": str(o.get("text", "")).strip()[:1500], "why": str(o.get("why") or "").strip()[:1500]} for i, o in enumerate(opts) if str(o.get("text", "")).strip()]
    if not 2 <= len(opts) <= 6 or (t == "tf" and len(opts) != 2):
        raise ValueError("needs 2-6 options (True/False needs exactly 2)")
    ids = [o["id"] for o in opts]
    cor = d.get("correct") or []
    cor = [ids[c] if isinstance(c, int) and c < len(ids) else str(c).strip().lower() for c in (cor if isinstance(cor, list) else str(cor).replace(",", "|").split("|"))]
    cor = [c for c in dict.fromkeys(cor) if c in ids]
    if not cor:
        raise ValueError("mark at least one correct option")
    if t in ("single", "tf") and len(cor) != 1:
        raise ValueError("single-choice and True/False need exactly one correct option")
    if t == "multi" and len(cor) < 2:
        raise ValueError("multiple-select needs at least two correct options")
    dom = (d.get("domain") or "").strip()
    if not dom:
        raise ValueError("domain is required")
    diff = (d.get("difficulty") or "medium").lower()
    if diff not in ("easy", "medium", "hard"):
        raise ValueError("difficulty must be easy, medium or hard")
    tags = d.get("tags") or []
    tags = [x.strip().lower() for x in (tags if isinstance(tags, list) else str(tags).split("|")) if x.strip()][:15]
    return {"type": t, "stem": stem[:4000], "options": opts, "correct": cor, "choose": len(cor) if t == "multi" else None, "domain": dom[:80], "difficulty": diff,
            "hint": (d.get("hint") or "").strip()[:1000], "ref_url": (d.get("ref_url") or "").strip()[:500], "ref_label": (d.get("ref_label") or "").strip()[:120],
            "tags": tags, "scenario_id": (d.get("scenario_id") or "").strip() or None}


async def save_q(data, user, qid=None):
    prev = await db.exam_questions.find_one({"qid": qid, "latest": True}, NO_ID) if qid else None
    doc = {**data, "id": new_id(), "qid": qid or f"q-{new_id()[:10]}", "version": (prev or {}).get("version", 0) + 1, "latest": True, "archived": False,
           "created_at": now_iso(), "author": user.get("email", "system")}
    if prev:
        await db.exam_questions.update_one({"id": prev["id"]}, {"$set": {"latest": False}})
    await db.exam_questions.insert_one(dict(doc))
    doc.pop("_id", None)
    return doc


class QIn(BaseModel):
    type: str = "single"
    stem: str = Field(max_length=4000)
    options: list = Field(default_factory=list, max_length=6)
    correct: list = Field(default_factory=list, max_length=6)
    domain: str = Field(max_length=80)
    difficulty: str = "medium"
    hint: str = ""
    ref_url: str = ""
    ref_label: str = ""
    tags: list[str] = Field(default_factory=list)
    scenario_id: Optional[str] = None


def valid(d):
    try:
        return clean_q(d)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.get("/questions")
async def list_q(q: str = "", domain: str = "", tag: str = "", type: str = "", archived: bool = False, user=Depends(admin_only)):
    f = {"latest": True, "archived": {"$ne": True} if not archived else True}
    if domain:
        f["domain"] = domain
    if tag:
        f["tags"] = tag.lower()
    if type:
        f["type"] = type
    if q:
        f["stem"] = {"$regex": re.escape(q[:60]), "$options": "i"}
    rows = await db.exam_questions.find(f, NO_ID).sort("qid", 1).to_list(3000)
    return {"questions": rows, "domains": sorted(await db.exam_questions.distinct("domain", {"latest": True})), "tags": sorted(await db.exam_questions.distinct("tags", {"latest": True}))}


@router.post("/questions")
async def create_q(body: QIn, user=Depends(admin_only)):
    return await save_q(valid(body.model_dump()), user)


@router.put("/questions/{qid}")
async def update_q(qid: str, body: QIn, user=Depends(admin_only)):
    if not await db.exam_questions.find_one({"qid": qid, "latest": True}):
        raise HTTPException(404, "Question not found")
    return await save_q(valid(body.model_dump()), user, qid)


@router.delete("/questions/{qid}")
async def archive_q(qid: str, restore: bool = False, user=Depends(admin_only)):
    await db.exam_questions.update_one({"qid": qid, "latest": True}, {"$set": {"archived": not restore}})
    return {"ok": True}


@router.get("/questions/{qid}/versions")
async def versions(qid: str, user=Depends(admin_only)):
    return await db.exam_questions.find({"qid": qid}, NO_ID).sort("version", -1).to_list(100)


@router.post("/questions/{qid}/restore/{version}")
async def restore_version(qid: str, version: int, user=Depends(admin_only)):
    old = await db.exam_questions.find_one({"qid": qid, "version": version}, NO_ID)
    if not old:
        raise HTTPException(404, "Version not found")
    return await save_q(valid(old), user, qid)


def rows_from(fmt, text):
    if fmt == "json":
        data = json.loads(text)
        return data if isinstance(data, list) else data.get("questions", [])
    out = []
    for r in csv.DictReader(io.StringIO(text.strip())):
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
        opts = [{"text": r.get(f"option_{x}", ""), "why": r.get(f"why_{x}", "")} for x in "abcdef" if r.get(f"option_{x}")]
        sc = {"id": r.get("scenario_id"), "title": r.get("scenario_title"), "kind": r.get("scenario_kind") or "text", "body": r.get("scenario_body")} if r.get("scenario_body") else None
        out.append({**r, "options": opts, "correct": r.get("correct", ""), "tags": r.get("tags", ""), "scenario": sc})
    return out


class ImportIn(BaseModel):
    format: str = Field(pattern="^(csv|json)$")
    text: str = Field(max_length=3_000_000)
    commit: bool = False


@router.post("/questions/import")
async def import_q(body: ImportIn, user=Depends(admin_only)):
    try:
        rows = rows_from(body.format, body.text)
    except (ValueError, csv.Error) as e:
        raise HTTPException(422, f"Could not read the file: {e}")
    ok, errors, scen = [], [], {}
    for i, r in enumerate(rows[:2000], 1):
        sc = r.get("scenario")
        if sc and sc.get("body"):
            sid = sc.get("id") or f"sc-{new_id()[:8]}"
            scen[sid] = {"id": sid, "title": (sc.get("title") or "Case study")[:140], "kind": sc.get("kind") if sc.get("kind") in ("text", "log", "table") else "text", "body": sc["body"][:20000]}
            r = {**r, "scenario_id": sid}
        try:
            ok.append({**clean_q(r), "qid": (r.get("qid") or "").strip() or None})
        except (ValueError, TypeError, AttributeError) as e:
            errors.append({"row": i, "error": str(e)})
    if body.commit and ok:
        for s in scen.values():
            await db.exam_scenarios.update_one({"id": s["id"]}, {"$set": s}, upsert=True)
        for q in ok:
            qid = q.pop("qid")
            if qid and await db.exam_questions.find_one({"qid": qid, "latest": True}):
                await save_q(q, user, qid)
            elif qid:
                await save_new_with_qid(q, user, qid)
            else:
                await save_q(q, user)
        await audit(user, "question import", f"{len(ok)} questions")
    return {"valid": len(ok), "errors": errors, "preview": ok[:50], "scenarios": list(scen.values()), "committed": body.commit and bool(ok)}


async def save_new_with_qid(q, user, qid):
    doc = {**q, "id": new_id(), "qid": qid, "version": 1, "latest": True, "archived": False, "created_at": now_iso(), "author": user.get("email")}
    await db.exam_questions.insert_one(doc)


class ScIn(BaseModel):
    title: str = Field(min_length=2, max_length=140)
    kind: str = Field(default="text", pattern="^(text|log|table)$")
    body: str = Field(min_length=5, max_length=20000)


@router.get("/scenarios")
async def list_sc(user=Depends(admin_only)):
    return await db.exam_scenarios.find({}, NO_ID).to_list(1000)


@router.post("/scenarios")
async def create_sc(body: ScIn, user=Depends(admin_only)):
    s = {**body.model_dump(), "id": f"sc-{new_id()[:8]}"}
    await db.exam_scenarios.insert_one(dict(s))
    return s


@router.put("/scenarios/{sid}")
async def update_sc(sid: str, body: ScIn, user=Depends(admin_only)):
    await db.exam_scenarios.update_one({"id": sid}, {"$set": body.model_dump()})
    return {"id": sid, **body.model_dump()}


# ---------- tests ----------
class ExamIn(BaseModel):
    title: str = Field(min_length=3, max_length=140)
    subtitle: str = Field(default="", max_length=240)
    description: str = Field(default="", max_length=8000)
    vendor: str = Field(default="", max_length=60)
    topic: str = Field(default="", max_length=60)
    code: str = Field(default="", max_length=30)
    level: str = "Intermediate"
    price: int = Field(default=0, ge=0, le=200000)
    mrp: int = Field(default=0, ge=0, le=500000)
    sale_ends_at: Optional[str] = None
    cover: str = Field(default="", max_length=1000)
    kind: str = Field(default="exam", pattern="^(practice|exam|certification)$")
    duration_min: int = Field(default=60, ge=0, le=600)
    pass_mark: int = Field(default=70, ge=1, le=100)
    attempts_max: int = Field(default=3, ge=1, le=50)
    cooldown_hours: int = Field(default=24, ge=0, le=720)
    identity: str = Field(default="name", pattern="^(account|name|webcam)$")
    practice_enabled: bool = True
    shuffle: bool = True
    outcomes: list[str] = Field(default_factory=list, max_length=30)
    requirements: list[str] = Field(default_factory=list, max_length=20)
    audience: list[str] = Field(default_factory=list, max_length=20)
    faqs: list[dict] = Field(default_factory=list, max_length=30)
    domains: list[dict] = Field(default_factory=list, max_length=20)
    related: list[dict] = Field(default_factory=list, max_length=12)
    selection: dict = Field(default_factory=lambda: {"mode": "fixed", "ids": []})
    sample_qids: list[str] = Field(default_factory=list, max_length=3)


def clean_exam(b: ExamIn):
    d = b.model_dump()
    if d["level"] not in LEVELS:
        raise HTTPException(422, "Pick a valid level")
    if d["sale_ends_at"]:
        try:
            parse_dt(d["sale_ends_at"])
        except ValueError:
            raise HTTPException(422, "Invalid sale end date")
    for k in ("outcomes", "requirements", "audience"):
        d[k] = [x.strip()[:300] for x in d[k] if x.strip()]
    d["faqs"] = [{"q": str(f.get("q", ""))[:300], "a": str(f.get("a", ""))[:2000]} for f in d["faqs"] if f.get("q")]
    d["domains"] = [{"name": str(x.get("name", ""))[:80], "weight": int(x.get("weight") or 0), "links": [{"title": str(l.get("title", ""))[:120], "link": str(l.get("link", ""))[:500]} for l in x.get("links") or [] if l.get("link")][:5]} for x in d["domains"] if x.get("name")]
    d["related"] = [{"kind": str(x.get("kind", "Course"))[:20], "title": str(x.get("title", ""))[:140], "link": str(x.get("link", ""))[:500]} for x in d["related"] if x.get("link")]
    s = d["selection"] or {}
    if s.get("mode") == "pool":
        d["selection"] = {"mode": "pool", "domains": [{"domain": str(x.get("domain", ""))[:80], "count": max(0, min(500, int(x.get("count") or 0))), "tags": [str(t).lower() for t in x.get("tags") or []][:10]} for x in s.get("domains") or [] if x.get("domain")]}
    else:
        d["selection"] = {"mode": "fixed", "ids": [str(i) for i in dict.fromkeys(s.get("ids") or [])][:500]}
    return d


@router.get("/exams")
async def list_exams(user=Depends(admin_only)):
    from routes_exams import q_count
    rows = await db.exams.find({}, NO_ID).sort("updated_at", -1).to_list(300)
    return [{**e, "questions": await q_count(e), "attempts": await db.exam_attempts.count_documents({"exam_id": e["id"]})} for e in rows]


@router.post("/exams")
async def create_exam(body: ExamIn, user=Depends(admin_only)):
    e = {**clean_exam(body), "id": new_id(), "status": "draft", "created_at": now_iso(), "updated_at": now_iso()}
    await db.exams.insert_one(dict(e))
    await audit(user, "test create", e["title"])
    e.pop("_id", None)
    return e


@router.put("/exams/{eid}")
async def update_exam(eid: str, body: ExamIn, user=Depends(admin_only)):
    if not (await db.exams.update_one({"id": eid}, {"$set": {**clean_exam(body), "updated_at": now_iso()}})).matched_count:
        raise HTTPException(404, "Test not found")
    return await db.exams.find_one({"id": eid}, NO_ID)


class StatusIn(BaseModel):
    status: str = Field(pattern="^(draft|published)$")


@router.post("/exams/{eid}/status")
async def set_status(eid: str, body: StatusIn, user=Depends(admin_only)):
    from routes_exams import q_count
    e = await db.exams.find_one({"id": eid}, NO_ID)
    if not e:
        raise HTTPException(404, "Test not found")
    if body.status == "published" and not await q_count(e):
        raise HTTPException(400, "Add questions before publishing")
    await db.exams.update_one({"id": eid}, {"$set": {"status": body.status, **({"published_at": e.get("published_at") or now_iso()} if body.status == "published" else {})}})
    await audit(user, f"test {body.status}", e["title"])
    return {"status": body.status}


@router.delete("/exams/{eid}")
async def delete_exam(eid: str, user=Depends(admin_only)):
    if await db.exam_attempts.find_one({"exam_id": eid}):
        raise HTTPException(400, "Students have attempts on this test — unpublish it instead")
    await db.exams.delete_one({"id": eid})
    return {"ok": True}


@router.get("/exams/{eid}/analytics")
async def analytics(eid: str, user=Depends(admin_only)):
    e = await db.exams.find_one({"id": eid}, NO_ID)
    if not e:
        raise HTTPException(404, "Test not found")
    atts = await db.exam_attempts.find({"exam_id": eid}, {"_id": 0, "scenarios": 0}).to_list(20000)
    done = [a for a in atts if a["status"] == "submitted" and not a.get("domain")]
    graded = [a for a in done if a["mode"] != "practice"] or done
    per = {}
    for a in graded:
        for q in a["questions"]:
            p = per.setdefault(q["qid"], {"qid": q["qid"], "stem": q["stem"][:160], "domain": q["domain"], "rows": [], "picks": {}})
            ans = a["answers"].get(q["qid"]) or []
            p["rows"].append((a["percent"], E.is_right(q, ans)))
            for x in ans or ["(blank)"]:
                p["picks"][x] = p["picks"].get(x, 0) + 1
    items = []
    for p in per.values():
        n = len(p["rows"])
        items.append({"qid": p["qid"], "stem": p["stem"], "domain": p["domain"], "answered": n, "p_correct": round(sum(r[1] for r in p["rows"]) / n, 2) if n else None,
                      "discrimination": E.discrimination(p["rows"]), "picks": p["picks"]})
    abandoned = [a for a in atts if a["status"] == "in_progress"]
    drop = {}
    for a in abandoned:
        k = len(a.get("answers") or {})
        drop[k] = drop.get(k, 0) + 1
    users = {a["user_id"] for a in atts}
    by_mode = {m: sum(1 for a in done if a["mode"] == m) for m in E.KINDS}
    recent = sorted(done, key=lambda a: a["submitted_at"], reverse=True)[:25]
    return {"title": e["title"], "attempts": len(atts), "submitted": len(done), "in_progress": len(abandoned), "students": len(users), "by_mode": by_mode,
            "average": round(sum(a["percent"] for a in graded) / len(graded), 1) if graded else None, "pass_rate": round(100 * sum(a["passed"] for a in graded) / len(graded)) if graded else None,
            "avg_time": round(sum(a.get("time_taken") or 0 for a in graded) / len(graded)) if graded else None,
            "items": sorted(items, key=lambda x: (x["p_correct"] if x["p_correct"] is not None else 2)), "dropoff": [{"answered": k, "attempts": v} for k, v in sorted(drop.items())],
            "completion_rate": round(100 * len([a for a in atts if a["status"] == "submitted"]) / len(atts)) if atts else None,
            "recent": [{k: a.get(k) for k in ("id", "user_name", "mode", "number", "percent", "passed", "time_taken", "submitted_at")} | {"identity": {k: v for k, v in (a.get("identity") or {}).items() if k != "photo_path"} | {"photo": bool((a.get("identity") or {}).get("photo_path"))}} for a in recent]}


# ---------- seed ----------
async def seed_exams():
    from exam_csa_data import questions, SCENARIOS, DOMAINS
    await db.exam_questions.create_index([("qid", 1), ("version", 1)], unique=True)
    await db.exam_attempts.create_index([("exam_id", 1), ("user_id", 1), ("status", 1)])
    await db.exam_attempts.create_index([("exam_id", 1), ("user_id", 1), ("mode", 1)], unique=True, partialFilterExpression={"status": "in_progress"}, name="one_open_attempt")
    if await db.exams.find_one({"id": "csa-v1"}):
        return
    for sid, (title, kind, body) in SCENARIOS.items():
        await db.exam_scenarios.update_one({"id": sid}, {"$set": {"id": sid, "title": title, "kind": kind, "body": body}}, upsert=True)
    qs = questions()
    for q in qs:
        if not await db.exam_questions.find_one({"qid": q["qid"]}):
            await db.exam_questions.insert_one({**q, "id": new_id(), "version": 1, "latest": True, "archived": False, "created_at": now_iso(), "author": "seed"})
    doms = [{"name": n, "weight": w, "links": [{"title": l, "link": u}]} for _, n, w, u, l in DOMAINS]
    await db.exams.insert_one({
        "id": "csa-v1", "title": "CSA v1 - Certified SOC Analyst Exam Preparation (312-39)", "subtitle": "Full-length, timed 312-39 simulation with verified answers, hints and an explanation for every option.",
        "description": "Prepare for the EC-Council Certified SOC Analyst (CSA) 312-39 exam with a realistic, proctored-style test engine.\n\nEvery answer has been checked against the CSA courseware, wrong answers in common dumps are corrected, and each option explains why it is right or wrong. Use practice mode with hints to learn, then sit the timed certification exam to earn a verifiable SOCProfessionals certificate.",
        "vendor": "EC-Council", "topic": "SOC Analysis", "code": "312-39", "level": "Intermediate", "price": 973, "mrp": 1999, "sale_ends_at": None, "cover": "",
        "kind": "certification", "duration_min": 180, "pass_mark": 70, "attempts_max": 3, "cooldown_hours": 24, "identity": "name", "practice_enabled": True, "shuffle": True,
        "outcomes": ["SOC roles, workflow, risk and compliance basics", "Attack methodology: kill chain, web attacks, DoS, password attacks, IoCs", "Windows, Linux, macOS, firewall, router and web-server log analysis", "SIEM architecture, use cases, EPS and alert triage", "Threat intelligence types, life cycle and platforms", "Incident handling & response: containment, eradication, forensics"],
        "requirements": ["Basic networking and operating-system knowledge", "Familiarity with security monitoring concepts helps"],
        "audience": ["Candidates preparing for EC-Council CSA 312-39", "L1/L2 SOC analysts validating their knowledge", "Students moving into blue-team roles"],
        "faqs": [{"q": "How close is this to the real exam?", "a": "The real 312-39 has 100 multiple-choice questions in 3 hours with a ~70% pass mark. This simulation uses the same timing, pass mark and domain mix."},
                 {"q": "Are the answers verified?", "a": "Yes. Each answer was checked against the CSA courseware; several answers that are wrong in common dumps have been corrected, and every option has an explanation."},
                 {"q": "What is the difference between practice and certification mode?", "a": "Practice mode gives instant feedback, hints and explanations and can be untimed. Certification mode is timed with no hints, limited to 3 attempts with a 24-hour cooldown, and passing issues a certificate."},
                 {"q": "What if my browser closes during the exam?", "a": "Every answer is autosaved. Reopen the test and press Resume — the timer keeps running on the server."},
                 {"q": "Is this the official EC-Council certification?", "a": "No. It is preparation material. Passing issues a SOCProfessionals Academy certificate of achievement, not the EC-Council credential."}],
        "domains": doms, "related": [{"kind": "Course", "title": "CSA - Certified SOC Analyst (Splunk, MDR, Qualys, Kali)", "link": "/courses"}, {"kind": "Lab", "title": "Phishing to Ransomware lab", "link": "/app/labs/lab-phish-ransom"},
                                     {"kind": "Tool", "title": "SIEM simulator", "link": "/app/siem"}, {"kind": "Practice", "title": "Daily alert drill", "link": "/app/drill"}],
        "selection": {"mode": "fixed", "ids": [q["qid"] for q in qs]}, "sample_qids": ["csa-q003", "csa-q014", "csa-q002"],
        "status": "published", "created_at": now_iso(), "updated_at": now_iso(), "published_at": now_iso()})
