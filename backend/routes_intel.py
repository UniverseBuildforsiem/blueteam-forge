import asyncio
import csv
import io
import ipaddress
import re
from datetime import datetime, timedelta
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from core import db, now, now_iso, new_id, get_current_user
import intel_sources as S

router = APIRouter(prefix="/api/intel")
DAILY = {"student": 150, "instructor": 400, "admin": 1000}
BULK_MAX = 25


class LookupIn(BaseModel):
    ioc: str = Field(min_length=1, max_length=2048)


class BulkIn(BaseModel):
    iocs: List[str] = Field(min_length=1, max_length=BULK_MAX)


class ExtractIn(BaseModel):
    text: str = Field(min_length=1, max_length=100000)


async def quota(user, n):
    used = await db.intel_history.count_documents({"owner": user["id"], "at": {"$gt": (now() - timedelta(days=1)).isoformat()}})
    limit = DAILY.get(user.get("role"), 150)
    if used + n > limit:
        raise HTTPException(429, f"Daily lookup limit reached ({limit} a day). It resets over the next 24 hours.")
    recent = await db.intel_history.count_documents({"owner": user["id"], "at": {"$gt": (now() - timedelta(minutes=1)).isoformat()}})
    if n == 1 and recent >= 20:
        raise HTTPException(429, "Slow down a little: max 20 lookups a minute.")
    return limit - used - n


def check_ip(ip):
    a = ipaddress.ip_address(ip)
    if a.is_private or a.is_loopback or a.is_reserved or a.is_multicast or a.is_link_local or a.is_unspecified:
        raise HTTPException(400, "That is a private or reserved IP. Only public internet IPs can be checked.")


def age_days(iso):
    try:
        return (now() - datetime.fromisoformat(iso.replace("Z", "+00:00"))).days
    except Exception:
        return None


def vt_points(v, reasons, heavy):
    if v.get("status") != "ok":
        return 0
    m, s = v["data"]["malicious"], v["data"]["suspicious"]
    if m:
        reasons.append(f"VirusTotal: {m} engines flag it malicious" + (f", {s} suspicious" if s else ""))
        return heavy if m >= 3 else heavy // 2
    if s:
        reasons.append(f"VirusTotal: {s} engines flag it suspicious")
        return 15
    return 0


def score_ip(src, reasons):
    p = vt_points(src.get("virustotal", {}), reasons, 60)
    ab = src.get("abuseipdb", {})
    if ab.get("status") == "ok":
        sc = ab["data"].get("abuseConfidenceScore") or 0
        if sc >= 25:
            reasons.append(f"AbuseIPDB confidence {sc}% from {ab['data'].get('totalReports', 0)} reports")
            p += 50 if sc >= 75 else 25
    f = src.get("blocklists", {}).get("data", {})
    if f.get("feodo_c2"):
        reasons.append("Listed on abuse.ch Feodo Tracker as a botnet C2 server")
        p += 80
    if f.get("spamhaus_drop"):
        reasons.append(f"Inside Spamhaus DROP hijacked range {f['spamhaus_drop']}")
        p += 70
    if f.get("tor_exit"):
        reasons.append("Tor exit node: traffic is anonymised")
        p += 30
    g = src.get("geo", {}).get("data", {})
    if g.get("proxy"):
        reasons.append("Flagged as proxy / VPN exit")
        p += 20
    if g.get("hosting"):
        reasons.append(f"Hosting / data-centre IP ({g.get('isp') or g.get('org')})")
        p += 5
    tags = set(src.get("open_ports", {}).get("data", {}).get("tags") or [])
    bad = tags & {"compromised", "malware", "c2", "botnet", "scanner", "honeypot"}
    if bad:
        reasons.append(f"Shodan tags: {', '.join(sorted(bad))}")
        p += 20
    vulns = src.get("open_ports", {}).get("data", {}).get("vulns") or []
    if vulns:
        reasons.append(f"{len(vulns)} known CVEs on exposed services")
    return p


