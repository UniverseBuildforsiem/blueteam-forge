# SOC Series: AI covers, weekly series email (cron piggyback), prefs, unsubscribe
import os, time, hmac, hashlib, uuid, asyncio
import pytest, requests
from dotenv import dotenv_values
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")).rstrip("/")
ENV = dotenv_values("/app/backend/.env")
ADMIN = ("admin@socprofessionals.academy", "Admin@123")
STUDENT = ("student@socprofessionals.academy", "Student@123")


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if False else asyncio.run(coro)


async def _db_call(fn):
    c = AsyncIOMotorClient(ENV["MONGO_URL"])
    try:
        return await fn(c[ENV["DB_NAME"]])
    finally:
        c.close()


def db(fn):
    return asyncio.run(_db_call(fn))


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
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
def series():
    r = requests.get(f"{BASE_URL}/api/public/series")
    assert r.status_code == 200
    return [p for s in r.json()["sections"] for p in s["posts"]]


# Covers
class TestCovers:
    def test_written_posts_have_ai_cover(self, series):
        ready = [p for p in series if p["status"] == "ready"]
        assert len(ready) >= 15
        for p in ready:
            assert p["cover"].startswith(f"/api/public/series-cover/{p['id']}?v="), p
        assert len({p["cover"] for p in ready}) == len(ready)

    def test_unwritten_use_section_image(self, series):
        planned = [p for p in series if p["status"] != "ready" and not p.get("ai_cover")]
        assert planned
        for p in planned[:20]:
            assert not p["cover"].startswith("/api/public/series-cover"), p

    def test_cover_urls_serve_webp(self, series):
        ready = [p for p in series if p["status"] == "ready"]
        sizes = set()
        for p in ready:
            r = requests.get(BASE_URL + p["cover"], timeout=60)
            assert r.status_code == 200, p["title"]
            assert r.headers["content-type"].startswith("image/webp")
            assert r.content[:4] == b"RIFF" and r.content[8:12] == b"WEBP"
            sizes.add(len(r.content))
        assert len(sizes) == len(ready)

    def test_cover_404_unknown(self):
        assert requests.get(f"{BASE_URL}/api/public/series-cover/nope").status_code == 404

    def test_custom_cover_overrides(self, admin, series):
        p = next(x for x in series if x["status"] == "ready")
        url = "https://images.unsplash.com/photo-1550751827-4bd374c3f58b"
        r = admin.put(f"{BASE_URL}/api/admin/series/{p['id']}", json={"cover": url})
        assert r.status_code == 200
        try:
            pub = requests.get(f"{BASE_URL}/api/public/series/{p['slug']}").json()
            assert pub["cover"] == url
            g = admin.get(f"{BASE_URL}/api/admin/series/{p['id']}").json()
            assert g["cover"] == url and g["cover_preview"].startswith("/api/public/series-cover/")
        finally:
            admin.put(f"{BASE_URL}/api/admin/series/{p['id']}", json={"cover": ""})
        pub = requests.get(f"{BASE_URL}/api/public/series/{p['slug']}").json()
        assert pub["cover"].startswith("/api/public/series-cover/")

    def test_regen_cover_auth(self, student, series):
        p = series[0]
        assert requests.post(f"{BASE_URL}/api/admin/series/{p['id']}/cover").status_code in (401, 403)
        assert student.post(f"{BASE_URL}/api/admin/series/{p['id']}/cover").status_code == 403
        assert login(*ADMIN).post(f"{BASE_URL}/api/admin/series/nope/cover").status_code == 404


# Prefs / next / test email
class TestSeriesEmailUser:
    def test_next_and_toggle(self, student):
        r = student.get(f"{BASE_URL}/api/me/series/next")
        assert r.status_code == 200
        d = r.json()
        assert d["on"] is True and d["next"]["number"] == 1 and d["received"] == 0
        try:
            r = student.patch(f"{BASE_URL}/api/me/preferences", json={"series_emails": False})
            assert r.status_code == 200 and r.json()["series_emails"] is False
            assert student.get(f"{BASE_URL}/api/me/series/next").json()["on"] is False
            assert student.get(f"{BASE_URL}/api/me/preferences").json()["series_emails"] is False
        finally:
            r = student.patch(f"{BASE_URL}/api/me/preferences", json={"series_emails": True})
            assert r.json()["series_emails"] is True

    def test_next_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/me/series/next").status_code == 401

    def test_admin_email_test(self, admin, student):
        r = admin.post(f"{BASE_URL}/api/admin/series/email-test", timeout=60)
        assert r.status_code == 200 and r.json() == {"sent": 1}
        assert student.post(f"{BASE_URL}/api/admin/series/email-test").status_code == 403
        assert db(lambda d: d.series_sends.count_documents({})) == 0


