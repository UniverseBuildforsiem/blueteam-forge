"""Cloud Agent labs (Module 1). Fictional SOCP branding; workflow follows a typical cloud-agent deployment guide."""
from vm_shell import CUSTOMER_ID, ACTIVATION_ID, URI, AGENT_UUID, DL, LOG

T = lambda id, title, instruction, hint, solution, check: dict(id=id, title=title, instruction=instruction, hint=hint, solution=solution, check=check)  # noqa: E731
E = lambda event, **match: {"type": "event", "event": event, **({"match": match} if match else {})}  # noqa: E731
A = lambda answer: {"type": "answer", "answer": answer}  # noqa: E731
CTL = '"C:\\Program Files\\SOCP\\CloudAgent\\SOCPAgentCtl.exe"'
UP = {"installed": True, "running": True, "cwd": DL}
INSTALL = f"CustomerId={{{CUSTOMER_ID}}} ActivationId={{{ACTIVATION_ID}}} WebServiceUri={URI}"


def lab(n, slug, title, minutes, diff, summary, intro, tasks, preset=None, free=False):
    return {"id": f"vm-lab-ca-{n:02d}-{slug}", "kind": "lab", "module": 1, "order": n, "free": free, "minutes": minutes, "difficulty": diff, "status": "published",
            "title": f"Lab {n} · {title}", "summary": summary, "intro": intro, "tasks": tasks, **({"preset": preset} if preset else {})}


