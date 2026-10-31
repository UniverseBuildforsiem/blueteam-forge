# Course Sync / Course-to-Lab links / Recommended course tests (iteration 7)
import os
import sys
import time
import uuid
import asyncio
import pytest
import requests
from dotenv import dotenv_values

BASE_URL = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")
SECRET = dotenv_values("/app/backend/.env")["WEBHOOK_CRON_SECRET"].strip('"')


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    return s


# --- public catalogue ---
class TestPublicCourses:
    def test_shape(self):
        r = requests.get(f"{BASE_URL}/api/public/courses")
        assert r.status_code == 200
        d = r.json()
        assert set(["courses", "synced_at", "store_url"]) <= set(d)
        assert len(d["courses"]) == 13, len(d["courses"])
        for c in d["courses"]:
            for k in ["id", "title", "type", "price", "mrp", "off", "image", "url", "tags", "practice", "topics"]:
                assert k in c, (k, c["id"])
            assert "_id" not in c
            assert c["url"] == f"https://www.socprofessionals.com/courses/{c['id']}", c["url"]
            assert c["practice"] and all(set(p) >= {"key", "kind", "title", "link"} for p in c["practice"])
            assert all(p["link"].startswith("/app/") for p in c["practice"])
            assert c["type"] in ("Videos", "Tests", "Files")

    def test_csa_has_phish_lab(self):
        cs = requests.get(f"{BASE_URL}/api/public/courses").json()["courses"]
        csa = [c for c in cs if "csa" in c["title"].lower()]
        assert csa
        assert any(p["link"] == "/app/labs/lab-phish-ransom" for c in csa for p in c["practice"])


# --- cron course-sync ---
class TestCron:
    URL = f"{BASE_URL}/api/cron/course-sync"

    def test_no_auth(self):
        assert requests.post(self.URL, json={}).status_code == 401

    def test_wrong_auth(self):
        assert requests.post(self.URL, json={}, headers={"Authorization": "Bearer nope"}).status_code == 401

    def test_ok_and_dedupe_and_synced_at(self):
        before = requests.get(f"{BASE_URL}/api/public/courses").json()["synced_at"]
        rid = f"TEST_{uuid.uuid4()}"
        h = {"Authorization": f"Bearer {SECRET}", "X-Webhook-Id": rid}
        t = time.time()
        r = requests.post(self.URL, json={}, headers=h)
        assert r.status_code == 200 and r.json() == {"ok": True}
        assert time.time() - t < 5
        r2 = requests.post(self.URL, json={}, headers=h)
        assert r2.status_code == 200 and r2.json().get("duplicate") is True
        after = before
        for _ in range(15):
            time.sleep(2)
            after = requests.get(f"{BASE_URL}/api/public/courses").json()["synced_at"]
            if after != before:
                break
        assert after and after != before, (before, after)


# --- recommended ---
class TestRecommended:
    def test_logged_out(self):
        assert requests.get(f"{BASE_URL}/api/courses/recommended").status_code == 401

    def test_student(self):
        s = login("student@socforge.io", "Student@123")
        r = s.get(f"{BASE_URL}/api/courses/recommended")
        assert r.status_code == 200
        d = r.json()
        assert d["course"] and d["reason"]
        acc = s.get(f"{BASE_URL}/api/me/analytics").json()["accuracy"]
        print("accuracy", acc, "->", d.get("topic"), d["course"]["title"])
        if acc:
            assert d["topic"] in d["course"]["topics"]
            assert d["accuracy"] == next(a["accuracy"] for a in acc if a["topic"] == d["topic"])


# --- sync failure keeps last list (direct call, monkeypatched SOURCE) ---
def test_sync_failure_keeps_courses():
    sys.path.insert(0, "/app/backend")
    os.chdir("/app/backend")
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    import routes_courses as rc

    async def run():
        before = await rc.db.courses.count_documents({"active": True})
        orig = rc.SOURCE
        rc.SOURCE = "https://invalid.invalid.example/nope"
        try:
            ok = await rc.sync_courses()
        finally:
            rc.SOURCE = orig
        after = await rc.db.courses.count_documents({"active": True})
        meta = await rc.db.meta.find_one({"key": "course_sync"})
        return ok, before, after, meta
    ok, before, after, meta = asyncio.get_event_loop().run_until_complete(run()) if False else asyncio.run(run())
    assert ok is False
    assert before == after == 13
    assert meta.get("last_error")
