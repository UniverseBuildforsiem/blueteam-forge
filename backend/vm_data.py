"""Seed content and fake console data for the SOCP Vulnerability Management Lab. All names, hosts, IDs and vulnerabilities are fictional."""
import random
from vm_shell import CUSTOMER_ID, ACTIVATION_ID, URI, SHA256, AGENT_UUID, HOST

MODULES = [
    {"id": 1, "title": "Cloud Agent", "summary": "Deploy, install, validate, read logs, scan on demand and uninstall the agent."},
    {"id": 2, "title": "Vulnerability Management", "summary": "Assets, tags, asset groups, scans, knowledge base, search lists, reports, users and remediation."},
    {"id": 3, "title": "Web Application Scanning", "summary": "Web app setup, sitemap, option profiles, search lists, scheduling and reports."},
    {"id": 4, "title": "PCI DSS & Policy Compliance", "summary": "Scenario quizzes and compliance checklists."},
]

EVENTS = {
    "cmd.dir_downloads": "Terminal: listed the Downloads folder", "cmd.hash_verified": "Terminal: verified installer SHA256",
    "agent.installed": "Terminal: agent installed with valid keys", "agent.service_checked": "Terminal: queried the agent service",
    "agent.service_stopped": "Terminal: stopped the agent service", "agent.service_started": "Terminal: started the agent service",
    "agent.log_reviewed": "Terminal: read the agent log", "agent.log_searched": "Terminal: searched the agent log (findstr)",
    "agent.scan_on_demand": "Terminal: ran an on-demand VM scan", "agent.uninstalled": "Terminal: uninstalled the agent",
    "console.activation_key_viewed": "Console: opened an activation key", "console.agent_viewed": "Console: opened an agent's details (match host)",
    "tag.created": "Console: created a tag (match name)", "asset_group.created": "Console: created an asset group (match name)",
    "scan.launched": "Console: launched a scan (match title/target/profile)", "scan.scheduled": "Console: scheduled a scan (match frequency)",
    "report.generated": "Console: generated a report (match template/format)", "user.created": "Console: added a user (match role)",
    "kb.searched": "Console: searched the knowledge base (match q)", "asset.searched": "Console: searched the asset inventory (match q)",
    "cmd.whoami": "Terminal: checked user/privileges (whoami)", "cmd.dir_logdir": "Terminal: listed the agent data folder",
    "agent.installed_msi": "Terminal: installed via msiexec /qn", "agent.process_checked": "Terminal: listed processes (tasklist)",
    "agent.registry_checked": "Terminal: queried HKLM\\SOFTWARE\\SOCP", "agent.logs_zipped": "Terminal: zipped agent folder for support",
    "agent.selfprot_checked": "Terminal: checked self-protection status", "agent.stop_blocked": "Terminal: service stop blocked by self-protection",
    "agent.kill_blocked": "Terminal: taskkill blocked by self-protection", "agent.killed": "Terminal: agent process killed",
    "agent.service_missing": "Terminal: service query shows not installed (1060)",
    "agent.scan_vm": "Terminal: on-demand VM scan", "agent.scan_pc": "Terminal: on-demand PC scan", "agent.scan_inventory": "Terminal: on-demand inventory scan",
    "key.created": "Console: created an activation key (match title/tag/modules/limit)", "install_instructions.viewed": "Console: opened install instructions (match os)",
    "installer.downloaded": "Console: downloaded an installer (match os)", "agent.searched": "Console: searched agents (match q)",
    "query.saved": "Console: saved an agent search query (match name)", "selfprot.enabled": "Console: enabled self-protection in a profile", "selfprot.disabled": "Console: disabled self-protection in a profile",
    "profile.saved": "Console: saved a configuration profile", "console.module_deactivated": "Console: deactivated a module on an agent (match module)",
    "console.module_activated": "Console: activated a module on an agent (match module)", "console.agent_uninstall_requested": "Console: requested agent uninstall (match host)",
    "cmd.ping": "Terminal: pinged a lab target", "cmd.nslookup": "Terminal: nslookup on a lab target", "cmd.nbtstat": "Terminal: nbtstat -A on a lab target",
    "cmd.portcheck": "Terminal: Test-NetConnection port check (match command)", "cmd.netuser": "Terminal: net user qscanner /domain", "cmd.sudo_check": "Terminal: ssh sudo -l on a Linux target",
    "hosts.added": "Console: added host IPs (match ipset all/windows/linux/custom, tracking)", "tag.rule_tested": "Console: tested a tag rule (match engine/query)",
    "inventory.queried": "Console: ran an inventory query (match q)", "auth.created": "Console: created an authentication record (match kind/type/user/domain/delegation/ipset)",
    "option_profile.created": "Console: created an option profile (match title/ports/performance/detection/windows/unix/global)", "profile.ports_viewed": "Console: viewed the standard port list",
    "scan.results_viewed": "Console: viewed scan results", "storage.saved": "Console: saved scan storage (match months)", "schedule.run_now": "Console: ran a schedule now (match title)",
    "kb.viewed": "Console: opened a QID (match qid)", "kb.filtered": "Console: filtered the KnowledgeBase (match severity/type)",
    "searchlist.created": "Console: created a search list (match title/kind/severity/category/qids/global)", "searchlist.imported": "Console: imported a library search list (match title)",
    "template.created": "Console: created a report template (match title/findings/trending/filter/searchlist)", "template.imported": "Console: imported a library template (match title)",
    "report.viewed": "Console: opened a report (match template)", "report.downloaded": "Console: downloaded a report (match format)",
    "report.scheduled": "Console: scheduled a report (match frequency/email/start)", "report.schedules_viewed": "Console: opened report schedules",
    "user.email_opened": "Console: opened the registration email", "user.activated": "Console: activated a new user account",
    "remediation.policy_created": "Console: created a remediation policy (match title/action/assignee/vulns/target/due/reopen)",
    "remediation.policy_moved": "Console: moved a remediation policy (match title/position)", "remediation.tickets_viewed": "Console: opened remediation tickets",
}