LABS = [
    lab(1, "deploy", "Cloud Agent Deployment", 15, "Beginner", "Plan a rollout: create an activation key with static tags, the right modules and a seat limit.",
        "Finance is onboarding 25 Windows servers. Before any agent can be installed you need an activation key: it ties agents to your subscription, applies a static tag so the hosts are easy to find, and decides which applications (modules) each agent gets a licence for.\n\nAsset Inventory is always on. FIM, EDR and PM are agent-only applications.\n\nWork in Console → Cloud Agent → Activation Keys.",
        [T("t1", "Review existing keys", "Open the 'Windows Servers' key and note its modules and seat usage.", "Activation Keys tab → click a key title.", "Console → Cloud Agent → Activation Keys → Windows Servers", E("console.activation_key_viewed", name="Windows Servers")),
         T("t2", "Create the Finance key", "Click 'New key'. Title it 'Finance Servers' and add the static tag 'Finance'.", "Both fields are on the first section of the new-key form.", "New key → Title: Finance Servers · Static tag: Finance → Create", E("key.created", title="(?i)finance servers", tag="(?i)finance")),
         T("t3", "Provision VM and PC", "The key must license Vulnerability Management and Policy Compliance (plus the default Asset Inventory).", "Tick VM and PC in the modules list.", "Modules: AI, VM, PC", E("key.created", title="(?i)finance servers", modules="(?i).*VM.*PC.*")),
         T("t4", "Limit the key to 25 agents", "Set the agent limit so the key can't be reused beyond the 25 Finance servers.", "Agent limit field in the same form.", "Agent limit: 25", E("key.created", title="(?i)finance servers", limit="25")),
         T("t5", "Knowledge check", "Name one agent-exclusive application (it can't be done by network scanning).", "Three of the modules can only collect data from an agent.", "FIM, EDR or PM", A("fim|edr|pm|file integrity monitoring|endpoint detection and response|patch management"))], free=True),
    lab(2, "components", "Agent Installation and its Components", 15, "Beginner", "Find install instructions per OS, download the right package and check prerequisites on the host.",
        "Installers and commands are generated per activation key. Each command embeds your CustomerId and ActivationId, so treat it like a credential.\n\nPrerequisites: Windows 7/2008 R2 or later (older needs a proxy), outbound TCP 443 with TLS 1.2+, and administrator/root rights on the host.",
        [T("t1", "Open Install Agent for the Windows key", "Activation Keys → open 'Windows Servers' → Install Agent → choose Windows (.exe) and view the instructions.", "The Install Agent button is inside the key panel.", "Windows Servers → Install Agent → Windows (.exe)", E("install_instructions.viewed", os="(?i)windows \\(\\.exe\\)")),
         T("t2", "Download the .exe installer", "Download the Windows (.exe) package from the instructions panel.", "There's a Download button above the command.", "Click 'Download SOCPCloudAgent.exe'", E("installer.downloaded", os="(?i)windows \\(\\.exe\\)")),
         T("t3", "Compare the Linux package", "Open the Linux (.rpm) instructions and notice the command needs sudo.", "Pick Linux (.rpm) in the OS list.", "Install Agent → Linux (.rpm)", E("install_instructions.viewed", os="(?i)linux.*rpm.*")),
         T("t4", "Check you are elevated", "In the terminal confirm the session is in BUILTIN\\Administrators with a High mandatory level.", "whoami has a /groups switch.", "whoami /groups", E("cmd.whoami")),
         T("t5", "Knowledge check", "Which outbound port must the host reach the platform on?", "Agents talk HTTPS directly or through a proxy.", "443", A("443|tcp 443|tcp/443"))]),
    lab(4, "msi", "MSI Installation", 20, "Intermediate", "Deploy with Windows Installer for software-distribution tools: silent install, properties and verbose logging.",
        "Software-distribution tools (SCCM, Intune, GPO) push the MSI package. The same CustomerId, ActivationId and WebServiceUri go in as MSI properties, and the install must be silent because there's no user session.\n\nThe terminal is elevated and the agent is not installed yet.",
        [T("t1", "Find the MSI package", "List C:\\Users\\student\\Downloads and spot SOCPCloudAgent.msi.", "cd Downloads, then dir.", "cd Downloads\ndir", E("cmd.dir_downloads")),
         T("t2", "Install silently with msiexec", "Run msiexec with /i, the three properties and the quiet switch.", "Without a quiet switch Windows Installer tries to show UI.", f"msiexec /i SOCPCloudAgent.msi {INSTALL} /qn", E("agent.installed_msi")),
         T("t3", "Confirm the service", "Check the SOCPCloudAgent service is RUNNING.", "sc query <service>", "sc query SOCPCloudAgent", E("agent.service_checked")),
         T("t4", "Knowledge check", "Which msiexec switch gives a fully silent install?", "q = quiet, n = no UI.", "/qn", A("/qn|qn|/quiet"))]),
    lab(5, "validate", "Validate Cloud Agent Installation", 15, "Beginner", "Prove an install worked: process, registry HostID, service and console check-in.",
        "The agent was installed on WIN-LAB-01 by a deployment tool overnight. Your job is to validate it before closing the change ticket.",
        [T("t1", "Check the running processes", "List running processes and find the agent process.", "tasklist shows every image.", "tasklist", E("agent.process_checked")),
         T("t2", "Read the registry", "Query HKLM\\SOFTWARE\\SOCP to find the HostID.", "reg query <key>", "reg query HKLM\\SOFTWARE\\SOCP", E("agent.registry_checked")),
         T("t3", "Record the HostID", "Enter the HostID value.", "It's a UUID in the reg query output.", AGENT_UUID, A(AGENT_UUID)),
         T("t4", "Check the service state", "Confirm the service is RUNNING.", "sc query or Get-Service.", "sc query SOCPCloudAgent", E("agent.service_checked")),
         T("t5", "Confirm check-in", "In Console → Cloud Agent → Agents open WIN-LAB-01.", "Click the row.", "Console → Agents → WIN-LAB-01", E("console.agent_viewed", host="WIN-LAB-01"))], preset=UP),
    lab(6, "logs", "Cloud Agent Log File", 20, "Intermediate", "Navigate the agent data folder, read Log.txt, filter errors and package logs for support.",
        f"A ticket says WIN-LAB-01 showed a failure during first sync. Logs live in the hidden folder C:\\ProgramData\\SOCP\\CloudAgent\\ (Log.txt). Find what failed, whether it recovered, and package the folder for technical support.",
        [T("t1", "Open the agent data folder", "cd into C:\\ProgramData\\SOCP\\CloudAgent and list it.", "Hidden folders still work with cd.", "cd C:\\ProgramData\\SOCP\\CloudAgent\ndir", E("cmd.dir_logdir")),
         T("t2", "Read the log", "Print Log.txt.", "type or Get-Content.", "type Log.txt", E("agent.log_reviewed")),
         T("t3", "Filter for errors", "Show only lines containing 'error'.", "findstr /i \"text\" <file>", 'findstr /i "error" Log.txt', E("agent.log_searched")),
         T("t4", "What failed?", "Enter the HTTP status code of the failed manifest download.", "It's in the [Error] line.", "503", A("503")),
         T("t5", "Package logs for support", "Zip the whole agent folder to the Desktop for the support case.", "PowerShell Compress-Archive.", 'Compress-Archive -Path "C:\\ProgramData\\SOCP\\CloudAgent" -DestinationPath C:\\Users\\student\\Desktop\\agent-logs.zip', E("agent.logs_zipped"))], preset=UP),
    lab(7, "assets", "Asset Details and Queries", 15, "Beginner", "Search agents, open asset details and save a reusable query.",
        "Management wants to know what the platform knows about WIN-LAB-01, and wants a saved search for all Windows servers. Work in Console → Cloud Agent → Agents.",
        [T("t1", "Search for the host", "Search agents for WIN-LAB-01.", "Type in the agent search box and press Enter.", "Search: WIN-LAB-01", E("agent.searched", q="(?i).*win-lab-01.*")),
         T("t2", "View asset details", "Open WIN-LAB-01's details.", "Click the row.", "Agents → WIN-LAB-01", E("console.agent_viewed", host="WIN-LAB-01")),
         T("t3", "Inventory size", "How many software items did the agent inventory?", "Look in the asset details.", "412", A("412")),
         T("t4", "Query by tag", "Search agents by the tag 'Windows Servers'.", "Searches match tag names too.", "Search: Windows Servers", E("agent.searched", q="(?i).*windows servers.*")),
         T("t5", "Save the query", "Save the search as 'All Windows Servers'.", "Use 'Save query' next to the search box.", "Save query → All Windows Servers", E("query.saved", name="(?i)all windows servers"))], preset=UP),
    lab(8, "selfprotect", "Windows Self Protection Feature", 20, "Intermediate", "Stop users and malware from tampering with the agent by enabling self-protection.",
        "During an incident an attacker tried to kill security agents. Self-protection makes the agent refuse stop, kill and uninstall attempts from the host. It's set in a configuration profile.",
        [T("t1", "Check the current status", "Ask the agent for its self-protection status.", f"{CTL} SelfProtection Status", f"{CTL} SelfProtection Status", E("agent.selfprot_checked")),
         T("t2", "Enable it in the profile", "Console → Cloud Agent → Config Profiles → 'Default Windows Profile' → turn on Self Protection → Save.", "Toggle is in the profile panel.", "Config Profiles → Default Windows Profile → Self Protection ON → Save", E("selfprot.enabled")),
         T("t3", "Try to stop the service", "Attempt net stop on the agent service. It should be refused.", "net stop <service>", "net stop SOCPCloudAgent", E("agent.stop_blocked")),
         T("t4", "Try to kill the process", "Attempt taskkill on the agent process. It should be refused.", "taskkill /im <image> /f", "taskkill /im SOCPCloudAgent.exe /f", E("agent.kill_blocked"))], preset=UP),
    lab(9, "scan", "Scan on Demand", 15, "Beginner", "Trigger VM, PC and inventory scans from the host instead of waiting for the next interval.",
        "A critical patch was just applied to WIN-LAB-01. Rather than wait up to 4 hours for the next scan interval, trigger scans on demand with SOCPAgentCtl.exe and confirm them in the log.",
        [T("t1", "Run a VM scan", "Trigger an on-demand vulnerability scan.", "ScanOnDemand Type=VM", f"{CTL} ScanOnDemand Type=VM", E("agent.scan_vm")),
         T("t2", "Run a PC scan", "Trigger an on-demand policy compliance scan.", "Type=PC", f"{CTL} ScanOnDemand Type=PC", E("agent.scan_pc")),
         T("t3", "Refresh inventory", "Trigger an on-demand inventory scan.", "Type=Inventory", f"{CTL} ScanOnDemand Type=Inventory", E("agent.scan_inventory")),
         T("t4", "Confirm in the log", "Read the last lines of the log and find the on-demand entries.", "Get-Content <file> -Tail 5", f'Get-Content "{LOG}" -Tail 5', E("agent.log_reviewed")),
         T("t5", "Knowledge check", "What's the minimum scan interval in hours for VM data?", "Shorter than that needs scan on demand.", "4", A("4|4 hours"))], preset=UP),
    lab(10, "lifecycle", "Activate, Deactivate and Uninstall Agents", 20, "Intermediate", "Manage module licences on an agent, then decommission it cleanly.",
        "WIN-LAB-01 is being moved out of PCI scope and will later be retired. Deactivating a module frees its licence but inventory keeps flowing. Uninstalling removes the agent and frees every licence.",
        [T("t1", "Deactivate PC", "Open WIN-LAB-01 in Agents and deactivate the Policy Compliance module.", "Module buttons are in the agent panel.", "Agents → WIN-LAB-01 → Deactivate PC", E("console.module_deactivated", module="PC")),
         T("t2", "Re-activate PC", "Change of plan: reactivate Policy Compliance.", "Same panel.", "Agents → WIN-LAB-01 → Activate PC", E("console.module_activated", module="PC")),
         T("t3", "Request uninstall from the console", "Use 'Uninstall agent' on WIN-LAB-01. It takes effect at the next check-in.", "Bottom of the agent panel.", "Agents → WIN-LAB-01 → Uninstall agent", E("console.agent_uninstall_requested", host="WIN-LAB-01")),
         T("t4", "Uninstall on the host", "Run the local uninstaller to finish now.", "Uninstall.exe Uninstall=True", '"C:\\Program Files\\SOCP\\CloudAgent\\Uninstall.exe" Uninstall=True', E("agent.uninstalled")),
         T("t5", "Verify removal", "Confirm the service no longer exists.", "sc query should return 1060.", "sc query SOCPCloudAgent", E("agent.service_missing"))], preset=UP),
]
