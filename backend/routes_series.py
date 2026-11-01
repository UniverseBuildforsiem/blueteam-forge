import asyncio
import os
import re
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from emergentintegrations.llm.chat import LlmChat, UserMessage
from core import db, now_iso, new_id, logger, admin_only, audit
from series_data import CATALOG, SECTION_NAMES, SECTION_COVER

router = APIRouter(prefix="/api")
AUTO_WRITE = 15
SEM = asyncio.Semaphore(3)
TASKS = set()
LIST = {"_id": 0, "body": 0}

PROMPT = """Write blog post #{n} of the "SOC Analyst Technical Blog Series" on SOCProfessionals Academy, for L1/L2/L3 SOC analysts, threat hunters and incident responders.
Series section: {section}
Title: {title}

Start your reply with exactly these three header lines, then a line with only ---, then the article in Markdown:
EXCERPT: one sentence (max 30 words) on what the reader will learn
TAGS: 4-6 short comma-separated tags
MITRE: comma-separated relevant ATT&CK technique IDs with names (e.g. T1110.003 Password Spraying), or none
---

Article rules (2,000-3,000 words, practical, not theoretical):
- Do not repeat the title as a heading. Use ## for sections and ### for sub-sections.
- Sections: ## Why this matters on shift; ## How it works (technical deep dive); ## Real-world example (a named public incident if one fits, otherwise a realistic scenario at a fictional company "Acme Corp" with timestamps, hostnames, users and IPs); ## What it looks like in the logs (realistic sample log lines / Event IDs in ```text code blocks); ## Detection (Splunk SPL in ```spl blocks and Microsoft Sentinel/Defender KQL in ```kql blocks, each with a one-line explanation and tuning tips); ## Step-by-step investigation playbook (numbered steps an L1 then L2 would follow, with what to check and the decision at each step); ## Response and containment; ## Common mistakes and false positives; ## Analyst checklist (- [ ] items); ## Key takeaways.
- Use tables where they help (e.g. Event ID reference, L1 vs L2 vs L3, severity matrix).
- Adapt sections sensibly for conceptual or list-style titles (e.g. "50 Practical Splunk Queries" should actually list 50 numbered queries; interview posts should give questions with practical model answers), but always stay hands-on with real commands, queries, log fields and examples.
- Be technically accurate (correct Event IDs, field names, command syntax). Never mention that you are an AI."""


def slugify(t):
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")[:80]


def parse(text):
    head, _, body = text.strip().partition("\n---")
    if not body.strip():
        head, body = "", text
    meta = {k.lower(): v.strip() for k, v in re.findall(r"^(EXCERPT|TAGS|MITRE):\s*(.*)$", head, re.M)}
    body = re.sub(r"^#\s+.*\n", "", body.strip(), count=1).strip()
    split = lambda s: [x.strip() for x in (s or "").split(",") if x.strip() and x.strip().lower() != "none"][:8]
    return {"excerpt": meta.get("excerpt", "")[:300], "tags": split(meta.get("tags")), "mitre": split(meta.get("mitre")), "body": body}


def read_min(body):
    return max(1, round(len((body or "").split()) / 200))


async def write_post(pid):
    async with SEM:
        p = await db.series_posts.find_one({"id": pid}, {"_id": 0})
        if not p or p["status"] == "ready":
            return
        await db.series_posts.update_one({"id": pid}, {"$set": {"status": "generating", "error": None}})
        try:
            chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"series-{pid}-{new_id()[:6]}",
                           system_message="You are a principal SOC analyst and detection engineer who writes deep, accurate, hands-on technical blogs.").with_model("anthropic", "claude-sonnet-5-5").with_params(max_tokens=12000)
            d = parse(await chat.send_message(UserMessage(text=PROMPT.format(n=p.get("number", ""), section=p["section"], title=p["title"]))))
            if len(d["body"].split()) < 400:
                raise ValueError("article came back too short")
            await db.series_posts.update_one({"id": pid}, {"$set": {**d, "read_min": read_min(d["body"]), "status": "ready", "updated_at": now_iso(), "written_at": now_iso()}})
            logger.info(f"Series post written: {p['title']}")
        except Exception as e:
            logger.warning(f"Series write failed '{p['title']}': {e}")
            await db.series_posts.update_one({"id": pid}, {"$set": {"status": "failed", "error": str(e)[:200]}})


