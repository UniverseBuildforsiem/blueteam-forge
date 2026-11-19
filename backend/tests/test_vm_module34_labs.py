# VM Lab Modules 3 (Web App Scanning) & 4 (PCI DSS / Policy Compliance): hub, locks, all labs via API, quizzes, CTF (iteration 62). Run: pytest -n0
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api/vmlab"
SHOP = "https://shop.socp.test/"
PCI = "203.0.113.10-203.0.113.13"
M3 = ["vm-lab-was-01-webapp", "vm-lab-was-02-auth", "vm-lab-was-03-profile", "vm-lab-was-04-sitemap", "vm-lab-was-05-vulnscan",
      "vm-lab-was-06-searchlist", "vm-lab-was-07-schedule", "vm-lab-was-08-reports"]
M4 = ["vm-lab-pci-01-scope", "vm-lab-pci-02-asv", "vm-lab-pci-03-dispute", "vm-lab-pci-04-policy", "vm-lab-pci-05-posture", "vm-lab-pci-06-exceptions"]
CIS = "CIS Microsoft Windows Server 2019 Benchmark v2.0 Level 1"


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


def reset(s, lab):
    r = s.post(f"{API}/labs/{lab}/reset")
    assert r.status_code == 200, r.text
    assert all(not t["done"] for t in r.json()["tasks"])
    return r.json()


def ex(s, lab, cmd, expect=None):
    r = s.post(f"{API}/labs/{lab}/exec", json={"command": cmd})
    assert r.status_code == 200, r.text
    j = r.json()
    if expect:
        assert expect in str(j), f"{cmd} -> {j}"
    return j


def ev(s, lab, event, code=200, **data):
    r = s.post(f"{API}/labs/{lab}/event", json={"event": event, "data": data})
    assert r.status_code == code, f"{event} {data} -> {r.status_code} {r.text}"
    return r.json()


def ans(s, lab, tid, a, ok=True):
    r = s.post(f"{API}/labs/{lab}/answer", json={"task_id": tid, "answer": a})
    assert r.status_code == 200, r.text
    assert r.json()["correct"] is ok, f"{lab} {tid} {a}"


def assert_complete(s, lab):
    j = s.get(f"{API}/labs/{lab}").json()
    d = [t["id"] for t in j["tasks"] if t["done"]]
    assert len(d) == len(j["tasks"]), f"{lab} done={d}"
    assert j["completed_at"] and j["score"] == 100


# Hub / locks / console data
class TestHub:
    def test_hub_m3_m4(self, admin):
        h = admin.get(API).json()
        m3 = next(m for m in h["modules"] if m["id"] == 3)
        m4 = next(m for m in h["modules"] if m["id"] == 4)
        assert [i["id"] for i in m3["items"]] == M3 + ["vm-quiz-was-core", "vm-ctf-was-hunt"]
        assert [i["id"] for i in m4["items"]] == M4 + ["vm-quiz-pci-core"]
        assert m3["items"][0]["free"] and m4["items"][0]["free"]
        assert not m3["items"][1]["free"] and not m4["items"][1]["free"]

    def test_student_locks(self, student):
        h = student.get(API).json()
        if h.get("access"):
            pytest.skip("student has access")
        for lab1, lab2 in ((M3[0], M3[1]), (M4[0], M4[1])):
            assert student.get(f"{API}/labs/{lab1}").status_code == 200
            assert student.get(f"{API}/labs/{lab2}").status_code == 403
        assert student.get(f"{API}/quizzes/vm-quiz-was-core").status_code == 403
        assert student.get(f"{API}/quizzes/vm-quiz-pci-core").status_code == 403
        assert student.get(f"{API}/ctf/vm-ctf-was-hunt").status_code == 403

    def test_console_data_m3(self, admin):
        d = admin.get(f"{API}/console-data").json()["m3"]
        assert len(d["was"]["sitemap"]) == 15 and len(d["was"]["kb"]) == 12
        assert len(d["pci"]["hosts"]) == 4 and len(d["pc"]["controls"]) == 6

    def test_lab_view_has_scenarios(self, admin):
        j = admin.get(f"{API}/labs/{M4[0]}").json()
        assert j["scenarios"][0]["id"] == "s1" and len(j["scenarios"][0]["items"]) == 6


