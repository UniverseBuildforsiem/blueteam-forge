# VM Lab Module 2 - Vulnerability Management labs 1..17, quiz, CTF, locks (iteration 61). Run serially: pytest -n0
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api/vmlab"
NET = "10.50.200."
RANGE = f"{NET}243-{NET}250"
PW = "Train!ng-2026"
IDS = ["vm-lab-vm-01-setup", "vm-lab-vm-02-tags", "vm-lab-vm-03-search", "vm-lab-vm-04-assign", "vm-lab-vm-05-auth", "vm-lab-vm-06-users",
       "vm-lab-vm-07-template", "vm-lab-vm-08-ignore", "vm-lab-vm-09-kb", "vm-lab-vm-10-launch", "vm-lab-vm-11-organize", "vm-lab-vm-12-remreport",
       "vm-lab-vm-13-reporting", "vm-lab-vm-14-schedule", "vm-lab-vm-15-schedreports", "vm-lab-vm-16-searchlist", "vm-lab-vm-17-assessment"]


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


def ex(s, lab, cmd):
    r = s.post(f"{API}/labs/{lab}/exec", json={"command": cmd})
    assert r.status_code == 200, r.text
    return r.json()


def ev(s, lab, event, code=200, **data):
    r = s.post(f"{API}/labs/{lab}/event", json={"event": event, "data": data})
    assert r.status_code == code, f"{event} {data} -> {r.status_code} {r.text}"
    return r.json()


def ans(s, lab, tid, a, ok=True):
    r = s.post(f"{API}/labs/{lab}/answer", json={"task_id": tid, "answer": a})
    assert r.status_code == 200, r.text
    assert r.json()["correct"] is ok, f"{lab} {tid} {a}"
    return r.json()


def done(s, lab):
    j = s.get(f"{API}/labs/{lab}").json()
    return [t["id"] for t in j["tasks"] if t["done"]], j


def assert_complete(s, lab):
    d, j = done(s, lab)
    assert len(d) == len(j["tasks"]), f"{lab} done={d}"
    assert j["completed_at"]
    assert j["score"] == 100


# Hub / access
class TestHub:
    def test_hub_module2_items(self, admin):
        h = admin.get(API).json()
        m2 = next(m for m in h["modules"] if m["id"] == 2)
        ids = [i["id"] for i in m2["items"]]
        assert ids[:17] == IDS
        assert ids[17:] == ["vm-quiz-vm-core", "vm-ctf-vm-hunt"]
        assert m2["items"][0]["free"] is True
        assert m2["items"][0]["title"] == "Lab 1 · Account and Application Setup"

    def test_student_locks(self, student):
        h = student.get(API).json()
        if h["access"]:
            pytest.skip("student has access")
        m2 = next(m for m in h["modules"] if m["id"] == 2)
        assert m2["items"][0]["locked"] is False
        assert all(i["locked"] for i in m2["items"][1:])
        assert student.get(f"{API}/labs/vm-lab-vm-01-setup").status_code == 200
        assert student.get(f"{API}/labs/vm-lab-vm-02-tags").status_code == 403
        assert student.get(f"{API}/quizzes/vm-quiz-vm-core").status_code == 403
        assert student.get(f"{API}/ctf/vm-ctf-vm-hunt").status_code == 403


