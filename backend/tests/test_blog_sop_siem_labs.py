# Iteration 18: Blog, SOP library, SIEM (SPL+KQL), Scenario Labs, regression
import os
import uuid
from datetime import datetime, timedelta, timezone
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
CRON_SECRET = None
for line in open("/app/backend/.env"):
    if line.startswith("WEBHOOK_CRON_SECRET"):
        CRON_SECRET = line.split("=", 1)[1].strip().strip('"')


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def instructor():
    return login("instructor@socprofessionals.academy", "Instructor@123")


# ---------- Blog ----------
class TestBlog:
    def test_list(self):
        r = requests.get(f"{API}/public/blog")
        assert r.status_code == 200
        d = r.json()
        assert len(d["posts"]) >= 12, len(d["posts"])
        assert "Ransomware" in d["categories"]
        assert d["updated_at"]
        assert "_id" not in d["posts"][0]

    def test_filter_category_and_q(self):
        d = requests.get(f"{API}/public/blog").json()
        cat = d["posts"][0]["category"]
        r = requests.get(f"{API}/public/blog", params={"category": cat}).json()
        assert r["posts"] and all(p["category"] == cat for p in r["posts"])
        word = d["posts"][0]["title"].split()[0]
        r2 = requests.get(f"{API}/public/blog", params={"q": word}).json()
        assert any(p["id"] == d["posts"][0]["id"] for p in r2["posts"])
        r3 = requests.get(f"{API}/public/blog", params={"q": "zzqqxxnotfound"}).json()
        assert r3["posts"] == []

    def test_detail_and_404(self):
        slug = requests.get(f"{API}/public/blog").json()["posts"][0]["slug"]
        r = requests.get(f"{API}/public/blog/{slug}")
        assert r.status_code == 200
        p = r.json()
        for k in ("summary", "key_points", "soc_actions", "iocs", "mitre", "related"):
            assert isinstance(p[k], list), k
        assert p["summary"] and p["soc_actions"]
        assert p["source_url"].startswith("http")
        assert "key" not in p
        assert requests.get(f"{API}/public/blog/no-such-slug-xyz").status_code == 404

    def test_cron_auth_and_dupe(self):
        assert requests.post(f"{API}/cron/blog-sync", json={}).status_code == 401
        wid = f"TEST_{uuid.uuid4()}"
        h = {"Authorization": f"Bearer {CRON_SECRET}", "X-Webhook-Id": wid}
        r = requests.post(f"{API}/cron/blog-sync", json={}, headers=h)
        assert r.status_code == 200 and r.json()["ok"] is True and not r.json().get("duplicate")
        r2 = requests.post(f"{API}/cron/blog-sync", json={}, headers=h)
        assert r2.status_code == 200 and r2.json().get("duplicate") is True

    def test_admin_sync_forbidden_student(self, student):
        assert student.post(f"{API}/admin/blog/sync").status_code == 403


# ---------- SOP ----------
FREE = ["sop-phishing", "sop-bruteforce", "sop-malware", "sop-powershell", "sop-impossible-travel"]


class TestSop:
    def _check_list(self, d, owned):
        assert d["price"] == 499 and d["free_count"] == 5 and len(d["sops"]) == 12
        for s in d["sops"]:
            if s["id"] in FREE:
                assert s["locked"] is False and s["free"] is True
            else:
                assert s["locked"] is (not owned), s["id"]

    def test_anon_list(self):
        self._check_list(requests.get(f"{API}/public/sops").json(), False)
        assert [s["id"] for s in requests.get(f"{API}/public/sops").json()["sops"][:5]] == FREE

    def test_student_list(self, student):
        d = student.get(f"{API}/public/sops").json()
        assert d["logged_in"] is True and d["owned"] is False
        self._check_list(d, False)

    def test_free_detail(self):
        p = requests.get(f"{API}/public/sops/sop-phishing").json()
        for k in ("steps", "queries", "escalation", "sla", "mitre", "closure", "roles", "tools"):
            assert k in p and p[k], k
        assert p["queries"][0]["spl"] and p["queries"][0]["kql"]

    def test_locked_detail(self, student):
        for c in (requests, student):
            p = c.get(f"{API}/public/sops/sop-ransomware").json()
            assert p["locked"] is True
            assert "queries" not in p and "steps" not in p and "escalation" not in p

    def test_admin_instructor_unlocked(self, admin, instructor):
        for c in (admin, instructor):
            d = c.get(f"{API}/public/sops").json()
            assert d["owned"] is True
            self._check_list(d, True)
            p = c.get(f"{API}/public/sops/sop-ransomware").json()
            assert p["locked"] is False and p["queries"] and p["steps"]

    def test_404(self):
        assert requests.get(f"{API}/public/sops/sop-nope").status_code == 404

    def test_payment_plan_valid(self, student):
        r = student.post(f"{API}/payments/razorpay/order", json={"plan": "sop-bundle"})
        assert r.status_code != 400, r.text
        assert r.status_code in (200, 503), r.text
        r2 = student.post(f"{API}/payments/razorpay/order", json={"plan": "bogus-plan"})
        print("bogus plan:", r2.status_code, r2.text[:120])


