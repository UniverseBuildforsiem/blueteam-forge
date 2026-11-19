"""Web / PCI terminal commands for Modules 3-4 (simulated)."""
import re
import vm_m3

HELP = """
Web / compliance commands:
  curl -I https://shop.socp.test/          curl -s https://shop.socp.test/login
  curl https://shop.socp.test/robots.txt   net accounts /domain
  ssh pciadmin@203.0.113.10 "rpm -q openssh\""""

LOGIN = """<!doctype html><html><head><title>SOCP Shop · Sign in</title></head><body>
<form id="signin" method="POST" action="/login">
  <input type="text" name="email" placeholder="Email">
  <input type="password" name="passwd" placeholder="Password">
  <input type="hidden" name="csrf" value="9f1c...">
  <button type="submit">Sign in</button>
</form></body></html>"""


def curl(args):
    url = next((a for a in args if a.startswith("http")), "")
    m = re.match(r"https?://([^/]+)(/[^\s]*)?", url)
    if not m:
        return "curl: try 'curl -I https://shop.socp.test/'", []
    host, path = m.group(1).lower(), (m.group(2) or "/").rstrip() or "/"
    if host != vm_m3.SHOP_HOST:
        return f"curl: (6) Could not resolve host: {host}", []
    if "-I" in args or "--head" in args:
        return ("HTTP/1.1 200 OK\nServer: nginx/1.18.0\nContent-Type: text/html; charset=utf-8\nX-Powered-By: Express\n"
                "Set-Cookie: sid=s%3A8f2c1a; Path=/\nCache-Control: no-store\n(no Content-Security-Policy, no X-Frame-Options)"), ["cmd.curl_head"]
    if path.startswith("/login"):
        return LOGIN, ["cmd.curl_login"]
    if path.startswith("/robots.txt"):
        return "User-agent: *\nDisallow: /admin/\nDisallow: /account/\nSitemap: https://shop.socp.test/sitemap.xml", ["cmd.curl_robots"]
    return f"<!doctype html><html><head><title>SOCP Shop</title></head><body>... {path} ...</body></html>", []


def ssh_pci(args):
    m = re.match(r"([\w.-]+)@(203\.0\.113\.\d+)", args[0] if args else "")
    if not m:
        return None
    ip = m.group(2)
    if ip != f"{vm_m3.PCI_NET}10":
        return f"ssh: connect to host {ip} port 22: Connection refused", []
    if m.group(1).lower() != "pciadmin":
        return f"{m.group(1)}@{ip}: Permission denied (publickey).", []
    if "rpm -q openssh" not in " ".join(args[1:]).lower():
        return f"Authenticated to {ip} as pciadmin. Run: ssh pciadmin@{ip} \"rpm -q openssh\"", []
    return ("openssh-7.4p1-23.el7_9.x86_64\n\n# changelog excerpt (rpm -q --changelog openssh | grep 38408)\n"
            "* Mon Jul 24 2023 SOCP Linux Security <sec@socp.test> - 7.4p1-23\n- Fix CVE-2023-38408: ssh-agent remote code execution (backported)"), ["cmd.rpm_check"]


def web(h, args, low):
    if h in ("curl", "curl.exe"):
        return curl(args)
    if h == "ssh":
        return ssh_pci(args)
    if h == "net" and args and args[0].lower() == "accounts":
        if "/domain" not in low:
            return "Tip: net accounts /domain", []
        return ("The request will be processed at a domain controller for domain trn.socp.test.\n\nForce user logoff how long after time expires?:       Never\n"
                "Minimum password age (days):                          1\nMaximum password age (days):                          42\nMinimum password length:                              7\n"
                "Length of password history maintained:                24\nLockout threshold:                                    Never\nLockout duration (minutes):                           30\n"
                "The command completed successfully."), ["cmd.netaccounts"]
    return None