# Unsubscribe
class TestUnsub:
    def test_bad_token(self, student):
        uid = student.get(f"{BASE_URL}/api/auth/me").json()["id"]
        r = requests.get(f"{BASE_URL}/api/public/unsubscribe/series", params={"u": uid, "t": "bad"})
        assert r.status_code == 400
        assert requests.get(f"{BASE_URL}/api/public/unsubscribe/series").status_code == 400

    def test_valid_token(self, student):
        uid = student.get(f"{BASE_URL}/api/auth/me").json()["id"]
        t = hmac.new(ENV["JWT_SECRET"].encode(), f"series-unsub:{uid}".encode(), hashlib.sha256).hexdigest()[:32]
        try:
            r = requests.get(f"{BASE_URL}/api/public/unsubscribe/series", params={"u": uid, "t": t})
            assert r.status_code == 200 and "unsubscribed" in r.text
            assert student.get(f"{BASE_URL}/api/me/preferences").json()["series_emails"] is False
        finally:
            student.patch(f"{BASE_URL}/api/me/preferences", json={"series_emails": True})


# Cron piggyback
class TestCron:
    def test_cron_flow(self, student):
        secret = ENV["WEBHOOK_CRON_SECRET"]
        url = f"{BASE_URL}/api/cron/weekly-digest"
        assert requests.post(url, json={"run_id": "TEST_noauth"}).status_code == 401
        before_digest = db(lambda d: d.digest_sends.distinct("_id"))
        t0 = time.time()
        r = requests.post(url, json={"run_id": f"TEST_{uuid.uuid4().hex[:8]}"}, headers={"Authorization": f"Bearer {secret}"}, timeout=30)
        print("cron ack secs", round(time.time() - t0, 2))
        assert r.status_code == 200 and r.json() == {"ok": True}
        try:
            students = db(lambda d: d.users.distinct("id", {"role": "student", "status": "active", "series_emails": {"$ne": False}}))
            for _ in range(40):
                n = db(lambda d: d.series_sends.count_documents({}))
                if n >= len(students):
                    break
                time.sleep(3)
            sends = db(lambda d: d.series_sends.find({}, {"_id": 0}).to_list(100))
            print("sends", len(sends), "students", len(students))
            assert len(sends) == len(students)
            assert {s["user_id"] for s in sends} == set(students)
            first = student.get(f"{BASE_URL}/api/public/series").json()
            first_id = next(p["id"] for s in first["sections"] for p in s["posts"] if p["status"] == "ready")
            assert all(s["post_id"] == first_id for s in sends)
            assert len({s["week"] for s in sends}) == 1
            # second run same week -> no dupes
            r = requests.post(url, json={"run_id": f"TEST_{uuid.uuid4().hex[:8]}"}, headers={"Authorization": f"Bearer {secret}"}, timeout=30)
            assert r.status_code == 200
            time.sleep(15)
            assert db(lambda d: d.series_sends.count_documents({})) == len(students)
            # duplicate run id
            rid = f"TEST_{uuid.uuid4().hex[:8]}"
            requests.post(url, json={"run_id": rid}, headers={"Authorization": f"Bearer {secret}"})
            r = requests.post(url, json={"run_id": rid}, headers={"Authorization": f"Bearer {secret}"})
            assert r.json().get("duplicate") is True
            time.sleep(10)
            nx = student.get(f"{BASE_URL}/api/me/series/next").json()
            assert nx["received"] == 1 and nx["next"]["number"] == 2
        finally:
            db(lambda d: d.series_sends.delete_many({}))
            db(lambda d: d.digest_sends.delete_many({"_id": {"$nin": before_digest}}))
            db(lambda d: d.cron_runs.delete_many({"run_id": {"$regex": "^TEST_"}}))
        assert student.get(f"{BASE_URL}/api/me/series/next").json()["next"]["number"] == 1
