import asyncio
import base64
import hashlib
import io
import ipaddress
import json
import os
import re
import socket
from email.parser import HeaderParser
from email.utils import getaddresses, parseaddr
from urllib.parse import urlparse, parse_qsl, urljoin
import dns.asyncresolver
import dns.resolver
import httpx
import qrcode
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from core import db, get_current_user, now_iso, new_id, award, logger
from phish_data import TYPES, CASES, V
import intel_sources as S

router = APIRouter(prefix="/api/phish")
NO_ID = {"_id": 0}
XP = {"Easy": 40, "Medium": 60, "Hard": 80}
PANELS = {"email", "code", "chat", "table", "browser", "qr", "wifi"}
TYPE_IDS = {t["id"] for t in TYPES}


def fix(o):
    if isinstance(o, list):
        return [fix(x) for x in o]
    if isinstance(o, dict):
        return {("from" if k == "from_" else k): fix(v) for k, v in o.items()}
    return o


def shuffled(items, seed):
    return sorted(items, key=lambda x: hashlib.md5(f"{seed}{x['text']}".encode()).hexdigest())


STARTER = {c["id"]: {**fix(c), "red_flags": shuffled(c["red_flags"], c["id"]), "response": shuffled(c["response"], c["id"] + "r"), "source": "starter"} for c in CASES}


def paid(user):
    return user["role"] in ("admin", "instructor") or user.get("plan") == "pro"


async def all_cases(staff=False):
    ai = await db.phish_cases.find({} if staff else {"published": True, "status": "ready"}, NO_ID).sort("created_at", 1).to_list(1000)
    return list(STARTER.values()) + ai


async def get_case(cid, user):
    c = STARTER.get(cid) or await db.phish_cases.find_one({"id": cid, "status": "ready"}, NO_ID)
    if not c or (c.get("source") == "ai" and not c.get("published") and user["role"] not in ("admin", "instructor")):
        raise HTTPException(404, "Case not found")
    if not c.get("free") and not paid(user):
        raise HTTPException(403, "This case is for paid members — upgrade to unlock every phishing investigation")
    return c


def card(c, user, best):
    return {"id": c["id"], "type": c["type"], "title": c["title"], "difficulty": c["difficulty"], "free": bool(c.get("free")), "source": c.get("source", "ai"),
            "locked": not c.get("free") and not paid(user), "best": best.get(c["id"]), "xp": XP.get(c["difficulty"], 50)}


async def bests(user):
    rows = await db.phish_attempts.find({"user_id": user["id"]}, {"_id": 0, "case_id": 1, "score": 1}).to_list(5000)
    out = {}
    for r in rows:
        out[r["case_id"]] = max(out.get(r["case_id"], 0), r["score"])
    return out


@router.get("/types")
async def list_types(user=Depends(get_current_user)):
    cs, best = await all_cases(), await bests(user)
    return {"paid": paid(user), "types": [{**t, "cases": [card(c, user, best) for c in cs if c["type"] == t["id"]]} for t in TYPES]}


def public_case(c):
    return {**{k: c[k] for k in ("id", "type", "title", "difficulty", "brief", "panels")}, "free": bool(c.get("free")),
            "red_flags": [f["text"] for f in c["red_flags"]], "response": [r["text"] for r in c["response"]], "verdicts": V, "ioc_count": len(c["iocs"])}


@router.get("/cases/{cid}")
async def case(cid: str, user=Depends(get_current_user)):
    c = await get_case(cid, user)
    last = await db.phish_attempts.find_one({"user_id": user["id"], "case_id": cid}, {"_id": 0, "user_id": 0}, sort=[("created_at", -1)])
    return {**public_case(c), "type_name": next(t["name"] for t in TYPES if t["id"] == c["type"]), "last": last}


class SubmitIn(BaseModel):
    verdict: str = Field(max_length=80)
    flags: list[int] = Field(default_factory=list, max_length=20)
    iocs: list[str] = Field(default_factory=list, max_length=30)
    response: list[int] = Field(default_factory=list, max_length=20)


def norm(s):
    s = S.refang(s.strip()).lower().rstrip("/")
    s = re.sub(r"^https?://", "", s)
    return re.sub(r"[\s()-]", "", s) if re.fullmatch(r"\+?[\d\s()-]{8,}", s) else s


