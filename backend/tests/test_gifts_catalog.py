# Gift a Course + catalog backend tests (iteration 50)
import json
import os
import subprocess
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SIM = "/app/backend/tests/gift_sim.py"
SEED_CODE = "smLGnqqTMVsVHpih"
TAG = uuid.uuid4().hex[:6]
CREATED = {"payments": [], "users": []}


def sim(*args):
    out = subprocess.run(["python", SIM, *args], capture_output=True, text=True, timeout=90)
    assert out.returncode == 0, out.stderr[-2000:]
    return json.loads(out.stdout.strip().splitlines()[-1])


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s, r.json()


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


@pytest.fixture(scope="module")
def fresh():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/register", json={"name": "TEST Gift User", "email": f"test_gift_{TAG}@example.com",
                                                     "username": f"testgift{TAG}", "password": "TestGift@123!"})
    assert r.status_code == 200, r.text
    CREATED["users"].append(r.json()["id"])
    return s, r.json()


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    print(sim("cleanup", ",".join(CREATED["payments"]), ",".join(CREATED["users"])))


GIFT = {"to_name": "TEST Friend", "to_email": "delivered@resend.dev", "message": "hi"}


# Catalog public endpoints
class TestCatalog:
    def test_public_courses(self):
        r = requests.get(f"{BASE_URL}/api/public/academy/courses")
        assert r.status_code == 200
        ids = {c["id"]: c for c in r.json()}
        assert "test-paid-course" in ids and "test-free-course" in ids
        assert ids["test-paid-course"]["off"] > 0 and ids["test-free-course"]["price"] == 0

    def test_public_bundles(self):
        r = requests.get(f"{BASE_URL}/api/public/academy/bundles")
        assert r.status_code == 200
        assert any(b["id"] == "86fce03a566a" for b in r.json())


# Order creation validation with gift
class TestGiftOrder:
    def test_invalid_email_422(self, student):
        s, _ = student
        r = s.post(f"{BASE_URL}/api/payments/razorpay/order", json={"plan": "course:test-paid-course", "gift": {**GIFT, "to_email": "bad"}})
        assert r.status_code == 422

    def test_non_course_plan_400(self, student):
        s, _ = student
        r = s.post(f"{BASE_URL}/api/payments/razorpay/order", json={"plan": "sop-bundle", "gift": GIFT})
        assert r.status_code == 400 and "Only courses and bundles" in r.json()["detail"]

    def test_valid_course_gift_503(self, student):
        s, _ = student
        r = s.post(f"{BASE_URL}/api/payments/razorpay/order", json={"plan": "course:test-paid-course", "gift": GIFT})
        assert r.status_code == 503, r.text

    def test_valid_bundle_gift_503(self, student):
        s, _ = student
        r = s.post(f"{BASE_URL}/api/payments/razorpay/order", json={"plan": "bundle:86fce03a566a", "gift": GIFT})
        assert r.status_code == 503, r.text

    def test_free_course_gift_400(self, student):
        s, _ = student
        r = s.post(f"{BASE_URL}/api/payments/razorpay/order", json={"plan": "course:test-free-course", "gift": GIFT})
        assert r.status_code == 400, r.text

    def test_bundle_gift_with_coupon_400(self, student):
        s, _ = student
        r = s.post(f"{BASE_URL}/api/payments/razorpay/order", json={"plan": "bundle:86fce03a566a", "gift": GIFT, "coupon": "ANY"})
        assert r.status_code == 400

    def test_invalid_send_on_422(self, student):
        s, _ = student
        r = s.post(f"{BASE_URL}/api/payments/razorpay/order", json={"plan": "course:test-paid-course", "gift": {**GIFT, "send_on": "notadate"}})
        assert r.status_code == 422, r.text

    def test_logged_out_401(self):
        r = requests.post(f"{BASE_URL}/api/payments/razorpay/order", json={"plan": "course:test-paid-course", "gift": GIFT})
        assert r.status_code == 401


