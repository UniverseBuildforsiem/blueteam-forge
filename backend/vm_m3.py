"""Modules 3 (Web App Scanning) and 4 (PCI DSS & Policy Compliance): fictional SOCP environment data."""
import vm_m2

SHOP = "https://shop.socp.test/"
SHOP_HOST = "shop.socp.test"
# path, kind (link/form/api/static), needs_auth
SITEMAP = [
    ("/", "link", False), ("/products", "link", False), ("/products?id=12", "link", False), ("/search?q=", "form", False), ("/login", "form", False),
    ("/contact", "form", False), ("/api/v1/products", "api", False), ("/static/js/jquery-3.4.1.min.js", "static", False), ("/robots.txt", "static", False),
    ("/cart", "link", True), ("/checkout", "form", True), ("/account", "link", True), ("/account/orders", "link", True),
    ("/admin/delete-user", "form", True), ("/logout", "link", True),
]
# qid, title, severity, owasp, cwe, path, needs_auth, payload, sensitive
WAS_KB = [
    (150003, "SQL Injection", 5, "A03:2021 Injection", "CWE-89", "/products?id=12", False, "id=12' OR '1'='1' --", False),
    (150084, "Stored Cross-Site Scripting (XSS)", 5, "A03:2021 Injection", "CWE-79", "/contact", False, "message=<img src=x onerror=alert(document.domain)>", False),
    (150001, "Reflected Cross-Site Scripting (XSS)", 4, "A03:2021 Injection", "CWE-79", "/search?q=", False, "q=<script>alert(1)</script>", False),
    (150047, "Path Traversal", 4, "A01:2021 Broken Access Control", "CWE-22", "/api/v1/products", False, "img=../../../../etc/passwd", False),
    (150500, "Insecure Direct Object Reference (order history)", 4, "A01:2021 Broken Access Control", "CWE-639", "/account/orders", True, "order_id=1001 -> 1002 (another customer)", False),
    (150262, "Session Fixation", 4, "A07:2021 Identification and Authentication Failures", "CWE-384", "/login", True, "session id not rotated after login", False),
    (150018, "Cross-Site Request Forgery", 3, "A01:2021 Broken Access Control", "CWE-352", "/account", True, "POST /account without anti-CSRF token", False),
    (150123, "Cookie Without Secure / HttpOnly Flag", 3, "A05:2021 Security Misconfiguration", "CWE-614", "/login", False, "Set-Cookie: sid=...; Path=/", False),
    (150525, "Vulnerable JavaScript Library: jQuery 3.4.1 (CVE-2020-11022)", 3, "A06:2021 Vulnerable and Outdated Components", "CWE-1104", "/static/js/jquery-3.4.1.min.js", False, "jQuery 3.4.1 detected", False),
    (150010, "Sensitive Content: Credit Card Number in Response", 3, "A02:2021 Cryptographic Failures", "CWE-311", "/account/orders", True, "4111 1111 1111 1111 shown in full", True),
    (150124, "Clickjacking: Framable Page", 2, "A05:2021 Security Misconfiguration", "CWE-1021", "/login", False, "no X-Frame-Options / frame-ancestors", False),
    (150202, "Missing Content-Security-Policy Header", 2, "A05:2021 Security Misconfiguration", "CWE-693", "/", False, "response has no Content-Security-Policy", False),
]
WAS_SL_LIBRARY = ["OWASP Top 10 2021", "Injection Only", "Sensitive Content"]
WAS_TEMPLATES = ["Web Application Report", "Scan Report", "Executive Summary (WAS)", "OWASP Top 10 Report"]
SHOP_APP = {"name": "SOCP Shop", "url": SHOP, "scope": "Limit to URL hostname", "maxlinks": "300", "blacklist": "", "tags": ""}
SHOP_AUTH = {"title": "Shop Login", "kind": "Form", "user_field": "email", "pass_field": "passwd", "user": "was_scanner@socp.test", "check": "Logout"}
SHOP_PROFILE = {"title": "Shop Deep Scan", "maxlinks": "1000", "detection": "Core", "forms": "POST and GET", "cc": "yes", "bruteforce": "Minimal"}

