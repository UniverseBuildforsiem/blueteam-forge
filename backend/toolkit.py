import hashlib
import ipaddress
import random
import re
import time
from datetime import date, timedelta
from core import db
from seed_data import INTEL

IP_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
HASH_RE = re.compile(r"\b(?:[a-f0-9]{64}|[a-f0-9]{40}|[a-f0-9]{32})\b", re.I)
TLDS = "com|net|org|io|ru|top|xyz|live|info|biz|cn|nz|example|cc|me|co|site|online|tk|su|ly|in|de|uk"
DOMAIN_RE = re.compile(rf"\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:{TLDS})\b", re.I)
FILE_RE = re.compile(r"(?:[A-Za-z]:\\[^\s'\"|]+|/(?:tmp|dev/shm|var/tmp|opt|usr/bin|etc/cron\.d)/[^\s'\"|;]+|\b[\w.-]+\.(?:exe|dll|docm|xlsm|doc|ps1|bat|vbs|js|sh|aspx|php|zip|7z|kdbx|bin|hta|lnk|iso|jar|py|elf))\b", re.I)
INTERNAL = ("acme-corp.com", "acme-corp.local", "acme.local", "acme.com", "corp.local")
GOOD = {"microsoft.com", "office.com", "windowsupdate.com", "google.com", "github.com", "8.8.8.8", "1.1.1.1", "outlook.com", "live.com"}
BAD_WORDS = ("attacker", "malicious", "c2", "blocklist", "phish", "typosquat", "exfil", "tor", "bulletproof", "hosting", "crypto", "scam", "brute", "failed", "spray", "beacon",
             "registered", "miner", "shell", "payload", "stage", "dropper", "intel:", "vps", "rare", "new country", "/dev/tcp", "4444", "sqlmap", "spf=fail",
             "dmarc=fail", "newly", "union", "upload", "exploit", "scan", "spoof", "mitm", "pool", "kali")
VENDORS = ["Kaspersky", "ESET-NOD32", "BitDefender", "Sophos", "Fortinet", "CrowdStrike Falcon", "Microsoft", "Google Safebrowsing", "Palo Alto Networks", "Trend Micro",
           "Avira", "Emsisoft", "G-Data", "Webroot", "Forcepoint ThreatSeeker", "Abusix"]
SCRIPT_PARENT = {".docm": "WINWORD.EXE", ".doc": "WINWORD.EXE", ".xlsm": "EXCEL.EXE", ".ps1": "powershell.exe", ".vbs": "wscript.exe", ".js": "wscript.exe", ".hta": "mshta.exe",
                 ".bat": "cmd.exe", ".sh": "bash", ".aspx": "w3wp.exe", ".php": "php-fpm", ".lnk": "explorer.exe", ".zip": "explorer.exe", ".7z": "7z.exe"}
BEHAVIOURS = [  # keyword, signature, MITRE technique
    ("powershell", "Launches PowerShell with hidden/encoded arguments", "T1059.001 PowerShell"), ("-enc", "Uses Base64-encoded command line", "T1027 Obfuscated Files or Information"),
    ("macro", "Office document executes a macro", "T1204.002 Malicious File"), (".docm", "Macro-enabled Office attachment", "T1566.001 Spearphishing Attachment"),
    ("vssadmin", "Deletes volume shadow copies", "T1490 Inhibit System Recovery"), ("lockd", "Mass-encrypts and renames files", "T1486 Data Encrypted for Impact"),
    ("schtasks", "Creates a scheduled task", "T1053.005 Scheduled Task"), ("cron", "Installs a cron job", "T1053.003 Cron"), ("authorized_keys", "Adds an SSH authorized key", "T1098.004 SSH Authorized Keys"),
    ("net user", "Creates a local/domain account", "T1136 Create Account"), ("useradd", "Creates a local account", "T1136.001 Local Account"), ("domain admins", "Adds account to a privileged group", "T1098 Account Manipulation"),
    ("mimikatz", "Dumps credentials from LSASS", "T1003.001 LSASS Memory"), ("lsass", "Accesses LSASS memory", "T1003.001 LSASS Memory"), ("psexec", "Remote service execution", "T1569.002 Service Execution"),
    ("rclone", "Syncs data to cloud storage", "T1567.002 Exfiltration to Cloud Storage"), ("mega", "Uploads to file-sharing service", "T1567.002 Exfiltration to Cloud Storage"),
    ("dns", "Unusual DNS activity", "T1071.004 DNS"), ("dns txt", "DNS TXT data channel", "T1048 Exfiltration Over Alternative Protocol"), ("bash -i", "Spawns a reverse shell", "T1059.004 Unix Shell"),
    ("curl", "Downloads a remote payload", "T1105 Ingress Tool Transfer"), ("wget", "Downloads a remote payload", "T1105 Ingress Tool Transfer"), ("rundll32", "Proxy execution via rundll32", "T1218.011 Rundll32"),
    ("xmrig", "Runs a cryptocurrency miner", "T1496 Resource Hijacking"), ("stratum", "Connects to a mining pool", "T1496 Resource Hijacking"), ("whoami", "System owner discovery", "T1033 System Owner/User Discovery"),
    ("nmap", "Network service scanning", "T1046 Network Service Discovery"), ("sqlmap", "Automated SQL injection", "T1190 Exploit Public-Facing Application"), ("w3wp", "Web server spawns a shell", "T1505.003 Web Shell"),
    ("sudo", "Abuses sudo rights", "T1548.003 Sudo and Sudo Caching"), ("7z", "Archives collected data", "T1560.001 Archive via Utility"), ("anydesk", "Remote access software", "T1219 Remote Access Software"),
    ("wmi", "WMI event subscription", "T1546.003 WMI Event Subscription"), ("inbox rule", "Creates hidden mailbox rule", "T1564.008 Email Hiding Rules"), ("clear", "Clears logs or history", "T1070 Indicator Removal")]