# Public gift view + redeem
class TestGiftPublic:
    def test_view_no_email(self):
        r = requests.get(f"{BASE_URL}/api/public/gifts/{SEED_CODE}")
        assert r.status_code == 200
        d = r.json()
        assert "to_email" not in d and "delivered@resend.dev" not in r.text
        assert d["item_id"] == "test-paid-course" and d["signed_in"] is False

    def test_view_unknown_404(self):
        assert requests.get(f"{BASE_URL}/api/public/gifts/TEST_nope").status_code == 404

    def test_redeem_logged_out_401(self):
        assert requests.post(f"{BASE_URL}/api/gifts/{SEED_CODE}/redeem").status_code == 401

    def test_admin_owns_all(self, admin):
        s, _ = admin
        assert s.get(f"{BASE_URL}/api/public/gifts/{SEED_CODE}").json()["owns_all"] is True
        r = s.post(f"{BASE_URL}/api/gifts/{SEED_CODE}/redeem")
        assert r.status_code == 400 and "already own" in r.json()["detail"]


# activate() gift branch, cron delivery, send-now, redeem bundle
class TestGiftLifecycle:
    def test_activate_immediate_and_redeem(self, student, fresh):
        _, u = student
        pid = f"TEST_pay_now_{TAG}"
        CREATED["payments"].append(pid)
        d = sim("activate", pid, u["id"], "course:test-paid-course", "none")
        g = d["gift"]
        assert g and g["from_user_id"] == u["id"] and d["buyer_purchase"] is None
        assert g["status"] == "sent", g
        fs, fu = fresh
        r = fs.post(f"{BASE_URL}/api/gifts/{g['code']}/redeem")
        assert r.status_code == 200 and r.json()["go"] == "/app/courses/test-paid-course"
        assert fs.get(f"{BASE_URL}/api/public/gifts/{g['code']}").json()["redeemed_by_you"] is True
        assert fs.post(f"{BASE_URL}/api/gifts/{g['code']}/redeem").status_code == 400
        assert any(p["product_id"] == "course:test-paid-course" for p in sim("purchases", fu["id"]))

    def test_scheduled_then_cron(self, student, admin):
        s, u = student
        pid = f"TEST_pay_sched_{TAG}"
        CREATED["payments"].append(pid)
        g = sim("activate", pid, u["id"], "course:test-paid-course", "2031-05-01T08:00:00Z")["gift"]
        assert g["status"] == "scheduled"
        sent = s.get(f"{BASE_URL}/api/gifts/sent").json()
        row = next(x for x in sent if x["id"] == g["id"])
        assert row["link"].endswith(f"/gift/{g['code']}") and "redeemed_by" not in row
        # other user's send-now -> 404
        a, _ = admin
        assert a.post(f"{BASE_URL}/api/gifts/{g['id']}/send-now").status_code == 404
        sim("set_past", g["id"])
        secret = [l.split("=", 1)[1].strip().strip('"') for l in open("/app/backend/.env") if l.startswith("WEBHOOK_CRON_SECRET")][0]
        r = requests.post(f"{BASE_URL}/api/cron/session-reminders", headers={"Authorization": f"Bearer {secret}"}, json={"run_id": f"TEST_run_{uuid.uuid4().hex}"})
        assert r.status_code == 200, r.text
        import time
        for _ in range(15):
            time.sleep(2)
            if sim("get", g["id"])["status"] == "sent":
                break
        assert sim("get", g["id"])["status"] == "sent"
        # resend now as owner
        r = s.post(f"{BASE_URL}/api/gifts/{g['id']}/send-now")
        assert r.status_code == 200, r.text

    def test_bundle_gift_redeem(self, admin, fresh):
        _, u = admin
        pid = f"TEST_pay_bundle_{TAG}"
        CREATED["payments"].append(pid)
        g = sim("activate", pid, u["id"], "bundle:86fce03a566a", "none")["gift"]
        assert g["courses"] == ["test-paid-course", "test-paid-course-2"]
        fs, fu = fresh
        # fresh user already owns test-paid-course from previous test but not course-2 -> can redeem
        r = fs.post(f"{BASE_URL}/api/gifts/{g['code']}/redeem")
        assert r.status_code == 200 and r.json()["go"] == "/app/courses"
        prods = {p["product_id"] for p in sim("purchases", fu["id"])}
        assert {"bundle:86fce03a566a", "course:test-paid-course-2"} <= prods

    def test_cron_unauthorized(self):
        assert requests.post(f"{BASE_URL}/api/cron/session-reminders").status_code in (401, 403)