def queue(pid):
    t = asyncio.create_task(write_post(pid))
    TASKS.add(t)
    t.add_done_callback(TASKS.discard)


async def ensure_series():
    await db.series_posts.create_index("id", unique=True)
    await db.series_posts.create_index("slug", unique=True)
    for n, sec, title in CATALOG:
        await db.series_posts.update_one({"seed": n}, {"$setOnInsert": {
            "id": new_id(), "seed": n, "number": n, "order": n, "section": sec, "title": title, "slug": slugify(title), "excerpt": "", "tags": [], "mitre": [],
            "cover": "", "body": "", "status": "planned", "published": True, "created_at": now_iso(), "updated_at": now_iso()}}, upsert=True)
    await db.series_posts.update_many({"status": "generating"}, {"$set": {"status": "planned"}})
    async for p in db.series_posts.find({"seed": {"$lte": AUTO_WRITE}, "status": "planned"}, {"_id": 0, "id": 1}):
        await db.series_posts.update_one({"id": p["id"]}, {"$set": {"status": "generating"}})
        queue(p["id"])


def sort_key(p):
    return (SECTION_NAMES.index(p["section"]) if p["section"] in SECTION_NAMES else 99, p.get("order", 0))


async def all_posts(q, proj=LIST):
    posts = sorted(await db.series_posts.find(q, proj).to_list(1000), key=sort_key)
    for i, p in enumerate(posts, 1):
        p["number"] = i
        p["cover"] = p.get("cover") or SECTION_COVER.get(p["section"], "")
    return posts


@router.get("/public/series")
async def public_series():
    posts = await all_posts({"published": True})
    secs = [{"name": s, "cover": SECTION_COVER[s], "posts": [p for p in posts if p["section"] == s]} for s in SECTION_NAMES]
    return {"sections": [s for s in secs if s["posts"]], "total": len(posts), "written": sum(p["status"] == "ready" for p in posts)}


@router.get("/public/series/{slug}")
async def public_post(slug: str):
    ready = await all_posts({"published": True, "status": "ready"}, {"_id": 0, "id": 1, "slug": 1, "title": 1, "section": 1, "order": 1, "cover": 1})
    idx = next((i for i, x in enumerate(ready) if x["slug"] == slug), None)
    if idx is None:
        raise HTTPException(404, "Post not found")
    p = await db.series_posts.find_one({"slug": slug}, {"_id": 0})
    allp = await all_posts({"published": True}, {"_id": 0, "slug": 1, "section": 1, "order": 1})
    p["number"] = next(x["number"] for x in allp if x["slug"] == slug)
    p["total"] = len(allp)
    p["cover"] = p.get("cover") or SECTION_COVER.get(p["section"], "")
    p["prev"] = ready[idx - 1] if idx > 0 else None
    p["next"] = ready[idx + 1] if idx + 1 < len(ready) else None
    return p


class PostIn(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    section: str
    excerpt: str = Field(default="", max_length=300)
    cover: str = Field(default="", max_length=600)
    tags: List[str] = []
    mitre: List[str] = []
    body: str = Field(default="", max_length=120000)
    published: bool = True


class PostPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=200)
    section: Optional[str] = None
    excerpt: Optional[str] = Field(default=None, max_length=300)
    cover: Optional[str] = Field(default=None, max_length=600)
    tags: Optional[List[str]] = None
    mitre: Optional[List[str]] = None
    body: Optional[str] = Field(default=None, max_length=120000)
    published: Optional[bool] = None


def check(d):
    if "section" in d and d["section"] not in SECTION_NAMES:
        raise HTTPException(400, "Unknown section")
    if d.get("cover") and not re.match(r"^https?://", d["cover"]):
        raise HTTPException(400, "Cover must be an http(s) image link")
    for k in ("tags", "mitre"):
        if k in d:
            d[k] = [t.strip()[:60] for t in d[k] if t.strip()][:8]
    if "body" in d:
        d["status"] = "ready" if d["body"].strip() else "planned"
        d["read_min"] = read_min(d["body"])