def score_domain(src, reasons):
    p = vt_points(src.get("virustotal", {}), reasons, 60)
    if src.get("blocklists", {}).get("data", {}).get("phishing_army"):
        reasons.append(f"On the Phishing Army blocklist ({src['blocklists']['data']['phishing_army']})")
        p += 70
    reg = src.get("whois", {}).get("data", {}).get("registered")
    d = age_days(reg) if reg else None
    if d is not None and d < 30:
        reasons.append(f"Newly registered domain: {d} days old")
        p += 25
    elif d is not None and d < 180:
        reasons.append(f"Young domain: {d} days old")
        p += 10
    dns = src.get("dns", {}).get("data", {})
    if dns and not dns.get("A") and not dns.get("AAAA"):
        reasons.append("Domain does not resolve right now (no A/AAAA records)")
    return p


def score_hash(src, reasons):
    p = vt_points(src.get("virustotal", {}), reasons, 70)
    v = src.get("virustotal", {}).get("data", {})
    if v.get("threat_label"):
        reasons.append(f"Threat label: {v['threat_label']}")
    if v.get("yara"):
        reasons.append(f"{len(v['yara'])} YARA rules matched")
    if src.get("known_good", {}).get("status") == "ok":
        reasons.append(f"Known-good file in CIRCL hashlookup ({src['known_good']['data'].get('source') or 'NSRL'})")
        if v.get("malicious", 0) < 3:
            p -= 30
    return p


def verdict(p, src):
    rep = any(src.get(k, {}).get("status") == "ok" for k in ("virustotal", "abuseipdb", "known_good", "blocklists"))
    if p >= 60:
        return "malicious"
    if p >= 25:
        return "suspicious"
    return "clean" if rep else "unknown"


async def run(kind, value, deep=True, wait_vt=True):
    jobs = {}
    if kind == "ip":
        check_ip(value)
        jobs = {"geo": S.src_ipapi(value), "open_ports": S.src_internetdb(value), "blocklists": S.src_feeds_ip(value),
                "abuseipdb": S.src_abuseipdb(value), "virustotal": S.src_vt("ip", value, wait_vt)}
        if deep:
            jobs["whois"] = S.src_rdap("ip", value)
    elif kind in ("domain", "url"):
        host = S.url_host(value) if kind == "url" else value
        host_ip = None
        try:
            host_ip = str(ipaddress.ip_address(host))
        except ValueError:
            pass
        if host_ip:
            check_ip(host_ip)
            jobs = {"blocklists": S.src_feeds_ip(host_ip), "geo": S.src_ipapi(host_ip)}
        else:
            jobs = {"dns": S.src_dns(host), "blocklists": S.src_feeds_domain(host), "whois": S.src_rdap("domain", S.registrable(host))}
            if deep:
                jobs["certificates"] = S.src_crtsh(host)
        jobs["virustotal"] = S.src_vt(kind, value, wait_vt)
    elif kind == "hash":
        jobs = {"known_good": S.src_hashlookup(value), "virustotal": S.src_vt("hash", value, wait_vt)}
    res = await asyncio.gather(*jobs.values())
    src = dict(zip(jobs.keys(), res))
    reasons = []
    if kind == "ip":
        p = score_ip(src, reasons)
    elif kind == "hash":
        p = score_hash(src, reasons)
    elif "dns" in src:
        p = score_domain(src, reasons)
    else:
        p = score_ip(src, reasons)
    p = max(0, min(100, p))
    return {"type": kind, "ioc": value, "verdict": verdict(p, src), "score": p, "reasons": reasons, "sources": src}


async def save(user, r):
    doc = {"id": new_id(), "user_id": user["id"], "owner": user["id"], "type": r["type"], "ioc": r["ioc"], "verdict": r["verdict"], "score": r["score"], "reasons": r["reasons"], "sources": r["sources"], "at": now_iso()}
    await db.intel_history.insert_one(doc)
    doc.pop("_id", None)
    doc.pop("user_id", None)
    doc.pop("owner", None)
    return doc


@router.post("/lookup")
async def lookup(body: LookupIn, user=Depends(get_current_user)):
    kind, value = S.detect(body.ioc)
    if not kind:
        raise HTTPException(400, "Enter a public IP, domain, URL or MD5/SHA-1/SHA-256 hash.")
    left = await quota(user, 1)
    r = await save(user, await run(kind, value))
    return {**r, "remaining": left}


