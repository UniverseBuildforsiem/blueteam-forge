import random

HOSTS = ["FIN-WS-07", "WS-HR-03", "WS-MKT-11", "IT-SRV-02", "WS-ENG-22", "WS-SALES-05"]
USERS = ["j.morris", "a.kumar", "m.shah", "h.lee", "s.chen", "r.ortiz"]
BAD_IPS = ["185.220.101.45", "45.155.205.12", "91.243.44.10", "193.42.33.7", "103.77.192.9"]

TEMPLATES = [
    {"category": "Phishing", "severity": "High", "verdict": "TP", "rule": "SOC101 - Suspicious Email Attachment",
     "title": "Payroll update requires action", "description": "A user forwarded an email asking them to confirm payroll details via an attached document.",
     "evidence": ["Authentication-Results: spf=fail dkim=none dmarc=fail header.from=hr-payro11.com",
                  "Sandbox: Payroll_Update.xlsm -> EXCEL.EXE -> powershell.exe -w hidden -enc ...",
                  "Proxy: {host} GET http://{ip}/p.bin 200", "Intel: {ip} listed on 9 blocklists"],
     "keywords": ["dmarc", "macro", "powershell", "{ip}", "isolate", "block"]},
    {"category": "Brute Force", "severity": "Medium", "verdict": "TP", "rule": "SOC112 - Brute Force Detected",
     "title": "RDP logon storm on exposed server", "description": "Hundreds of failed RDP logons for one account, followed by silence.",
     "evidence": ["310 x EventID 4625 user={user} src={ip} LogonType=10", "1 x EventID 4624 user={user} src={ip} LogonType=10",
                  "Geo: {ip} -> hosting provider, never seen before", "{user} has no remote-work exception"],
     "keywords": ["4625", "4624", "{ip}", "reset", "password", "mfa"]},
    {"category": "Malware", "severity": "Low", "verdict": "FP", "rule": "SOC134 - Persistence via Scheduled Task",
     "title": "New scheduled task on IT server", "description": "EDR flagged a scheduled task created by the backup service account.",
     "evidence": ["Change ticket CHG-{n} approved for backup task on {host}", "Script signed by internal IT code-signing certificate",
                  "Task runs nightly backup to internal NAS only", "No external network connections observed"],
     "keywords": ["change", "ticket", "signed", "legitimate", "tuning"]},
    {"category": "Ransomware", "severity": "Critical", "verdict": "TP", "rule": "SOC145 - Ransomware Behavior",
     "title": "Shadow copies deleted on {host}", "description": "EDR recorded shadow copy deletion followed by mass file writes.",
     "evidence": ["4688: cmd.exe /c vssadmin delete shadows /all /quiet on {host}", "8,400 files renamed to *.crypt in 2 minutes",
                  "Unsigned binary C:\\Users\\Public\\upd.exe started by {user}", "Outbound 443 to {ip} (1.1 GB)"],
     "keywords": ["isolate", "vssadmin", "shadow", "upd.exe", "{ip}", "backup"]},
    {"category": "Lateral Movement", "severity": "High", "verdict": "TP", "rule": "SOC151 - Remote Service Installation",
     "title": "Remote service created from workstation", "description": "A workstation installed a service on three servers within five minutes.",
     "evidence": ["7045: Service 'WinSvcUpd' installed on FS-01, SQL-02, DC-01 by {user}", "4624 LogonType 3 from {host} to all three servers",
                  "{user} is not a member of any admin group", "{host} ran an unsigned credential-dumping tool 10 minutes earlier"],
     "keywords": ["7045", "lateral", "{host}", "credential", "disable", "isolate"]},
    {"category": "Phishing", "severity": "Medium", "verdict": "FP", "rule": "SOC177 - Lookalike Sender Domain",
     "title": "Vendor invoice from new domain", "description": "Mail gateway flagged an invoice email from a recently registered domain.",
     "evidence": ["SPF pass, DKIM pass, DMARC pass for vendor-billing.io", "Procurement confirms vendor migrated to vendor-billing.io last week (ticket PRC-{n})",
                  "Attachment is a plain PDF, sandbox shows no active content", "Domain registered by the vendor's known registrar account"],
     "keywords": ["dmarc", "pass", "procurement", "legitimate", "pdf", "benign"]},
]


def drill_for(day: str):
    rnd = random.Random(day)
    t = TEMPLATES[rnd.randrange(len(TEMPLATES))]
    v = {"host": rnd.choice(HOSTS), "user": rnd.choice(USERS), "ip": rnd.choice(BAD_IPS), "n": rnd.randint(4000, 9999)}
    fill = lambda s: s.format(**v)
    return {"id": f"drill-{day}", "date": day, "title": fill(t["title"]), "category": t["category"], "severity": t["severity"],
            "points": 100, "bonus_xp": 50, "description": fill(t["description"]), "verdict": t["verdict"],
            "alert": {"rule": t["rule"], "time": f"{day} 0{rnd.randint(1, 9)}:{rnd.randint(10, 59)}", "host": v["host"], "user": v["user"]},
            "evidence": [fill(e) for e in t["evidence"]], "keywords": [fill(k) for k in t["keywords"]]}
