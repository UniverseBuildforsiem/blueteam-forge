import asyncio
import hashlib
import hmac
import html
import json
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import httpx
from fastapi import APIRouter, Request, BackgroundTasks, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pymongo.errors import DuplicateKeyError
from emergentintegrations.llm.chat import LlmChat, UserMessage
from core import db, now, now_iso, logger, admin_only, send_email, email_template
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
                              "published_at": parsedate_to_datetime(pub).astimezone(timezone.utc).isoformat() if pub else now_iso()})
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
_PS = ("sourcetype=sysmon command_line=*DownloadString* | table _time host user parent_process command_line", 'DeviceProcessEvents | where ProcessCommandLine has "DownloadString" | project TimeGenerated, DeviceName, AccountName, ProcessCommandLine', "PowerShell download cradles")
HUNTS = {"Ransomware": ("vssadmin OR svch0st.exe | table _time host user message", 'SecurityEvent | where * has "vssadmin" or * has "svch0st" | project TimeGenerated, Computer, Account, Activity', "Shadow-copy deletion and the encryptor"),
         "Vulnerability": ("sourcetype=web user_agent=sqlmap* | stats count by uri_query, status", 'W3CIISLog | where csUserAgent has "sqlmap" | summarize count() by csUriQuery, scStatus', "Exploit attempts against the public web server"),
         "Phishing": ("sourcetype=sysmon parent_process=winword.exe | table _time host user command_line", 'DeviceProcessEvents | where InitiatingProcessFileName =~ "winword.exe" | project TimeGenerated, DeviceName, AccountName, ProcessCommandLine', "Office documents spawning scripts"),
         "Malware": ("sourcetype=proxy url=*gate.php* | stats count by host, user", 'ProxyLogs | where RequestURL has "gate.php" | summarize count() by Computer, Account', "Malware beaconing to its C2"),
         "Data Breach": ("sourcetype=firewall bytes_out>100000000 | table _time src_ip dest_ip bytes_out message", "CommonSecurityLog | where SentBytes > 100000000 | project TimeGenerated, SourceIP, DestinationIP, SentBytes", "Large outbound data transfers"),
         "APT": ("event_id=4769 ticket_encryption=0x17 | stats count by user, src_ip", 'SecurityEvent | where EventID == 4769 and TicketEncryptionType == "0x17" | summarize count() by Account, IpAddress', "Kerberoasting by a hands-on-keyboard actor"),
         "Cloud": ("sourcetype=azuread result_code=50126 | stats count by src_ip, country", 'SigninLogs | where ResultType == "50126" | summarize count() by IPAddress, Location', "Password spray against cloud identities"),
         "Supply Chain": _PS, "AI Security": _PS,
         "Other": ("event_id=4625 | stats count by src_ip, user", "SecurityEvent | where EventID == 4625 | summarize count() by IpAddress, Account", "Brute-force logon attempts")}


def hunt_for(category):
    spl, kql, title = HUNTS.get(category, HUNTS["Other"])
    return {"title": title, "spl": spl, "kql": kql}


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
    p["hunt"] = hunt_for(p["category"])
    return p


SEV_RANK = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}


async def top_posts(days=7, n=5):
    since = (now() - timedelta(days=days)).isoformat()
    posts = await db.blog_posts.find({"$or": [{"published_at": {"$gte": since}}, {"created_at": {"$gte": since}}]}, {"_id": 0, "key": 0}).to_list(500)
    posts.sort(key=lambda p: p["published_at"], reverse=True)
    posts.sort(key=lambda p: SEV_RANK.get(p["severity"], 4))
    return posts[:n]


def digest_unsub_token(uid):
    return hmac.new(os.environ["JWT_SECRET"].encode(), f"digest-unsub:{uid}".encode(), hashlib.sha256).hexdigest()[:32]


