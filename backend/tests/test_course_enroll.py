# Free-course enrollment / My courses tests (iteration 56)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
FREE = "384eef11de47"


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    return s


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


def _card(s, cid=FREE):
    r = s.get(f"{BASE_URL}/api/academy/courses")
    assert r.status_code == 200
    return next(c for c in r.json() if c["id"] == cid)


class TestEnrollFlow:
    def test_01_fresh_not_enrolled(self, student):
        c = _card(student)
        assert "enrolled" in c
        assert c["price"] == 0
        assert c["owned"] is False and c["enrolled"] is False

    def test_02_detail_forbidden(self, student):
        r = student.get(f"{BASE_URL}/api/academy/courses/{FREE}")
        assert r.status_code == 403
        assert "Enroll in this course" in r.json()["detail"]

    def test_03_public_landing_flags(self, student):
        r = student.get(f"{BASE_URL}/api/public/academy/courses/{FREE}")
        assert r.status_code == 200
        d = r.json()
        assert d["enrolled"] is False and d["owned"] is False and d["signed_in"] is True

    def test_04_public_landing_anon(self):
        d = requests.get(f"{BASE_URL}/api/public/academy/courses/{FREE}").json()
        assert d["signed_in"] is False and d["enrolled"] is False

    def test_05_enroll_unknown(self, student):
        r = student.post(f"{BASE_URL}/api/academy/courses/nope-xyz/enroll")
        assert r.status_code == 404

    def test_06_enroll_unauth(self):
        r = requests.post(f"{BASE_URL}/api/academy/courses/{FREE}/enroll")
        assert r.status_code in (401, 403)

    def test_07_enroll_and_idempotent(self, student):
        for _ in range(2):
            r = student.post(f"{BASE_URL}/api/academy/courses/{FREE}/enroll")
            assert r.status_code == 200
            assert r.json() == {"ok": True, "enrolled": True}
        c = _card(student)
        assert c["owned"] is True and c["enrolled"] is True
        d = student.get(f"{BASE_URL}/api/public/academy/courses/{FREE}").json()
        assert d["enrolled"] is True and d["owned"] is True

    def test_08_detail_ok_after_enroll(self, student):
        r = student.get(f"{BASE_URL}/api/academy/courses/{FREE}")
        assert r.status_code == 200
        assert r.json()["owned"] is True

    def test_09_admin_owned_not_enrolled(self, admin):
        c = _card(admin)
        assert c["owned"] is True
        assert admin.get(f"{BASE_URL}/api/academy/courses/{FREE}").status_code == 200


def test_enroll_paid_402(admin):
    """Temporarily create a published paid course, check 402, then delete."""
    from pymongo import MongoClient
    from dotenv import dotenv_values
    env = dotenv_values("/app/backend/.env")
    db = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
    cid = "TEST_paid_enroll_course"
    db.academy_courses.insert_one({"id": cid, "title": "TEST_paid", "status": "published", "price": 499, "mrp": 0, "modules": []})
    try:
        s = login("student@socprofessionals.academy", "Student@123")
        r = s.post(f"{BASE_URL}/api/academy/courses/{cid}/enroll")
        assert r.status_code == 402
        r = s.get(f"{BASE_URL}/api/academy/courses/{cid}")
        assert r.status_code == 403 and "Buy" in r.json()["detail"]
    finally:
        db.academy_courses.delete_one({"id": cid})