CMD_HINT = re.compile(r"(powershell|cmd\.exe|cmd /c|vssadmin|net user|net group|net localgroup|schtasks|rclone|curl|wget|bash -c|bash -i|chmod|7z\.exe|rundll32|mimikatz|m\.exe|nmap|useradd|xmrig|rubeus|sqlmap|whoami|find \.|dnscat|svch0st|anydesk|wmic|psexec)", re.I)

SYSLOG = re.compile(r"^(?:[A-Z][a-z]{2} +\d{1,2} \d\d:\d\d|\d{4}-\d\d-\d\d[T ]\d\d:|type=\w+ msg=)")
_cache = {"at": 0, "index": {}, "ctx": {}}


def defang(s):
    return (s or "").replace("[.]", ".").replace("hxxp", "http")


PRIVATE = [ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "169.254.0.0/16")]
SYSTEM_BINS = {"winword.exe", "excel.exe", "powershell.exe", "cmd.exe", "rundll32.exe", "w3wp.exe", "explorer.exe", "svchost.exe", "lsass.exe", "mstsc.exe", "schtasks.exe", "wscript.exe", "mshta.exe", "7z.exe", "vssadmin.exe"}


def is_private(ip):
    try:
        return any(ipaddress.ip_address(ip) in n for n in PRIVATE)
    except ValueError:
        return True


def extract(text):
    text = defang(text)
    hashes = {h.lower() for h in HASH_RE.findall(text)}
    ips = {i for i in IP_RE.findall(text) if all(0 <= int(x) <= 255 for x in i.split(".")) and i.split(".")[-1] not in ("0", "255")}
    files = []
    for f in FILE_RE.findall(text):
        f = f.rstrip(".,)")
        if f not in files and not DOMAIN_RE.fullmatch(f) and f.lower() not in SYSTEM_BINS:
            files.append(f)
    domains = {d.lower() for d in DOMAIN_RE.findall(text)} - {f.lower() for f in files}
    return {"ip": sorted(ips), "domain": sorted(domains), "hash": sorted(hashes), "file": files[:10]}


def ctx_text(kind, doc):
    if kind == "challenge":
        return "\n".join([doc.get("description", ""), *[f"{k}: {v}" for k, v in doc["alert"].items()], *doc.get("evidence", [])])
    return "\n".join([doc.get("description", ""), doc.get("scenario", ""), *(doc.get("kali", {}).get("fs", {}).values()), *(doc.get("kali", {}).get("net", {}).get("whois", {}).values())])


async def contexts():
    if time.time() - _cache["at"] < 600:
        return _cache
    ctx, index = {}, {}
    for kind, coll in (("challenge", "challenges"), ("lab", "labs")):
        for d in await db[coll].find({}, {"_id": 0, "id": 1, "title": 1, "description": 1, "alert": 1, "evidence": 1, "verdict": 1, "scenario": 1, "kali": 1}).to_list(1000):
            text = ctx_text(kind, d)
            c = {"kind": kind, "id": d["id"], "title": d["title"], "text": text, "bad": d.get("verdict", "TP") == "TP", "iocs": extract(text)}
            ctx[(kind, d["id"])] = c
            for t in ("ip", "domain", "hash"):
                for v in c["iocs"][t]:
                    index.setdefault(v, []).append(c)
    _cache.update(at=time.time(), ctx=ctx, index=index)
    return _cache