# Labs 1-17 full completion via API
class TestLabs:
    def test_lab01_setup(self, admin):
        L = IDS[0]; reset(admin, L)
        ex(admin, L, f"ping {NET}247"); ex(admin, L, f"nslookup {NET}247"); ex(admin, L, f"nbtstat -A {NET}243")
        r = ev(admin, L, "hosts.added", ips=f"{NET}247-{NET}250", tracking="NetBIOS")
        assert "t4" not in r["new"]
        ev(admin, L, "hosts.added", ips=f"{NET}247-{NET}250", tracking="DNS")
        ev(admin, L, "hosts.added", ips=f"{NET}243-{NET}246", tracking="NetBIOS")
        ans(admin, L, "t6", "wrong", ok=False)
        ans(admin, L, "t6", "Host ID")
        assert_complete(admin, L)

    def test_lab02_tags(self, admin):
        L = IDS[1]; reset(admin, L)
        ev(admin, L, "tag.created", name="Operating Systems", engine="Static")
        ev(admin, L, "tag.rule_tested", engine="Asset Inventory", query="operatingSystem: Windows")
        ev(admin, L, "tag.created", name="Windows", parent="Operating Systems", engine="Asset Inventory", query="operatingSystem: Windows", evaluate="yes")
        ev(admin, L, "tag.created", name="Linux", parent="Operating Systems", engine="Asset Inventory", query="operatingSystem: Linux", evaluate="yes")
        ans(admin, L, "t5", "4")
        assert_complete(admin, L)

    def test_lab03_search(self, admin):
        L = IDS[2]; reset(admin, L)
        ev(admin, L, "asset.searched", os="Linux")
        ev(admin, L, "asset.searched", port="3389")
        ans(admin, L, "t3", "3")
        ev(admin, L, "inventory.queried", q="operatingSystem: Windows and port: 445")
        ev(admin, L, "tag.created", name="RDP Exposed")
        assert_complete(admin, L)

    def test_lab04_assign(self, admin):
        L = IDS[3]; reset(admin, L)
        ans(admin, L, "t1", "socp_dc05")
        ev(admin, L, "remediation.policy_created", title="Assign Remote Exploitable", action="Assign", target="AG: San Jose", vulns="Remote Exploitable", assignee="socp_dc05", due="30")
        ev(admin, L, "remediation.tickets_viewed")
        assert_complete(admin, L)

    def test_lab05_auth(self, admin):
        L = IDS[4]; reset(admin, L)
        ex(admin, L, "net user qscanner /domain")
        ex(admin, L, f'ssh qscanner@{NET}247 "sudo -l"')
        ev(admin, L, "auth.created", kind="Windows", title="TRN Domain", type="Domain", domain="trn.socp.test", user="qscanner", protocol="NTLMv2")
        ev(admin, L, "auth.created", kind="Unix", title="TRN Linux", user="qscanner", delegation="Sudo", ips=f"{NET}247-{NET}250")
        ans(admin, L, "t5", "Unix")
        assert_complete(admin, L)

    def test_lab06_users(self, admin):
        L = IDS[5]; reset(admin, L)
        ev(admin, L, "user.created", name="TEST_User", email="test_user@example.com", role="Remediation User", groups="AG: San Jose")
        ev(admin, L, "user.email_opened")
        ev(admin, L, "user.activated", code=422, login="socp_new1", password="bad")
        r = ev(admin, L, "user.activated", login="socp_new1", password=PW)
        assert "t4" in r["new"]
        ans(admin, L, "t5", "Reader")
        assert_complete(admin, L)

    def test_lab07_template(self, admin):
        L = IDS[6]; reset(admin, L)
        ev(admin, L, "template.created", title="Critical Remote Findings", findings="Host Based", trending="yes", filter="Custom", searchlist="Remote Exploitable")
        ev(admin, L, "report.generated", template="Critical Remote Findings", target="AG: San Jose", format="PDF")
        ans(admin, L, "t5", "Host Based")
        assert_complete(admin, L)

    def test_lab08_ignore(self, admin):
        L = IDS[7]; r = reset(admin, L)
        assert len(r["state"]["console"]["policies"]) == 1
        ev(admin, L, "remediation.policy_created", title="Ignore Accepted Risk", action="Ignore", vulns="Accepted Risk", reopen="yes", reopen_days="90")
        r = ev(admin, L, "remediation.policy_moved", title="Ignore Accepted Risk", position="1")
        assert r["lab"]["state"]["console"]["policies"][0]["title"] == "Ignore Accepted Risk"
        ev(admin, L, "remediation.policy_moved", code=422, title="Nope", position="1")
        ev(admin, L, "scan.launched", title="x", profile="Custom Authentication", target=RANGE)
        ans(admin, L, "t5", "top to bottom")
        _, j = done(admin, L)
        assert j["state"]["console"]["policies"][0]["title"] == "Ignore Accepted Risk"
        assert_complete(admin, L)

    def test_lab09_kb(self, admin):
        L = IDS[8]; reset(admin, L)
        ev(admin, L, "kb.searched", q="CVE-2017-0144")
        ev(admin, L, "kb.viewed", qid="91345")
        ans(admin, L, "t3", "91345")
        ev(admin, L, "kb.filtered", severity="5", type="Confirmed")
        ans(admin, L, "t5", "yellow")
        assert_complete(admin, L)

    def test_lab10_launch(self, admin):
        L = IDS[9]; reset(admin, L)
        ev(admin, L, "scan.launched", title="Custom Auth Scan", profile="Custom Authentication", target=RANGE)
        ev(admin, L, "scan.results_viewed", title="Custom Auth Scan")
        ans(admin, L, "t3", "2")
        r = ev(admin, L, "storage.saved", months="13")
        assert r["lab"]["state"]["console"]["storage"] == "13"
        ans(admin, L, "t5", "processed")
        assert_complete(admin, L)

    def test_lab11_organize(self, admin):
        L = IDS[10]; reset(admin, L)
        ev(admin, L, "asset_group.created", name="AG: San Jose", ips=RANGE, impact="Critical")
        ev(admin, L, "asset_group.created", name="AG: Linux Servers", ips=f"{NET}247-{NET}250", impact="Medium")
        ans(admin, L, "t4", "business impact"); ans(admin, L, "t5", "no")
        assert_complete(admin, L)

    def test_lab12_remreport(self, admin):
        L = IDS[11]; reset(admin, L)
        ev(admin, L, "report.generated", template="Executive Remediation Report", format="PDF")
        ev(admin, L, "report.viewed", template="Executive Remediation Report")
        ans(admin, L, "t3", "6")
        ev(admin, L, "report.downloaded", format="PDF")
        ans(admin, L, "t5", "overdue")
        assert_complete(admin, L)

    def test_lab13_reporting(self, admin):
        L = IDS[12]; reset(admin, L)
        ev(admin, L, "template.imported", title="High Severity Report")
        ev(admin, L, "report.generated", template="High Severity Report", target="AG: San Jose")
        ev(admin, L, "report.viewed", template="High Severity Report")
        ev(admin, L, "report.downloaded", format="CSV")
        ans(admin, L, "t5", "7")
        assert_complete(admin, L)

    def test_lab14_schedule(self, admin):
        L = IDS[13]; reset(admin, L)
        r = ev(admin, L, "scan.scheduled", title="Weekly Auth Scan", profile="Custom Authentication", frequency="Weekly", target=RANGE, tz="")
        assert "t3" not in r["new"]
        ev(admin, L, "scan.scheduled", title="Weekly Auth Scan", profile="Custom Authentication", frequency="Weekly", target=RANGE, tz="Asia/Kolkata")
        ev(admin, L, "schedule.run_now", title="Weekly Auth Scan")
        ans(admin, L, "t5", "daily")
        assert_complete(admin, L)

    def test_lab15_schedreports(self, admin):
        L = IDS[14]; reset(admin, L)
        ev(admin, L, "report.scheduled", title="Technical Report - Lab Hosts", frequency="Weekly", email="test@example.com", start="2026-02-02T06:00")
        ev(admin, L, "report.schedules_viewed")
        ans(admin, L, "t5", "after")
        assert_complete(admin, L)

    def test_lab16_searchlist(self, admin):
        L = IDS[15]; reset(admin, L)
        ev(admin, L, "searchlist.created", title="Critical Windows", kind="Dynamic", severity="5", category="Windows", **{"global": "yes"})
        ev(admin, L, "searchlist.created", title="Approved Exceptions", kind="Static", qids="82003, 90043")
        ev(admin, L, "searchlist.imported", title="Log4j Detection")
        ans(admin, L, "t5", "dynamic")
        assert_complete(admin, L)

    def test_lab17_assessment(self, admin):
        L = IDS[16]; reset(admin, L)
        ex(admin, L, f"Test-NetConnection {NET}247 -Port 22")
        ev(admin, L, "profile.ports_viewed")
        ev(admin, L, "option_profile.created", title="Custom Authentication", ports="Standard Scan", performance="Normal", detection="Complete", windows="yes", unix="yes", **{"global": "yes"})
        ans(admin, L, "t5", "1900")
        assert_complete(admin, L)