def digest_html(name, posts, uid):
    base = os.environ["FRONTEND_URL"]
    e = html.escape
    rows = ""
    for i, p in enumerate(posts, 1):
        acts = "".join(f"<li style='margin:0 0 6px'>{e(a)}</li>" for a in p.get("soc_actions", [])[:3])
        rows += (f"<div style='border-left:3px solid #00F0FF;padding:10px 14px;margin:0 0 18px;background:#111827'>"
                 f"<div style='font-size:11px;font-family:monospace;color:#FF9500'>{i:02d} · {e(p['severity']).upper()} · {e(p['category'])} · via {e(p['source'])}</div>"
                 f"<a href='{e(base)}/blog/{e(p['slug'])}' style='color:#E2E8F0;font-size:16px;font-weight:bold;text-decoration:none'>{e(p['title'])}</a>"
                 f"<p style='color:#94A3B8;margin:6px 0'>{e(p.get('excerpt', ''))}</p>"
                 f"<div style='font-size:11px;font-family:monospace;color:#00FF66;margin-top:8px'>SOC ACTION ITEMS</div><ul style='color:#CBD5E1;padding-left:18px;margin:6px 0'>{acts}</ul>"
                 f"<a href='{e(base)}/blog/{e(p['slug'])}' style='color:#00F0FF;font-size:13px'>Read the full briefing and hunt it in the SIEM &rarr;</a></div>")
    lines = ["Here are the five most severe security stories of the past week, each with what a SOC analyst should do about it."]
    body = email_template(name, lines, f"{base}/blog", "Open the security blog", unsubscribe=f"{base}/api/public/unsubscribe/digest?u={uid}&t={digest_unsub_token(uid)}")
    return body.replace("<p style='font-size:12px;color:#64748B'>Sent by", rows + "<p style='font-size:12px;color:#64748B'>Sent by", 1)


async def send_digest(only_user=None):
    posts = await top_posts()
    if not posts:
        logger.info("Weekly digest skipped: no posts this week")
        return 0
    week = now().strftime("%G-W%V")
    q = {"id": only_user["id"]} if only_user else {"role": "student", "status": "active", "digest_emails": {"$ne": False}}
    sent = 0
    async for u in db.users.find(q, {"_id": 0, "id": 1, "name": 1, "email": 1}):
        if not only_user:
            try:
                await db.digest_sends.insert_one({"user_id": u["id"], "week": week, "at": now_iso()})
            except DuplicateKeyError:
                continue
        await send_email(to=u["email"], subject=f"Weekly Threat Digest: {posts[0]['title'][:70]}", html=digest_html(u["name"], posts, u["id"]))
        sent += 1
    logger.info(f"Weekly digest sent: {sent}")
    return sent


@router.post("/cron/weekly-digest")
async def cron_digest(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    if not await accept(request, "weekly-digest"):
        return {"ok": True, "duplicate": True}
    from series_email import send_series_week
    background.add_task(send_digest)
    background.add_task(send_series_week)
    return {"ok": True}


@router.get("/public/blog-digest/preview")
async def digest_preview():
    return {"posts": [{k: p[k] for k in ("title", "slug", "severity", "category", "source", "soc_actions")} for p in await top_posts()]}


@router.post("/admin/blog/digest-test")
async def digest_test(user=Depends(admin_only)):
    return {"sent": await send_digest(only_user=user)}


@router.get("/public/unsubscribe/digest", response_class=HTMLResponse)
async def digest_unsub(u: str = "", t: str = ""):
    ok = bool(u and t) and hmac.compare_digest(t, digest_unsub_token(u))
    if ok:
        await db.users.update_one({"id": u}, {"$set": {"digest_emails": False}})
    msg = "You're unsubscribed from the Weekly Threat Digest. You can turn it back on from the Security Blog page." if ok else "This unsubscribe link is invalid or has expired."
    return HTMLResponse(f"<html><body style='background:#0B0F1A;color:#E2E8F0;font-family:monospace;padding:60px'><h2 style='color:#00F0FF'>SOCProfessionals Academy</h2><p>{msg}</p>"
                        f"<a style='color:#00FF66' href='{os.environ['FRONTEND_URL']}/blog'>Open the blog</a></body></html>", status_code=200 if ok else 400)


async def ensure_blog():
    await db.blog_posts.create_index("key", unique=True)
    await db.blog_posts.create_index("slug")
    await db.digest_sends.create_index([("user_id", 1), ("week", 1)], unique=True)
    async for p in db.blog_posts.find({"published_at": {"$not": {"$regex": r"\+00:00$"}}}, {"_id": 0, "key": 1, "published_at": 1}):
        await db.blog_posts.update_one({"key": p["key"]}, {"$set": {"published_at": datetime.fromisoformat(p["published_at"]).astimezone(timezone.utc).isoformat()}})
    if not await db.blog_posts.count_documents({}):
        run_bg()
