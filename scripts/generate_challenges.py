import asyncio
import json
import os
import re
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

load_dotenv("/app/backend/.env")

CATS = ["Phishing", "Brute Force", "Malware", "Ransomware", "Lateral Movement", "Web Attacks", "Cloud", "Insider Threat",
        "Data Exfiltration", "Privilege Escalation", "Command and Control", "Persistence"]
EXAMPLE = {"id": "ch-bf-01", "title": "Multiple Failed Logons on VPN", "category": "Brute Force", "severity": "Medium", "points": 120, "difficulty": "Medium", "verdict": "TP",
           "description": "Auth gateway alerted on 240 failed logons for one account within 5 minutes.",
           "alert": {"rule": "SOC112 - Brute Force Detected", "time": "2026-06-03 02:41", "host": "VPN-GW-01", "user": "a.kumar", "src_ip": "45.155.205.12"},
           "evidence": ["240 x EventID 4625 user=a.kumar src=45.155.205.12 substatus=0xC000006A", "1 x EventID 4624 user=a.kumar src=45.155.205.12 LogonType=10 at 02:46",
                        "45.155.205.12 geolocates to a hosting provider, never seen for this user", "No MFA challenge logged for the successful session"],
           "keywords": ["4625", "4624", "45.155.205.12", "mfa", "reset", "block"]}


async def gen(cat, k):
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"gen-ch-{k}",
                   system_message="You write realistic SOC L1/L2 alert triage challenges. Reply with JSON only.").with_model("anthropic", "claude-sonnet-5-5")
    prompt = (f"Write 5 distinct SOC triage challenges in category '{cat}'. Mix: 2 Easy (points 80), 2 Medium (points 120), 1 Hard (points 180). "
              "Make 1 or 2 of the 5 false positives (verdict FP) with evidence that clearly explains the benign cause; the rest TP. "
              "Each has a realistic SIEM rule name (format 'SOC### - Name'), 2026-06 timestamps, realistic hosts/users/IPs/hashes/domains (use reserved or fictional values), "
              "4-6 evidence log lines an analyst would see, and 5-7 lowercase keywords a good written analysis should mention (IOCs, event IDs, actions like isolate/block/reset). "
              f"Use ids ch-{k:02d}-1 .. ch-{k:02d}-5. Severity one of Low, Medium, High, Critical. Return a JSON array of objects exactly in this schema:\n" + json.dumps(EXAMPLE))
    out = ""
    async for ev in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(ev, TextDelta):
            out += ev.content
        elif isinstance(ev, StreamDone):
            break
    items = json.loads(re.search(r"\[.*\]", out, re.S).group(0))
    for it in items:
        it["category"] = cat
    return items


async def main():
    res = await asyncio.gather(*[gen(c, i + 1) for i, c in enumerate(CATS)], return_exceptions=True)
    out = [x for r in res if isinstance(r, list) for x in r]
    print(len(out), [str(r)[:80] for r in res if not isinstance(r, list)])
    json.dump(out, open("/app/backend/assets/challenges.json", "w"), indent=1)

asyncio.run(main())