# Module 3 labs
class TestM3:
    def test_was01(self, admin):
        L = M3[0]; reset(admin, L)
        ex(admin, L, f"curl -I {SHOP}", "nginx/1.18.0")
        ex(admin, L, f"curl {SHOP}robots.txt", "Disallow: /admin/")
        r = ev(admin, L, "webapp.created", name="SOCP Shop", url=SHOP, scope="Limit to content at or below URL subdirectory", maxlinks="300")
        assert r["new"] == ["t3"]
        ev(admin, L, "webapp.created", name="SOCP Shop", url=SHOP, scope="Limit to URL hostname", maxlinks="300")
        ans(admin, L, "t5", "X-Powered-By", ok=False)
        ans(admin, L, "t5", "X-Frame-Options")
        assert_complete(admin, L)

    def test_was02(self, admin):
        L = M3[1]; reset(admin, L)
        ex(admin, L, f"curl -s {SHOP}login", 'name="passwd"')
        ev(admin, L, "was.auth_created", title="Shop Login", kind="Form", user_field="email", pass_field="passwd", user="was_scanner@socp.test", check="Logout")
        ev(admin, L, "webapp.auth_assigned", app="SOCP Shop", record="Shop Login")
        ev(admin, L, "webapp.exclusion_added", app="SOCP Shop", path="/logout")
        assert_complete(admin, L)

    def test_was03(self, admin):
        L = M3[2]; reset(admin, L)
        ev(admin, L, "was.profile_created", title="Shop Deep Scan", maxlinks="1000", detection="Core", forms="POST and GET", cc="yes", bruteforce="None", searchlist="")
        ans(admin, L, "t5", "300")
        assert_complete(admin, L)

    def test_was04(self, admin):
        L = M3[3]; reset(admin, L)
        r = ev(admin, L, "was.scan_launched", title="d", app="SOCP Shop", type="Discovery", auth="None", profile="Initial WAS Options")
        assert r["new"] == []
        ev(admin, L, "was.scan_launched", title="Disc", app="SOCP Shop", type="Discovery", auth="Shop Login", profile="Initial WAS Options")
        ev(admin, L, "was.sitemap_viewed", app="SOCP Shop")
        ans(admin, L, "t3", "4", ok=False)
        ans(admin, L, "t3", "5")
        ev(admin, L, "webapp.exclusion_added", app="SOCP Shop", path="/admin/delete-user")
        ans(admin, L, "t5", "no")
        assert_complete(admin, L)

    def test_was05(self, admin):
        L = M3[4]; reset(admin, L)
        ev(admin, L, "was.scan_launched", title="V", app="SOCP Shop", type="Vulnerability", auth="Shop Login", profile="Shop Deep Scan")
        ev(admin, L, "was.findings_viewed", title="V")
        ev(admin, L, "was.finding_viewed", qid="150003")
        ans(admin, L, "t4", "2"); ans(admin, L, "t5", "CWE-89")
        r = ev(admin, L, "was.finding_ignored", qid="150202", reason="Risk accepted")
        assert r["new"] == []
        ev(admin, L, "was.finding_ignored", qid="150202", reason="False positive")
        assert_complete(admin, L)

    def test_was06(self, admin):
        L = M3[5]; reset(admin, L)
        ev(admin, L, "was.searchlist_created", title="Shop Injection", kind="Dynamic", owasp="A03:2021 Injection", severity="Any")
        ans(admin, L, "t2", "3")
        ev(admin, L, "was.searchlist_created", title="Access Control", kind="Static", qids="150047, 150500")
        ev(admin, L, "was.searchlist_imported", title="OWASP Top 10 2021")
        ev(admin, L, "was.profile_created", title="Injection Only", maxlinks="300", detection="Custom search list", searchlist="Shop Injection", forms="GET only", cc="no")
        assert_complete(admin, L)

    def test_was07(self, admin):
        L = M3[6]; reset(admin, L)
        base = dict(title="Shop Weekly", app="SOCP Shop", type="Vulnerability", frequency="Weekly", auth="Shop Login", profile="Shop Deep Scan", start="2026-06-14T02:00")
        r = ev(admin, L, "was.scan_scheduled", **base, tz="")
        assert "t3" not in r["new"]
        ev(admin, L, "was.scan_scheduled", **base, tz="Asia/Kolkata")
        ev(admin, L, "was.schedule_run_now", title="Shop Weekly")
        ans(admin, L, "t5", "release")
        assert_complete(admin, L)

    def test_was08(self, admin):
        L = M3[7]; reset(admin, L)
        ev(admin, L, "was.report_generated", title="Dev", template="Web Application Report", app="SOCP Shop", severity="4", format="PDF")
        ev(admin, L, "was.report_viewed", template="Web Application Report")
        ans(admin, L, "t3", "6")
        ev(admin, L, "was.report_downloaded", template="OWASP Top 10 Report", format="PDF")
        ans(admin, L, "t5", "A01")
        assert_complete(admin, L)

    def test_quiz3(self, admin):
        q = admin.get(f"{API}/quizzes/vm-quiz-was-core").json()
        assert len(q["questions"]) == 8
        r = admin.post(f"{API}/quizzes/vm-quiz-was-core/submit", json={"answers": [1] * 8}).json()
        assert r["score"] == 100 and r["passed"]

    def test_ctf3(self, admin):
        for i, f in enumerate(["passwd", "150084", "/account/orders", "nginx/1.18.0"]):
            assert admin.post(f"{API}/ctf/vm-ctf-was-hunt/submit", json={"index": i, "flag": f}).json()["correct"] is True
        assert admin.post(f"{API}/ctf/vm-ctf-was-hunt/submit", json={"index": 0, "flag": "password"}).json()["correct"] is False
        assert all(c["solved"] for c in admin.get(f"{API}/ctf/vm-ctf-was-hunt").json()["challenges"])