def pick_score(opts, chosen, weight):
    right = {i for i, o in enumerate(opts) if o["correct"]}
    got = {i for i in chosen if 0 <= i < len(opts)}
    return round(weight * max(0, (len(got & right) - len(got - right)) / len(right))) if right else weight


@router.post("/cases/{cid}/submit")
async def submit(cid: str, body: SubmitIn, user=Depends(get_current_user)):
    c = await get_case(cid, user)
    given = {norm(x) for x in body.iocs if x.strip()}
    hits = [i for i in c["iocs"] if norm(i) in given or any(g and (norm(i).startswith(g) or g.startswith(norm(i))) and len(g) > 6 for g in given)]
    parts = {"verdict": 30 if body.verdict == c["verdict"] else 0, "red_flags": pick_score(c["red_flags"], body.flags, 30),
             "iocs": round(20 * len(hits) / len(c["iocs"])) if c["iocs"] else 20, "response": pick_score(c["response"], body.response, 20)}
    score = sum(parts.values())
    passed = score >= 70
    first = passed and not await db.phish_attempts.find_one({"user_id": user["id"], "case_id": cid, "passed": True})
    xp = XP.get(c["difficulty"], 50) if first else 0
    await db.phish_attempts.insert_one({"id": new_id(), "user_id": user["id"], "case_id": cid, "score": score, "parts": parts, "passed": passed, "created_at": now_iso()})
    if xp:
        await award(user["id"], xp, f"Solved phishing case: {c['title']}")
    return {"score": score, "parts": parts, "passed": passed, "xp": xp, "verdict": c["verdict"], "debrief": c["debrief"], "iocs": c["iocs"], "ioc_hits": hits,
            "red_flags": [f["correct"] for f in c["red_flags"]], "response": [r["correct"] for r in c["response"]]}


@router.get("/qr")
async def qr_png(data: str = Query(min_length=1, max_length=600)):
    buf = io.BytesIO()
    qrcode.make(data, border=2).save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


# ---------- OSINT tools ----------
IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
URL_RE = re.compile(r"https?://[^\s\"'<>)\]]+", re.I)


def public_ip(ip):
    try:
        return ipaddress.ip_address(ip).is_global
    except ValueError:
        return False


def dom(addr):
    a = parseaddr(addr or "")[1]
    return a.split("@")[-1].lower() if "@" in a else ""


class HeadersIn(BaseModel):
    raw: str = Field(min_length=10, max_length=60000)


@router.post("/osint/headers")
async def analyze_headers(body: HeadersIn, user=Depends(get_current_user)):
    raw = body.raw.replace("\r\n", "\n")
    h = HeaderParser().parsestr(raw if "\n\n" in raw else raw + "\n\n")
    hops = []
    for r in reversed(h.get_all("Received") or []):
        r1 = " ".join(r.split())
        ips = [i for i in IP_RE.findall(r1) if public_ip(i)]
        m_from, m_by = re.search(r"from\s+(\S+)", r1), re.search(r"by\s+(\S+)", r1)
        hops.append({"from": m_from.group(1) if m_from else None, "by": m_by.group(1) if m_by else None, "ip": ips[0] if ips else None,
                     "time": r1.rsplit(";", 1)[1].strip() if ";" in r1 else None})
    auth = " ".join(h.get_all("Authentication-Results") or []) + " " + " ".join(h.get_all("Received-SPF") or [])
    res = {k: (re.search(rf"\b{k}\s*=\s*(\w+)", auth, re.I) or [None, None])[1] for k in ("spf", "dkim", "dmarc")}
    if not res["spf"] and h.get("Received-SPF"):
        res["spf"] = h["Received-SPF"].split()[0].lower()
    addrs = {k: h.get(k) for k in ("From", "Reply-To", "Return-Path", "Sender", "To", "Subject", "Date", "Message-ID")}
    fd, rd, rp = dom(addrs["From"]), dom(addrs["Reply-To"]), dom(addrs["Return-Path"])
    mid = re.search(r"@([\w.-]+)>?", addrs["Message-ID"] or "")
    warn = []
    for k, v in res.items():
        if v and v.lower() not in ("pass",):
            warn.append(f"{k.upper()} result is '{v}'")
        if not v:
            warn.append(f"No {k.upper()} result found")
    if rd and rd != fd:
        warn.append(f"Reply-To domain ({rd}) differs from From domain ({fd}) — replies go elsewhere")
    if rp and rp != fd:
        warn.append(f"Return-Path domain ({rp}) differs from From domain ({fd})")
    if mid and fd and not mid.group(1).lower().endswith(fd.split(".", 1)[-1]):
        warn.append(f"Message-ID domain ({mid.group(1)}) doesn't match the sender")
    name = parseaddr(addrs["From"] or "")[0]
    if name and re.search(r"[\w.-]+@[\w.-]+", name) and dom(name) != fd:
        warn.append("Display name contains a different email address (display-name spoofing)")
    if fd in ("gmail.com", "outlook.com", "hotmail.com", "yahoo.com", "proton.me", "protonmail.com"):
        warn.append(f"Sent from a free mail provider ({fd})")
    orig = h.get("X-Originating-IP")
    ips = sorted({i for i in IP_RE.findall(raw) if public_ip(i)})
    domains = sorted({d for d in [fd, rd, rp, *(dom(a) for _, a in getaddresses(h.get_all("To") or []))] if d} | {S.url_host(u) for u in URL_RE.findall(raw)})
    return {"hops": hops, "auth": res, "addresses": addrs, "warnings": warn, "originating_ip": orig.strip("[] ") if orig else None,
            "iocs": {"ips": ips, "domains": domains, "urls": sorted(set(URL_RE.findall(raw)))[:20]}}


