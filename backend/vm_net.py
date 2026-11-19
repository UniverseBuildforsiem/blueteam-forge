"""Network / scan-prep commands for the Module 2 terminal (simulated)."""
import re
import vm_m2
import vm_web

HELP = """
Network / scan-prep commands (lab targets 10.50.200.243-250):
  ping <ip|name>      nslookup <ip|name>      nbtstat -A <ip>
  Test-NetConnection <ip> -Port <n>           net user qscanner /domain
  ssh qscanner@<linux ip> "sudo -l\"""" + vm_web.HELP


def ping(args):
    tgt = next((a for a in args if not a.startswith("-")), "")
    x = vm_m2.find_host(tgt)
    if not x:
        if tgt.startswith(vm_m2.NET):
            return f"Pinging {tgt} with 32 bytes of data:\nRequest timed out.\nRequest timed out.\n\nPing statistics for {tgt}:\n    Packets: Sent = 2, Received = 0, Lost = 2 (100% loss)", []
        return f"Ping request could not find host {tgt}. Please check the name and try again.", []
    ttl = 128 if x["tracking"] == "NetBIOS" else 64
    rep = "\n".join(f"Reply from {x['ip']}: bytes=32 time={3 + i}ms TTL={ttl}" for i in range(4))
    return f"Pinging {x['ip']} with 32 bytes of data:\n{rep}\n\nPing statistics for {x['ip']}:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)", ["cmd.ping"]


def nslookup(first):
    x = vm_m2.find_host(first)
    head = "Server:  dns01.trn.socp.test\nAddress:  10.50.200.2\n\n"
    if not x:
        return head + f"*** dns01.trn.socp.test can't find {first}: Non-existent domain", ["cmd.nslookup"]
    if x["tracking"] != "DNS":
        return head + f"*** dns01.trn.socp.test can't find {first}: Non-existent domain\n(Tip: this Windows host has no DNS record. It is identified by its NetBIOS name. Try nbtstat -A {x['ip']})", ["cmd.nslookup"]
    return head + f"Name:    {x['name']}\nAddress:  {x['ip']}", ["cmd.nslookup"]


def nbtstat(args):
    if not args or args[0].lower() != "-a" or len(args) < 2:
        return "Usage: nbtstat -A <ip>", []
    x = vm_m2.find_host(args[1])
    if not x:
        return "    Host not found.", []
    if x["tracking"] != "NetBIOS":
        return f"\nEthernet0:\nNode IpAddress: [10.20.30.41] Scope Id: []\n\n    Host not found. ({x['ip']} doesn't answer NetBIOS: Linux hosts are tracked by DNS name.)", ["cmd.nbtstat"]
    n = x["name"]
    return f"\n           NetBIOS Remote Machine Name Table\n\n       Name               Type         Status\n    ---------------------------------------------\n    {n:<15}<00>  UNIQUE      Registered\n    TRN            <00>  GROUP       Registered\n    {n:<15}<20>  UNIQUE      Registered\n\n    MAC Address = 00-50-56-AA-{x['ip'][-2:]}-01", ["cmd.nbtstat"]


def portcheck(args, low):
    x = vm_m2.find_host(args[0] if args else "")
    m = re.search(r"-port\s+(\d+)", low)
    if not x or not m:
        return "Usage: Test-NetConnection <ip> -Port <n>   (lab targets 10.50.200.243-250)", []
    port = int(m.group(1))
    ok = port in x["ports"]
    out = f"\nComputerName     : {x['ip']}\nRemoteAddress    : {x['ip']}\nRemotePort       : {port}\nInterfaceAlias   : Ethernet0\nSourceAddress    : 10.20.30.41\nTcpTestSucceeded : {ok}"
    return out + ("" if ok else f"\nWARNING: TCP connect to ({x['ip']} : {port}) failed"), ["cmd.portcheck"]


def net_user(args, low):
    if len(args) < 2 or args[1].lower() != "qscanner" or "/domain" not in low:
        return "The user name could not be found.\nTip: net user qscanner /domain", []
    return (f"The request will be processed at a domain controller for domain {vm_m2.DOMAIN}.\n\nUser name                    qscanner\nFull Name                    SOCP Scan Service\n"
            "Account active               Yes\nPassword expires             Never\nGlobal Group memberships     *Domain Users         *Domain Admins\nThe command completed successfully."), ["cmd.netuser"]


def ssh(args):
    m = re.match(r"([\w.-]+)@([\w.-]+)", args[0] if args else "")
    if not m:
        return 'Usage: ssh qscanner@<linux ip> "sudo -l"', []
    user, x = m.group(1).lower(), vm_m2.find_host(m.group(2))
    if not x:
        return f"ssh: connect to host {m.group(2)} port 22: Connection timed out", []
    if 22 not in x["ports"]:
        return f"ssh: connect to host {x['ip']} port 22: Connection refused (Windows host: use a Windows authentication record)", []
    if user == "root":
        return f"root@{x['ip']}: Permission denied (publickey,password).\n(Root login is disabled. Use a standard account such as qscanner with sudo root delegation.)", []
    if user != "qscanner":
        return f"{user}@{x['ip']}: Permission denied (publickey,password).", []
    short = x["name"].split(".")[0]
    if "sudo -l" not in " ".join(args[1:]).lower():
        return f"Authenticated to {x['ip']} as qscanner. Interactive shells are disabled in this lab.\nRun: ssh qscanner@{x['ip']} \"sudo -l\"", []
    return f"Matching Defaults entries for qscanner on {short}:\n    env_reset, secure_path=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin\n\nUser qscanner may run the following commands on {short}:\n    (ALL) NOPASSWD: ALL", ["cmd.sudo_check"]


def network(h, args, low):
    w = vm_web.web(h, args, low)
    if w:
        return w
    if h == "ping":
        return ping(args)
    if h == "nslookup":
        return nslookup(args[0] if args else "")
    if h == "nbtstat":
        return nbtstat(args)
    if h in ("test-netconnection", "tnc"):
        return portcheck(args, low)
    if h == "net" and args and args[0].lower() == "user":
        return net_user(args, low)
    if h == "ssh":
        return ssh(args)
    return None
