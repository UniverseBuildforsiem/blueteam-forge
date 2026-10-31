import asyncio
import hashlib
import html
import json
import os
import re
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
import httpx
from fastapi import APIRouter, Request, BackgroundTasks, Depends, HTTPException
from emergentintegrations.llm.chat import LlmChat, UserMessage
from core import db, now_iso, logger, admin_only
from routes_cron import accept

router = APIRouter(prefix="/api")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"}
SOURCES = [("The Hacker News", "https://thehackernews.com", ["https://feeds.feedburner.com/TheHackersNews"]),
           ("BleepingComputer", "https://www.bleepingcomputer.com", ["https://www.bleepingcomputer.com/feed/",
                                                                     "https://news.google.com/rss/search?q=site:bleepingcomputer.com+when:3d&hl=en-US&gl=US&ceid=US:en"])]
PER_SOURCE = 6
CATEGORIES = ["Ransomware", "Vulnerability", "Phishing", "Malware", "Data Breach", "APT", "Cloud", "Supply Chain", "AI Security", "Other"]
LOCK = asyncio.Lock()
TASKS = set()
NO_ID = {"_id": 0}


def strip(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def slugify(title, key):
    return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:70] + "-" + key[:6]


async def fetch_items(client, name, urls):
    for url in urls:
        try:
            r = await client.get(url)
            if r.status_code >= 400 or not r.text.lstrip().startswith("<?xml"):
                continue
            items = []
            for it in ET.fromstring(r.content).iter("item"):
                title = strip(it.findtext("title"))
                if "news.google.com" in url:
                    title = re.sub(r"\s+-\s+BleepingComputer$", "", title)
                enc = it.find("enclosure")
                pub = it.findtext("pubDate")
                items.append({"title": title, "link": (it.findtext("link") or "").strip(), "snippet": strip(it.findtext("description"))[:1500],
                              "image": enc.get("url") if enc is not None else None,
                              "published_at": parsedate_to_datetime(pub).isoformat() if pub else now_iso()})
            if items:
                return items
        except Exception as e:
            logger.warning(f"Blog feed {url} failed: {e}")
    return []


async def article_text(client, link):
    if "news.google.com" in link:
        return ""
    try:
        r = await client.get(link)
        if r.status_code >= 400 or "Just a moment" in r.text[:2000]:
            return ""
        paras = [strip(p) for p in re.findall(r"<p[^>]*>(.*?)</p>", r.text, re.S)]
        return " ".join(p for p in paras if len(p) > 60)[:7000]
    except Exception:
        return ""


PROMPT = """You write for SOCProfessionals Academy, a training site for SOC analysts. Using ONLY the facts below, write an original post (do not copy sentences).
Return JSON only:
{"title": "clear headline in your own words", "excerpt": "one sentence, max 30 words",
 "summary": ["2-3 short paragraphs explaining what happened, who is affected and why it matters"],
 "key_points": ["3-5 facts"], "soc_actions": ["4-6 concrete things a SOC analyst should do now: hunts, detections, patches, blocks"],
 "iocs": ["any CVEs, domains, IPs, hashes, malware names mentioned; empty if none"], "mitre": ["relevant ATT&CK techniques like 'T1566 Phishing'"],
 "severity": "Critical|High|Medium|Low", "category": "one of %s", "tags": ["3-5 short tags"]}
If details are thin, keep the summary short and do not invent facts; SOC actions may be general best practice for this threat type.

SOURCE: %s
HEADLINE: %s
FEED TEXT: %s
ARTICLE TEXT: %s"""