class UrlIn(BaseModel):
    url: str = Field(min_length=4, max_length=2000)


async def safe_target(url):
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.hostname:
        raise ValueError("Only http/https URLs can be expanded")
    infos = await asyncio.get_running_loop().getaddrinfo(p.hostname, p.port or (443 if p.scheme == "https" else 80), type=socket.SOCK_STREAM)
    ips = {i[4][0] for i in infos}
    if not ips or not all(ipaddress.ip_address(i).is_global for i in ips):
        raise ValueError("That host resolves to a private or reserved address — blocked for safety")
    return sorted(ips)


def embedded(url):
    out = []
    for _, v in parse_qsl(urlparse(url).query):
        if URL_RE.match(v):
            out.append(v)
            continue
        try:
            d = base64.urlsafe_b64decode(v + "=" * (-len(v) % 4)).decode()
            if URL_RE.match(d):
                out.append(d)
        except (ValueError, UnicodeDecodeError):
            pass
    return out


@router.post("/osint/expand")
async def expand(body: UrlIn, user=Depends(get_current_user)):
    url = S.refang(body.url.strip())
    if not re.match(r"https?://", url, re.I):
        url = "http://" + url
    chain = []
    async with httpx.AsyncClient(follow_redirects=False, timeout=6, headers={"User-Agent": "Mozilla/5.0 (SOCPro URL expander)"}) as cl:
        for _ in range(8):
            hop = {"url": url, "embedded": embedded(url)}
            try:
                hop["ips"] = await safe_target(url)
                async with cl.stream("GET", url) as r:
                    hop.update(status=r.status_code, server=r.headers.get("server"), content_type=r.headers.get("content-type"))
                    loc = r.headers.get("location")
            except (ValueError, OSError, httpx.HTTPError) as e:
                hop["error"] = str(e)[:200] or e.__class__.__name__
                chain.append(hop)
                break
            chain.append(hop)
            if not loc or not (300 <= hop["status"] < 400):
                break
            url = urljoin(url, loc)
    final = chain[-1]["url"]
    return {"chain": chain, "final_url": final, "final_host": S.url_host(final), "hops": len(chain)}


GLYPHS = {"o": ["0"], "l": ["1", "i"], "i": ["1", "l"], "e": ["3"], "a": ["4"], "s": ["5"], "m": ["rn"], "w": ["vv"], "g": ["q"], "b": ["d"], "d": ["b"], "n": ["m"]}
TLDS = ["com", "net", "org", "co", "in", "io", "info", "xyz", "top", "online", "site", "co.in"]
WORDS = ["secure", "login", "support", "verify", "account", "mail", "portal", "online", "help"]