# Module 4 labs
class TestM4:
    def test_pci01(self, admin):
        L = M4[0]; reset(admin, L)
        r = ev(admin, L, "scenario.checked", sid="s1", picked="a,b,c,d,f")
        assert r["new"] == []
        r = ev(admin, L, "scenario.checked", sid="s1", picked="F, d,B,a")
        assert r["new"] == ["t1"]
        ev(admin, L, "pci.scope_added", ips=PCI)
        ans(admin, L, "t3", "quarterly"); ans(admin, L, "t4", "11")
        assert_complete(admin, L)

    def test_pci02(self, admin):
        L = M4[1]; reset(admin, L)
        ev(admin, L, "pci.scan_launched", title="Q", profile="PCI External (ASV)", target=PCI)
        ev(admin, L, "pci.results_viewed")
        ans(admin, L, "t3", "fail"); ans(admin, L, "t4", "4.0"); ans(admin, L, "t5", "203.0.113.13")
        assert_complete(admin, L)

    def test_pci03(self, admin):
        L = M4[2]; reset(admin, L)
        ex(admin, L, 'ssh pciadmin@203.0.113.10 "rpm -q openssh"', "backported")
        ev(admin, L, "scenario.checked", sid="s3", picked="a,b,d")
        r = ev(admin, L, "pci.dispute_submitted", qid="38909", ip="203.0.113.10", category="False Positive", reason="too short")
        assert r["new"] == []
        ev(admin, L, "pci.dispute_submitted", qid="38909", ip="203.0.113.10", category="False Positive", reason="Vendor backported fix to openssh-7.4p1-23, see rpm changelog")
        ans(admin, L, "t4", "ASV"); ans(admin, L, "t5", "no")
        assert_complete(admin, L)

    def test_pci04(self, admin):
        L = M4[3]; reset(admin, L)
        ev(admin, L, "pc.policy_created", title="SOCP Windows Hardening", template=CIS, group="AG: Windows Servers")
        ev(admin, L, "pc.control_edited", cid="1071", value="14", policy="SOCP Windows Hardening")
        ev(admin, L, "scenario.checked", sid="s4", picked="a,b,d")
        ans(admin, L, "t4", "1"); ans(admin, L, "t5", "12")
        assert_complete(admin, L)

    def test_pci05(self, admin):
        L = M4[4]; reset(admin, L)
        ex(admin, L, "net accounts /domain", "Lockout threshold")
        ev(admin, L, "pc.scan_launched", title="C", policy="SOCP Windows Hardening", auth="TRN Domain", target="AG: Windows Servers")
        ev(admin, L, "pc.posture_viewed")
        ans(admin, L, "t4", "1072"); ans(admin, L, "t5", "42"); ans(admin, L, "t6", "TRN-WIN2012")
        assert_complete(admin, L)

    def test_pci06(self, admin):
        L = M4[5]; reset(admin, L)
        ev(admin, L, "scenario.checked", sid="s6", picked="a,b,c")
        ev(admin, L, "pc.exception_created", cid="2105", host="TRN-WIN2012", days="90", reason="Legacy app needs SMBv1 until migration")
        ev(admin, L, "pc.exception_approved", cid="2105", host="TRN-WIN2012")
        ev(admin, L, "pc.report_generated", title="Policy Report · SOCP Windows Hardening", policy="SOCP Windows Hardening")
        ev(admin, L, "pc.report_viewed", policy="SOCP Windows Hardening")
        ans(admin, L, "t5", "no")
        assert_complete(admin, L)

    def test_quiz4(self, admin):
        r = admin.post(f"{API}/quizzes/vm-quiz-pci-core/submit", json={"answers": [1, 1, 1, 1, 1, 2, 1, 1]}).json()
        assert r["score"] == 100 and r["passed"]


