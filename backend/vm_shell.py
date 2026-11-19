"""Simulated Windows shell for the SOCP Cloud Agent labs. Fake data only."""
import re
import shlex

DL = r"C:\Users\student\Downloads"
HOME = r"C:\Users\student"
INSTALL_DIR = r"C:\Program Files\SOCP\CloudAgent"
LOG = r"C:\ProgramData\SOCP\CloudAgent\Log.txt"
EXE = "SOCPCloudAgent.exe"
CUSTOMER_ID = "7a1c2e9b-4d3f-4b8a-9c11-5e2f6a7b8c90"
ACTIVATION_ID = "3f9e8d7c-6b5a-4c3d-8e1f-0a9b8c7d6e5f"
URI = "https://agent.socp-vmdr.test/CloudAgent/"
AGENT_UUID = "c0ffee00-1ab5-4e2d-9f00-00000000a11e"
SHA256 = "4E1F0C9A7B2D63E58F10A4C7D9B3E2F6A8C5D1E0B7F4A39C6E2D8B1A0F5C7E93"
HOST = "WIN-LAB-01"
SERVICE = "SOCPCloudAgent"
GUID = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"

HELP = """Supported commands in this lab (simulated):
  cd <dir>            dir / ls            cls / clear         whoami / hostname
  ipconfig            certutil -hashfile <file> SHA256
  SOCPCloudAgent.exe CustomerId={...} ActivationId={...} WebServiceUri=<uri>
  sc query SOCPCloudAgent         Get-Service SOCPCloudAgent
  net stop|start SOCPCloudAgent   type <file> / Get-Content <file> [-Tail N]
  findstr /i "<text>" <file>
  msiexec /i SOCPCloudAgent.msi CustomerId={...} ActivationId={...} WebServiceUri=<uri> /qn
  whoami /groups      tasklist            taskkill /im <image> /f
  reg query HKLM\\SOFTWARE\\SOCP
  Compress-Archive -Path <folder> -DestinationPath <file.zip>
  "C:\\Program Files\\SOCP\\CloudAgent\\SOCPAgentCtl.exe" ScanOnDemand Type=VM|PC|Inventory
  "C:\\Program Files\\SOCP\\CloudAgent\\SOCPAgentCtl.exe" SelfProtection Status
  "C:\\Program Files\\SOCP\\CloudAgent\\Uninstall.exe" Uninstall=True"""


MSI = "SOCPCloudAgent.msi"


def fresh(preset=None):
    return {"cwd": HOME, "installed": False, "running": False, "scans": 0, "selfprot": False, **(preset or {})}


def log_lines(st):
    if not st["installed"]:
        return []
    out = [
        "2026-06-12 10:14:02.118 [Info] SOCP Cloud Agent 6.2.0.41 starting (Windows Server 2022, x64)",
        f"2026-06-12 10:14:02.240 [Info] CustomerId={CUSTOMER_ID}",
        f"2026-06-12 10:14:02.241 [Info] WebServiceUri={URI}",
        "2026-06-12 10:14:03.507 [Warn] Proxy auto-detect returned no proxy; using direct connection",
        "2026-06-12 10:14:04.912 [Info] Provisioning request sent (ActivationId=3f9e****6e5f)",
        f"2026-06-12 10:14:06.033 [Info] Provisioning successful. AgentId={AGENT_UUID}",
        "2026-06-12 10:14:06.540 [Info] Downloading configuration profile 'Default Windows Profile'",
        "2026-06-12 10:14:08.771 [Error] Manifest download attempt 1 failed: HTTP 503 (retrying in 30s)",
        "2026-06-12 10:14:39.102 [Info] Manifest VULNSIGS-2.6.81 downloaded and verified",
        "2026-06-12 10:15:20.664 [Info] Inventory collection completed (412 software items)",
        "2026-06-12 10:16:02.011 [Info] Vulnerability scan delta uploaded (snapshot 1)",
        "2026-06-12 10:16:02.013 [Info] Agent status: Active",
    ]
    out += [f"2026-06-12 10:{20 + i:02d}:00.000 [Info] On-demand VM scan requested; snapshot uploaded" for i in range(st.get("scans", 0))]
    if not st["running"]:
        out.append("2026-06-12 10:30:00.000 [Info] Service stop requested by administrator")
    return out