# ---------- SIEM ----------
def q(s, query, lang="spl", **kw):
    return s.get(f"{API}/siem/search", params={"q": query, "lang": lang, **kw})


class TestSiem:
    def test_spl_stats(self, student):
        d = q(student, "event_id=4625 | stats count by src_ip").json()
        rows = {r["value"]: r["count"] for r in d["stats"]["rows"]}
        assert rows.get("45.155.205.12") == 45, rows
        for k in ("total", "events", "fields", "stats", "columns", "timeline"):
            assert k in d

    def test_spl_table(self, student):
        d = q(student, "index=windows EventCode=4769 ticket_encryption=0x17 | table _time user service").json()
        assert d["total"] == 6 and d["columns"] == ["_time", "user", "service"]

    def test_spl_or_and_numeric(self, student):
        d = q(student, "sourcetype=web status=500 OR status=404 | stats count by status").json()
        vals = {r["value"] for r in d["stats"]["rows"]}
        assert vals and vals <= {"500", "404"}, vals
        d2 = q(student, "sourcetype=firewall bytes_out>1000000000").json()
        assert d2["total"] >= 1 and all(float(e["bytes_out"]) > 1e9 for e in d2["events"])

    def test_spl_unsupported(self, student):
        r = q(student, "index=windows | eval x=1")
        assert r.status_code == 400 and "eval" in r.json()["detail"]

    def test_kql_kerberoast(self, student):
        d = q(student, 'SecurityEvent | where EventID == 4769 and TicketEncryptionType == "0x17" | summarize count() by Account', "kql").json()
        rows = {r["value"]: r["count"] for r in d["stats"]["rows"]}
        assert rows.get("s.chen") == 6, rows

    def test_kql_signin(self, student):
        d = q(student, 'SigninLogs | where ResultType == "50126" | summarize count() by IPAddress', "kql").json()
        rows = {r["value"]: r["count"] for r in d["stats"]["rows"]}
        assert rows.get("102.89.34.11") == 30, rows

    def test_kql_project(self, student):
        d = q(student, 'DeviceProcessEvents | where InitiatingProcessFileName in~ ("w3wp.exe","winword.exe") | project TimeGenerated, DeviceName, ProcessCommandLine', "kql").json()
        assert d["total"] == 2 and d["columns"] == ["_time", "host", "command_line"], d["columns"]

    def test_kql_dns(self, student):
        d = q(student, 'DnsEvents | where Name endswith "exfil-tunnel.xyz" | summarize count() by Computer', "kql").json()
        rows = {r["value"]: r["count"] for r in d["stats"]["rows"]}
        assert rows.get("IT-SRV-02") == 60, rows

    def test_kql_ago(self, student):
        d = q(student, "SecurityEvent | where TimeGenerated > ago(24h)", "kql").json()
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24, minutes=5)).isoformat()
        assert d["total"] > 0 and all(e["_time"] >= cutoff for e in d["events"])
        full = q(student, "SecurityEvent", "kql").json()
        assert full["total"] >= d["total"]

    def test_kql_unknown_table(self, student):
        r = q(student, "FooTable | take 5", "kql")
        assert r.status_code == 400 and "Unknown table" in r.json()["detail"]

    def test_time_filter(self, student):
        full = q(student, "index=windows").json()
        tl = full["timeline"]
        hour = tl[len(tl) // 2]["t"]
        start, end = hour + ":00:00", hour + ":59:59"
        d = q(student, "index=windows", start=start, end=end).json()
        print("time filter", full["total"], d["total"], start, end, full["events"][0]["_time"])
        assert 0 < d["total"] < full["total"]

    def test_dashboard_alerts(self, student):
        d = student.get(f"{API}/siem/dashboard").json()
        assert d["timeline"] and d["by_country"]
        al = student.get(f"{API}/siem/alerts").json()
        ids = {a["id"]: a for a in al}
        for i in ("al-5", "al-6", "al-7", "al-8"):
            assert i in ids, i
            assert ids[i]["triggered"] is True, (i, ids[i]["matches"], ids[i]["threshold"])

    def test_saved_kql(self, student):
        r = student.post(f"{API}/siem/saved", json={"name": "TEST_kql", "query": "SigninLogs | take 5", "lang": "kql"})
        assert r.status_code == 200 and r.json()["lang"] == "kql"
        sid = r.json()["id"]
        assert any(s["id"] == sid for s in student.get(f"{API}/siem/saved").json())
        student.delete(f"{API}/siem/saved/{sid}")

    def test_unauth(self):
        assert requests.get(f"{API}/siem/search", params={"q": "*"}).status_code == 401


# ---------- Labs ----------
LABS = ["lab-phish-ransom", "lab-bruteforce", "lab-kerberoast", "lab-bec-m365", "lab-webshell-iis", "lab-dns-tunnel"]


class TestLabs:
    def test_list(self, student):
        d = student.get(f"{API}/labs").json()
        ids = [l["id"] for l in d]
        for lid in LABS:
            assert lid in ids
        for l in d:
            for k in ("category", "phases", "task_count", "solved", "report_score"):
                assert k in l

    def test_detail_no_answers(self, student):
        for lid in LABS:
            d = student.get(f"{API}/labs/{lid}").json()
            assert "report_keywords" not in d and d["keyword_count"] > 0
            assert d.get("scenario") and d.get("report_guide"), lid
            for t in d["tasks"]:
                assert "answer" not in t and t.get("phase")
                if t.get("type") == "mcq":
                    assert t["options"]

    def test_bruteforce_flow(self, student):
        lid = "lab-bruteforce"
        d = student.get(f"{API}/labs/{lid}").json()
        answers = {"t1": "45.155.205.12", "t1b": "Brute force / dictionary attack", "t2": "DEPLOY", "t3": "/home/deploy/.ssh/authorized_keys",
                   "t4": "Remove the attacker key from authorized_keys, reset deploy's password and block the IP"}
        assert {t["id"] for t in d["tasks"]} == set(answers), [t["id"] for t in d["tasks"]]
        if len(d["progress"]["answered"]) < len(answers):
            r = student.post(f"{API}/labs/{lid}/report", json={"report": "x" * 30})
            assert r.status_code == 400
        assert student.post(f"{API}/labs/{lid}/tasks/t1", json={"answer": "1.2.3.4"}).json()["correct"] is False
        for tid, a in answers.items():
            assert student.post(f"{API}/labs/{lid}/tasks/{tid}", json={"answer": a}).json()["correct"] is True, tid
        rep = "Brute force from 45.155.205.12 against deploy, accepted login, authorized_keys persistence. Block IP."
        r = student.post(f"{API}/labs/{lid}/report", json={"report": rep})
        assert r.status_code == 200
        res = r.json()
        assert res["score"] == round(100 * 6 / 8), res
        assert set(res["keywords_missed"]) == {"reset", "mfa"}
        r2 = student.post(f"{API}/labs/{lid}/report", json={"report": "Only mentions the brute force here, short."}).json()
        assert r2["best"] >= res["score"] and r2["score"] < res["score"]
        assert student.get(f"{API}/labs/{lid}").json()["progress"]["report_score"] >= res["score"]

    def test_dns_answers(self, student):
        lid = "lab-dns-tunnel"
        ans = {"d1": "exfil-tunnel.xyz", "d2": "TXT", "d3": "passwords.kdbx", "d4": "dnscat2.exe", "d5": "Sinkhole the domain, isolate IT-SRV-02 and rotate the vault's secrets"}
        for tid, a in ans.items():
            assert student.post(f"{API}/labs/{lid}/tasks/{tid}", json={"answer": a}).json()["correct"] is True, tid


# ---------- Regression ----------
class TestRegression:
    def test_challenge_hint(self, student):
        ch = student.get(f"{API}/challenges").json()
        items = ch if isinstance(ch, list) else ch.get("challenges", [])
        assert items
        cid = items[0]["id"]
        r = student.post(f"{API}/challenges/{cid}/hint/0")
        print("hint", r.status_code, r.text[:200])
        assert r.status_code in (200, 400)