def permutations(label):
    out = set()
    for i in range(len(label)):
        out.add(label[:i] + label[i + 1:])
        out.add(label[:i] + label[i] + label[i:])
        if i < len(label) - 1:
            out.add(label[:i] + label[i + 1] + label[i] + label[i + 2:])
        for g in GLYPHS.get(label[i], []):
            out.add(label[:i] + g + label[i + 1:])
    for w in WORDS:
        out |= {f"{label}-{w}", f"{w}-{label}"}
    if "-" in label:
        out.add(label.replace("-", ""))
    else:
        out |= {label[:i] + "-" + label[i:] for i in range(2, len(label) - 1)}
    out.discard(label)
    return {x for x in out if len(x) > 1 and not x.startswith("-") and not x.endswith("-")}


class LookIn(BaseModel):
    domain: str = Field(min_length=3, max_length=120)


@router.post("/osint/lookalike")
async def lookalike(body: LookIn, user=Depends(get_current_user)):
    host = S.url_host(S.refang(body.domain.strip().lower())) if "/" in body.domain else S.refang(body.domain.strip().lower())
    reg = S.registrable(host)
    label, tld = reg.split(".", 1) if "." in reg else (reg, "com")
    cands = sorted(f"{p}.{tld}" for p in permutations(label))[:90] + [f"{label}.{t}" for t in TLDS if t != tld]
    res = dns.asyncresolver.Resolver()
    res.lifetime = 2.5
    sem = asyncio.Semaphore(25)

    async def check(d):
        async with sem:
            try:
                a = await res.resolve(d, "A")
                return {"domain": d, "registered": True, "ips": sorted({r.to_text() for r in a})[:3]}
            except dns.resolver.NXDOMAIN:
                return {"domain": d, "registered": False}
            except Exception:
                try:
                    await res.resolve(d, "NS")
                    return {"domain": d, "registered": True, "ips": []}
                except Exception:
                    return {"domain": d, "registered": False}
    rows = await asyncio.gather(*[check(d) for d in cands])
    idn = host.encode("idna").decode() if any(ord(ch) > 127 for ch in host) else None
    puny = host.encode().decode("idna") if "xn--" in host else None
    return {"domain": reg, "checked": len(rows), "registered": [r for r in rows if r["registered"]], "idn_ascii": idn, "idn_unicode": puny}


# ---------- AI case writer (staff) ----------
def staff(user=Depends(get_current_user)):
    if user["role"] not in ("admin", "instructor"):
        raise HTTPException(403, "Insufficient permissions")
    return user


PROMPT = """Write ONE realistic phishing investigation case for SOC analyst training.
Phishing type: {name} — {summary}
Difficulty: {difficulty}
Here is an example case of this type (same JSON shape you must use, but invent a NEW, different scenario, company, people, domains and IPs):
{example}

Reply with ONLY a JSON object with keys: title, difficulty, brief, panels, red_flags, iocs, response, verdict, debrief.
- panels: 2-3 evidence panels. Allowed panel types and fields:
  email {{type, from, reply_to?, to, date, subject, body (use [link text](url) for links), attachments: []}}
  code {{type, title, lang: headers|ics|html|text, text}}   (raw headers must include Received, Authentication-Results, From, Return-Path)
  chat {{type, title, channel: sms|voice|social, messages: [{{from, time, text}}]}}
  table {{type, title, columns: [...], rows: [[...]]}}
  browser {{type, title, url, cert, body}}
  qr {{type, title, caption, payload (the URL encoded in the QR)}}
  wifi {{type, title, networks: [{{ssid, bssid, vendor, security, signal, channel}}]}}
- red_flags: 7 items {{text, correct}}; 4 correct, 3 plausible-but-wrong.
- response: 7 items {{text, correct}}; 4 correct SOC actions, 3 wrong.
- iocs: 2-4 exact indicators that appear in the panels (domains, URLs, IPs, emails, phone numbers).
- verdict: one of {verdicts}.
- debrief: 2 sentences explaining the giveaway and the right response.
Use fictional but realistic lookalike domains; never use real company login domains as the malicious IOC."""


