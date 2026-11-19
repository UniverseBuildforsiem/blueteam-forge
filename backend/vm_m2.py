"""Module 2 (Vulnerability Management) lab environment. Fictional SOCP hosts on 10.50.200.0/24; real public CVE IDs, fictional QIDs."""
import ipaddress
import re

DOMAIN = "trn.socp.test"
NET = "10.50.200."
RANGE = f"{NET}243-{NET}250"
WIN = [f"{NET}{i}" for i in range(243, 247)]
LNX = [f"{NET}{i}" for i in range(247, 251)]
ALL = WIN + LNX
PASSWORD = "Train!ng-2026"

# qid, title, severity, type (C=confirmed, P=potential, IG=info gathered), cve, cvss, category, remote, patch
KB = [
    (91345, "Microsoft SMBv1 Remote Code Execution (EternalBlue, MS17-010)", 5, "C", "CVE-2017-0144", 8.1, "Windows", True, True),
    (91541, "Microsoft RDP Remote Code Execution (BlueKeep)", 5, "C", "CVE-2019-0708", 9.8, "Windows", True, True),
    (91785, "Windows Print Spooler Remote Code Execution (PrintNightmare)", 5, "C", "CVE-2021-34527", 8.8, "Windows", True, True),
    (91680, "Netlogon Elevation of Privilege (Zerologon)", 5, "C", "CVE-2020-1472", 10.0, "Windows", True, True),
    (376157, "Apache Log4j Remote Code Execution (Log4Shell)", 5, "C", "CVE-2021-44228", 10.0, "Web Application", True, True),
    (38657, "OpenSSL Heartbeat Information Disclosure (Heartbleed)", 4, "C", "CVE-2014-0160", 7.5, "General", True, True),
    (105871, "Linux Kernel Dirty Pipe Privilege Escalation", 4, "C", "CVE-2022-0847", 7.8, "Linux", False, True),
    (371199, "Sudo Heap-Based Buffer Overflow (Baron Samedit)", 4, "C", "CVE-2021-3156", 7.8, "Linux", False, True),
    (105945, "Polkit pkexec Local Privilege Escalation (PwnKit)", 4, "C", "CVE-2021-4034", 7.8, "Linux", False, True),
    (38701, "SSL/TLS 3DES Birthday Attack (SWEET32)", 3, "C", "CVE-2016-2183", 7.5, "General", True, True),
    (38601, "SSL/TLS RC4 Cipher Suites Supported", 3, "C", "CVE-2013-2566", 5.9, "General", True, True),
    (38739, "SSH Prefix Truncation Weakness (Terrapin)", 3, "P", "CVE-2023-48795", 5.9, "General", True, True),
    (38695, "TLS DHE Export Downgrade (Logjam)", 3, "P", "CVE-2015-4000", 3.7, "General", True, True),
    (38623, "SSH Server CBC Mode Ciphers Enabled", 2, "P", "CVE-2008-5161", 2.6, "General", True, True),
    (38173, "SSL Certificate Signed Using Weak Hashing Algorithm (MD5)", 2, "C", "CVE-2004-2761", 4.3, "General", True, True),
    (90043, "SMB Signing Not Required", 2, "C", "-", 5.3, "Windows", True, True),
    (82003, "ICMP Timestamp Request", 1, "C", "CVE-1999-0524", 0.0, "Network", True, False),
    (45017, "Operating System Detected", 1, "IG", "-", 0.0, "Information gathering", False, False),
    (82023, "Open TCP Services List", 1, "IG", "-", 0.0, "Information gathering", False, False),
    (70000, "NetBIOS Host Name", 1, "IG", "-", 0.0, "Information gathering", False, False),
]
KB_TEXT = {
    91345: ("A remote attacker can send crafted SMBv1 packets to run code as SYSTEM.", "Full system compromise; wormable (used by WannaCry).", "Apply MS17-010 and disable SMBv1."),
    91541: ("Unauthenticated RDP requests can trigger remote code execution.", "Remote takeover of the host before login.", "Apply the vendor patch; enable Network Level Authentication; block TCP 3389 at the edge."),
    91785: ("The Print Spooler service allows a user to install a malicious printer driver.", "Remote code execution as SYSTEM.", "Install the cumulative update and disable Print Spooler where not needed."),
    91680: ("Netlogon's cryptographic flaw lets an attacker impersonate any computer, including the domain controller.", "Domain administrator compromise.", "Apply the Netlogon update and enforce secure RPC."),
    376157: ("JNDI lookups in logged strings let an attacker load remote code.", "Unauthenticated remote code execution.", "Upgrade Log4j to 2.17.1 or later."),
}
TYPES = {"C": "Confirmed", "P": "Potential", "IG": "Information gathered"}


def h(ip, name, os, tracking, ports, qids):
    return {"ip": ip, "name": name, "os": os, "tracking": tracking, "ports": ports, "qids": qids}