# PCI (TEST-NET-3 documentation range)
PCI_NET = "203.0.113."
PCI_RANGE = f"{PCI_NET}10-{PCI_NET}13"
PCI_HOSTS = [
    {"ip": f"{PCI_NET}10", "name": "web01.shop.socp.test", "role": "Checkout web server"},
    {"ip": f"{PCI_NET}11", "name": "api.pay.socp.test", "role": "Payment API"},
    {"ip": f"{PCI_NET}12", "name": "mail.socp.test", "role": "Mail relay"},
    {"ip": f"{PCI_NET}13", "name": "vpn.socp.test", "role": "Remote-access VPN"},
]
# ip, qid, title, cvss, cve
PCI_VULNS = [
    (f"{PCI_NET}10", 38628, "TLS 1.0 Protocol Enabled", 6.5, "-"),
    (f"{PCI_NET}10", 38909, "OpenSSH Remote Code Execution via ssh-agent (banner-based)", 9.8, "CVE-2023-38408"),
    (f"{PCI_NET}11", 150202, "Missing Content-Security-Policy Header", 0.0, "-"),
    (f"{PCI_NET}12", 74042, "SMTP STARTTLS Command Injection", 3.7, "CVE-2011-0411"),
    (f"{PCI_NET}13", 43702, "Fortinet FortiOS SSL VPN Path Traversal", 9.8, "CVE-2018-13379"),
    (f"{PCI_NET}13", 38167, "SSL Certificate Expired", 5.0, "-"),
]

# Policy compliance on the Module 2 Windows hosts
PC_HOSTS = ["TRN-DC01", "TRN-WIN2016", "TRN-WIN10", "TRN-WIN2012"]
# cid, title, op, expected (template default), actual per host
CONTROLS = [
    (1071, "Minimum password length", ">=", "8", ["7", "14", "8", "7"]),
    (1072, "Account lockout threshold", "1-5", "5", ["0", "0", "0", "0"]),
    (1080, "Enforce password history", ">=", "24", ["24", "24", "10", "24"]),
    (2105, "SMBv1 server protocol", "==", "Disabled", ["Enabled", "Disabled", "Disabled", "Enabled"]),
    (3020, "Windows Firewall: Domain profile state", "==", "On", ["On", "On", "On", "Off"]),
    (4011, "Audit Logon events", "==", "Success and Failure", ["Success and Failure", "Success", "Success", "Success"]),
]
PC_LIBRARY = ["CIS Microsoft Windows Server 2019 Benchmark v2.0 Level 1", "CIS Microsoft Windows Server 2019 Benchmark v2.0 Level 2", "CIS Ubuntu Linux 20.04 Benchmark v2.0 Level 1", "PCI DSS v4.0 Windows Controls"]
PC_POLICY = {"title": "SOCP Windows Hardening", "template": PC_LIBRARY[0], "group": "AG: Windows Servers", "overrides": {"1071": "14"}}


def passes(op, expected, actual):
    if op == ">=":
        return int(actual) >= int(expected)
    if op == "1-5":
        return 1 <= int(actual) <= int(expected)
    return actual.lower() == expected.lower()


def console():
    return {
        "was": {"sitemap": [dict(zip(("path", "kind", "auth"), s)) for s in SITEMAP], "kb": [dict(zip(("qid", "title", "severity", "owasp", "cwe", "path", "auth", "payload", "sensitive"), k)) for k in WAS_KB],
                "sl_library": WAS_SL_LIBRARY, "templates": WAS_TEMPLATES, "host": SHOP_HOST, "url": SHOP},
        "pci": {"hosts": PCI_HOSTS, "vulns": [dict(zip(("ip", "qid", "title", "cvss", "cve"), v)) for v in PCI_VULNS], "range": PCI_RANGE},
        "pc": {"hosts": PC_HOSTS, "controls": [dict(zip(("cid", "title", "op", "expected", "actual"), c)) for c in CONTROLS], "library": PC_LIBRARY},
        "win_auth": vm_m2.AUTH[0],
    }