async def unique_slug(title, pid=None):
    base = slugify(title) or "post"
    slug, i = base, 2
    while await db.series_posts.find_one({"slug": slug, "id": {"$ne": pid}}):
        slug, i = f"{base}-{i}", i + 1
    return slug


@router.get("/admin/series")
async def admin_list(user=Depends(admin_only)):
    posts = await all_posts({}, {"_id": 0, "body": 0})
    return {"posts": posts, "sections": SECTION_NAMES}


@router.get("/admin/series/{pid}")
async def admin_get(pid: str, user=Depends(admin_only)):
    p = await db.series_posts.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Post not found")
    return p


@router.post("/admin/series")
async def admin_create(body: PostIn, user=Depends(admin_only)):
    d = body.model_dump()
    check(d)
    last = await db.series_posts.find_one({"section": d["section"]}, {"_id": 0, "order": 1}, sort=[("order", -1)])
    p = {**d, "id": new_id(), "slug": await unique_slug(d["title"]), "order": (last or {}).get("order", 0) + 1, "created_at": now_iso(), "updated_at": now_iso()}
    await db.series_posts.insert_one(p)
    await audit(user, "series post create", d["title"][:80])
    p.pop("_id", None)
    return p


@router.put("/admin/series/{pid}")
async def admin_update(pid: str, body: PostPatch, user=Depends(admin_only)):
    d = body.model_dump(exclude_none=True)
    check(d)
    cur = await db.series_posts.find_one({"id": pid}, {"_id": 0, "status": 1})
    if cur and cur["status"] == "generating" and "body" in d:
        raise HTTPException(409, "AI is still writing this post. Try again in a minute.")
    if "title" in d:
        d["slug"] = await unique_slug(d["title"], pid)
    if "section" in d:
        cur = await db.series_posts.find_one({"id": pid}, {"_id": 0, "section": 1})
        if cur and cur["section"] != d["section"]:
            last = await db.series_posts.find_one({"section": d["section"]}, {"_id": 0, "order": 1}, sort=[("order", -1)])
            d["order"] = (last or {}).get("order", 0) + 1
    r = await db.series_posts.find_one_and_update({"id": pid}, {"$set": {**d, "updated_at": now_iso()}}, projection={"_id": 0}, return_document=True)
    if not r:
        raise HTTPException(404, "Post not found")
    await audit(user, "series post update", r["title"][:80])
    return r


@router.delete("/admin/series/{pid}")
async def admin_delete(pid: str, user=Depends(admin_only)):
    p = await db.series_posts.find_one_and_delete({"id": pid})
    if not p:
        raise HTTPException(404, "Post not found")
    await audit(user, "series post delete", p["title"][:80])
    return {"ok": True}


class MoveIn(BaseModel):
    dir: int = Field(ge=-1, le=1)


@router.post("/admin/series/{pid}/move")
async def admin_move(pid: str, body: MoveIn, user=Depends(admin_only)):
    p = await db.series_posts.find_one({"id": pid}, {"_id": 0, "id": 1, "section": 1, "order": 1})
    if not p:
        raise HTTPException(404, "Post not found")
    sib = sorted(await db.series_posts.find({"section": p["section"]}, {"_id": 0, "id": 1, "order": 1}).to_list(500), key=lambda x: x["order"])
    i = next(i for i, x in enumerate(sib) if x["id"] == pid)
    j = i + body.dir
    if body.dir == 0 or not 0 <= j < len(sib):
        return {"ok": False}
    sib[i], sib[j] = sib[j], sib[i]
    for k, x in enumerate(sib, 1):
        await db.series_posts.update_one({"id": x["id"]}, {"$set": {"order": k}})
    return {"ok": True}


@router.post("/admin/series/{pid}/generate")
async def admin_generate(pid: str, user=Depends(admin_only)):
    p = await db.series_posts.find_one({"id": pid}, {"_id": 0, "title": 1, "status": 1})
    if not p:
        raise HTTPException(404, "Post not found")
    if p["status"] == "generating":
        return {"ok": True, "status": "generating"}
    await db.series_posts.update_one({"id": pid}, {"$set": {"status": "generating", "error": None}})
    queue(pid)
    await audit(user, "series post ai write", p["title"][:80])
    return {"ok": True, "status": "generating"}
