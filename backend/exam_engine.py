import random
from datetime import datetime, timedelta, timezone
from core import db, now_iso, new_id

NO_ID = {"_id": 0}
QTYPES = ("single", "multi", "tf")
KINDS = ("practice", "exam", "certification")
IDENTITY = ("account", "name", "webcam")


def parse_dt(s):
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def now():
    return datetime.now(timezone.utc)


async def latest(qids):
    rows = await db.exam_questions.find({"qid": {"$in": list(qids)}, "latest": True, "archived": {"$ne": True}}, NO_ID).to_list(5000)
    return {q["qid"]: q for q in rows}


async def scenarios_for(qs):
    ids = {q["scenario_id"] for q in qs if q.get("scenario_id")}
    return {s["id"]: s for s in await db.exam_scenarios.find({"id": {"$in": list(ids)}}, NO_ID).to_list(500)} if ids else {}


async def pool_pick(exam, domain=None):
    sel = exam.get("selection") or {}
    if domain:
        if sel.get("mode") == "fixed":
            rows = [q for q in (await latest(sel.get("ids") or [])).values() if q["domain"] == domain]
        else:
            d = next((x for x in sel.get("domains") or [] if x["domain"] == domain), {})
            rows = await db.exam_questions.find({"latest": True, "archived": {"$ne": True}, "domain": domain, **({"tags": {"$in": d["tags"]}} if d.get("tags") else {})}, NO_ID).to_list(2000)
        random.shuffle(rows)
        return rows[:20]
    if sel.get("mode") == "fixed":
        m = await latest(sel.get("ids") or [])
        return [m[i] for i in sel.get("ids") or [] if i in m]
    out = []
    for d in sel.get("domains") or []:
        rows = await db.exam_questions.find({"latest": True, "archived": {"$ne": True}, "domain": d["domain"], **({"tags": {"$in": d["tags"]}} if d.get("tags") else {})}, NO_ID).to_list(2000)
        random.shuffle(rows)
        out += rows[:int(d.get("count") or 0)]
    return out


def order(qs, shuffle):
    groups, seen = [], {}
    for q in qs:
        sid = q.get("scenario_id")
        if sid and sid in seen:
            seen[sid].append(q)
        else:
            g = [q]
            groups.append(g)
            if sid:
                seen[sid] = g
    if shuffle:
        random.shuffle(groups)
    return [q for g in groups for q in g]


def snap(q, shuffle):
    opts = [dict(o) for o in q["options"]]
    if shuffle and q["type"] != "tf":
        random.shuffle(opts)
    return {k: q.get(k) for k in ("qid", "version", "type", "stem", "correct", "choose", "domain", "difficulty", "hint", "ref_url", "ref_label", "scenario_id")} | {"options": opts}


def is_right(q, ans):
    return bool(ans) and set(ans) == set(q["correct"])


def public_q(q, reveal=False):
    base = {k: q.get(k) for k in ("qid", "type", "stem", "choose", "domain", "difficulty", "scenario_id")}
    base["options"] = [{"id": o["id"], "text": o["text"], **({"why": o.get("why", "")} if reveal else {})} for o in q["options"]]
    if reveal:
        base |= {"correct": q["correct"], "ref_url": q.get("ref_url"), "ref_label": q.get("ref_label"), "hint": q.get("hint")}
    return base


def grade(att):
    qs, ans = att["questions"], att.get("answers") or {}
    doms = {}
    right = 0
    for q in qs:
        ok = is_right(q, ans.get(q["qid"]))
        right += ok
        d = doms.setdefault(q["domain"], {"domain": q["domain"], "correct": 0, "total": 0})
        d["total"] += 1
        d["correct"] += ok
    for d in doms.values():
        d["percent"] = round(100 * d["correct"] / d["total"]) if d["total"] else 0
    pct = round(100 * right / len(qs)) if qs else 0
    return {"score": right, "total": len(qs), "percent": pct, "domains": sorted(doms.values(), key=lambda x: x["percent"])}


def readiness(avg, pass_mark):
    if avg is None:
        return None
    return "Exam ready" if avg >= pass_mark + 5 else "Almost ready" if avg >= pass_mark - 10 else "Not ready"


