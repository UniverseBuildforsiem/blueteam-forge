# SOP Practice Lab + landing SOP list regression tests (iteration 32)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SID = "sop-m365-password-spray"
ADMIN = ("admin@socprofessionals.academy", "Admin@123")
STUDENT = ("student@socprofessionals.academy", "Student@123")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def admin():
    return login(*ADMIN)


@pytest.fixture(scope="module")
def student():
    return login(*STUDENT)


@pytest.fixture(scope="module")
def answer_key(admin):
    """Submit once with zeros to learn the shuffled correct indices (used for grading tests)."""
    lab = admin.get(f"{BASE_URL}/api/sop-labs/{SID}").json()
    n = len(lab["questions"])
    r = admin.post(f"{BASE_URL}/api/sop-labs/{SID}/submit", json={"answers": [0] * n, "verdict": "false_positive", "severity": "Low", "containment": []})
    assert r.status_code == 200, r.text
    return lab, r.json()


# Public index + card has_lab
class TestIndex:
    def test_lab_index_55(self):
        r = requests.get(f"{BASE_URL}/api/public/sop-labs")
        assert r.status_code == 200
        ready = r.json()["ready"]
        assert len(ready) == 55, len(ready)
        assert SID in ready

    def test_sop_cards_has_lab(self):
        r = requests.get(f"{BASE_URL}/api/public/sops")
        assert r.status_code == 200, r.status_code
        sops = r.json()["sops"]
        assert len(sops) == 67
        with_lab = [s for s in sops if s["has_lab"]]
        assert len(with_lab) == 55
        free = [s for s in sops if s["free"]]
        assert len(free) == 5


# GET lab
class TestGetLab:
    def test_admin_get_no_leak(self, admin):
        r = admin.get(f"{BASE_URL}/api/sop-labs/{SID}")
        assert r.status_code == 200
        d = r.json()
        assert d["sop_id"] == SID
        assert 14 <= len(d["logs"]) <= 20 or len(d["logs"]) >= 10
        for l in d["logs"]:
            assert set(l.keys()) == {"ts", "source", "line"}
        assert 4 <= len(d["questions"]) <= 6
        for q in d["questions"]:
            assert set(q.keys()) == {"q", "options"}
            assert len(q["options"]) == 4
        assert all(isinstance(c, str) for c in d["containment"])
        for k in ("verdict", "severity", "summary", "verdict_explain", "answers"):
            assert k not in d
        assert d["severities"] == ["Low", "Medium", "High", "Critical"]
        assert "entities" in d["alert"] and d["background"]

    def test_unknown_404(self, admin):
        assert admin.get(f"{BASE_URL}/api/sop-labs/nope-xyz").status_code == 404

    def test_student_premium_403(self, student):
        assert student.get(f"{BASE_URL}/api/sop-labs/{SID}").status_code == 403
        r = student.post(f"{BASE_URL}/api/sop-labs/{SID}/submit", json={"answers": [0] * 5, "verdict": "true_positive", "severity": "High", "containment": [0]})
        assert r.status_code == 403

    def test_logged_out_401(self):
        assert requests.get(f"{BASE_URL}/api/sop-labs/{SID}").status_code in (401, 403)


# Submit + grading
class TestSubmit:
    def test_wrong_count_400(self, admin):
        r = admin.post(f"{BASE_URL}/api/sop-labs/{SID}/submit", json={"answers": [0], "verdict": "true_positive", "severity": "High", "containment": [0]})
        assert r.status_code == 400

    def test_unknown_submit_404(self, admin):
        r = admin.post(f"{BASE_URL}/api/sop-labs/nope-xyz/submit", json={"answers": [0], "verdict": "true_positive", "severity": "High", "containment": [0]})
        assert r.status_code == 404

    def test_result_shape_and_shuffle(self, answer_key):
        lab, res = answer_key
        assert res["pass_mark"] == 70
        assert len(res["questions"]) == len(lab["questions"])
        for q, lq in zip(res["questions"], lab["questions"]):
            assert q["options"] == lq["options"]
            assert q["explain"]
        assert len(res["evidence"]) >= 1
        assert res["verdict"]["answer"] in ("true_positive", "false_positive")
        assert res["severity"]["answer"] in ("Low", "Medium", "High", "Critical")
        assert [c["action"] for c in res["containment"]] == lab["containment"]

    def test_shuffle_across_labs(self, admin):
        """Correct answer positions across several labs should not all be 0."""
        ready = requests.get(f"{BASE_URL}/api/public/sop-labs").json()["ready"][:6]
        positions = []
        for sid in ready:
            lab = admin.get(f"{BASE_URL}/api/sop-labs/{sid}").json()
            r = admin.post(f"{BASE_URL}/api/sop-labs/{sid}/submit", json={"answers": [0] * len(lab["questions"]), "verdict": "false_positive", "severity": "Low", "containment": []})
            positions += [q["answer"] for q in r.json()["questions"]]
        assert len(set(positions)) >= 3, positions
        assert positions.count(0) < len(positions) * 0.6

    def test_perfect_score_100(self, admin, answer_key):
        lab, res = answer_key
        body = {"answers": [q["answer"] for q in res["questions"]], "verdict": res["verdict"]["answer"],
                "severity": res["severity"]["answer"], "containment": [i for i, c in enumerate(res["containment"]) if c["correct"]]}
        xp0 = admin.get(f"{BASE_URL}/api/auth/me").json().get("xp")
        r = admin.post(f"{BASE_URL}/api/sop-labs/{SID}/submit", json=body)
        assert r.status_code == 200
        d = r.json()
        assert d["score"] == 100 and d["passed"] is True
        assert all(q["correct"] for q in d["questions"])
        xp1 = admin.get(f"{BASE_URL}/api/auth/me").json().get("xp")
        print("xp", xp0, xp1, "awarded", d["xp"])
        if d["xp"]:
            assert xp1 - xp0 == 50
        # second pass awards nothing
        r2 = admin.post(f"{BASE_URL}/api/sop-labs/{SID}/submit", json=body).json()
        assert r2["xp"] == 0 and r2["passed"]
        xp2 = admin.get(f"{BASE_URL}/api/auth/me").json().get("xp")
        assert xp2 == xp1
        best = admin.get(f"{BASE_URL}/api/sop-labs/{SID}").json()["best"]
        assert best["score"] == 100 and best["passed"]

    def test_wrong_containment_penalty(self, admin, answer_key):
        lab, res = answer_key
        body = {"answers": [q["answer"] for q in res["questions"]], "verdict": res["verdict"]["answer"],
                "severity": res["severity"]["answer"], "containment": list(range(len(res["containment"])))}
        d = admin.post(f"{BASE_URL}/api/sop-labs/{SID}/submit", json=body).json()
        assert d["score"] < 100