def norm_path(cwd, arg):
    a = arg.strip().strip('"')
    if re.match(r"^[a-zA-Z]:\\", a):
        return a.rstrip("\\") or a
    if a in ("..", "..\\"):
        return cwd.rsplit("\\", 1)[0] if cwd.count("\\") > 1 else cwd[:3]
    if a in (".", ""):
        return cwd
    return f"{cwd}\\{a}".replace("\\\\", "\\")


def same(a, b):
    return a.lower().rstrip("\\") == b.lower().rstrip("\\")


def listing(path, st):
    p = path.lower()
    if same(p, DL):
        return f""" Volume in drive C has no label.
 Directory of {DL}

06/12/2026  09:58 AM    <DIR>          .
06/12/2026  09:58 AM    <DIR>          ..
06/12/2026  09:57 AM        42,116,608 {EXE}
06/12/2026  09:57 AM        39,845,888 {MSI}
06/10/2026  03:12 PM           184,220 VPN-Setup-Guide.pdf
               3 File(s)     82,146,716 bytes""", ["cmd.dir_downloads"]
    if same(p, HOME):
        return f" Directory of {HOME}\n\n<DIR>  Desktop\n<DIR>  Documents\n<DIR>  Downloads", []
    if same(p, INSTALL_DIR) and st["installed"]:
        return f" Directory of {INSTALL_DIR}\n\n{EXE}\nSOCPAgentCtl.exe\nUninstall.exe\nconfig.db", []
    if same(p, r"C:\ProgramData\SOCP\CloudAgent") and st["installed"]:
        return " Directory of C:\\ProgramData\\SOCP\\CloudAgent\n\n06/12/2026  10:16 AM           18,204 Log.txt\n06/12/2026  10:14 AM    <DIR>          Manifests\n06/12/2026  10:16 AM    <DIR>          Snapshots\n06/12/2026  10:14 AM               512 Config.db", ["cmd.dir_logdir"]
    return "File Not Found", []


def install(args, st, msi=False):
    kv = {}
    for a in args:
        if "=" in a:
            k, v = a.split("=", 1)
            kv[k.lower()] = v.strip().strip("{}").strip('"')
    if st["installed"]:
        return "SOCP Cloud Agent is already installed on this host. Uninstall it first to reinstall.", []
    if not same(st["cwd"], DL):
        if msi:
            return f"This installation package could not be opened. Verify that the package exists in the current folder ({st['cwd']}).\nTip: cd to {DL} first.", []
        return f"'{EXE}' is not recognized as an internal or external command,\noperable program or batch file.\nTip: the installer is in {DL} — cd there first.", []
    missing = [k for k, n in (("customerid", "CustomerId"), ("activationid", "ActivationId"), ("webserviceuri", "WebServiceUri")) if k not in kv]
    if missing:
        return f"Setup error 1639: missing required parameter(s): {', '.join(n for k, n in (('customerid', 'CustomerId'), ('activationid', 'ActivationId'), ('webserviceuri', 'WebServiceUri')) if k in missing)}.\nUsage: {EXE} CustomerId={{GUID}} ActivationId={{GUID}} WebServiceUri=<platform URI>", []
    for k, name in (("customerid", "CustomerId"), ("activationid", "ActivationId")):
        if not re.fullmatch(GUID, kv[k]):
            return f"Setup error 1639: {name} '{kv[k]}' is not a valid GUID (expected xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).", []
    if kv["customerid"].lower() != CUSTOMER_ID:
        return "Provisioning failed (0x80070057): CustomerId does not match any subscription.\nCopy it from Console → Cloud Agent → Activation Keys.", []
    if kv["activationid"].lower() != ACTIVATION_ID:
        return "Provisioning failed (0x80070005): ActivationId not recognised or revoked.\nCopy the active key from Console → Cloud Agent → Activation Keys.", []
    if kv["webserviceuri"].rstrip("/").lower() != URI.rstrip("/").lower():
        return f"Provisioning failed (0x80072EE7): could not reach platform at '{kv['webserviceuri']}'.\nUse the WebServiceUri shown with the activation key.", []
    if msi and not any(a.lower() in ("/qn", "/quiet") for a in args):
        return "Windows Installer: this host has no interactive desktop session.\nAdd /qn (quiet, no UI) for an unattended install. Optional: /l*v install.log for verbose logging.", []
    st.update(installed=True, running=True)
    if msi:
        return f"""MSI (s) (C4:18): Product: SOCP Cloud Agent -- Installation operation completed successfully.
MSI (s) (C4:18): Windows Installer installed the product. Product Version: 6.2.0.41. Installation success or error status: 0.
Service {SERVICE} registered and started; provisioning with {URI} ... success""", ["agent.installed", "agent.installed_msi"]
    return f"""Extracting files... done
Installing SOCP Cloud Agent 6.2.0.41 to {INSTALL_DIR}
Registering service {SERVICE}... done
Provisioning with platform {URI} ... success
Installation completed successfully (exit code 0).""", ["agent.installed"]