async def cooldown_until(exam, uid):
    last = await db.exam_attempts.find_one({"exam_id": exam["id"], "user_id": uid, "mode": "certification", "status": "submitted"}, NO_ID, sort=[("submitted_at", -1)])
    if not last or last.get("passed"):
        return None
    until = parse_dt(last["submitted_at"]) + timedelta(hours=int(exam.get("cooldown_hours") or 0))
    return until.isoformat() if until > now() else None


async def cert_count(exam, uid):
    return await db.exam_attempts.count_documents({"exam_id": exam["id"], "user_id": uid, "mode": "certification"})


async def build_attempt(exam, user, mode, timed, domain, identity):
    qs = await pool_pick(exam, domain if mode == "practice" else None)
    if not qs:
        return None
    sc = await scenarios_for(qs)
    shuffle = mode != "practice" or bool(exam.get("shuffle", True))
    qs = order(qs, shuffle)
    num = await db.exam_attempts.count_documents({"exam_id": exam["id"], "user_id": user["id"], "mode": mode}) + 1
    dur = int(exam.get("duration_min") or 0)
    if domain and dur:
        sel = exam.get("selection") or {}
        full = len(sel.get("ids") or []) if sel.get("mode") == "fixed" else sum(int(d.get("count") or 0) for d in sel.get("domains") or [])
        dur = max(5, round(dur * len(qs) / max(full, len(qs))))
    started = now()
    att = {"id": new_id(), "exam_id": exam["id"], "exam_title": exam["title"], "user_id": user["id"], "user_name": user["name"], "mode": mode, "domain": domain,
           "status": "in_progress", "number": num, "started_at": started.isoformat(), "pass_mark": int(exam.get("pass_mark") or 70),
           "deadline": (started + timedelta(minutes=dur)).isoformat() if dur and (mode != "practice" or timed) else None,
           "questions": [snap(q, shuffle) for q in qs], "scenarios": sc, "answers": {}, "flags": [], "checked": [], "hints": [], "last_index": 0, "identity": identity,
           "strict": bool(exam.get("strict_mode")) and mode != "practice", "focus_count": 0, "away_seconds": 0, "focus_events": []}
    await db.exam_attempts.insert_one(dict(att))
    return att


async def finish(att):
    if att["status"] == "submitted":
        return att
    g = grade(att)
    end = now()
    if att.get("deadline") and end > parse_dt(att["deadline"]):
        end = parse_dt(att["deadline"])
    upd = {**g, "status": "submitted", "submitted_at": now_iso(), "time_taken": int((end - parse_dt(att["started_at"])).total_seconds()),
           "passed": g["percent"] >= att["pass_mark"]}
    r = await db.exam_attempts.update_one({"id": att["id"], "status": "in_progress"}, {"$set": upd})
    att = {**att, **upd}
    if r.modified_count:
        await after_submit(att)
    return att


async def after_submit(att):
    from core import award
    await award(att["user_id"], 20 + att["score"] * (1 if att["mode"] == "practice" else 2), f"Test: {att['exam_title'][:60]}")
    if att["mode"] == "certification" and att["passed"]:
        cid = f"exam:{att['exam_id']}"
        if not await db.academy_certs.find_one({"user_id": att["user_id"], "course_id": cid}):
            name = (att.get("identity") or {}).get("name") or att["user_name"]
            cert = {"id": f"SOCP-C-{new_id()[:8].upper()}", "user_id": att["user_id"], "name": name, "course_id": cid, "course_title": att["exam_title"], "kind": "exam",
                    "instructor_name": "SOCProfessionals Academy", "issued_at": now_iso(), "score": att["percent"], "attempt_id": att["id"]}
            await db.academy_certs.insert_one(cert)
            await db.exam_attempts.update_one({"id": att["id"]}, {"$set": {"certificate_id": cert["id"]}})


async def maybe_expire(att):
    if att["status"] == "in_progress" and att.get("deadline") and now() > parse_dt(att["deadline"]):
        return await finish(att)
    return att


def discrimination(rows):
    """rows: list of (total_percent, correct_bool) for one question."""
    if len(rows) < 2:
        return None
    rows = sorted(rows, key=lambda r: r[0])
    k = max(1, round(len(rows) * 0.27))
    lo, hi = rows[:k], rows[-k:]
    return round(sum(r[1] for r in hi) / k - sum(r[1] for r in lo) / k, 2)