T = lambda id, title, instruction, hint, solution, check: dict(id=id, title=title, instruction=instruction, hint=hint, solution=solution, check=check)  # noqa: E731

LAB1 = {
    "id": "vm-lab-agent-win-cli", "kind": "lab", "module": 1, "order": 3, "free": False, "minutes": 25, "difficulty": "Beginner", "status": "published",
    "title": "Lab 3 · Windows Command-line Installation",
    "summary": "Install the SOCP Cloud Agent on a Windows server from an elevated prompt, validate the service and review the agent log.",
    "intro": "You are a Tier-1 analyst onboarding the new server WIN-LAB-01 into vulnerability management.\n\nThe installer has been downloaded for you. Get the activation keys from the console, verify the installer, install it from the command line, then prove it works: service running, log healthy, agent visible in the console.\n\nThe terminal on the right is an elevated (Administrator) Command Prompt. Type 'help' for supported commands.",
    "tasks": [
        T("t1", "Locate the installer", "Go to C:\\Users\\student\\Downloads and list its contents.", "Use cd Downloads, then dir.", "cd Downloads\ndir", {"type": "event", "event": "cmd.dir_downloads"}),
        T("t2", "Get the activation keys", "In the Console tab open Cloud Agent → Activation Keys and open the 'Windows Servers' key to reveal the CustomerId, ActivationId and WebServiceUri.", "Click the key name in the Activation Keys table.", "Console → Cloud Agent → Activation Keys → click 'Windows Servers'.", {"type": "event", "event": "console.activation_key_viewed"}),
        T("t3", "Verify the installer checksum", "Compute the SHA256 hash of SOCPCloudAgent.exe and compare it with the checksum shown under the activation key.", "certutil can hash files. Pick the right algorithm.", "certutil -hashfile SOCPCloudAgent.exe SHA256", {"type": "event", "event": "cmd.hash_verified"}),
        T("t4", "Install the agent", "Run the installer with the CustomerId, ActivationId and WebServiceUri from the key.", "Format: SOCPCloudAgent.exe CustomerId={...} ActivationId={...} WebServiceUri=...", f"SOCPCloudAgent.exe CustomerId={{{CUSTOMER_ID}}} ActivationId={{{ACTIVATION_ID}}} WebServiceUri={URI}", {"type": "event", "event": "agent.installed"}),
        T("t5", "Validate the service", "Confirm the SOCPCloudAgent service is RUNNING.", "sc query works with the service name.", "sc query SOCPCloudAgent", {"type": "event", "event": "agent.service_checked"}),
        T("t6", "Review the agent log", "Read C:\\ProgramData\\SOCP\\CloudAgent\\Log.txt and check provisioning succeeded.", "type \"<path>\" prints a file. Quote paths with spaces.", 'type "C:\\ProgramData\\SOCP\\CloudAgent\\Log.txt"', {"type": "event", "event": "agent.log_reviewed"}),
        T("t7", "Record the Agent ID", "Enter the AgentId the platform assigned (from the 'Provisioning successful' log line).", "Look for 'AgentId=' in the log.", AGENT_UUID, {"type": "answer", "answer": AGENT_UUID}),
        T("t8", "Confirm in the console", "Open Console → Cloud Agent → Agents and open WIN-LAB-01's details. It should show Active.", "The new agent appears at the top of the Agents table after install.", "Console → Cloud Agent → Agents → click WIN-LAB-01.", {"type": "event", "event": "console.agent_viewed", "match": {"host": HOST}}),
    ],
}

