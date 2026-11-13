import asyncio
import os
from emergentintegrations.llm.chat import LlmChat, UserMessage
from core import db, now_iso, new_id, logger
from sop_writer import parse

SEM = asyncio.Semaphore(4)
TASKS = set()
TERMINALS = ("escalate", "close")
CATEGORIES = ["Brute Force", "Cloud", "Command and Control", "Data Exfiltration", "Insider Threat", "Lateral Movement", "Linux", "Malware",
              "Networking", "Persistence", "Phishing", "Privilege Escalation", "Ransomware", "Web Attacks"]

PROMPT = """Build an interactive SOC incident-response PLAYBOOK (decision tree) for this alert type.
{source}

Related hands-on log-investigation labs you may link (id: title [category]):
{labs}

Reply with ONLY a JSON object (no markdown fences):
{{"title": "Playbook: <alert type>", "severity": "Low"|"Medium"|"High"|"Critical", "summary": "one sentence",
"mitre": ["T1110.003 Password Spraying", ...2-5 real ATT&CK techniques],
"triggers": [4-6 concrete trigger conditions / detection rule names with thresholds],
"categories": [1-3 values from {cats} that this playbook applies to],
"labs": [0-3 lab ids from the list above that practise this investigation],
"start": "q1",
"nodes": [
  {{"id": "q1", "type": "question", "title": "short step name", "text": "the exact question the analyst answers, with where to look (log source, field, event ID)", "answers": [{{"label": "Yes - ...", "next": "a1"}}, {{"label": "No - ...", "next": "c1"}}]}},
  {{"id": "a1", "type": "action", "title": "...", "text": "specific action/command/console step", "next": "q2"}},
  {{"id": "e1", "type": "escalate", "title": "Escalate to L2 / IR (P1)", "text": "containment done and who to escalate to, with SLA"}},
  {{"id": "c1", "type": "close", "title": "Close as False Positive / benign", "text": "closure reason and tuning note"}}
],
"report": [5-7 {{"section": "Summary"|"Timeline"|"Affected assets"|"IOCs"|"Actions taken"|"Root cause"|"Recommendations"..., "prompt": "what to write in this section for this alert type"}}]}}

Rules: 6-10 question nodes, 2-6 action nodes, at least 2 escalate and 2 close terminals. Questions have 2-3 answers. Every path from start must end in an escalate or close node; no loops; every "next" must reference an existing node id. Early questions triage (is it expected/benign? is it a known scanner/admin?) and can close as false positive; later questions confirm malicious activity, scope and containment before escalating. Be technically precise (real event IDs, field names, tools)."""


def reach(pb):
    nodes = {n["id"]: n for n in pb["nodes"]}
    memo, stack = {}, set()

    def go(nid):
        if nid in memo:
            return memo[nid]
        n = nodes.get(nid)
        assert n, f"step '{nid or '(empty)'}' doesn't exist — every answer and action must point to an existing step"
        assert nid not in stack, f"step '{nid}' loops back on itself — paths must always move forward"
        stack.add(nid)
        if n["type"] in TERMINALS:
            out = {n["type"]}
        elif n["type"] == "action":
            out = go(n["next"])
        else:
            assert n["type"] == "question" and 2 <= len(n["answers"]) <= 4, f"question {nid} needs 2-4 answers"
            out = set().union(*(go(a["next"]) for a in n["answers"]))
        stack.discard(nid)
        memo[nid] = out
        return out
    assert go(pb["start"]) == set(TERMINALS), "the tree needs at least one escalate and one close ending"
    return memo


def clean(d, src):
    nodes = []
    for n in d["nodes"]:
        t = n.get("type")
        base = {"id": str(n["id"]), "type": t, "title": str(n.get("title", "")).strip(), "text": str(n.get("text", "")).strip()}
        if t == "question":
            base["answers"] = [{"label": str(a["label"]).strip(), "next": str(a["next"])} for a in n["answers"]]
        elif t == "action":
            base["next"] = str(n["next"])
        nodes.append(base)
    pb = {"title": str(d["title"]).strip(), "severity": d.get("severity") if d.get("severity") in ("Low", "Medium", "High", "Critical") else src.get("severity", "Medium"),
          "summary": str(d.get("summary", "")).strip(), "mitre": [str(m) for m in d.get("mitre", [])][:6], "triggers": [str(t) for t in d.get("triggers", [])][:8],
          "categories": [c for c in d.get("categories", []) if c in CATEGORIES][:3] or ([src["category"]] if src.get("category") in CATEGORIES else []),
          "labs": [str(x) for x in d.get("labs", [])][:3], "start": str(d["start"]), "nodes": nodes,
          "report": [{"section": str(r["section"]), "prompt": str(r.get("prompt", ""))} for r in d.get("report", [])][:8]}
    reach(pb)
    assert len(pb["report"]) >= 3, "report template too short"
    return pb


