"""Module 3 (Web Application Scanning, 8 labs + quiz + CTF) and Module 4 (PCI DSS & Policy Compliance, 6 scenario labs + quiz)."""
from vm_labs2 import T, E, A
from vm_m3 import SHOP, SHOP_APP, SHOP_AUTH, SHOP_PROFILE, PCI_RANGE, PCI_NET, PC_POLICY, PC_LIBRARY
from vm_m2 import AUTH, WIN, NET

W1 = {"webapps": [SHOP_APP]}
W2 = {"webapps": [{**SHOP_APP, "blacklist": "/logout"}], "was_auth": [SHOP_AUTH], "was_assign": [{"app": "SOCP Shop", "record": "Shop Login"}]}
W3 = {**W2, "was_profiles": [SHOP_PROFILE], "was_excl": [{"app": "SOCP Shop", "path": "/admin/delete-user"}]}
WSCAN = {"title": "Shop Vuln Scan", "app": "SOCP Shop", "type": "Vulnerability", "auth": "Shop Login", "profile": "Shop Deep Scan", "at": "2026-06-12T08:00:00"}
P1 = {"pci_scope": [{"ips": PCI_RANGE}]}
P2 = {**P1, "pci_scans": [{"title": "Q2 PCI External Scan", "profile": "PCI External (ASV)", "target": PCI_RANGE, "at": "2026-06-10T02:00:00"}]}
WG = {"groups": [{"name": "AG: Windows Servers", "ips": f"{WIN[0]}-{WIN[-1]}", "impact": "High"}], "hosts": [{"ips": f"{WIN[0]}-{WIN[-1]}", "tracking": "NetBIOS"}]}
C1 = {**WG, "auth": AUTH, "pc_policies": [PC_POLICY]}
C2 = {**C1, "pc_scans": [{"title": "Weekly Compliance Scan", "policy": PC_POLICY["title"], "auth": "TRN Domain", "target": "AG: Windows Servers", "at": "2026-06-12T09:00:00"}]}


def lab(m, n, slug, title, minutes, diff, summary, intro, tasks, preset=None, scenarios=None):
    tag = "was" if m == 3 else "pci"
    return {"id": f"vm-lab-{tag}-{n:02d}-{slug}", "kind": "lab", "module": m, "order": n, "free": n == 1, "minutes": minutes, "difficulty": diff, "status": "published",
            "title": f"Lab {n} · {title}", "summary": summary, "intro": intro, "tasks": tasks, "console_preset": preset or {}, "scenarios": scenarios or []}


S = lambda sid, prompt, items: {"id": sid, "prompt": prompt, "items": [{"id": chr(97 + i), "text": t} for i, t in enumerate(items)]}  # noqa: E731
CHK = lambda sid, picked: E("scenario.checked", sid=sid, picked=picked)  # noqa: E731

