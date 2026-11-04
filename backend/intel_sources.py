import asyncio
import base64
import ipaddress
import os
import re
import time
from datetime import timedelta
import httpx
from core import db, now, logger

UA = {"User-Agent": "SOCProfessionals-ThreatIntel/1.0"}
FEEDS = {
    "tor": "https://check.torproject.org/torbulkexitlist",
    "feodo": "https://feodotracker.abuse.ch/downloads/ipblocklist.txt",
    "drop": "https://www.spamhaus.org/drop/drop.txt",
    "phish": "https://phishing.army/download/phishing_army_blocklist.txt",
}
_feeds = {}
_feed_lock = asyncio.Lock()
_vt_times = []
_vt_lock = asyncio.Lock()
VT_DAILY = 480

HASH_RE = re.compile(r"^(?:[a-fA-F0-9]{32}|[a-fA-F0-9]{40}|[a-fA-F0-9]{64})$")
DOMAIN_RE = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


def refang(s):
    s = s.strip()
    for a, b in (("hxxps", "https"), ("hxxp", "http"), ("[.]", "."), ("(.)", "."), ("{.}", "."), ("[:]", ":"), ("[://]", "://"), ("[at]", "@"), ("[@]", "@")):
        s = re.sub(re.escape(a), b, s, flags=re.I)
    return s


def detect(raw):
    v = refang(raw)
    if re.match(r"^https?://", v, re.I):
        host = re.sub(r"^https?://", "", v, flags=re.I).split("/")[0].split("?")[0].split("@")[-1].split(":")[0].lower()
        if not host:
            return None, v
        return "url", v
    try:
        ip = ipaddress.ip_address(v)
        return "ip", str(ip)
    except ValueError:
        pass
    if HASH_RE.match(v):
        return "hash", v.lower()
    d = v.lower().rstrip(".")
    if DOMAIN_RE.match(d):
        return "domain", d
    return None, v


def url_host(u):
    return re.sub(r"^https?://", "", u, flags=re.I).split("/")[0].split("?")[0].split("@")[-1].split(":")[0].lower()


def hash_kind(h):
    return {32: "MD5", 40: "SHA-1", 64: "SHA-256"}.get(len(h), "hash")


async def cached(key, ttl_h, fn):
    hit = await db.intel_cache.find_one({"key": key, "expires_at": {"$gt": now()}}, {"_id": 0, "data": 1})
    if hit:
        return {**hit["data"], "cached": True}
    data = await fn()
    if data.get("status") == "ok" or data.get("status") == "not_found":
        await db.intel_cache.update_one({"key": key}, {"$set": {"data": data, "expires_at": now() + timedelta(hours=ttl_h)}}, upsert=True)
    return data


async def feed(name):
    f = _feeds.get(name)
    if f and time.time() - f[0] < 3600:
        return f[1]
    async with _feed_lock:
        f = _feeds.get(name)
        if f and time.time() - f[0] < 3600:
            return f[1]
        try:
            async with httpx.AsyncClient(timeout=25, headers=UA, follow_redirects=True) as c:
                r = await c.get(FEEDS[name])
                r.raise_for_status()
            lines = [ln.split(";")[0].strip() for ln in r.text.splitlines() if ln.strip() and not ln.startswith(("#", ";"))]
            data = [ipaddress.ip_network(x, strict=False) for x in lines if x] if name == "drop" else set(x.lower() for x in lines)
            _feeds[name] = (time.time(), data)
        except Exception as e:
            logger.warning(f"intel feed {name} failed: {e}")
            if not f:
                return set() if name != "drop" else []
            _feeds[name] = (time.time() - 3000, f[1])
        return _feeds[name][1]


async def get_json(url, **kw):
    async with httpx.AsyncClient(timeout=kw.pop("timeout", 10), headers={**UA, **kw.pop("headers", {})}, follow_redirects=True) as c:
        r = await c.get(url, **kw)
    return r


