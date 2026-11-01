import asyncio
import sys
sys.path.insert(0, "/app/backend")
from routes_admin import suggest_practice, SuggestIn  # noqa: E402
from path_templates import BUILTIN_TEMPLATES  # noqa: E402


async def main():
    t = next(x for x in BUILTIN_TEMPLATES if x["id"] == "tpl-soc-l1-30")
    miss = 0
    for m in t["modules"]:
        for l in m["lessons"]:
            r = await suggest_practice(SuggestIn(title=l["title"]), user={})
            practice = [x for x in r if x["type"] != "sop"]
            if not practice:
                miss += 1
            print(("OK  " if practice else "MISS"), l["title"], "->", [f"{x['type']}:{x['title']}" for x in r][:4])
    print("missing:", miss)

asyncio.run(main())