def service(st, verb=None, ps=False):
    if not st["installed"]:
        return (f"Get-Service : Cannot find any service with service name '{SERVICE}'." if ps else
                f"[SC] EnumQueryServicesStatus:OpenService FAILED 1060:\n\nThe specified service does not exist as an installed service."), ["agent.service_missing"]
    if verb == "stop" and st.get("selfprot"):
        return "System error 5 has occurred.\n\nAccess is denied.\n(SOCP Cloud Agent self-protection blocked this request.)", ["agent.stop_blocked"]
    if verb == "stop":
        st["running"] = False
        return f"The SOCP Cloud Agent service is stopping.\nThe SOCP Cloud Agent service was stopped successfully.", ["agent.service_stopped"]
    if verb == "start":
        st["running"] = True
        return "The SOCP Cloud Agent service is starting.\nThe SOCP Cloud Agent service was started successfully.", ["agent.service_started"]
    state = "RUNNING" if st["running"] else "STOPPED"
    if ps:
        return f"\nStatus   Name               DisplayName\n------   ----               -----------\n{'Running' if st['running'] else 'Stopped':<8} {SERVICE:<18} SOCP Cloud Agent", ["agent.service_checked"]
    return f"""
SERVICE_NAME: {SERVICE}
        TYPE               : 10  WIN32_OWN_PROCESS
        STATE              : {'4  RUNNING' if st['running'] else '1  STOPPED'}
                                (STOPPABLE, NOT_PAUSABLE, ACCEPTS_SHUTDOWN)
        WIN32_EXIT_CODE    : 0  (0x0)
        SERVICE_EXIT_CODE  : 0  (0x0)""", ["agent.service_checked"] if state else []


def read_file(path, st, tail=None, grep=None):
    if same(path, LOG):
        if not st["installed"]:
            return f"The system cannot find the path specified: {LOG}", []
        lines = log_lines(st)
        if grep:
            hits = [line for line in lines if grep.lower() in line.lower()]
            return "\n".join(hits) or "", ["agent.log_searched"]
        return "\n".join(lines[-tail:] if tail else lines), ["agent.log_reviewed"]
    return f"The system cannot find the file specified: {path}", []


