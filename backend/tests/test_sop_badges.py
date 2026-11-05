# SOP Mastery badges regression tests (iteration 33)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = ("admin@socprofessionals.academy", "Admin@123")
STUDENT = ("student@socprofessionals.academy", "Student@123")
EMAIL_LAB = "sop-users-reported-malware-email"
EXPECTED = {"sop-identity": 11, "sop-cloud-identity": 11, "sop-endpoint": 16, "sop-network": 6,
            "sop-application": 9, "sop-email-security": 1, "sop-data-protection": 1}


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


def sop_map(sess):
    r = sess.get(f"{BASE_URL}/api/me/badges")
    assert r.status_code == 200, r.text
    return {b["id"]: b for b in r.json()["badges"] if b["id"].startswith("sop-")}


# Badge list structure
class TestBadgeList:
    def test_admin_has_7_sop_badges(self, admin):
        m = sop_map(admin)
        assert set(m) == set(EXPECTED), m.keys()
        for bid, total in EXPECTED.items():
            b = m[bid]
            assert b["kind"] == "sop"
            assert b["progress"][1] == total, (bid, b["progress"])
            assert 0 <= b["progress"][0] <= total
            assert b["earned"] == (b["progress"][0] == total)
            assert b["name"].endswith(" Master")
            assert "level" in b

    def test_student_badges_zero_progress(self, student):
        m = sop_map(student)
        assert len(m) == 7
        for b in m.values():
            assert b["progress"][0] == 0 and b["earned"] is False

    def test_share_card_unearned_404(self, student):
        r = student.post(f"{BASE_URL}/api/me/badges/sop-identity/share-card")
        assert r.status_code == 404

    def test_dashboard_includes_sop_badges(self, admin):
        r = admin.get(f"{BASE_URL}/api/dashboard")
        assert r.status_code == 200
        ids = {b["id"] for b in r.json()["badges"]}
        assert set(EXPECTED) <= ids


# Passing the single Email Security lab grants badge (run after UI pass or does pass itself)
class TestEmailBadge:
    def test_pass_email_lab_and_badge(self, admin):
        before = sop_map(admin)["sop-email-security"]
        lab = admin.get(f"{BASE_URL}/api/sop-labs/{EMAIL_LAB}").json()
        assert lab["category"] == "Email Security"
        n = len(lab["questions"])
        r = admin.post(f"{BASE_URL}/api/sop-labs/{EMAIL_LAB}/submit",
                       json={"answers": [0] * n, "verdict": "true_positive", "severity": "Low", "containment": []})
        assert r.status_code == 200, r.text
        key = r.json()
        if not key["passed"]:
            assert key["badge"] is None
        perfect = {"answers": [q["answer"] for q in key["questions"]], "verdict": key["verdict"]["answer"],
                   "severity": key["severity"]["answer"], "containment": [i for i, c in enumerate(key["containment"]) if c["correct"]]}
        r2 = admin.post(f"{BASE_URL}/api/sop-labs/{EMAIL_LAB}/submit", json=perfect)
        d = r2.json()
        assert d["score"] == 100 and d["passed"]
        if before["earned"]:
            assert d["badge"] is None and d["xp"] == 0  # already passed earlier
        after = sop_map(admin)["sop-email-security"]
        assert after["earned"] is True and after["progress"] == [1, 1]

    def test_share_card_and_png(self, admin):
        r = admin.post(f"{BASE_URL}/api/me/badges/sop-email-security/share-card")
        assert r.status_code == 200, r.text
        d = r.json()
        png = requests.get(d["image_url"])
        assert png.status_code == 200
        assert png.headers["content-type"] == "image/png"
        assert png.content[:8] == b"\x89PNG\r\n\x1a\n" and len(png.content) > 10000
        page = requests.get(d["share_url"])
        assert page.status_code == 200 and "Email Security Master" in page.text
