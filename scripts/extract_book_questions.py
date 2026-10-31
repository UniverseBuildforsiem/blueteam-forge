import asyncio
import json
import os
import re
import sys
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone

load_dotenv("/app/backend/.env")


async def ask(text, i):
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"book-extract-{i}",
                   system_message="You extract interview questions from a SOC analyst interview book. Reply with JSON only.").with_model("anthropic", "claude-sonnet-5-5")
    prompt = ("From this book excerpt, extract every distinct SOC interview question with the book's answer. Return a JSON array of objects "
              '{"q": question as asked by an interviewer, "a": the book\'s answer condensed to 60-120 words keeping key technical points, "topic": one of '
              '"Phishing","SIEM & Splunk","Malware","Network","Web Attacks","Incident Response","Threat Intel","Threat Hunting","Vulnerability Mgmt","Core SOC"}. '
              "Skip questions without an answer in the text.\n\nEXCERPT:\n" + text)
    out = ""
    async for ev in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(ev, TextDelta):
            out += ev.content
        elif isinstance(ev, StreamDone):
            break
    m = re.search(r"\[.*\]", out, re.S)
    return json.loads(m.group(0)) if m else []


async def main():
    t = open(sys.argv[1]).read()
    n = 6
    size = len(t) // n + 1
    res = await asyncio.gather(*[ask(t[k * size:(k + 1) * size], k) for k in range(n)])
    qs = [q for r in res for q in r]
    json.dump(qs, open("/tmp/book_qas.json", "w"), indent=1)
    print(len(qs))

asyncio.run(main())