def err(e):
    if isinstance(e, httpx.HTTPStatusError):
        return {"status": "error", "error": f"service unavailable (HTTP {e.response.status_code})"}
    if isinstance(e, httpx.TimeoutException):
        return {"status": "error", "error": "service timed out"}
    return {"status": "error", "error": str(e).split("\n")[0][:120] or e.__class__.__name__}


def registrable(host):
    p = host.split(".")
    n = 3 if len(p) > 2 and len(p[-1]) == 2 and p[-2] in {"co", "com", "net", "org", "gov", "ac", "edu", "ne", "or", "gob", "mil"} else 2
    return ".".join(p[-n:])


async def src_ipapi(ip):
    async def go():
        try:
            r = await get_json(f"http://ip-api.com/json/{ip}", params={"fields": "status,message,continent,country,countryCode,regionName,city,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query"})
            d = r.json()
            return {"status": "ok", "data": d} if d.get("status") == "success" else {"status": "error", "error": d.get("message", "lookup failed")}
        except Exception as e:
            return err(e)
    return await cached(f"ipapi:{ip}", 12, go)


async def src_internetdb(ip):
    async def go():
        try:
            r = await get_json(f"https://internetdb.shodan.io/{ip}")
            if r.status_code == 404:
                return {"status": "not_found", "data": {"ports": [], "vulns": [], "tags": [], "hostnames": [], "cpes": []}}
            r.raise_for_status()
            return {"status": "ok", "data": r.json()}
        except Exception as e:
            return err(e)
    return await cached(f"idb:{ip}", 12, go)


async def src_rdap(kind, value):
    async def go():
        try:
            r = await get_json(f"https://rdap.org/{kind}/{value}", timeout=12)
            if r.status_code == 404:
                return {"status": "not_found", "data": {}}
            r.raise_for_status()
            j = r.json()
            ev = {e.get("eventAction"): e.get("eventDate") for e in j.get("events", [])}
            ents = []
            for e in j.get("entities", []):
                name = next((v[3] for v in (e.get("vcardArray") or [None, []])[1] if v[0] in ("fn", "org")), None)
                ents.append({"roles": e.get("roles", []), "name": name or e.get("handle")})
            d = {"handle": j.get("handle"), "name": j.get("name") or j.get("ldhName"), "registered": ev.get("registration"), "expires": ev.get("expiration"),
                 "updated": ev.get("last changed"), "status": j.get("status", []), "entities": ents[:6],
                 "nameservers": [n.get("ldhName", "").lower() for n in j.get("nameservers", [])][:8],
                 "range": f"{j.get('startAddress')} - {j.get('endAddress')}" if j.get("startAddress") else None, "country": j.get("country")}
            return {"status": "ok", "data": d}
        except Exception as e:
            return err(e)
    return await cached(f"rdap:{kind}:{value}", 24, go)


async def src_dns(domain):
    async def go():
        out = {}
        try:
            async with httpx.AsyncClient(timeout=8, headers=UA) as c:
                for t in ("A", "AAAA", "MX", "NS", "TXT"):
                    r = await c.get("https://dns.google/resolve", params={"name": domain, "type": t})
                    out[t] = [a["data"] for a in r.json().get("Answer", []) if a.get("type") in (1, 28, 15, 2, 16)][:10]
            return {"status": "ok", "data": out}
        except Exception as e:
            return err(e)
    return await cached(f"dns:{domain}", 1, go)


async def src_crtsh(domain):
    async def go():
        try:
            r = await get_json("https://crt.sh/", params={"q": domain, "output": "json"}, timeout=15)
            r.raise_for_status()
            rows = r.json()
            names = sorted({n.strip().lower() for x in rows for n in x.get("name_value", "").split("\n") if n.strip() and "*" not in n})
            rows.sort(key=lambda x: x.get("not_before", ""), reverse=True)
            recent = [{"issuer": (x.get("issuer_name", "").split("CN=")[-1])[:60], "not_before": x.get("not_before"), "not_after": x.get("not_after"), "name": x.get("common_name")} for x in rows[:6]]
            return {"status": "ok", "data": {"certificates": len(rows), "subdomains": names[:40], "subdomain_count": len(names), "recent": recent,
                                              "first_seen": rows[-1].get("not_before") if rows else None}}
        except Exception as e:
            return err(e)
    return await cached(f"crt:{domain}", 24, go)