def ioc_type(v):
    return "hash" if HASH_RE.fullmatch(v) else "ip" if IP_RE.fullmatch(v) else "domain"


def internal(v, t):
    return (t == "ip" and is_private(v)) or (t == "domain" and (v.endswith(INTERNAL) or v.endswith(".local") or v.endswith(".internal")))


def judge(v, t, cs):
    if v in GOOD or internal(v, t):
        return "clean"
    if not cs:
        return "unknown"
    bad = [c for c in cs if c["bad"]]
    if not bad:
        return "clean"
    lines = [l.lower() for c in bad for l in c["text"].split("\n") if v in defang(l).lower()]
    return "malicious" if t == "hash" or any(w in l for l in lines for w in BAD_WORDS) else "suspicious"


def rng(v):
    return random.Random(int(hashlib.sha256(v.encode()).hexdigest()[:12], 16))


def vendor_table(verdict, t, r, base_detected=None):
    detected = base_detected if base_detected is not None else 0 if verdict not in ("malicious", "suspicious") else r.randint(30, 60) if t == "hash" else r.randint(8, 18) if verdict == "malicious" else r.randint(2, 4)
    flagged = min({"malicious": r.randint(9, 15), "suspicious": r.randint(2, 3)}.get(verdict, 0), detected)
    labels = (["Trojan.Generic", "Malware.Heur", "Trojan.Agent", "HEUR:Trojan.Win32", "Ransom.Gen", "Backdoor.Agent"] if t == "hash"
              else ["malicious", "malware", "phishing", "suspicious"] if verdict == "malicious" else ["suspicious", "spam"])
    order = VENDORS[:]
    r.shuffle(order)
    rows = [{"vendor": n, "result": r.choice(labels) if i < flagged else ("undetected" if t == "hash" else "clean"), "flagged": i < flagged} for i, n in enumerate(order)]
    return sorted(rows, key=lambda x: not x["flagged"]), detected


async def intel_report(q, kind=None, cid=None):
    v = defang(q.strip().lower())
    v = v if HASH_RE.fullmatch(v) else re.sub(r"^https?://", "", v).split("/")[0].split(":")[0]
    t = ioc_type(v)
    c = await contexts()
    cs = c["index"].get(v, [])
    if kind and (kind, cid) in c["ctx"]:
        mine = c["ctx"][(kind, cid)]
        cs = [mine] + [x for x in cs if x is not mine]
    base = INTEL.get(v, {})
    verdict = base.get("verdict") or judge(v, t, cs)
    r = rng(v)
    total = 72 if t == "hash" else 90
    vendors, detected = vendor_table(verdict, t, r, int(base["detections"].split("/")[0]) if base.get("detections") else None)
    first = base.get("first_seen") or (date(2026, 6, 1) - timedelta(days=r.randint(1, 40) if verdict != "clean" else r.randint(400, 3000))).isoformat()
    last = (date(2026, 6, 20) - timedelta(days=r.randint(0, 6))).isoformat()
    related = []
    for x in cs[:3]:
        for rt in ("ip", "domain", "hash"):
            for o in x["iocs"][rt]:
                if o != v and not internal(o, rt) and o not in GOOD and all(o != y["value"] for y in related):
                    related.append({"type": rt, "value": o, "relation": "seen in the same incident" if x is cs[0] else f"also seen in: {x['title']}"})
    if t == "ip":
        details = {"country": base.get("country") or ("Internal" if internal(v, t) else r.choice(["NL", "RU", "RO", "MD", "SC", "US", "DE", "NG", "CN"])),
                   "asn": base.get("asn") or ("—" if internal(v, t) else f"AS{r.randint(10000, 65000)}"),
                   "as_owner": "Private network (RFC 1918)" if internal(v, t) else r.choice(["Bulletproof Hosting Ltd", "Cheap VPS LLC", "Offshore Hosting", "M247 Europe", "DigitalOcean"]) if verdict != "clean" else "Google LLC" if v == "8.8.8.8" else "Cloud provider"}
    elif t == "domain":
        details = {"registrar": base.get("registrar") or ("Corporate" if internal(v, t) else r.choice(["NameSilo", "PDR Ltd", "Hosting Concepts B.V.", "Namecheap", "Shinjiru"])),
                   "creation_date": first if verdict != "clean" else "2003-04-11", "resolves_to": next((y["value"] for y in related if y["type"] == "ip"), "—")}
    else:
        fname = base.get("file_name") or next((f for x in cs for f in x["iocs"]["file"] if re.search(r"\.(exe|dll|docm|ps1|sh|aspx|bin)$", f, re.I)), "sample.bin")
        details = {"file_name": fname.split("\\")[-1].split("/")[-1], "file_type": "Office Open XML (macro)" if fname.endswith("docm") else "PE32 executable" if fname.lower().endswith((".exe", ".dll")) else "Script / data",
                   "size": f"{r.randint(40, 900)} KB", "family": base.get("family") or (r.choice(["Generic Trojan", "Loader", "Dropper"]) if verdict == "malicious" else "—")}
    tags = base.get("tags") or {"malicious": ["malicious-activity"], "suspicious": ["suspicious"], "clean": ["internal" if internal(v, t) else "benign"], "unknown": []}[verdict]
    return {"indicator": v, "type": t, "verdict": verdict, "detections": f"{detected}/{total}", "community_score": {"malicious": -r.randint(8, 40), "suspicious": -r.randint(1, 6), "clean": r.randint(0, 12), "unknown": 0}[verdict],
            "first_seen": first, "last_seen": last, "last_analysis": last, "tags": tags, "details": details, "vendors": vendors if verdict != "unknown" else [],
            "related": related[:6], "seen_in": [{"kind": x["kind"], "id": x["id"], "title": x["title"]} for x in cs[:5]],
            "note": "No records in the simulated intel database." if verdict == "unknown" else None}