def source_text(p, sop):
    if p["source"]["type"] == "siem":
        a = p["source"]
        return f"SIEM correlation alert: {a['title']}\nDetection query: {a.get('query')} (threshold >= {a.get('threshold')})\nDefault severity: {p['severity']}"
    s = sop
    analysis = "\n".join(f"- {x.get('check')} | malicious if: {x.get('malicious_if')} | benign if: {x.get('benign_if')}" for x in s.get("analysis", [])[:9])
    return (f"SOP: {s['title']} (category {s['category']}, severity {s['severity']})\nSummary: {s.get('summary', '')}\nTriggers: {'; '.join(s.get('triggers', []))}\n"
            f"Analysis checklist:\n{analysis}\nEscalation: {'; '.join(s.get('escalation', []))}\nMITRE: {', '.join(s.get('mitre', []))}\nClosure: {'; '.join(s.get('closure', []))}")


async def write_playbook(pid):
    from routes_sop import find_sop
    async with SEM:
        p = await db.playbooks.find_one({"id": pid}, {"_id": 0})
        if not p or p["status"] == "ready":
            return
        sop = await find_sop(p["source"]["id"]) if p["source"]["type"] == "sop" else None
        if p["source"]["type"] == "sop" and not sop:
            return
        labs = await db.labs.find({}, {"_id": 0, "id": 1, "title": 1, "category": 1}).to_list(100)
        lab_ids = {x["id"] for x in labs}
        await db.playbooks.update_one({"id": pid}, {"$set": {"status": "generating"}})
        for attempt in (1, 2, 3):
            try:
                chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"pb-{pid}-{new_id()[:6]}",
                               system_message="You are a principal SOC incident responder who designs precise, production-grade triage playbooks as decision trees. You reply with valid JSON only.").with_model("anthropic", "claude-sonnet-5-5").with_params(max_tokens=8000)
                text = PROMPT.format(source=source_text(p, sop), labs="\n".join(f"{x['id']}: {x['title']} [{x.get('category', '')}]" for x in labs), cats=CATEGORIES)
                src = {"severity": p["severity"], "category": (sop or {}).get("category")}
                reply = await chat.send_message(UserMessage(text=text))
                try:
                    pb = clean(parse(reply), src)
                except (AssertionError, KeyError, ValueError, TypeError) as e:
                    pb = clean(parse(await chat.send_message(UserMessage(text=f"That JSON failed validation: {e}. Fix the tree and reply with the full corrected JSON only."))), src)
                pb["labs"] = [x for x in pb["labs"] if x in lab_ids]
                await db.playbooks.update_one({"id": pid, "status": "generating"}, {"$set": {**pb, "status": "ready", "error": None, "updated": now_iso()[:10]}})
                logger.info(f"Playbook written: {pb['title']}")
                return
            except Exception as e:
                logger.warning(f"Playbook write failed ({attempt}) {pid}: {e}")
                if attempt == 3:
                    await db.playbooks.update_one({"id": pid, "status": "generating"}, {"$set": {"status": "failed", "error": str(e)[:200]}})


def queue(pid):
    t = asyncio.create_task(write_playbook(pid))
    TASKS.add(t)
    t.add_done_callback(TASKS.discard)


async def ensure_playbooks():
    from routes_sop import all_sops
    await db.playbooks.create_index("id", unique=True)
    base = {"status": "planned", "published": True, "version": "1.0"}
    for i, a in enumerate(await db.siem_alerts.find({}, {"_id": 0}).to_list(50)):
        await db.playbooks.update_one({"id": f"pb-{a['id']}"}, {"$setOnInsert": {**base, "id": f"pb-{a['id']}", "order": i, "title": f"Playbook: {a['name']}", "severity": a.get("severity", "Medium"),
                                                                                  "source": {"type": "siem", "id": a["id"], "title": a["name"], "query": a.get("query"), "threshold": a.get("threshold")}}}, upsert=True)
    for i, s in enumerate(await all_sops()):
        await db.playbooks.update_one({"id": f"pb-{s['id']}"}, {"$setOnInsert": {**base, "id": f"pb-{s['id']}", "order": 100 + i, "title": f"Playbook: {s['title']}", "severity": s["severity"],
                                                                                  "source": {"type": "sop", "id": s["id"], "title": s["title"]}}}, upsert=True)
    await db.playbooks.update_many({"status": {"$in": ["generating", "failed"]}}, {"$set": {"status": "planned"}})
    async for p in db.playbooks.find({"status": "planned"}, {"_id": 0, "id": 1}).sort("order", 1):
        queue(p["id"])