async def summarize(item, source):
    chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"blog-{item['key']}",
                   system_message="You are a senior SOC analyst and security news editor. Reply with valid JSON only.").with_model("anthropic", "claude-sonnet-5-5")
    out = await chat.send_message(UserMessage(text=PROMPT % (", ".join(CATEGORIES), source, item["title"], item["snippet"], item["text"] or "(not available)")))
    d = json.loads(re.search(r"\{.*\}", out, re.S).group(0))
    return {"title": str(d.get("title") or item["title"])[:200], "excerpt": str(d.get("excerpt", ""))[:300],
            "summary": [str(x) for x in d.get("summary", [])][:4], "key_points": [str(x) for x in d.get("key_points", [])][:6],
            "soc_actions": [str(x) for x in d.get("soc_actions", [])][:8], "iocs": [str(x) for x in d.get("iocs", [])][:15],
            "mitre": [str(x) for x in d.get("mitre", [])][:6], "tags": [str(x) for x in d.get("tags", [])][:6],
            "severity": d.get("severity") if d.get("severity") in ("Critical", "High", "Medium", "Low") else "Medium",
            "category": d.get("category") if d.get("category") in CATEGORIES else "Other"}


async def sync_blog():
    if LOCK.locked():
        return 0
    added = 0
    async with LOCK, httpx.AsyncClient(timeout=20, headers=UA, follow_redirects=True) as client:
        for name, home, urls in SOURCES:
            for it in (await fetch_items(client, name, urls))[:PER_SOURCE]:
                key = hashlib.sha1(it["title"].lower().encode()).hexdigest()
                if await db.blog_posts.find_one({"key": key}):
                    continue
                it["key"] = key
                it["text"] = await article_text(client, it["link"])
                try:
                    post = await summarize(it, name)
                except Exception as e:
                    logger.warning(f"Blog summarize failed '{it['title']}': {e}")
                    continue
                await db.blog_posts.update_one({"key": key}, {"$setOnInsert": {**post, "key": key, "id": key[:12], "slug": slugify(post["title"], key),
                                                                               "source": name, "source_home": home, "source_url": it["link"], "source_title": it["title"],
                                                                               "image": it["image"], "published_at": it["published_at"], "created_at": now_iso()}}, upsert=True)
                added += 1
    logger.info(f"Blog sync added {added} posts")
    return added


def run_bg():
    t = asyncio.create_task(sync_blog())
    TASKS.add(t)
    t.add_done_callback(TASKS.discard)


@router.post("/cron/blog-sync")
async def cron_blog(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    if not await accept(request, "blog-sync"):
        return {"ok": True, "duplicate": True}
    background.add_task(sync_blog)
    return {"ok": True}


@router.post("/admin/blog/sync")
async def admin_sync(user=Depends(admin_only)):
    run_bg()
    return {"ok": True, "queued": True}


LIST_FIELDS = {"_id": 0, "id": 1, "slug": 1, "title": 1, "excerpt": 1, "source": 1, "image": 1, "published_at": 1, "severity": 1, "category": 1, "tags": 1}


@router.get("/public/blog")
async def list_posts(category: str = "", q: str = "", limit: int = 60):
    f = {}
    if category:
        f["category"] = category
    if q:
        f["$or"] = [{"title": {"$regex": re.escape(q), "$options": "i"}}, {"tags": {"$regex": re.escape(q), "$options": "i"}}]
    posts = await db.blog_posts.find(f, LIST_FIELDS).sort("published_at", -1).to_list(min(limit, 200))
    last = await db.blog_posts.find_one({}, {"_id": 0, "created_at": 1}, sort=[("created_at", -1)])
    return {"posts": posts, "categories": CATEGORIES, "updated_at": (last or {}).get("created_at"), "total": await db.blog_posts.count_documents({})}


@router.get("/public/blog/{slug}")
async def get_post(slug: str):
    p = await db.blog_posts.find_one({"slug": slug}, {"_id": 0, "key": 0})
    if not p:
        raise HTTPException(404, "Post not found")
    p["related"] = await db.blog_posts.find({"category": p["category"], "slug": {"$ne": slug}}, LIST_FIELDS).sort("published_at", -1).to_list(3)
    return p


async def ensure_blog():
    await db.blog_posts.create_index("key", unique=True)
    await db.blog_posts.create_index("slug")
    if not await db.blog_posts.count_documents({}):
        run_bg()
