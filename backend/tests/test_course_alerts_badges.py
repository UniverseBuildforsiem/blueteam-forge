# Iteration 8: New Course Alerts (sync -> course_alerts, prefs, unsubscribe) + Course Completion Badges
import hashlib
import hmac
import os
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")).rstrip("/")
ENV = dotenv_values("/app/backend/.env")
CRON = ENV["WEBHOOK_CRON_SECRET"].strip('"')
JWT = ENV["JWT_SECRET"].strip('"')
db = MongoClient(ENV["MONGO_URL"].strip('"'))[ENV["DB_NAME"].strip('"')]

STUDENT = {"email": "student@socforge.io", "password": "Student@123"}
TEST_CID = 584863


def tok(uid):
    return hmac.new(JWT.encode(), f"course-unsub:{uid}".encode(), hashlib.sha256).hexdigest()[:32]


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    r = x.post(f"{BASE_URL}/api/auth/login", json=STUDENT)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    return x


@pytest.fixture(scope="module")
def uid(s):
    return s.get(f"{BASE_URL}/api/auth/me").json()["id"]


def trigger():
    r = requests.post(f"{BASE_URL}/api/cron/course-sync", headers={"Authorization": f"Bearer {CRON}", "X-Webhook-Id": f"TEST_{uuid.uuid4()}"}, json={})
    assert r.status_code == 200 and r.json() == {"ok": True}, r.text
    before = (db.meta.find_one({"key": "course_sync"}) or {}).get("last_attempt")
    for _ in range(40):
        time.sleep(1)
        m = db.meta.find_one({"key": "course_sync"}) or {}
        if m.get("last_attempt") != before or m.get("last_ok") == m.get("last_attempt"):
            break
    # notify loop sends emails sequentially; wait until course_alerts count stabilises
    last, stable = -1, 0
    for _ in range(30):
        n = db.course_alerts.count_documents({})
        stable = stable + 1 if n == last else 0
        if stable >= 4:
            break
        last = n
        time.sleep(1)


# Preferences
class TestPrefs:
    def test_independent(self, s):
        r = s.patch(f"{BASE_URL}/api/me/preferences", json={"course_emails": False})
        assert r.status_code == 200 and r.json()["course_emails"] is False and "streak_emails" in r.json()
        streak = r.json()["streak_emails"]
        r = s.patch(f"{BASE_URL}/api/me/preferences", json={"streak_emails": not streak})
        assert r.json() == {"streak_emails": (not streak), "course_emails": False}
        r = s.patch(f"{BASE_URL}/api/me/preferences", json={"streak_emails": streak, "course_emails": True})
        assert r.json() == {"streak_emails": streak, "course_emails": True}
        assert s.get(f"{BASE_URL}/api/me/courses").json()["course_emails"] is True

    def test_empty_body(self, s):
        r = s.patch(f"{BASE_URL}/api/me/preferences", json={})
        assert r.status_code == 200 and set(r.json()) == {"streak_emails", "course_emails"}

    def test_unauth(self):
        assert requests.patch(f"{BASE_URL}/api/me/preferences", json={"course_emails": False}).status_code == 401


# Unsubscribe link
class TestUnsub:
    def test_invalid(self, s, uid):
        r = requests.get(f"{BASE_URL}/api/public/unsubscribe/course-alerts", params={"u": uid, "t": "deadbeef" * 4})
        assert r.status_code == 400 and "invalid" in r.text
        assert s.get(f"{BASE_URL}/api/me/courses").json()["course_emails"] is True
        assert requests.get(f"{BASE_URL}/api/public/unsubscribe/course-alerts").status_code == 400

    def test_valid(self, s, uid):
        r = requests.get(f"{BASE_URL}/api/public/unsubscribe/course-alerts", params={"u": uid, "t": tok(uid)})
        assert r.status_code == 200 and "unsubscribed" in r.text and "text/html" in r.headers["content-type"]
        assert s.get(f"{BASE_URL}/api/me/courses").json()["course_emails"] is False
        s.patch(f"{BASE_URL}/api/me/preferences", json={"course_emails": True})


# Completion badges
class TestCompletion:
    def test_complete_flow(self, s):
        assert s.post(f"{BASE_URL}/api/me/courses/999999/complete").status_code == 404
        assert requests.post(f"{BASE_URL}/api/me/courses/{TEST_CID}/complete").status_code == 401
        for _ in range(2):
            r = s.post(f"{BASE_URL}/api/me/courses/{TEST_CID}/complete")
            assert r.status_code == 200 and r.json() == {"completed": True}
        done = s.get(f"{BASE_URL}/api/me/courses").json()["completed"]
        assert done.count(TEST_CID) == 1
        b = [x for x in s.get(f"{BASE_URL}/api/dashboard").json()["badges"] if x["id"] == f"course-{TEST_CID}"]
        assert len(b) == 1 and b[0]["kind"] == "course" and b[0]["earned"] is True and b[0]["name"]
        pb = requests.get(f"{BASE_URL}/api/public/profile/demo").json()
        pbadges = pb.get("badges") or pb.get("profile", {}).get("badges") or []
        assert any(x["id"] == f"course-{TEST_CID}" and x.get("kind") == "course" for x in pbadges), pb.keys()
        for _ in range(2):
            r = s.delete(f"{BASE_URL}/api/me/courses/{TEST_CID}/complete")
            assert r.status_code == 200 and r.json() == {"completed": False}
        assert TEST_CID not in s.get(f"{BASE_URL}/api/me/courses").json()["completed"]
        assert not any(x["id"] == f"course-{TEST_CID}" for x in s.get(f"{BASE_URL}/api/dashboard").json()["badges"])


# Sync -> alerts
class TestSyncAlerts:
    def test_new_course_alerts_once_and_optout(self, s, uid):
        # opt out demo student
        s.patch(f"{BASE_URL}/api/me/preferences", json={"course_emails": False})
        try:
            db.course_alerts.delete_many({"course_id": TEST_CID})
            eligible = db.users.count_documents({"role": "student", "status": "active", "course_emails": {"$ne": False}})
            assert db.courses.delete_one({"id": TEST_CID}).deleted_count == 1
            trigger()
            assert db.courses.find_one({"id": TEST_CID, "active": True}), "course not re-synced"
            n1 = db.course_alerts.count_documents({"course_id": TEST_CID})
            assert n1 == eligible, f"alerts {n1} != eligible {eligible}"
            assert db.course_alerts.count_documents({"course_id": TEST_CID, "user_id": uid}) == 0
            trigger()
            assert db.course_alerts.count_documents({"course_id": TEST_CID}) == n1
        finally:
            s.patch(f"{BASE_URL}/api/me/preferences", json={"course_emails": True})
            assert db.courses.count_documents({"active": True}) == 13