async def src_hashlookup(h):
    async def go():
        try:
            r = await get_json(f"https://hashlookup.circl.lu/lookup/{hash_kind(h).replace('-', '').lower()}/{h}")
            if r.status_code == 404:
                return {"status": "not_found", "data": {}}
            r.raise_for_status()
            j = r.json()
            return {"status": "ok", "data": {"known_good": True, "file_name": j.get("FileName"), "file_size": j.get("FileSize"), "source": j.get("source") or ("NSRL" if j.get("db") == "nsrl_modern_rds" else j.get("db")),
                                              "product": (j.get("ProductCode") or {}).get("ProductName") if isinstance(j.get("ProductCode"), dict) else None, "trust": j.get("hashlookup:trust")}}
        except Exception as e:
            return err(e)
    return await cached(f"hl:{h}", 24, go)


async def src_feeds_ip(ip):
    tor, feodo, drop = await asyncio.gather(feed("tor"), feed("feodo"), feed("drop"))
    a = ipaddress.ip_address(ip)
    net = next((str(n) for n in drop if a.version == n.version and a in n), None)
    return {"status": "ok", "data": {"tor_exit": ip in tor, "feodo_c2": ip in feodo, "spamhaus_drop": net, "lists": {"tor": len(tor), "feodo": len(feodo), "drop": len(drop)}}}


async def src_feeds_domain(domain):
    phish = await feed("phish")
    parts = domain.split(".")
    hit = next((".".join(parts[i:]) for i in range(len(parts) - 1) if ".".join(parts[i:]) in phish), None)
    return {"status": "ok", "data": {"phishing_army": hit, "list_size": len(phish)}}


async def src_abuseipdb(ip):
    key = os.environ.get("ABUSEIPDB_API_KEY")
    if not key:
        return {"status": "no_key"}

    async def go():
        try:
            r = await get_json("https://api.abuseipdb.com/api/v2/check", params={"ipAddress": ip, "maxAgeInDays": 90}, headers={"Key": key, "Accept": "application/json"})
            if r.status_code == 429:
                return {"status": "error", "error": "AbuseIPDB daily limit reached"}
            if r.status_code in (401, 403):
                return {"status": "error", "error": "AbuseIPDB key was rejected"}
            r.raise_for_status()
            d = r.json().get("data", {})
            return {"status": "ok", "data": {k: d.get(k) for k in ("abuseConfidenceScore", "totalReports", "numDistinctUsers", "lastReportedAt", "usageType", "isp", "domain", "countryCode", "isTor", "isWhitelisted", "hostnames")}}
        except Exception as e:
            return err(e)
    return await cached(f"abuse:{ip}", 6, go)


async def vt_slot(wait):
    async with _vt_lock:
        day = now().strftime("%Y-%m-%d")
        u = await db.intel_cache.find_one({"key": f"vt-usage:{day}"}, {"_id": 0, "n": 1})
        if (u or {}).get("n", 0) >= VT_DAILY:
            return "VirusTotal daily free limit reached, try tomorrow"
        while True:
            t = time.monotonic()
            _vt_times[:] = [x for x in _vt_times if t - x < 60]
            if len(_vt_times) < 4:
                _vt_times.append(t)
                await db.intel_cache.update_one({"key": f"vt-usage:{day}"}, {"$inc": {"n": 1}, "$set": {"expires_at": now() + timedelta(days=2)}}, upsert=True)
                return None
            delay = 60 - (t - _vt_times[0]) + 0.1
            if not wait or delay > 45:
                return "VirusTotal free limit is 4 checks a minute, try again shortly"
            await asyncio.sleep(delay)


