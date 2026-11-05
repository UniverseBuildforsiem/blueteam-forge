import asyncio
import json
import os
import re
import json_repair
from emergentintegrations.llm.chat import LlmChat, UserMessage
from core import db, now_iso, new_id, logger
from sop_data import SLA
from sop_extra_data import EXTRA

SEM = asyncio.Semaphore(3)
TASKS = set()
FIELDS = ("summary", "objective", "scope", "triggers", "tools", "roles", "analysis", "steps", "queries", "escalation", "mitre", "closure")

PROMPT = """Write a detailed, shift-ready SOC Standard Operating Procedure (SOP) for this alert/incident:
Title: {title}
Category: {category}
Default severity: {severity}
Be technically accurate (correct event IDs, Okta eventType values, Entra risk detection names, Windows Sysmon IDs). Make it practical and specific, never generic.

{part}"""

PART_A = """Reply with ONLY a JSON object (no markdown fences) with exactly these keys:
"summary": one sentence (max 35 words) on what the SOP handles,
"objective": 1-2 sentences on the goal of the investigation,
"scope": 1-2 sentences on the systems, log sources and platforms covered,
"triggers": 4-6 concrete alert names / conditions that start this SOP (use real product alert names where they exist, e.g. Okta System Log events, Entra ID Protection risk detections, Microsoft Defender, CrowdStrike, WAF rule names),
"tools": 5-8 tools/consoles/log sources used,
"roles": 3 objects {"role": "L1 Analyst"|"L2 Analyst"|"Incident Responder" (or IAM/App team where relevant), "duty": short duty},
"analysis": 6-9 objects, the detailed analysis checklist an analyst works through: {"check": the question to answer, "how": exactly where and how to check it (console path, log source, field names, event IDs/event types), "malicious_if": what indicates true positive, "benign_if": what indicates a false positive / expected activity}."""

PART_B = """Now the second half of the same SOP. Reply with ONLY a JSON object (no markdown fences) with exactly these keys:
"steps": 5 phases in order named "Detection & Triage", "Investigation & Analysis", "Containment", "Eradication & Recovery", "Post-Incident & Closure"; each {"phase": name, "actions": 5-7 specific, imperative actions with real field names, event IDs, commands or console steps}."""

PART_C = """Next part of the same SOP. Reply with ONLY a JSON object (no markdown fences) with exactly these keys:
"queries": 3-4 objects {"name": short name, "purpose": one line, "spl": a realistic Splunk SPL query (multi-line, using realistic index/sourcetype and field names), "kql": the equivalent Microsoft Sentinel / Defender KQL query (real table names e.g. SigninLogs, AuditLogs, DeviceProcessEvents, DeviceNetworkEvents, OktaSSO / Okta_CL, AzureDiagnostics, W3CIISLog)}."""

PART_D = """Last part of the same SOP. Reply with ONLY a JSON object (no markdown fences) with exactly these keys:
"escalation": 3-5 rules in the form "condition → who (priority)",
"mitre": 2-5 MITRE ATT&CK techniques as "Txxxx[.xxx] Name",
"closure": 4-6 closure criteria."""


def parse(text):
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    t = t[t.index("{"):]
    try:
        d = json.loads(t[: t.rindex("}") + 1])
    except ValueError:
        d = json_repair.loads(t)
    return d


def take(d, keys):
    missing = [k for k in keys if not d.get(k)]
    if missing:
        raise ValueError(f"incomplete SOP json (missing {missing})")
    return {k: d[k] for k in keys}


async def write_sop(sid):
    async with SEM:
        s = await db.sops_extra.find_one({"id": sid}, {"_id": 0})
        if not s or s["status"] == "ready":
            return
        await db.sops_extra.update_one({"id": sid}, {"$set": {"status": "generating", "error": None}})
        for attempt in (1, 2):
            try:
                chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"sop-{sid}-{new_id()[:6]}",
                               system_message="You are a principal SOC analyst and incident responder who writes precise, production-grade SOC runbooks. You reply with valid JSON only.").with_model("anthropic", "claude-sonnet-5-5").with_params(max_tokens=10000)
                head = PROMPT.replace("{title}", s["title"]).replace("{category}", s["category"]).replace("{severity}", s["severity"])
                a = take(parse(await chat.send_message(UserMessage(text=head.replace("{part}", PART_A)))), FIELDS[:7])
                b = take(parse(await chat.send_message(UserMessage(text=PART_B))), ["steps"])
                c = take(parse(await chat.send_message(UserMessage(text=PART_C))), ["queries"])
                e = take(parse(await chat.send_message(UserMessage(text=PART_D))), ["escalation", "mitre", "closure"])
                if len(b["steps"]) < 4 or len(c["queries"]) < 2:
                    raise ValueError("too few steps or queries")
                d = {**a, **b, **c, **e}
                await db.sops_extra.update_one({"id": sid}, {"$set": {**d, "status": "ready", "updated": now_iso()[:10]}})
                logger.info(f"SOP written: {s['title']}")
                return
            except Exception as e:
                logger.warning(f"SOP write failed ({attempt}) '{s['title']}': {e}")
                if attempt == 2:
                    await db.sops_extra.update_one({"id": sid}, {"$set": {"status": "failed", "error": str(e)[:200]}})


def queue(sid):
    t = asyncio.create_task(write_sop(sid))
    TASKS.add(t)
    t.add_done_callback(TASKS.discard)


async def ensure_sop_extra():
    await db.sops_extra.create_index("id", unique=True)
    for i, (sid, title, cat, sev) in enumerate(EXTRA):
        await db.sops_extra.update_one({"id": f"sop-{sid}"}, {"$setOnInsert": {"id": f"sop-{sid}", "order": i, "title": title, "category": cat, "severity": sev,
                                                                               "version": "1.0", "updated": now_iso()[:10], "sla": SLA, "status": "planned"}}, upsert=True)
    await db.sops_extra.update_many({"status": {"$in": ["generating", "failed"]}}, {"$set": {"status": "planned"}})
    async for s in db.sops_extra.find({"status": "planned"}, {"_id": 0, "id": 1}).sort("order", 1):
        queue(s["id"])
