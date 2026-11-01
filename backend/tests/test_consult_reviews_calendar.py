# Consultation post-session reviews + cron review requests + admin moderation (iteration 26)
import os
import time
from datetime import datetime, timedelta, timezone
import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
CRON = os.environ["WEBHOOK_CRON_SECRET"]
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
IST = timezone(timedelta(hours=5, minutes=30))


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


def slot(delta_min):
    t = datetime.now(IST) + timedelta(minutes=delta_min)
    return t.replace(second=0, microsecond=0).isoformat()


@pytest.fixture(scope="module")
def seeded():
    base = {"user_id": "TEST_u", "phone": "9876543210", "notes": "", "amount": 99, "topic": "Career switch into SOC", "created_at": datetime.now(timezone.utc).isoformat()}
    docs = [
        {"id": "TEST_past_paid", "name": "Meera Iyer", "email": "test_past@example.com", "slot_at": slot(-120), "status": "paid"},
        {"id": "TEST_past_done", "name": "Arjun", "email": "test_done@example.com", "slot_at": slot(-300), "status": "completed"},
        {"id": "TEST_recent", "name": "Recent One", "email": "test_recent@example.com", "slot_at": slot(-60), "status": "paid"},
        {"id": "TEST_future", "name": "Future One", "email": "test_future@example.com", "slot_at": slot(600), "status": "paid"},
        {"id": "TEST_resched", "name": "Res Ched", "email": "test_res@example.com", "slot_at": slot(-200), "status": "needs_reschedule"},
    ]
    db.consultations.insert_many([{**base, **d} for d in docs])
    yield
    ids = [d["id"] for d in docs]
    db.consultations.delete_many({"id": {"$in": ids}})
    db.consult_reviews.delete_many({"consultation_id": {"$in": ids}})


class TestCron:
    def test_wrong_token_401(self):
        r = requests.post(f"{BASE_URL}/api/cron/session-reminders", json={}, headers={"Authorization": "Bearer nope"})
        assert r.status_code == 401

    def test_no_token_401(self):
        r = requests.post(f"{BASE_URL}/api/cron/session-reminders", json={})
        assert r.status_code == 401

    def test_cron_sets_tokens(self, seeded):
        t0 = time.time()
        r = requests.post(f"{BASE_URL}/api/cron/session-reminders", json={"run_id": f"TEST_run_{time.time()}"}, headers={"Authorization": f"Bearer {CRON}"})
        assert r.status_code == 200 and r.json()["ok"] is True
        assert time.time() - t0 < 5
        time.sleep(6)
        g = {c["id"]: c for c in db.consultations.find({"id": {"$regex": "^TEST_"}}, {"_id": 0})}
        for k in ("TEST_past_paid", "TEST_past_done"):
            assert g[k].get("review_requested") is True and len(g[k]["review_token"]) > 10
        for k in ("TEST_recent", "TEST_future", "TEST_resched"):
            assert not g[k].get("review_requested") and not g[k].get("review_token")

    def test_cron_idempotent_token(self, seeded):
        tok = db.consultations.find_one({"id": "TEST_past_paid"})["review_token"]
        requests.post(f"{BASE_URL}/api/cron/session-reminders", json={"run_id": f"TEST_run2_{time.time()}"}, headers={"Authorization": f"Bearer {CRON}"})
        time.sleep(4)
        assert db.consultations.find_one({"id": "TEST_past_paid"})["review_token"] == tok