# Hints / solutions / persistence / XP once
class TestMisc:
    def test_hint_solution_score_and_persistence(self, admin):
        L = M3[2]; reset(admin, L)
        assert admin.post(f"{API}/labs/{L}/hint/t1").status_code == 200
        assert admin.post(f"{API}/labs/{L}/solution/t5").status_code == 200
        ans(admin, L, "t5", "300")
        j = admin.get(f"{API}/labs/{L}").json()
        assert "t5" in [t["id"] for t in j["tasks"] if t["done"]]
        assert j["score"] < 100

    def test_state_persists_console(self, admin):
        L = M3[0]; reset(admin, L)
        ev(admin, L, "webapp.created", name="TEST_App", url=SHOP, scope="Limit to URL hostname", maxlinks="10")
        j = admin.get(f"{API}/labs/{L}").json()
        assert any(a["name"] == "TEST_App" for a in j["state"]["console"]["webapps"])
        reset(admin, L)

    def test_xp_awarded_once(self, admin):
        L = M4[3]; reset(admin, L)
        ev(admin, L, "pc.policy_created", title="SOCP Windows Hardening", template=CIS, group="AG: Windows Servers")
        ev(admin, L, "pc.control_edited", cid="1071", value="14")
        ev(admin, L, "scenario.checked", sid="s4", picked="a,b,d")
        ans(admin, L, "t4", "1")
        r = admin.post(f"{API}/labs/{L}/answer", json={"task_id": "t5", "answer": "12"}).json()
        assert r["lab"]["awarded"] is False  # already awarded in TestM4.test_pci04