def validate(d, tid):
    assert d.get("title") and d.get("brief") and d.get("debrief"), "missing title/brief/debrief"
    assert d.get("verdict") in V, "bad verdict"
    assert 1 <= len(d.get("panels", [])) <= 4 and all(p.get("type") in PANELS for p in d["panels"]), "bad panels"
    for k in ("red_flags", "response"):
        opts = d.get(k, [])
        assert 5 <= len(opts) <= 9 and 2 <= sum(bool(o.get("correct")) for o in opts) < len(opts), f"bad {k}"
    assert 1 <= len(d.get("iocs", [])) <= 6, "bad iocs"
    return {"type": tid, "title": d["title"][:140], "difficulty": d.get("difficulty") if d.get("difficulty") in XP else "Medium", "brief": d["brief"][:600],
            "panels": d["panels"], "iocs": [str(i)[:300] for i in d["iocs"]], "verdict": d["verdict"], "debrief": d["debrief"][:1200],
            "red_flags": [{"text": str(o["text"])[:300], "correct": bool(o.get("correct"))} for o in d["red_flags"]],
            "response": [{"text": str(o["text"])[:300], "correct": bool(o.get("correct"))} for o in d["response"]]}


async def write_case(cid, t, difficulty):
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from sop_writer import parse
    ex = next(c for c in CASES if c["type"] == t["id"])
    ex = {k: v for k, v in fix(ex).items() if k not in ("id", "type", "free")}
    try:
        chat = LlmChat(api_key=os.environ["EMERGENT_LLM_KEY"], session_id=f"phish-{cid}",
                       system_message="You are a senior SOC analyst and phishing-awareness trainer. You reply with valid JSON only.").with_model("anthropic", "claude-sonnet-5-5").with_params(max_tokens=6000)
        text = PROMPT.format(name=t["name"], summary=t["summary"], difficulty=difficulty, example=json.dumps(ex, ensure_ascii=False), verdicts=json.dumps(V))
        try:
            d = validate(parse(await chat.send_message(UserMessage(text=text))), t["id"])
        except (AssertionError, KeyError, TypeError, ValueError) as e:
            d = validate(parse(await chat.send_message(UserMessage(text=f"That JSON failed validation: {e}. Reply with the full corrected JSON only."))), t["id"])
        d["red_flags"], d["response"] = shuffled(d["red_flags"], cid), shuffled(d["response"], cid + "r")
        await db.phish_cases.update_one({"id": cid}, {"$set": {**d, "status": "ready", "updated_at": now_iso()}})
    except Exception as e:
        logger.warning(f"Phish case generation failed: {e}")
        await db.phish_cases.update_one({"id": cid}, {"$set": {"status": "failed", "error": str(e)[:300]}})


TASKS = set()


class GenIn(BaseModel):
    type: str
    difficulty: str = Field(default="Medium", pattern="^(Easy|Medium|Hard)$")


@router.post("/manage/generate")
async def generate(body: GenIn, user=Depends(staff)):
    t = next((t for t in TYPES if t["id"] == body.type), None)
    if not t:
        raise HTTPException(422, "Unknown phishing type")
    cid = f"ph-ai-{new_id()[:8]}"
    await db.phish_cases.insert_one({"id": cid, "type": t["id"], "title": f"Drafting a {t['name']} case…", "difficulty": body.difficulty, "status": "generating",
                                     "published": False, "source": "ai", "created_by": user["name"], "created_at": now_iso()})
    task = asyncio.create_task(write_case(cid, t, body.difficulty))
    TASKS.add(task)
    task.add_done_callback(TASKS.discard)
    return {"id": cid, "status": "generating"}


@router.get("/manage")
async def manage(user=Depends(staff)):
    return await db.phish_cases.find({}, {"_id": 0, "id": 1, "type": 1, "title": 1, "difficulty": 1, "status": 1, "published": 1, "error": 1, "created_by": 1, "created_at": 1}).sort("created_at", -1).to_list(500)


class PubIn(BaseModel):
    published: bool


@router.post("/manage/{cid}/publish")
async def publish(cid: str, body: PubIn, user=Depends(staff)):
    if not (await db.phish_cases.update_one({"id": cid, "status": "ready"}, {"$set": {"published": body.published}})).matched_count:
        raise HTTPException(404, "Case not ready or not found")
    return {"ok": True}


@router.delete("/manage/{cid}")
async def delete(cid: str, user=Depends(staff)):
    if not (await db.phish_cases.delete_one({"id": cid})).deleted_count:
        raise HTTPException(404, "Case not found")
    return {"ok": True}


async def fail_stale():
    await db.phish_cases.update_many({"status": "generating"}, {"$set": {"status": "failed", "error": "Interrupted by a server restart — try again"}})