HOSTS = [
    h(f"{NET}243", "TRN-DC01", "Windows Server 2019", "NetBIOS", [53, 88, 135, 389, 445], [91680, 91345, 90043, 38601, 82003, 45017, 82023, 70000]),
    h(f"{NET}244", "TRN-WIN2016", "Windows Server 2016", "NetBIOS", [135, 445, 3389], [91541, 91785, 90043, 38701, 82003, 45017, 82023, 70000]),
    h(f"{NET}245", "TRN-WIN10", "Windows 10 Enterprise", "NetBIOS", [135, 445, 3389], [91785, 91541, 38601, 45017, 82023, 70000]),
    h(f"{NET}246", "TRN-WIN2012", "Windows Server 2012 R2", "NetBIOS", [80, 135, 445, 3389], [91345, 91541, 38173, 38701, 90043, 82003, 45017, 82023]),
    h(f"{NET}247", f"lnx-ubuntu.{DOMAIN}", "Ubuntu Linux 20.04", "DNS", [22, 80], [105871, 38739, 38623, 371199, 45017, 82023]),
    h(f"{NET}248", f"lnx-centos.{DOMAIN}", "CentOS Linux 7", "DNS", [22, 111], [105945, 371199, 38657, 38623, 82003, 45017]),
    h(f"{NET}249", f"lnx-debian.{DOMAIN}", "Debian Linux 10", "DNS", [22, 443, 8080], [376157, 38657, 38739, 38695, 45017, 82023]),
    h(f"{NET}250", f"lnx-rhel.{DOMAIN}", "Red Hat Enterprise Linux 8", "DNS", [22, 443], [105945, 38739, 38695, 82003, 45017, 82023]),
]
BY_IP = {x["ip"]: x for x in HOSTS}


def find_host(arg):
    a = (arg or "").strip().lower().rstrip(".")
    return next((x for x in HOSTS if a in (x["ip"], x["name"].lower(), x["name"].lower().split(".")[0])), None)


def expand(text):
    """'10.50.200.243-10.50.200.250, 10.50.200.10' or '10.50.200.243-250' -> sorted list of IPs (max 1024)."""
    out = set()
    for part in re.split(r"[,\s;]+", str(text or "").strip()):
        if not part:
            continue
        try:
            if "-" in part:
                a, b = part.split("-", 1)
                if "." not in b:
                    b = a.rsplit(".", 1)[0] + "." + b
                lo, hi = int(ipaddress.IPv4Address(a)), int(ipaddress.IPv4Address(b))
                if 0 <= hi - lo < 1024:
                    out.update(str(ipaddress.IPv4Address(i)) for i in range(lo, hi + 1))
            else:
                out.add(str(ipaddress.IPv4Address(part)))
        except ValueError:
            continue
    return sorted(out, key=lambda s: int(ipaddress.IPv4Address(s)))


def ipset(text):
    s = set(expand(text))
    if not s:
        return "none"
    pci = frozenset(f"203.0.113.{i}" for i in range(10, 14))
    return {frozenset(ALL): "all", frozenset(WIN): "windows", frozenset(LNX): "linux", pci: "pci"}.get(frozenset(s), "custom")


SEARCH_LISTS = [
    {"title": "Remote Exploitable", "kind": "Dynamic", "criteria": "Remotely exploitable · severity 3-5", "global": "yes"},
    {"title": "Sev 4-5 Confirmed", "kind": "Dynamic", "criteria": "Severity 4-5 · Confirmed", "global": "yes"},
    {"title": "Accepted Risk", "kind": "Static", "criteria": "QIDs 82003, 90043", "global": "no"},
]
SL_LIBRARY = ["High Severity Windows", "Remote Exploitable Linux", "Top 20 Internet Facing", "Log4j Detection", "Ransomware Targeted"]
TEMPLATES = [{"title": t, "kind": k} for t, k in (("Technical Report", "Scan"), ("Executive Summary", "Scan"), ("Scan Results", "Scan"), ("Patch Report", "Patch"), ("Executive Remediation Report", "Remediation"))]
TPL_LIBRARY = ["High Severity Report", "Unknown Device Report", "PCI Scan Report", "Authentication Report", "Qualified Patch Report"]
REMEDIATION = [("Dana Cruz", "socp_dc05", 14, 6, 9, 3), ("Leo Mendes", "socp_lm02", 8, 2, 15, 0), ("Asha Rao", "socp_ar01", 3, 0, 11, 1), ("Unassigned", "-", 5, 0, 0, 0)]
GROUPS = [{"name": "AG: San Jose", "ips": RANGE, "impact": "Critical", "ipset": "all"}]
HOSTS_ALL = [{"ips": f"{NET}243-{NET}246", "tracking": "NetBIOS", "ipset": "windows"}, {"ips": f"{NET}247-{NET}250", "tracking": "DNS", "ipset": "linux"}]
PROFILE_AUTH = {"title": "Custom Authentication", "ports": "Standard Scan", "performance": "Normal", "detection": "Complete", "windows": "yes", "unix": "yes", "global": "yes"}
AUTH = [{"kind": "Windows", "title": "TRN Domain", "user": "qscanner", "domain": DOMAIN, "type": "Domain"}, {"kind": "Unix", "title": "TRN Linux", "user": "qscanner", "delegation": "Sudo", "ips": f"{NET}247-{NET}250", "ipset": "linux"}]


def console():
    kb = [{"qid": q, "title": t, "severity": s, "type": TYPES[ty], "cve": c, "cvss": v, "category": cat, "remote": r, "patch": p,
           **dict(zip(("threat", "impact", "solution"), KB_TEXT.get(q, ("See vendor advisory for details.", "Depends on the affected service.", "Apply the vendor update or configuration fix."))))} for q, t, s, ty, c, v, cat, r, p in KB]
    return {"hosts": HOSTS, "kb": kb, "range": RANGE, "domain": DOMAIN, "search_lists": SEARCH_LISTS, "sl_library": SL_LIBRARY, "templates": TEMPLATES, "tpl_library": TPL_LIBRARY,
            "remediation": [dict(zip(("name", "login", "open", "overdue", "closed", "ignored"), r)) for r in REMEDIATION], "password": PASSWORD}