async def alert_iocs(kind, cid):
    c = (await contexts())["ctx"].get((kind, cid))
    if not c:
        return None
    rows = [{"type": t, "value": v, "internal": internal(v, t)} for t in ("ip", "domain", "hash") for v in c["iocs"][t]]
    return {"title": c["title"], "iocs": sorted(rows, key=lambda x: x["internal"]), "files": c["iocs"]["file"]}


async def sandbox_report(file, kind, cid):
    c = (await contexts())["ctx"].get((kind, cid))
    if not c or file not in c["iocs"]["file"]:
        return None
    text, low = c["text"], c["text"].lower()
    name = re.split(r"[\\/]", file)[-1]
    ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    r = rng(file + cid)
    sha = c["iocs"]["hash"][0] if c["iocs"]["hash"] and file.lower().endswith((".docm", ".exe", ".dll", ".bin")) else hashlib.sha256(f"{cid}:{file}".encode()).hexdigest()
    bad = c["bad"]
    cmds = []
    for line in text.split("\n"):
        m = CMD_HINT.search(line)
        if m and len(cmds) < 5 and ". " not in line and not SYSLOG.match(line.strip()):
            cmd = re.sub(r"^\s*[\w\s:-]{0,30}?:\s+", "", line.strip().split("->")[-1].strip())[:110]
            if cmd not in cmds:
                cmds.append(cmd)
    parent = SCRIPT_PARENT.get(ext, name)
    pid = r.randint(2000, 6000)
    procs = [f"{parent} (pid {pid})"] + ([f"  └ {name} (pid {pid + 12})"] if parent != name else [])
    procs += [f"{'     ' if parent != name else '  '}└ {x} (pid {pid + 40 + i * 17})" for i, x in enumerate(cmds if bad else cmds[:1])]
    net = []
    for t in ("ip", "domain"):
        for v in c["iocs"][t]:
            if not internal(v, t) and v not in GOOD:
                port = re.search(rf"{re.escape(v)}[:/ ]+(\d{{2,5}})\b", defang(text))
                net.append(f"TCP {v}:{port.group(1)}" if t == "ip" and port else f"TCP {v}:443" if t == "ip" else f"DNS + HTTPS {v}")
    hits = [(s, m) for k, s, m in BEHAVIOURS if k in low]
    sigs = list(dict.fromkeys(s for s, _ in hits)) if bad else ["No malicious behaviour observed", "Signed or documented binary", "Activity matches an approved change"]
    mitre = list(dict.fromkeys(m for _, m in hits)) if bad else []
    return {"id": f"sbx-{hashlib.md5((cid + file).encode()).hexdigest()[:8]}", "file": name, "path": file, "sha256": sha,
            "score": r.randint(78, 99) if bad else r.randint(2, 14), "verdict": "malicious" if bad else "clean",
            "environment": "Linux (Ubuntu 22.04, x64)" if file.startswith("/") or ext in (".sh", ".php", "") else "Windows 10 x64 (Office 2019)",
            "duration": f"{r.randint(90, 300)}s", "processes": procs, "network": net[:6] if bad else [], "files": [f for f in c["iocs"]["file"] if f != file][:6] if bad else [],
            "signatures": sigs[:8], "mitre": mitre[:8], "source": {"kind": kind, "id": cid, "title": c["title"]}}