LABS3 = [
    lab(3, 1, "webapp", "Add a Web Application", 15, "Beginner", "Fingerprint the target, then register it with the right crawl scope and limits.",
        f"Web Application Scanning (WAS) starts with a web application record: the starting URL, crawl scope and limits. The training target is SOCP Shop at {SHOP}: an intentionally vulnerable store. Only scan applications you're authorised to test.\n\nScopes: 'Limit to URL hostname' crawls the whole host, and 'Limit to content at or below URL subdirectory' stays under the starting path.",
        [T("t1", "Fingerprint the server", "Read the response headers of the shop home page.", "curl has a flag for headers only.", f"curl -I {SHOP}", E("cmd.curl_head")),
         T("t2", "Check robots.txt", "See which paths the site asks crawlers to avoid.", "It's a file at the web root.", f"curl {SHOP}robots.txt", E("cmd.curl_robots")),
         T("t3", "Create the web application", f"Console → Web Applications → New: name 'SOCP Shop', URL {SHOP}.", "Name + starting URL.", f"Name: SOCP Shop · URL: {SHOP}", E("webapp.created", name="socp shop", url=r"https://shop\.socp\.test/?")),
         T("t4", "Set scope and crawl limit", "The same record must use scope 'Limit to URL hostname' and max links 300.", "Two fields under Crawl settings.", "Scope: Limit to URL hostname · Max links: 300", E("webapp.created", name="socp shop", scope="Limit to URL hostname", maxlinks="300")),
         T("t5", "Knowledge check", "Which header is missing that would block clickjacking? (name one)", "Look at the curl -I output note.", "X-Frame-Options", A("x-frame-options|content-security-policy|csp|frame-ancestors"))]),
    lab(3, 2, "auth", "Web Authentication Record", 20, "Intermediate", "Teach the scanner to log in with a form record and keep its session alive.",
        "Much of an app sits behind login. A form authentication record tells the scanner which fields to fill and how to confirm the login worked (a regex like 'Logout'). Blacklist /logout so the crawler doesn't end its own session.",
        [T("t1", "Inspect the login form", "Fetch the login page and note the field names.", "curl -s <url>/login", f"curl -s {SHOP}login", E("cmd.curl_login")),
         T("t2", "Create the form record", "Web Authentication → New Form record 'Shop Login' with user field 'email' and password field 'passwd', user was_scanner@socp.test.", "Field names come from the HTML name= attributes.", "Shop Login · user field email · password field passwd", E("was.auth_created", title="shop login", kind="Form", user_field="email", pass_field="passwd")),
         T("t3", "Add a login check", "The same record needs the success regex 'Logout'.", "Login check field.", "Check: Logout", E("was.auth_created", title="shop login", check=r"(?i).*logout.*")),
         T("t4", "Assign it to the app", "Web Applications → SOCP Shop → Authentication: pick 'Shop Login'.", "Assign button in the app row.", "SOCP Shop → Assign auth → Shop Login", E("webapp.auth_assigned", app="SOCP Shop", record="shop login")),
         T("t5", "Protect the session", "Add /logout to the app's exclusion (blacklist) list.", "Exclusions in the app row.", "SOCP Shop → Add exclusion → /logout", E("webapp.exclusion_added", app="SOCP Shop", path=r"/logout/?"))], preset=W1),
    lab(3, 3, "profile", "WAS Option Profile", 15, "Intermediate", "Tune crawl depth, detection scope, form submission and sensitive-content checks.",
        "WAS option profiles control how deep the crawler goes and what it tests. 'Core' detection runs the full OWASP-focused set. Turn on sensitive content checks (credit card numbers) for stores.",
        [T("t1", "Create the profile", "Option Profiles → New 'Shop Deep Scan' with max links 1000.", "Raise the default 300.", "Title: Shop Deep Scan · Max links: 1000", E("was.profile_created", title="shop deep scan", maxlinks="1000")),
         T("t2", "Use Core detection", "Detection scope: Core.", "Dropdown.", "Detection: Core", E("was.profile_created", title="shop deep scan", detection="Core")),
         T("t3", "Submit forms", "Form submission: POST and GET.", "Dropdown.", "Form submission: POST and GET", E("was.profile_created", title="shop deep scan", forms="POST and GET")),
         T("t4", "Look for card numbers", "Tick sensitive content: credit card numbers.", "Checkbox.", "Sensitive content: Credit card ✓", E("was.profile_created", title="shop deep scan", cc="yes")),
         T("t5", "Knowledge check", "What's the default maximum number of links crawled?", "Check the first lab.", "300", A("300"))], preset=W2),
    lab(3, 4, "sitemap", "Discovery Scan & Sitemap", 15, "Beginner", "Crawl the app with a discovery scan, read the sitemap and exclude dangerous forms.",
        "A discovery scan crawls without attacking. It builds the sitemap of links, forms and APIs. Review it before a vulnerability scan: exclude destructive forms (like delete actions) so the scanner never submits them.",
        [T("t1", "Launch a discovery scan", "Scans → New: type Discovery on SOCP Shop with authentication Shop Login.", "Type = Discovery.", "Title any · App SOCP Shop · Type Discovery · Auth Shop Login → Launch", E("was.scan_launched", app="SOCP Shop", type="Discovery", auth="Shop Login")),
         T("t2", "Open the sitemap", "View the sitemap for SOCP Shop.", "Sitemap button in the scan or app row.", "Sitemap", E("was.sitemap_viewed")),
         T("t3", "Count forms", "How many forms did the authenticated crawl find (including excluded ones)?", "Kind = form.", "5", A("5|five")),
         T("t4", "Exclude the destructive form", "From the sitemap, exclude /admin/delete-user.", "Exclude button on that row.", "Sitemap → /admin/delete-user → Exclude", E("webapp.exclusion_added", app="SOCP Shop", path="/admin/delete-user")),
         T("t5", "Knowledge check", "Does a discovery scan test for vulnerabilities? (yes/no)", "It only crawls.", "No", A("no"))], preset=W2),
    lab(3, 5, "vulnscan", "Vulnerability Scan & Findings", 20, "Intermediate", "Run an authenticated vulnerability scan and triage OWASP findings.",
        "A vulnerability scan crawls and attacks with payloads. Findings show the OWASP category, CWE and evidence (payload/response). Triage them: fix true positives and ignore confirmed false positives with a reason.",
        [T("t1", "Launch the vulnerability scan", "Scans → New: type Vulnerability, SOCP Shop, auth Shop Login, profile Shop Deep Scan.", "All three selectors.", "Type Vulnerability · Shop Login · Shop Deep Scan → Launch", E("was.scan_launched", app="SOCP Shop", type="Vulnerability", auth="Shop Login", profile="Shop Deep Scan")),
         T("t2", "Open the findings", "When processed, open Findings for the scan.", "Findings button in the scan row.", "Scans → Findings", E("was.findings_viewed")),
         T("t3", "Inspect the SQL injection", "Open QID 150003 to see the payload.", "Click the row.", "Click SQL Injection", E("was.finding_viewed", qid="150003")),
         T("t4", "Count critical findings", "How many severity 5 findings were reported?", "Sev column.", "2", A("2|two")),
         T("t5", "Map the weakness", "Which CWE does the SQL injection map to?", "In the finding detail.", "CWE-89", A("cwe-89|89")),
         T("t6", "Ignore a false positive", "The team confirmed the CSP header is set by the CDN. Ignore QID 150202 as 'False positive'.", "Ignore button in the finding drawer.", "QID 150202 → Ignore → False positive", E("was.finding_ignored", qid="150202", reason="False positive"))], preset=W3),
    lab(3, 6, "searchlist", "WAS Search Lists", 15, "Beginner", "Build OWASP-focused search lists to narrow scans and reports.",
        "WAS search lists group QIDs by OWASP category or severity. Use them in option profiles (scan only these) or report templates (report only these).",
        [T("t1", "Create a dynamic injection list", "Search Lists → New dynamic 'Shop Injection' with OWASP A03:2021 Injection.", "OWASP category dropdown.", "Shop Injection · Dynamic · A03:2021 Injection", E("was.searchlist_created", title="shop injection", kind="Dynamic", owasp=r"A03.*")),
         T("t2", "How many QIDs match?", "How many QIDs does 'Shop Injection' contain?", "QIDs column.", "3", A("3|three")),
         T("t3", "Create a static list", "New static 'Access Control' with QIDs 150047, 150500.", "Comma-separated.", "Access Control · Static · 150047, 150500", E("was.searchlist_created", title="access control", kind="Static", qids=r".*150047.*150500.*|.*150500.*150047.*")),
         T("t4", "Import from the library", "Import 'OWASP Top 10 2021'.", "Library button.", "Library → OWASP Top 10 2021 → Import", E("was.searchlist_imported", title="OWASP Top 10 2021")),
         T("t5", "Use it in a profile", "Create an option profile 'Injection Only' with detection 'Custom search list' = Shop Injection.", "Option Profiles → detection Custom search list.", "Injection Only · Custom search list · Shop Injection", E("was.profile_created", title="injection only", detection="Custom search list", searchlist="Shop Injection"))], preset=W3),
    lab(3, 7, "schedule", "Schedule a Web App Scan", 15, "Beginner", "Schedule recurring authenticated scans in a low-traffic window.",
        "Schedule WAS scans after each release or weekly during low traffic. Time zone and auth record are required for reliable results.",
        [T("t1", "Create the schedule", "Schedules → New 'Shop Weekly', SOCP Shop, Vulnerability, Weekly.", "Frequency Weekly.", "Shop Weekly · SOCP Shop · Vulnerability · Weekly", E("was.scan_scheduled", title="shop weekly", app="SOCP Shop", type="Vulnerability", frequency="Weekly")),
         T("t2", "Authenticated, with the profile", "The same schedule uses auth Shop Login and profile Shop Deep Scan.", "Two selectors.", "Shop Login · Shop Deep Scan", E("was.scan_scheduled", title="shop weekly", auth="Shop Login", profile="Shop Deep Scan")),
         T("t3", "Low-traffic window", "Start at 02:00 with a time zone selected.", "Start time + time zone.", "Start 02:00 · Asia/Kolkata", E("was.scan_scheduled", title="shop weekly", start=r".*T02:00", tz=r".+")),
         T("t4", "Test it", "Run the schedule now and watch it crawl.", "Run now.", "Run now", E("was.schedule_run_now", title="shop weekly")),
         T("t5", "Knowledge check", "Besides weekly, when else should you rescan a web app? (one word)", "Code changes…", "Release", A("release|deployment|deploy|change|update|releases"))], preset=W3),
    lab(3, 8, "reports", "Web Application Reports", 15, "Beginner", "Produce a developer report of high-severity findings and an OWASP report.",
        "WAS reports turn findings into action: a Web Application Report for developers (with payloads and fixes) and an OWASP Top 10 report for management.",
        [T("t1", "Run a developer report", "Reports → New: template 'Web Application Report', app SOCP Shop, minimum severity 4.", "Severity filter.", "Web Application Report · SOCP Shop · Sev 4+", E("was.report_generated", template="Web Application Report", app="SOCP Shop", severity="4")),
         T("t2", "Review it", "Open the report.", "View.", "View", E("was.report_viewed", template="Web Application Report")),
         T("t3", "How many findings?", "How many findings (severity 4-5) are in the report?", "Count the rows.", "6", A("6|six")),
         T("t4", "Management view", "Run the 'OWASP Top 10 Report' and download it as PDF.", "Run, View, Download.", "OWASP Top 10 Report → View → PDF", E("was.report_downloaded", template="OWASP Top 10 Report", format="PDF")),
         T("t5", "Knowledge check", "Which OWASP 2021 category does the path traversal finding belong to?", "Open QID 150047.", "A01 Broken Access Control", A("a01|broken access control|a01:2021|a01:2021 broken access control|a01 broken access control"))], preset={**W3, "was_scans": [WSCAN]}),
]