QUIZ1 = {
    "id": "vm-quiz-agent-basics", "kind": "quiz", "module": 1, "order": 11, "free": False, "minutes": 8, "difficulty": "Beginner", "status": "published",
    "title": "Cloud Agent Fundamentals Quiz", "summary": "Check your understanding of agent deployment and troubleshooting.",
    "questions": [
        {"q": "Which two values identify your subscription and the key used to activate an agent?", "options": ["CustomerId and ActivationId", "Hostname and IP", "AgentId and Manifest", "Username and password"], "answer": 0, "explain": "The CustomerId identifies the subscription; the ActivationId is the deployment key."},
        {"q": "Why verify the installer's SHA256 before installing?", "options": ["To speed up install", "To confirm the file wasn't tampered with or corrupted", "It's required for licensing", "To get the AgentId"], "answer": 1, "explain": "Hash comparison proves integrity against the published checksum."},
        {"q": "The log shows 'Provisioning failed (0x80070005): ActivationId not recognised'. What is the best next step?", "options": ["Reinstall Windows", "Disable the firewall", "Copy the active key again from the console", "Wait 24 hours"], "answer": 2, "explain": "The key is wrong or revoked: use the current key from Activation Keys."},
        {"q": "Which command confirms the agent service is running?", "options": ["ipconfig", "sc query SOCPCloudAgent", "dir", "hostname"], "answer": 1, "explain": "sc query shows the service STATE."},
        {"q": "A single 'Manifest download failed: HTTP 503 (retrying)' line followed by success means…", "options": ["Install failed", "A transient platform error that recovered", "The key was revoked", "The host is infected"], "answer": 1, "explain": "Retry then success = transient; keep monitoring only if it repeats."},
    ],
}

CTF1 = {
    "id": "vm-ctf-agent-logs", "kind": "ctf", "module": 1, "order": 12, "free": False, "minutes": 10, "difficulty": "Beginner", "status": "published",
    "title": "Agent Log Hunt CTF", "summary": "Pull answers out of the agent you installed in Lab 1.",
    "challenges": [
        {"q": "What manifest version did the agent download? (format VULNSIGS-x.y.z)", "answer": "VULNSIGS-2.6.81", "points": 100, "hint": "Search the log for 'Manifest'."},
        {"q": "How many software items did inventory collection find?", "answer": "412", "points": 100, "hint": "Look for 'Inventory collection completed'."},
        {"q": "What HTTP status caused the first manifest download to fail?", "answer": "503", "points": 150, "hint": "findstr /i \"error\" on the log."},
    ],
}

from vm_labs import LABS  # noqa: E402
from vm_labs2 import SEED2  # noqa: E402
import vm_m2  # noqa: E402

SEED_VERSION = 3
SEED = LABS[:2] + [LAB1] + LABS[2:] + [QUIZ1, CTF1] + SEED2

VULNS = [
    (91001, "SOCP Demo: Outdated OpenSSL-like library (fictional)", 5, "Windows/Linux"), (91002, "Fictional SMBv1 enabled on host", 4, "Windows"),
    (91003, "Demo web server banner discloses version", 2, "Web"), (91004, "Fictional TLS 1.0 still accepted", 3, "General"),
    (91005, "Demo Java runtime out of support", 4, "Windows"), (91006, "Fictional remote desktop weak encryption", 3, "Windows"),
    (91007, "Demo kernel privilege escalation (fictional)", 5, "Linux"), (91008, "Default SNMP community string 'public' (demo)", 3, "Network"),
    (91009, "Demo missing monthly OS security rollup", 4, "Windows"), (91010, "Fictional self-signed certificate in use", 2, "General"),
    (91011, "Demo directory listing enabled", 2, "Web"), (91012, "Fictional SQL injection in demo login form", 5, "Web"),
    (91013, "Demo browser plugin end-of-life", 3, "Windows"), (91014, "Fictional NTP mode 6 queries allowed", 2, "Network"),
    (91015, "Demo password policy below baseline", 3, "Policy"), (91016, "ICMP timestamp response (demo)", 1, "Network"),
]