class TestPublicReview:
    def tok(self):
        return db.consultations.find_one({"id": "TEST_past_paid"})["review_token"]

    def test_info(self, seeded):
        r = requests.get(f"{BASE_URL}/api/public/reviews/{self.tok()}")
        assert r.status_code == 200
        d = r.json()
        assert d["name"] == "Meera I." and d["topic"] == "Career switch into SOC" and d["review"] is None and "IST" in d["when"] or d["when"]

    def test_bad_token_404(self):
        assert requests.get(f"{BASE_URL}/api/public/reviews/bogus-token-123456").status_code == 404
        assert requests.post(f"{BASE_URL}/api/public/reviews/bogus-token-123456", json={"rating": 5}).status_code == 404
        assert requests.get(f"{BASE_URL}/api/public/reviews/x").status_code == 404

    @pytest.mark.parametrize("bad", [{"rating": 0}, {"rating": 6}, {"rating": 5, "comment": "x" * 601}, {}])
    def test_validation_422(self, seeded, bad):
        assert requests.post(f"{BASE_URL}/api/public/reviews/{self.tok()}", json=bad).status_code == 422

    def test_submit_and_upsert(self, seeded):
        t = self.tok()
        r = requests.post(f"{BASE_URL}/api/public/reviews/{t}", json={"rating": 3, "comment": "Okay session overall"})
        assert r.status_code == 200
        rv = requests.get(f"{BASE_URL}/api/public/reviews/{t}").json()["review"]
        assert rv["rating"] == 3 and rv["display_name"] == "Meera I."
        assert requests.post(f"{BASE_URL}/api/public/reviews/{t}", json={"rating": 5, "comment": "  TEST_ Amazing guidance on SIEM path  "}).status_code == 200
        rv2 = requests.get(f"{BASE_URL}/api/public/reviews/{t}").json()["review"]
        assert rv2["rating"] == 5 and rv2["comment"] == "TEST_ Amazing guidance on SIEM path" and rv2["id"] == rv["id"]
        assert db.consult_reviews.count_documents({"consultation_id": "TEST_past_paid"}) == 1

    def test_public_list_filters(self, seeded):
        t2 = db.consultations.find_one({"id": "TEST_past_done"})["review_token"]
        requests.post(f"{BASE_URL}/api/public/reviews/{t2}", json={"rating": 5, "comment": "short"})
        d = requests.get(f"{BASE_URL}/api/public/reviews").json()
        ids = [r["consultation_id"] if "consultation_id" in r else r["display_name"] for r in d["reviews"]]
        names = [r["display_name"] for r in d["reviews"]]
        assert "Meera I." in names and "Arjun" not in names
        assert all(r["rating"] >= 4 and len(r["comment"]) >= 10 for r in d["reviews"])
        assert len(d["reviews"]) <= 9 and isinstance(d["count"], int)
        assert "user_id" not in d["reviews"][0] and "consultation_id" not in d["reviews"][0]
        assert ids


class TestAdminModeration:
    def test_non_admin_403(self, student):
        assert student.get(f"{BASE_URL}/api/admin/consult-reviews").status_code == 403
        assert student.patch(f"{BASE_URL}/api/admin/consult-reviews/x", json={"hidden": True}).status_code == 403

    def test_anon_401(self):
        assert requests.get(f"{BASE_URL}/api/admin/consult-reviews").status_code in (401, 403)

    def test_hide_show(self, admin, seeded):
        rs = admin.get(f"{BASE_URL}/api/admin/consult-reviews").json()
        r = next(x for x in rs if x["consultation_id"] == "TEST_past_paid")
        assert admin.patch(f"{BASE_URL}/api/admin/consult-reviews/{r['id']}", json={"hidden": True}).status_code == 200
        names = [x["display_name"] for x in requests.get(f"{BASE_URL}/api/public/reviews").json()["reviews"]]
        assert "Meera I." not in names
        assert admin.patch(f"{BASE_URL}/api/admin/consult-reviews/{r['id']}", json={"hidden": False}).status_code == 200
        names = [x["display_name"] for x in requests.get(f"{BASE_URL}/api/public/reviews").json()["reviews"]]
        assert "Meera I." in names

    def test_patch_404_and_422(self, admin):
        assert admin.patch(f"{BASE_URL}/api/admin/consult-reviews/TEST_nope", json={"hidden": True}).status_code == 404
        assert admin.patch(f"{BASE_URL}/api/admin/consult-reviews/TEST_nope", json={}).status_code == 422