QUIZ3 = {"id": "vm-quiz-was-core", "kind": "quiz", "module": 3, "order": 9, "free": False, "minutes": 8, "difficulty": "Intermediate", "status": "published",
         "title": "Web App Scanning Quiz", "summary": "Scope, authentication, discovery vs vulnerability scans, OWASP.", "questions": [
             {"q": "Why blacklist /logout?", "options": ["It is slow", "The crawler would end its own session", "It contains PII", "PCI requires it"], "answer": 1, "explain": "Hitting logout kills the authenticated session."},
             {"q": "A discovery scan…", "options": ["Attacks every form", "Only crawls and builds the sitemap", "Needs no target", "Scans ports"], "answer": 1, "explain": "No attack payloads are sent."},
             {"q": "Form auth record field names come from…", "options": ["The page title", "The input name attributes", "The cookie", "DNS"], "answer": 1, "explain": "e.g. name=\"email\" and name=\"passwd\"."},
             {"q": "SQL injection maps to…", "options": ["CWE-79", "CWE-89", "CWE-22", "CWE-352"], "answer": 1, "explain": "CWE-79 is XSS, CWE-22 path traversal."},
             {"q": "Destructive forms (delete user) should be…", "options": ["Scanned first", "Excluded from the crawl", "Brute forced", "Ignored in reports only"], "answer": 1, "explain": "Never let a scanner submit destructive actions."},
             {"q": "'Limit to URL hostname' scope…", "options": ["Crawls other domains", "Crawls the whole host", "Only the start page", "Only APIs"], "answer": 1, "explain": "Subdirectory scope stays under the start path."},
             {"q": "Ignoring a finding requires…", "options": ["Nothing", "A documented reason such as false positive", "Admin password", "A rescan first"], "answer": 1, "explain": "Keep an audit trail."},
             {"q": "OWASP A06:2021 is…", "options": ["Injection", "Vulnerable and Outdated Components", "SSRF", "Logging failures"], "answer": 1, "explain": "e.g. jQuery 3.4.1."},
         ]}
