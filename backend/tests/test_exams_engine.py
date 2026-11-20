# Tests: certification exam engine (catalog, landing, practice/exam/cert flows, security, admin bank/tests/analytics)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "admin@socprofessionals.academy", "password": "Admin@123"}
STUDENT = {"email": "student@socprofessionals.academy", "password": "Student@123"}


def login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    return s


@pytest.fixture(scope="module")
def admin():
    return login(ADMIN)


@pytest.fixture(scope="module")
def student():
    return login(STUDENT)


@pytest.fixture(scope="module")
def created():
    return {"exams": [], "questions": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(created):
    yield
    s = login(ADMIN)
    for qid in created["questions"]:
        s.delete(f"{BASE_URL}/api/admin/questions/{qid}")
    for eid in created["exams"]:
        r = s.delete(f"{BASE_URL}/api/admin/exams/{eid}")
        if r.status_code == 400:  # has attempts -> unpublish
            s.post(f"{BASE_URL}/api/admin/exams/{eid}/status", json={"status": "draft"})


# ---- public catalog / landing
class TestPublic:
    def test_catalog(self):
        r = requests.get(f"{BASE_URL}/api/public/exams")
        assert r.status_code == 200
        csa = next(e for e in r.json() if e["id"] == "csa-v1")
        assert csa["code"] == "312-39" and csa["questions"] == 100 and csa["duration_min"] == 180 and csa["price"] == 973

    def test_landing(self):
        r = requests.get(f"{BASE_URL}/api/public/exams/csa-v1")
        assert r.status_code == 200
        d = r.json()
        assert d["pass_mark"] == 70 and d["attempts_max"] == 3 and d["cooldown_hours"] == 24 and d["identity"] == "name"
        assert len(d["domains"]) == 6 and len(d["samples"]) == 3 and d["signed_in"] is False
        assert all("why" in o for o in d["samples"][0]["options"]) and "correct" in d["samples"][0]

    def test_unknown_404(self):
        assert requests.get(f"{BASE_URL}/api/public/exams/nope-xyz").status_code == 404


# ---- admin guards
class TestGuards:
    def test_student_403(self, student):
        for p in ("/api/admin/questions", "/api/admin/exams", "/api/admin/scenarios", "/api/admin/exams/csa-v1/analytics"):
            assert student.get(f"{BASE_URL}{p}").status_code == 403, p

    def test_anon_401(self):
        assert requests.get(f"{BASE_URL}/api/me/exams").status_code == 401

    def test_paid_enroll_402(self, student):
        assert student.post(f"{BASE_URL}/api/exams/csa-v1/enroll").status_code == 402


# ---- practice flow on CSA
class TestPractice:
    def test_practice_flow(self, student):
        dash = student.get(f"{BASE_URL}/api/me/exams/csa-v1/dashboard").json()
        dom = dash["domain_names"][2]
        r = student.post(f"{BASE_URL}/api/exams/csa-v1/start", json={"mode": "practice", "domain": dom})
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        a = student.get(f"{BASE_URL}/api/exam-attempts/{aid}").json()
        assert a["deadline"] is None and a["hints_allowed"] is True
        assert all(q["domain"] == dom for q in a["questions"])
        q = a["questions"][0]
        assert "correct" not in q
        h = student.post(f"{BASE_URL}/api/exam-attempts/{aid}/hint/{q['qid']}")
        assert h.status_code == 200 and h.json()["hint"]
        c = student.put(f"{BASE_URL}/api/exam-attempts/{aid}/answer", json={"qid": q["qid"], "answer": [q["options"][0]["id"]], "check": True, "flagged": True})
        assert c.status_code == 200 and "correct" in c.json()["question"]
        again = student.put(f"{BASE_URL}/api/exam-attempts/{aid}/answer", json={"qid": q["qid"], "answer": [q["options"][1]["id"]]})
        assert again.status_code == 409
        a = student.get(f"{BASE_URL}/api/exam-attempts/{aid}").json()
        assert q["qid"] in a["flags"] and "correct" in a["questions"][0]
        s = student.post(f"{BASE_URL}/api/exam-attempts/{aid}/submit")
        assert s.status_code == 200
        res = student.get(f"{BASE_URL}/api/exam-attempts/{aid}/result").json()
        assert res["status"] == "submitted" and res["total"] == len(a["questions"])
        assert any(rec["practice"].startswith("/app/tests/csa-v1?practice=") for rec in res["recommendations"]) or res["percent"] >= 80


# ---- admin bank + new tests + security on exam/cert modes
class TestAdminAndSecurity:
    def test_question_crud_versions(self, admin, created):
        r = admin.post(f"{BASE_URL}/api/admin/questions", json={"type": "tf", "stem": "TEST_ SIEM correlates events?", "correct": ["a"], "domain": "TEST_Domain", "tags": ["test_tag"]})
        assert r.status_code == 200, r.text
        q = r.json()
        created["questions"].append(q["qid"])
        assert q["version"] == 1 and len(q["options"]) == 2
        u = admin.put(f"{BASE_URL}/api/admin/questions/{q['qid']}", json={"type": "tf", "stem": "TEST_ SIEM correlates events? v2", "correct": ["b"], "domain": "TEST_Domain"})
        assert u.status_code == 200 and u.json()["version"] == 2
        v = admin.get(f"{BASE_URL}/api/admin/questions/{q['qid']}/versions").json()
        assert [x["version"] for x in v] == [2, 1]
        rs = admin.post(f"{BASE_URL}/api/admin/questions/{q['qid']}/restore/1")
        assert rs.status_code == 200 and rs.json()["version"] == 3 and rs.json()["correct"] == ["a"]

    def test_validation(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/questions", json={"type": "multi", "stem": "TEST_ bad multi", "options": ["x", "y", "z"], "correct": ["a"], "domain": "D"})
        assert r.status_code == 422

    def test_search_special_chars(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/questions", params={"q": "(SIEM"})
        assert r.status_code == 200, f"search with '(' -> {r.status_code}"

    def test_import_preview(self, admin):
        csv = "type,stem,option_a,option_b,correct,domain\nsingle,TEST_ import question,A,B,a,TEST_Domain\nsingle,x,A,B,a,D\n"
        r = admin.post(f"{BASE_URL}/api/admin/questions/import", json={"format": "csv", "text": csv})
        assert r.status_code == 200 and r.json()["valid"] == 1 and len(r.json()["errors"]) == 1 and r.json()["committed"] is False

    def _mk_exam(self, admin, created, kind):
        qs = admin.get(f"{BASE_URL}/api/admin/questions", params={"domain": "Incidents, Events & Logging"}).json()["questions"][:5]
        body = {"title": f"TEST_ {kind} exam", "kind": kind, "price": 0, "duration_min": 30, "attempts_max": 3, "cooldown_hours": 24, "identity": "name",
                "selection": {"mode": "fixed", "ids": [q["qid"] for q in qs]}}
        e = admin.post(f"{BASE_URL}/api/admin/exams", json=body)
        assert e.status_code == 200, e.text
        eid = e.json()["id"]
        created["exams"].append(eid)
        assert admin.post(f"{BASE_URL}/api/admin/exams/{eid}/status", json={"status": "published"}).status_code == 200
        return eid

    def test_exam_mode_security(self, admin, student, created):
        eid = self._mk_exam(admin, created, "exam")
        assert student.post(f"{BASE_URL}/api/exams/{eid}/enroll").status_code == 200
        r = student.post(f"{BASE_URL}/api/exams/{eid}/start", json={"mode": "exam"})
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        a = student.get(f"{BASE_URL}/api/exam-attempts/{aid}").json()
        assert a["deadline"] and a["hints_allowed"] is False
        for q in a["questions"]:
            assert "correct" not in q and all("why" not in o for o in q["options"]) and "hint" not in q
        qid = a["questions"][0]["qid"]
        assert student.post(f"{BASE_URL}/api/exam-attempts/{aid}/hint/{qid}").status_code == 400
        assert student.put(f"{BASE_URL}/api/exam-attempts/{aid}/answer", json={"qid": qid, "answer": ["a"], "check": True}).status_code == 400
        # other user cannot read
        assert admin.get(f"{BASE_URL}/api/exam-attempts/{aid}").status_code == 404
        # resume
        r2 = student.post(f"{BASE_URL}/api/exams/{eid}/start", json={"mode": "exam"})
        assert r2.json() == {"id": aid, "resumed": True}
        assert student.put(f"{BASE_URL}/api/exam-attempts/{aid}/answer", json={"qid": qid, "answer": ["a"]}).status_code == 200
        assert student.post(f"{BASE_URL}/api/exam-attempts/{aid}/submit").status_code == 200
        an = admin.get(f"{BASE_URL}/api/admin/exams/{eid}/analytics")
        assert an.status_code == 200 and an.json()["submitted"] == 1 and an.json()["items"]

    def test_cert_mode_rules(self, admin, student, created):
        eid = self._mk_exam(admin, created, "certification")
        student.post(f"{BASE_URL}/api/exams/{eid}/enroll")
        assert student.post(f"{BASE_URL}/api/exams/{eid}/start", json={"mode": "certification", "name": "ab", "agree": True}).status_code == 400
        assert student.post(f"{BASE_URL}/api/exams/{eid}/start", json={"mode": "certification", "name": "TEST Student", "agree": False}).status_code == 400
        r = student.post(f"{BASE_URL}/api/exams/{eid}/start", json={"mode": "certification", "name": "TEST Student", "agree": True})
        assert r.status_code == 200, r.text
        aid = r.json()["id"]
        a = student.get(f"{BASE_URL}/api/exam-attempts/{aid}").json()
        assert all("correct" not in q and all("why" not in o for o in q["options"]) for q in a["questions"])
        qid = a["questions"][0]["qid"]
        assert student.put(f"{BASE_URL}/api/exam-attempts/{aid}/answer", json={"qid": qid, "answer": ["a"], "check": True}).status_code == 400
        assert student.post(f"{BASE_URL}/api/exam-attempts/{aid}/hint/{qid}").status_code == 400
        student.post(f"{BASE_URL}/api/exam-attempts/{aid}/submit")
        res = student.get(f"{BASE_URL}/api/exam-attempts/{aid}/result").json()
        if not res["passed"]:
            st = student.get(f"{BASE_URL}/api/me/exams/{eid}/dashboard").json()["status"]
            assert st["cert_attempts_left"] == 2 and st["cooldown_until"]
            again = student.post(f"{BASE_URL}/api/exams/{eid}/start", json={"mode": "certification", "name": "TEST Student", "agree": True})
            assert again.status_code == 400 and "Cooldown" in again.json()["detail"]