def vt_summary(kind, a):
    s = a.get("last_analysis_stats", {})
    d = {"malicious": s.get("malicious", 0), "suspicious": s.get("suspicious", 0), "harmless": s.get("harmless", 0), "undetected": s.get("undetected", 0),
         "reputation": a.get("reputation"), "votes": a.get("total_votes"), "tags": (a.get("tags") or [])[:10], "last_analysis": a.get("last_analysis_date"),
         "engines": [{"engine": k, "result": v.get("result"), "category": v.get("category")} for k, v in (a.get("last_analysis_results") or {}).items() if v.get("category") in ("malicious", "suspicious")][:15]}
    if kind == "ip":
        d.update({"asn": a.get("asn"), "as_owner": a.get("as_owner"), "network": a.get("network"), "country": a.get("country")})
    if kind == "domain":
        d.update({"registrar": a.get("registrar"), "categories": sorted(set((a.get("categories") or {}).values()))[:6], "creation_date": a.get("creation_date")})
    if kind == "url":
        d.update({"final_url": a.get("last_final_url"), "title": a.get("title"), "categories": sorted(set((a.get("categories") or {}).values()))[:6]})
    if kind == "hash":
        ptc = a.get("popular_threat_classification") or {}
        si = a.get("signature_info") or {}
        d.update({"names": (a.get("names") or [])[:6], "type": a.get("type_description"), "size": a.get("size"), "md5": a.get("md5"), "sha1": a.get("sha1"), "sha256": a.get("sha256"),
                  "first_seen": a.get("first_submission_date"), "threat_label": ptc.get("suggested_threat_label"),
                  "families": [x.get("value") for x in (ptc.get("popular_threat_name") or [])][:5], "signature": {k: si.get(k) for k in ("product", "description", "copyright", "signers", "verified", "signing date") if si.get(k)},
                  "yara": [{"rule": y.get("rule_name"), "source": y.get("source"), "author": y.get("author")} for y in (a.get("crowdsourced_yara_results") or [])][:8],
                  "sigma": a.get("sigma_analysis_stats"), "sandbox_verdicts": [{"sandbox": k, "category": v.get("category"), "names": v.get("malware_names", [])[:3]} for k, v in (a.get("sandbox_verdicts") or {}).items()][:6]})
    return d


async def src_vt(kind, value, wait=True):
    key = os.environ.get("VT_API_KEY")
    if not key:
        return {"status": "no_key"}
    ck = f"vt:{kind}:{value}"
    hit = await db.intel_cache.find_one({"key": ck, "expires_at": {"$gt": now()}}, {"_id": 0, "data": 1})
    if hit:
        return {**hit["data"], "cached": True}
    msg = await vt_slot(wait)
    if msg:
        return {"status": "skipped", "error": msg}
    path = {"ip": f"ip_addresses/{value}", "domain": f"domains/{value}", "hash": f"files/{value}",
            "url": "urls/" + base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")}[kind]
    try:
        r = await get_json(f"https://www.virustotal.com/api/v3/{path}", headers={"x-apikey": key}, timeout=20)
        if r.status_code == 404:
            data = {"status": "not_found", "data": {}}
        elif r.status_code == 429:
            return {"status": "skipped", "error": "VirusTotal quota reached, try again shortly"}
        elif r.status_code in (401, 403):
            return {"status": "error", "error": "VirusTotal key was rejected"}
        else:
            r.raise_for_status()
            data = {"status": "ok", "data": vt_summary(kind, r.json().get("data", {}).get("attributes", {}))}
    except Exception as e:
        return err(e)
    await db.intel_cache.update_one({"key": ck}, {"$set": {"data": data, "expires_at": now() + timedelta(hours=6)}}, upsert=True)
    return data