CTF3 = {"id": "vm-ctf-was-hunt", "kind": "ctf", "module": 3, "order": 10, "free": False, "minutes": 10, "difficulty": "Intermediate", "status": "published",
        "title": "Shop Breach CTF", "summary": "Pull flags from the sitemap, findings and terminal.", "challenges": [
            {"q": "Name of the password field on the shop login form?", "answer": "passwd", "points": 100, "hint": "curl the login page."},
            {"q": "QID of the stored XSS finding?", "answer": "150084", "points": 100, "hint": "Findings, severity 5."},
            {"q": "Path that leaks another customer's orders (IDOR)?", "answer": "/account/orders", "points": 150, "hint": "Only visible with authentication."},
            {"q": "Server software in the response headers (name/version)?", "answer": "nginx/1.18.0", "points": 150, "hint": "curl -I"},
        ]}

LABS4 = [
    lab(4, 1, "scope", "PCI DSS Scope & SAQ", 15, "Beginner", "Decide what is in PCI scope and register the external scope for ASV scanning.",
        f"SOCP Shop takes card payments on its own checkout page (web01) which calls a payment API. Staff administer web01 from a jump host. Marketing runs a blog on separate hosting with no link to card data.\n\nPCI DSS v4.0 req. 11.3.2 needs passing external ASV scans at least quarterly. External scope: {PCI_RANGE} (web01, payment API, mail relay, VPN).",
        [T("t1", "Scope checklist", "Console → Scenario: tick every system that is in PCI scope (part of or connected to the CDE).", "Connected-to and security systems count.", "Checkout web server, payment API, admin jump host, perimeter firewall", CHK("s1", "a,b,d,f")),
         T("t2", "Register the external scope", f"PCI Merchant → Scope: add {PCI_RANGE}.", "One range.", f"Scope: {PCI_RANGE} → Add", E("pci.scope_added", ipset="pci")),
         T("t3", "Knowledge check", "How often must external ASV scans pass?", "Four times a year.", "Quarterly", A("quarterly|every quarter|every 3 months|4 times a year|every three months")),
         T("t4", "Knowledge check", "Which PCI DSS requirement number covers vulnerability scanning and penetration testing?", "Req 11.", "11", A("11|11.3|requirement 11"))],
        scenarios=[S("s1", "Which systems are in PCI DSS scope?", ["Checkout web server (web01)", "Payment API", "HR laptop on an isolated VLAN with no CDE access", "Admin jump host used to manage web01", "Marketing blog on separate hosting", "Perimeter firewall protecting the CDE"])]),
    lab(4, 2, "asv", "External PCI Scan", 15, "Intermediate", "Run the external PCI scan and read the pass/fail verdict.",
        "PCI scans fail a host for any vulnerability with CVSS 4.0 or higher (plus some automatic failures). Every in-scope host must pass for a compliant quarter.",
        [T("t1", "Launch the PCI scan", f"PCI Merchant → Scans: launch with profile 'PCI External (ASV)' on {PCI_RANGE}.", "Use Select for the scope.", f"PCI External (ASV) · {PCI_RANGE} → Launch", E("pci.scan_launched", profile=r"PCI External \(ASV\)", ipset="pci")),
         T("t2", "Read the results", "Open the results when processed.", "Results button.", "Results", E("pci.results_viewed")),
         T("t3", "Overall status", "Is the merchant PCI compliant this quarter? (pass/fail)", "Any failing host fails the scan.", "Fail", A("fail|failed|no|non-compliant")),
         T("t4", "The threshold", "What CVSS score or higher causes a PCI failure?", "Medium and above.", "4.0", A("4|4.0")),
         T("t5", "Worst host", "Which IP has the Fortinet VPN path traversal (CVE-2018-13379)?", "Results table.", f"{PCI_NET}13", A(f"{PCI_NET}13"))], preset=P1),
    lab(4, 3, "dispute", "False-Positive Dispute", 20, "Intermediate", "Prove a banner-based finding is a false positive and dispute it properly.",
        f"web01 ({PCI_NET}10) fails for CVE-2023-38408 because its SSH banner says OpenSSH 7.4. The vendor backported the fix into the package. Disputes need evidence and are reviewed by the ASV. Real, exploitable findings can't be disputed away: they must be fixed.",
        [T("t1", "Collect package evidence", f"Check the installed OpenSSH package on {PCI_NET}10 as pciadmin.", 'ssh pciadmin@<ip> "rpm -q openssh"', f'ssh pciadmin@{PCI_NET}10 "rpm -q openssh"', E("cmd.rpm_check")),
         T("t2", "Evidence checklist", "Console → Scenario: tick the evidence that supports this false positive.", "Vendor proof and system output.", "Backport advisory, package version + changelog, config showing ssh-agent forwarding disabled", CHK("s3", "a,b,d")),
         T("t3", "Submit the dispute", "PCI Merchant → Vulnerabilities: dispute QID 38909 as 'False Positive' with a justification of at least 30 characters.", "Dispute button on the row.", "QID 38909 → Dispute → False Positive + justification", E("pci.dispute_submitted", qid="38909", category="False Positive", reason=r"(?s).{30,}")),
         T("t4", "Knowledge check", "Who reviews and accepts PCI scan disputes?", "Approved Scanning ___", "ASV", A("asv|approved scanning vendor|the asv")),
         T("t5", "Knowledge check", f"Can the {PCI_NET}13 VPN finding be disputed as a false positive if the firmware is really vulnerable? (yes/no)", "It's a real risk.", "No", A("no"))], preset=P2,
        scenarios=[S("s3", "Which evidence supports the CVE-2023-38408 false-positive dispute?", ["Vendor advisory showing the fix was backported to 7.4p1-23", "rpm -q output and changelog showing the patched package", "A statement that the server sits behind a firewall", "Config showing ssh-agent forwarding disabled", "A passing scan from a different vendor with no details"])]),
    lab(4, 4, "policy", "Build a Compliance Policy", 15, "Intermediate", "Create a hardening policy from a CIS benchmark and tune a control to your standard.",
        "Policy Compliance checks configuration against a policy built from a library template (CIS benchmarks, PCI controls). Level 1 is the practical baseline, Level 2 is stricter. SOCP's standard needs 14-character passwords (PCI DSS v4.0 req. 8.3.6 needs at least 12).",
        [T("t1", "Create from the library", f"Policies → New from library '{PC_LIBRARY[0]}' titled 'SOCP Windows Hardening', asset group AG: Windows Servers.", "Pick the template, title and group.", "Template CIS … Level 1 · Title SOCP Windows Hardening · AG: Windows Servers", E("pc.policy_created", title="socp windows hardening", template=PC_LIBRARY[0].replace(".", r"\."), group="AG: Windows Servers")),
         T("t2", "Tune a control", "Edit control 1071 'Minimum password length' to 14.", "Edit on the control row.", "1071 → 14 → Save", E("pc.control_edited", cid="1071", value="14")),
         T("t3", "Map controls to PCI req. 8", "Console → Scenario: tick controls that support PCI DSS req. 8 (identify & authenticate users).", "Password and lockout settings.", "Min password length, lockout threshold, password history", CHK("s4", "a,b,d")),
         T("t4", "Knowledge check", "Which CIS level is less restrictive: 1 or 2?", "The practical baseline.", "1", A("1|level 1|one")),
         T("t5", "Knowledge check", "Minimum password length required by PCI DSS v4.0?", "req 8.3.6", "12", A("12|twelve"))], preset=WG,
        scenarios=[S("s4", "Which controls support PCI DSS requirement 8?", ["Minimum password length", "Account lockout threshold", "SMBv1 server protocol", "Enforce password history", "Windows Firewall domain profile", "Audit Logon events"])]),
    lab(4, 5, "posture", "Compliance Scan & Posture", 20, "Intermediate", "Run an authenticated compliance scan and read the control posture.",
        "Compliance scans need authentication: they read registry and security policy. Posture shows pass/fail for every control on every host.",
        [T("t1", "Check the domain policy", "From the jump host, read the domain password and lockout policy.", "net accounts /domain", "net accounts /domain", E("cmd.netaccounts")),
         T("t2", "Launch the compliance scan", "Compliance Scans → Launch: policy SOCP Windows Hardening, auth TRN Domain, target AG: Windows Servers.", "Auth is required.", "SOCP Windows Hardening · TRN Domain · AG: Windows Servers → Launch", E("pc.scan_launched", policy="SOCP Windows Hardening", auth="TRN Domain")),
         T("t3", "Open the posture", "Posture: view the control × host grid.", "Posture nav item.", "Posture", E("pc.posture_viewed")),
         T("t4", "Control failing everywhere", "Which control ID fails on all 4 hosts?", "Look for an all-red row.", "1072", A("1072")),
         T("t5", "Pass rate", "What is the overall pass rate (%), rounded?", "Shown at the top of Posture.", "42", A("42|42%|41.7|41.67|42 %")),
         T("t6", "Worst host", "Which host fails the most controls?", "Count red cells per column.", "TRN-WIN2012", A("trn-win2012|win2012"))], preset=C1),
    lab(4, 6, "exceptions", "Exceptions & Policy Report", 15, "Intermediate", "Handle a justified exception with an expiry, then report compliance.",
        "TRN-WIN2012 runs a legacy app that needs SMBv1 until it's migrated. An exception documents the risk, the compensating controls, an owner and an expiry date. A Manager approves it. Reports show posture with exceptions marked.",
        [T("t1", "Exception checklist", "Console → Scenario: tick what a valid exception needs.", "Think audit-ready.", "Compensating controls, expiry date, business owner approval", CHK("s6", "a,b,c")),
         T("t2", "Request the exception", "Exceptions → New: control 2105 on TRN-WIN2012, 90 days, with a justification.", "Exception form.", "2105 · TRN-WIN2012 · 90 days · justification", E("pc.exception_created", cid="2105", host="TRN-WIN2012", days="90", reason=r"(?s)\s*\S.{18,}")),
         T("t3", "Approve it", "As Manager, approve the exception.", "Approve button on the row.", "Approve", E("pc.exception_approved", cid="2105")),
         T("t4", "Run the policy report", "Reports → Policy Report for SOCP Windows Hardening → View.", "Run then View.", "Policy Report → View", E("pc.report_viewed", policy="SOCP Windows Hardening")),
         T("t5", "Knowledge check", "Should an exception be permanent? (yes/no)", "It needs review.", "No", A("no"))], preset=C2,
        scenarios=[S("s6", "What does a valid compliance exception need?", ["Documented compensating controls (e.g. SMB restricted by firewall)", "An expiry / review date", "Approval from the business owner or Manager", "A note that the scanner is noisy", "Permanent status with no review"])]),
]

