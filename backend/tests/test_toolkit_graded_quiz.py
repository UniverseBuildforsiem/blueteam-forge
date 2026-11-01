# Iteration 22: Investigation toolkit (intel / alert-iocs / sandbox report) + graded (required) lesson quizzes
import os
import pytest
import requests
from pathlib import Path


def _base():
    u = os.environ.get("REACT_APP_BACKEND_URL")
    if not u:
        for line in Path("/app/frontend/.env").read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                u = line.split("=", 1)[1].strip()
    return u.rstrip("/")


BASE = _base()
CONTENT = ("Phishing triage starts with the headers. Check SPF, DKIM and DMARC results, the Return-Path versus From domain, and the sending IP reputation. "
           "Then inspect URLs without clicking: expand shorteners, check domain age, and detonate in a sandbox.")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


VT_KEYS = {"indicator", "type", "verdict", "detections", "community_score", "first_seen", "last_seen", "details", "vendors", "related", "seen_in"}


# ---- Intel (VirusTotal-style) ----
class TestIntel:
    def test_malicious_ip(self, student):
        r = student.get(f"{BASE}/api/tools/intel", params={"q": "185.220.101.45"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert VT_KEYS <= set(d)
        assert d["type"] == "ip" and d["verdict"] == "malicious"
        assert d["detections"].endswith("/90") and int(d["detections"].split("/")[0]) > 0
        assert {"country", "asn", "as_owner"} <= set(d["details"])
        assert len(d["vendors"]) == 16 and all({"vendor", "result", "flagged"} <= set(v) for v in d["vendors"])
        assert any(v["flagged"] for v in d["vendors"])

    def test_internal_ip_clean(self, student):
        d = student.get(f"{BASE}/api/tools/intel", params={"q": "10.0.9.50"}).json()
        assert d["verdict"] == "clean"
        assert d["details"]["country"] == "Internal"
        assert not any(v["flagged"] for v in d["vendors"])

    def test_malicious_domain(self, student):
        d = student.get(f"{BASE}/api/tools/intel", params={"q": "northwind-helpdesk.example"}).json()
        assert d["type"] == "domain" and d["verdict"] == "malicious"
        assert {"registrar", "creation_date", "resolves_to"} <= set(d["details"])

    def test_unknown_domain(self, student):
        d = student.get(f"{BASE}/api/tools/intel", params={"q": "zzz-nothing.com"}).json()
        assert d["verdict"] == "unknown" and d["note"]
        assert d["vendors"] == []

    def test_hash_from_alert(self, student):
        a = student.get(f"{BASE}/api/tools/alert-iocs", params={"kind": "challenge", "id": "ch-phish-01"}).json()
        h = next((i["value"] for i in a["iocs"] if i["type"] == "hash"), None)
        if not h:
            pytest.skip("no hash in ch-phish-01")
        d = student.get(f"{BASE}/api/tools/intel", params={"q": h, "kind": "challenge", "id": "ch-phish-01"}).json()
        assert d["type"] == "hash" and d["detections"].endswith("/72")
        assert {"file_name", "file_type", "size", "family"} <= set(d["details"])
        assert any(s["id"] == "ch-phish-01" for s in d["seen_in"])

    def test_short_q_422(self, student):
        assert student.get(f"{BASE}/api/tools/intel", params={"q": "ab"}).status_code == 422

    def test_unauth_401(self):
        assert requests.get(f"{BASE}/api/tools/intel", params={"q": "185.220.101.45"}).status_code == 401


# ---- Alert IOCs ----
class TestAlertIocs:
    def test_challenge(self, student):
        r = student.get(f"{BASE}/api/tools/alert-iocs", params={"kind": "challenge", "id": "ch-phish-01"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["title"] and isinstance(d["iocs"], list)
        assert all({"type", "value", "internal"} <= set(i) for i in d["iocs"])
        assert "Invoice_88213.docm" in d["files"] and "stage2.bin" in d["files"]

    def test_lab(self, student):
        d = student.get(f"{BASE}/api/tools/alert-iocs", params={"kind": "lab", "id": "lab-linux-cron"}).json()
        assert any(i["value"] == "185.243.115.9" for i in d["iocs"])
        assert any("/etc/cron.d/sysupdate" in f for f in d["files"])

    def test_bad_id_404(self, student):
        assert student.get(f"{BASE}/api/tools/alert-iocs", params={"kind": "challenge", "id": "nope-xyz"}).status_code == 404

    def test_bad_kind_422(self, student):
        assert student.get(f"{BASE}/api/tools/alert-iocs", params={"kind": "foo", "id": "ch-phish-01"}).status_code == 422


# ---- Sandbox report ----
class TestSandbox:
    def test_malicious_doc(self, student):
        r = student.get(f"{BASE}/api/tools/sandbox/report", params={"file": "Invoice_88213.docm", "kind": "challenge", "id": "ch-phish-01"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["verdict"] == "malicious" and d["score"] >= 70
        for k in ("sha256", "environment", "processes", "network", "files", "signatures", "mitre"):
            assert k in d
        a = student.get(f"{BASE}/api/tools/alert-iocs", params={"kind": "challenge", "id": "ch-phish-01"}).json()
        hashes = [i["value"] for i in a["iocs"] if i["type"] == "hash"]
        if hashes:
            assert d["sha256"] == hashes[0]
        assert d["mitre"] and d["processes"]

    def test_fp_clean(self, student):
        a = student.get(f"{BASE}/api/tools/alert-iocs", params={"kind": "challenge", "id": "ch-mal-01"}).json()
        f = next((x for x in a["files"] if "wsus_sync.ps1" in x), None)
        assert f, a["files"]
        d = student.get(f"{BASE}/api/tools/sandbox/report", params={"file": f, "kind": "challenge", "id": "ch-mal-01"}).json()
        assert d["verdict"] == "clean" and d["score"] < 20

    def test_file_not_in_alert_404(self, student):
        r = student.get(f"{BASE}/api/tools/sandbox/report", params={"file": "evil.exe", "kind": "challenge", "id": "ch-phish-01"})
        assert r.status_code == 404


# ---- Graded lesson quizzes ----
QS = [{"id": f"q{i}", "text": f"Question {i}?", "options": ["a", "b", "c", "d"], "answer": i % 4, "explanation": f"because {i}"} for i in range(5)]
RIGHT = [i % 4 for i in range(5)]


def make_path():
    return {"title": "TEST_Graded Path", "description": "test", "level": "Beginner", "published": True, "order": 99,
            "modules": [{"id": "m1", "title": "M1", "lessons": [
                {"id": "l-graded-t1", "title": "Graded", "content": CONTENT, "quiz": {"required": True, "questions": QS}},
                {"id": "l-practice-t1", "title": "Practice", "content": CONTENT, "quiz": {"questions": QS}},
                {"id": "l-noquiz-t1", "title": "Plain", "content": CONTENT}]}]}


def xp(s):
    return s.get(f"{BASE}/api/auth/me").json().get("xp", 0)


class TestGradedQuiz:
    pid = None

    def test_create(self, admin):
        r = admin.post(f"{BASE}/api/manage/paths", json=make_path())
        assert r.status_code == 200, r.text
        TestGradedQuiz.pid = r.json()["id"]

    def test_student_view_strips(self, student):
        g = student.get(f"{BASE}/api/paths/{self.pid}").json()
        ls = g["modules"][0]["lessons"]
        req = ls[0]["quiz"]
        assert req["required"] is True and req["pass_count"] == 3
        assert all("answer" not in q and "explanation" not in q for q in req["questions"])
        assert ls[1]["quiz"]["questions"][0]["answer"] == 0  # practice unchanged

    def test_complete_blocked(self, student):
        r = student.post(f"{BASE}/api/paths/{self.pid}/lessons/l-graded-t1/complete")
        assert r.status_code == 400

    def test_wrong_count_422(self, student):
        r = student.post(f"{BASE}/api/paths/{self.pid}/lessons/l-graded-t1/quiz", json={"answers": [0, 1]})
        assert r.status_code == 422

    def test_practice_400(self, student):
        r = student.post(f"{BASE}/api/paths/{self.pid}/lessons/l-practice-t1/quiz", json={"answers": RIGHT})
        assert r.status_code == 400
        r = student.post(f"{BASE}/api/paths/{self.pid}/lessons/l-noquiz-t1/quiz", json={"answers": RIGHT})
        assert r.status_code == 400

    def test_fail(self, student):
        ans = RIGHT[:2] + [(a + 1) % 4 for a in RIGHT[2:]]  # 2 correct
        d = student.post(f"{BASE}/api/paths/{self.pid}/lessons/l-graded-t1/quiz", json={"answers": ans}).json()
        assert d["passed"] is False and d["score"] == 2 and d["pass_count"] == 3 and d["xp"] == 0
        assert "answer" in d["results"][0] and "answer" not in d["results"][3] and "explanation" not in d["results"][3]
        g = student.get(f"{BASE}/api/paths/{self.pid}").json()
        assert "l-graded-t1" not in g["completed_lessons"]

    def test_pass_awards_once(self, student):
        before = xp(student)
        ans = RIGHT[:3] + [(a + 1) % 4 for a in RIGHT[3:]]  # 3 correct
        d = student.post(f"{BASE}/api/paths/{self.pid}/lessons/l-graded-t1/quiz", json={"answers": ans}).json()
        assert d["passed"] is True and d["completed"] is True and d["xp"] == 10
        assert all("answer" in r for r in d["results"])
        g = student.get(f"{BASE}/api/paths/{self.pid}").json()
        assert "l-graded-t1" in g["completed_lessons"]
        assert xp(student) == before + 10
        d2 = student.post(f"{BASE}/api/paths/{self.pid}/lessons/l-graded-t1/quiz", json={"answers": RIGHT}).json()
        assert d2["passed"] is True and d2["xp"] == 0 and d2["completed"] is False
        assert xp(student) == before + 10
        assert student.post(f"{BASE}/api/paths/{self.pid}/lessons/l-graded-t1/complete").status_code == 200

    def test_admin_manage_keeps_answers(self, admin):
        rows = admin.get(f"{BASE}/api/manage/paths").json()
        p = next(x for x in rows if x["id"] == self.pid)
        q = p["modules"][0]["lessons"][0]["quiz"]
        assert q["required"] is True and q["questions"][0]["answer"] == 0

    def test_cleanup(self, admin):
        assert admin.delete(f"{BASE}/api/manage/paths/{self.pid}").status_code == 200