# Hints/solutions/penalties and persistence
class TestScoring:
    def test_hint_solution_penalty(self, admin):
        L = IDS[8]; reset(admin, L)
        admin.post(f"{API}/labs/{L}/hint/t1")
        j = admin.post(f"{API}/labs/{L}/solution/t2").json()
        assert j["tasks"][0]["hint"] and j["tasks"][1]["solution"]
        ev(admin, L, "kb.searched", q="CVE-2017-0144")
        ev(admin, L, "kb.viewed", qid="91345")
        ans(admin, L, "t3", "91345")
        ev(admin, L, "kb.filtered", severity="5", type="Confirmed")
        ans(admin, L, "t5", "yellow")
        _, j = done(admin, L)
        assert j["score"] == 85  # 100 - 5 - 10
        reset(admin, L)


# Quiz + CTF
class TestQuizCtf:
    def test_quiz(self, admin):
        q = admin.get(f"{API}/quizzes/vm-quiz-vm-core").json()
        assert len(q["questions"]) == 10
        r = admin.post(f"{API}/quizzes/vm-quiz-vm-core/submit", json={"answers": [1, 1, 1, 1, 1, 3, 1, 2, 2, 1]}).json()
        assert r["score"] == 100 and r["passed"]

    def test_ctf(self, admin):
        c = admin.get(f"{API}/ctf/vm-ctf-vm-hunt").json()
        assert len(c["challenges"]) == 4
        for i, f in enumerate(["91345", "TRN-DC01", "lnx-debian.trn.socp.test", "6"]):
            assert admin.post(f"{API}/ctf/vm-ctf-vm-hunt/submit", json={"index": i, "flag": f}).json()["correct"] is True
        assert admin.post(f"{API}/ctf/vm-ctf-vm-hunt/submit", json={"index": 0, "flag": "nope"}).json()["correct"] is False


# Module 1 regression smoke: still accessible
class TestRegression:
    def test_module1_lab(self, admin):
        r = admin.get(f"{API}/labs/vm-lab-ca-01-deploy")
        assert r.status_code == 200 and r.json()["module"] == 1