@router.post("/extract")
async def extract(body: ExtractIn, user=Depends(get_current_user)):
    t = S.refang(body.text)
    found, seen = [], set()

    def add(k, v):
        if (k, v) not in seen:
            seen.add((k, v))
            found.append({"type": k, "ioc": v})
    for u in re.findall(r"https?://[^\s\"'<>()\]]+", t, re.I):
        add("url", u.rstrip(".,;"))
    for ip in re.findall(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", t):
        try:
            a = ipaddress.ip_address(ip)
            if not (a.is_private or a.is_loopback or a.is_reserved or a.is_link_local):
                add("ip", ip)
        except ValueError:
            pass
    for h in re.findall(r"\b[a-fA-F0-9]{64}\b|\b[a-fA-F0-9]{40}\b|\b[a-fA-F0-9]{32}\b", t):
        add("hash", h.lower())
    hosts = {S.url_host(x["ioc"]) for x in found if x["type"] == "url"}
    for d in re.findall(r"\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b", t.lower()):
        tld = d.rsplit(".", 1)[-1]
        if d not in hosts and tld not in {"exe", "dll", "txt", "log", "png", "jpg", "ps1", "bat", "zip", "pdf", "docx", "xlsx", "js", "py", "sh", "bin", "dat", "tmp"} and not re.match(r"^\d", tld):
            add("domain", d)
    return {"iocs": found[:200], "count": len(found)}


@router.post("/bulk")
async def bulk(body: BulkIn, user=Depends(get_current_user)):
    items = []
    for raw in dict.fromkeys(x.strip() for x in body.iocs if x.strip()):
        k, v = S.detect(raw)
        items.append((raw, k, v))
    left = await quota(user, len([i for i in items if i[1]]))
    sem = asyncio.Semaphore(4)

    async def one(raw, k, v):
        if not k:
            return {"ioc": raw, "type": None, "verdict": "invalid", "score": 0, "reasons": ["Not a public IP, domain, URL or hash"]}
        async with sem:
            try:
                return await save(user, await run(k, v, deep=False, wait_vt=False))
            except HTTPException as e:
                return {"ioc": v, "type": k, "verdict": "invalid", "score": 0, "reasons": [e.detail]}
    res = await asyncio.gather(*(one(*i) for i in items))
    return {"results": res, "remaining": left}


@router.get("/myip")
async def myip(request: Request, user=Depends(get_current_user)):
    ip = (request.headers.get("x-forwarded-for") or "").split(",")[0].strip() or (request.client.host if request.client else "")
    try:
        check_ip(ip)
    except Exception:
        return {"ip": ip, "public": False}
    g, f = await asyncio.gather(S.src_ipapi(ip), S.src_feeds_ip(ip))
    return {"ip": ip, "public": True, "geo": g, "blocklists": f}


@router.get("/history")
async def history(user=Depends(get_current_user)):
    items = await db.intel_history.find({"user_id": user["id"]}, {"_id": 0, "user_id": 0, "owner": 0, "sources": 0}).sort("at", -1).to_list(200)
    used = await db.intel_history.count_documents({"owner": user["id"], "at": {"$gt": (now() - timedelta(days=1)).isoformat()}})
    return {"items": items, "used_today": used, "limit": DAILY.get(user.get("role"), 150)}


@router.get("/history/export")
async def export(user=Depends(get_current_user)):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["checked_at_utc", "type", "indicator", "verdict", "risk_score", "findings"])
    async for h in db.intel_history.find({"user_id": user["id"]}, {"_id": 0}).sort("at", -1).limit(1000):
        w.writerow([h["at"], h["type"], h["ioc"], h["verdict"], h["score"], " | ".join(h.get("reasons") or [])])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=threat-intel-history.csv"})


@router.get("/history/{hid}")
async def history_item(hid: str, user=Depends(get_current_user)):
    h = await db.intel_history.find_one({"id": hid, "user_id": user["id"]}, {"_id": 0, "user_id": 0, "owner": 0})
    if not h:
        raise HTTPException(404, "Lookup not found")
    return h


@router.delete("/history")
async def clear(user=Depends(get_current_user)):
    await db.intel_history.update_many({"user_id": user["id"]}, {"$set": {"user_id": f"cleared:{user['id']}"}})
    return {"ok": True}


async def ensure_intel():
    await db.intel_cache.create_index("key", unique=True)
    await db.intel_cache.create_index("expires_at", expireAfterSeconds=0)
    await db.intel_history.create_index([("user_id", 1), ("at", -1)])
    await db.intel_history.create_index([("owner", 1), ("at", -1)])