def run(raw, st):
    cmd = raw.strip()
    if not cmd:
        return "", []
    try:
        parts = shlex.split(cmd.replace("\\", "\\\\"), posix=True)
    except ValueError:
        return "The syntax of the command is incorrect (unbalanced quotes).", []
    head, args, low = parts[0], parts[1:], cmd.lower()
    h = head.lower().replace(".\\", "").rsplit("\\", 1)[-1]
    if h in ("help", "?", "/?"):
        return HELP, []
    if h in ("whoami",):
        if args and args[0].lower() == "/groups":
            return "GROUP INFORMATION\n-----------------\nBUILTIN\\Administrators     Alias  S-1-5-32-544  Mandatory group, Enabled by default, Enabled group, Group owner\nMandatory Label\\High Mandatory Level  Label  S-1-16-12288", ["cmd.whoami"]
        return f"{HOST.lower()}\\administrator", ["cmd.whoami"]
    if h == "msiexec":
        if not args or args[0].lower() not in ("/i", "/package"):
            return "Windows Installer usage: msiexec /i <package.msi> [PROPERTY=value ...] /qn [/l*v <logfile>]", []
        if len(args) < 2 or args[1].lower().strip('"') != MSI.lower():
            return "This installation package could not be opened. Verify that the package exists and that you can access it.", []
        return install(args[2:], st, msi=True)
    if h == "tasklist":
        rows = "\nImage Name                     PID Session Name        Mem Usage\n========================= ======== ================ ============\nsvchost.exe                    812 Services             18,204 K"
        if st["installed"] and st["running"]:
            rows += f"\n{EXE}             4120 Services             36,880 K\nSOCPAgentCore.exe             4188 Services             22,416 K"
        return rows, ["agent.process_checked"] if st["installed"] and st["running"] else []
    if h == "taskkill":
        if st["installed"] and "socpcloudagent" in low:
            if st.get("selfprot"):
                return f"ERROR: The process \"{EXE}\" with PID 4120 could not be terminated.\nReason: Access is denied (self-protection).", ["agent.kill_blocked"]
            st["running"] = False
            return f"SUCCESS: The process \"{EXE}\" with PID 4120 has been terminated.", ["agent.killed"]
        return "ERROR: The process not found.", []
    if h == "reg":
        if len(args) >= 2 and args[0].lower() == "query" and args[1].lower().replace("hkey_local_machine", "hklm").rstrip("\\") in ("hklm\\software\\socp", "hklm\\software\\socp\\cloudagent"):
            if not st["installed"]:
                return "ERROR: The system was unable to find the specified registry key or value.", []
            return f"\nHKEY_LOCAL_MACHINE\\SOFTWARE\\SOCP\n    HostID    REG_SZ    {AGENT_UUID}\n    Version    REG_SZ    6.2.0.41\n    InstallPath    REG_SZ    {INSTALL_DIR}\n\nHKEY_LOCAL_MACHINE\\SOFTWARE\\SOCP\\Proxy", ["agent.registry_checked"]
        return "ERROR: The system was unable to find the specified registry key or value.\nTip: reg query HKLM\\SOFTWARE\\SOCP", []
    if h == "compress-archive":
        if "programdata\\socp\\cloudagent" in low and "-destinationpath" in low:
            return "", ["agent.logs_zipped"]
        return "Compress-Archive : usage: Compress-Archive -Path <folder> -DestinationPath <file.zip>", []
    if h == "hostname":
        return HOST, []
    if h == "ipconfig":
        return "Windows IP Configuration\n\nEthernet adapter Ethernet0:\n   IPv4 Address. . . . . . . . . . . : 10.20.30.41\n   Subnet Mask . . . . . . . . . . . : 255.255.255.0\n   Default Gateway . . . . . . . . . : 10.20.30.1", []
    if h in ("cd", "set-location", "chdir"):
        if not args:
            return st["cwd"], []
        target = norm_path(st["cwd"], " ".join(args))
        known = [HOME, DL, r"C:\Users", "C:\\", r"C:\ProgramData\SOCP\CloudAgent"] + ([INSTALL_DIR] if st["installed"] else [])
        hit = next((k for k in known if same(k, target)), None)
        if not hit:
            return "The system cannot find the path specified.", []
        st["cwd"] = hit
        return "", []
    if h in ("dir", "ls", "get-childitem"):
        return listing(norm_path(st["cwd"], " ".join(args)) if args else st["cwd"], st)
    if h == "certutil":
        if len(args) >= 2 and args[0].lower() == "-hashfile":
            f = norm_path(st["cwd"], args[1])
            if not same(f, f"{DL}\\{EXE}"):
                return f"CertUtil: -hashfile command FAILED: 0x80070002 (WIN32: 2 ERROR_FILE_NOT_FOUND)", []
            algo = (args[2] if len(args) > 2 else "SHA1").upper()
            if algo != "SHA256":
                return f"{algo} hash of {EXE}:\n{SHA256[:40].lower()}\nCertUtil: -hashfile command completed successfully.\n(Tip: the published checksum is SHA256.)", []
            return f"SHA256 hash of {EXE}:\n{SHA256.lower()}\nCertUtil: -hashfile command completed successfully.", ["cmd.hash_verified"]
        return "Usage: certutil -hashfile <file> SHA256", []
    if h == EXE.lower():
        return install(args, st)
    if h in ("sc", "sc.exe"):
        if len(args) >= 2 and args[0].lower() == "query" and args[1].lower() == SERVICE.lower():
            return service(st)
        if len(args) >= 2 and args[0].lower() == "query":
            return "[SC] EnumQueryServicesStatus:OpenService FAILED 1060:\n\nThe specified service does not exist as an installed service.", []
        return "Usage: sc query <ServiceName>", []
    if h == "get-service":
        return service(st, ps=True) if args and args[-1].lower() == SERVICE.lower() else (f"Get-Service : Cannot find any service with service name '{args[-1] if args else ''}'.", [])
    if h in ("net",) and len(args) == 2 and args[0].lower() in ("stop", "start"):
        if args[1].lower() != SERVICE.lower():
            return "The service name is invalid.", []
        return service(st, args[0].lower())
    if h in ("type", "cat", "get-content", "gc"):
        tail = None
        if "-tail" in [a.lower() for a in args]:
            i = [a.lower() for a in args].index("-tail")
            tail = int(args[i + 1]) if i + 1 < len(args) and args[i + 1].isdigit() else 10
            args = args[:i] + args[i + 2:]
        if not args:
            return "The syntax of the command is incorrect.", []
        return read_file(norm_path(st["cwd"], " ".join(args)), st, tail)
    if h == "findstr":
        rest = [a for a in args if not a.startswith("/")]
        if len(rest) < 2:
            return 'Usage: findstr /i "<text>" <file>', []
        return read_file(norm_path(st["cwd"], rest[-1]), st, grep=rest[0])
    if h == "socpagentctl.exe":
        if not st["installed"]:
            return f"'{head}' is not recognized as an internal or external command.", []
        if "selfprotection" in low:
            return f"Self-protection: {'Enabled' if st.get('selfprot') else 'Disabled'} (set by configuration profile 'Default Windows Profile')", ["agent.selfprot_checked"]
        m = re.search(r"type=(vm|pc|inventory|sca)", low)
        if "scanondemand" in low and m:
            if not st["running"]:
                return "Error: the agent service is stopped. Start it with: net start SOCPCloudAgent", []
            st["scans"] = st.get("scans", 0) + 1
            t = m.group(1)
            return f"On-demand {t.upper()} scan queued (job {4400 + st['scans']}). Results upload with the next snapshot.", ["agent.scan_on_demand", f"agent.scan_{t}"]
        return "Usage: SOCPAgentCtl.exe ScanOnDemand Type=VM|PC|Inventory  |  SOCPAgentCtl.exe SelfProtection Status", []
    if h == "uninstall.exe":
        if not st["installed"]:
            return f"'{head}' is not recognized as an internal or external command.", []
        if "uninstall=true" not in low:
            return "Usage: Uninstall.exe Uninstall=True", []
        st.update(installed=False, running=False, scans=0)
        if st["cwd"].lower().startswith(INSTALL_DIR.lower()):
            st["cwd"] = HOME
        return "Stopping service... done\nDeregistering agent from platform... done\nSOCP Cloud Agent was uninstalled.", ["agent.uninstalled"]
    if h in ("cls", "clear"):
        return "\x0c", []
    return f"'{head}' is not recognized as an internal or external command,\noperable program or batch file.\nType 'help' to see the commands this lab supports.", []