def console_data():
    rnd = random.Random(42)
    oses = ["Windows Server 2022", "Windows Server 2019", "Windows 11 Enterprise", "Ubuntu 22.04", "RHEL 9", "Cisco IOS (demo)"]
    tags = ["Production", "Finance", "DMZ", "PCI", "Workstations", "Linux Servers", "Windows Servers"]
    assets = []
    for i in range(36):
        os_ = rnd.choice(oses)
        host = ("FIN-" if i % 5 == 0 else "SRV-" if "Server" in os_ else "WS-" if "Windows 11" in os_ else "LNX-" if os_[0] in "UR" else "NET-") + f"{100 + i:03d}"
        sev = [rnd.randint(0, 3) for _ in range(5)]
        assets.append({"id": 5000 + i, "host": host, "ip": f"10.20.{rnd.randint(1, 60)}.{rnd.randint(2, 250)}", "os": os_,
                       "tags": sorted({rnd.choice(tags), "Windows Servers" if "Server" in os_ and "Windows" in os_ else rnd.choice(tags)}),
                       "agent": "Active" if i % 3 else "Not installed", "last_scan": f"2026-06-{rnd.randint(1, 11):02d}", "vulns": sev,
                       "qids": rnd.sample([v[0] for v in VULNS], 4)})
    agents = [{"host": a["host"], "ip": a["ip"], "os": a["os"], "status": "Active", "version": "6.2.0.41", "last_checkin": "2026-06-12 09:5" + str(i % 10), "key": "Windows Servers" if "Windows" in a["os"] else "Linux Fleet"}
              for i, a in enumerate(assets) if a["agent"] == "Active"][:12]
    return {
        "brand": "SOCP Sentinel VMDR", "assets": assets, "agents": agents, "tags": tags,
        "kb": [{"qid": q, "title": t, "severity": s, "category": c, "cve": f"FAKE-CVE-{2026}-{q % 1000:04d}", "patch": s >= 3} for q, t, s, c in VULNS],
        "keys": [{"name": "Windows Servers", "customer_id": CUSTOMER_ID, "activation_id": ACTIVATION_ID, "uri": URI, "sha256": SHA256, "used": 9, "limit": 50, "status": "Active", "modules": ["VM", "PC", "Inventory"]},
                 {"name": "Linux Fleet", "customer_id": CUSTOMER_ID, "activation_id": "9b8a7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d", "uri": URI, "sha256": SHA256, "used": 3, "limit": 25, "status": "Active", "modules": ["VM"]},
                 {"name": "Old Pilot (revoked)", "customer_id": CUSTOMER_ID, "activation_id": "11111111-2222-4333-8444-555555555555", "uri": URI, "sha256": SHA256, "used": 12, "limit": 12, "status": "Revoked", "modules": ["VM"]}],
        "users": [{"name": "Asha Rao", "login": "socp_ar01", "role": "Manager", "status": "Active"}, {"name": "Leo Mendes", "login": "socp_lm02", "role": "Scanner", "status": "Active"},
                  {"name": "Priya Nair", "login": "socp_pn03", "role": "Reader", "status": "Active"}, {"name": "Omar Haddad", "login": "socp_oh04", "role": "Unit Manager", "status": "Inactive"},
                  {"name": "Dana Cruz", "login": "socp_dc05", "role": "Remediation User", "status": "Active"}],
        "m2": vm_m2.console(),
        "profiles": ["Initial Options (default)", "Full TCP + Auth Scan", "Light Inventory Scan", "PCI External Scan"],
        "templates": ["Technical Report", "Executive Summary", "Scan Results", "Patch Report", "PCI Compliance"],
        "new_agent": {"host": HOST, "ip": "10.20.30.41", "os": "Windows Server 2022", "status": "Active", "version": "6.2.0.41", "last_checkin": "2026-06-12 10:16", "key": "Windows Servers", "software": 412, "ports": "135, 445, 3389, 5985",
                  "tags": ["Cloud Agent", "Windows Servers", "Production"], "vulns": [2, 5, 7, 3, 1], "profile": "Default Windows Profile"},
    }