QUIZ4 = {"id": "vm-quiz-pci-core", "kind": "quiz", "module": 4, "order": 7, "free": False, "minutes": 8, "difficulty": "Intermediate", "status": "published",
         "title": "PCI DSS & Compliance Quiz", "summary": "Scope, ASV scans, disputes, policies, exceptions.", "questions": [
             {"q": "A jump host that administers the CDE is…", "options": ["Out of scope", "In scope (connected-to)", "Only in scope yearly", "Exempt if patched"], "answer": 1, "explain": "Connected-to systems are in scope."},
             {"q": "External ASV scans must pass…", "options": ["Monthly", "Quarterly", "Yearly", "Only after breaches"], "answer": 1, "explain": "Req. 11.3.2."},
             {"q": "A PCI scan fails a host for CVSS…", "options": [">= 7.0", ">= 4.0", ">= 9.0", "any score"], "answer": 1, "explain": "4.0 and above fail."},
             {"q": "Best evidence for a backport false positive?", "options": ["Firewall statement", "Vendor advisory + package version", "Screenshot of login page", "Another vendor's pass"], "answer": 1, "explain": "Show the patched package."},
             {"q": "Compliance scans require…", "options": ["No credentials", "Authentication", "Agent only", "A PCI scope"], "answer": 1, "explain": "They read config from the host."},
             {"q": "PCI DSS v4.0 minimum password length?", "options": ["7", "8", "12", "16"], "answer": 2, "explain": "Req. 8.3.6 (was 7 in v3.2.1)."},
             {"q": "A valid exception must have…", "options": ["No owner", "An expiry and compensating controls", "Scanner approval", "Root access"], "answer": 1, "explain": "Exceptions are temporary and documented."},
             {"q": "CIS Level 2 compared to Level 1 is…", "options": ["Less strict", "More strict", "Identical", "Linux only"], "answer": 1, "explain": "Level 2 is defence-in-depth."},
         ]}

SEED3 = LABS3 + [QUIZ3, CTF3] + LABS4 + [QUIZ4]
