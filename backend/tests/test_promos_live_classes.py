# Promotions (spotlight cards) + SOC Live Classes (schedule, enquiries, settings) API tests
import os
import uuid
from datetime import datetime, timedelta, timezone
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
IST = timezone(timedelta(hours=5, minutes=30))
SEED_IDS = ["udemy-vmdr", "udemy-csa", "app", "paths", "book"]
EXP = ["Student / fresher", "0-1 years IT", "1-3 years IT", "3+ years IT", "Already in a SOC"]


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


@pytest.fixture(scope="module")
def created(admin):
    ids = []
    yield ids
    for pid in ids:
        admin.delete(f"{BASE_URL}/api/admin/promos/{pid}")


def promo(**kw):
    base = {"tag": "TEST", "title": "TEST_card", "text": "t", "price": "1", "cta": "Go now", "url": "https://example.com",
            "accent": "#112233", "icon": "live", "img": "", "active": True, "ends_at": None}
    base.update(kw)
    return base


# ---------- Public promos ----------
class TestPublicPromos:
    def test_seeded_sorted(self):
        r = requests.get(f"{BASE_URL}/api/public/promos")
        assert r.status_code == 200
        data = r.json()
        ids = [p["id"] for p in data]
        for s in SEED_IDS:
            assert s in ids
        orders = [p["order"] for p in data]
        assert orders == sorted(orders)
        assert all("_id" not in p for p in data)


# ---------- Admin promos CRUD ----------
class TestAdminPromos:
    def test_non_admin_forbidden(self, student):
        assert student.get(f"{BASE_URL}/api/admin/promos").status_code == 403
        assert student.post(f"{BASE_URL}/api/admin/promos", json=promo()).status_code == 403
        assert requests.get(f"{BASE_URL}/api/admin/promos").status_code in (401, 403)

    @pytest.mark.parametrize("bad", [{"url": "http://x.com"}, {"url": "javascript:alert(1)"}, {"accent": "red"},
                                     {"icon": "skull"}, {"img": "http://x/a.png"}, {"title": "x"}, {"ends_at": "notadate"}])
    def test_validation(self, admin, bad):
        r = admin.post(f"{BASE_URL}/api/admin/promos", json=promo(**bad))
        assert r.status_code in (400, 422), r.text

    def test_create_update_delete(self, admin, created):
        r = admin.post(f"{BASE_URL}/api/admin/promos", json=promo(title="TEST_crud", url="/book"))
        assert r.status_code == 200, r.text
        p = r.json()
        created.append(p["id"])
        assert p["title"] == "TEST_crud" and "_id" not in p
        pub = [x["id"] for x in requests.get(f"{BASE_URL}/api/public/promos").json()]
        assert p["id"] in pub and pub[-1] == p["id"]
        r = admin.put(f"{BASE_URL}/api/admin/promos/{p['id']}", json=promo(title="TEST_crud2", active=False))
        assert r.status_code == 200 and r.json()["title"] == "TEST_crud2" and r.json()["active"] is False
        pub = [x["id"] for x in requests.get(f"{BASE_URL}/api/public/promos").json()]
        assert p["id"] not in pub
        assert admin.put(f"{BASE_URL}/api/admin/promos/nope", json=promo()).status_code == 404
        assert admin.delete(f"{BASE_URL}/api/admin/promos/{p['id']}").status_code == 200
        assert admin.delete(f"{BASE_URL}/api/admin/promos/{p['id']}").status_code == 404
        created.remove(p["id"])

    def test_ends_at_past_hidden_future_shown(self, admin, created):
        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
        fut = (datetime.now(timezone.utc) + timedelta(days=2, hours=4)).isoformat().replace("+00:00", "Z")
        a = admin.post(f"{BASE_URL}/api/admin/promos", json=promo(title="TEST_past", ends_at=past)).json()
        b = admin.post(f"{BASE_URL}/api/admin/promos", json=promo(title="TEST_future", ends_at=fut)).json()
        created += [a["id"], b["id"]]
        pub = {x["id"]: x for x in requests.get(f"{BASE_URL}/api/public/promos").json()}
        assert a["id"] not in pub
        assert b["id"] in pub and pub[b["id"]]["ends_at"].endswith("+00:00")
        adm = [x["id"] for x in admin.get(f"{BASE_URL}/api/admin/promos").json()]
        assert a["id"] in adm

    def test_reorder_and_restore(self, admin):
        orig = [p["id"] for p in admin.get(f"{BASE_URL}/api/admin/promos").json()]
        new = list(reversed(orig))
        r = admin.post(f"{BASE_URL}/api/admin/promos/reorder", json={"ids": new})
        assert r.status_code == 200 and [p["id"] for p in r.json()] == new
        pub = [p["id"] for p in requests.get(f"{BASE_URL}/api/public/promos").json() if p["id"] in SEED_IDS]
        assert pub == [x for x in new if x in SEED_IDS]
        r = admin.post(f"{BASE_URL}/api/admin/promos/reorder", json={"ids": orig})
        assert [p["id"] for p in r.json()] == orig


# ---------- Live classes schedule ----------
class TestLiveSchedule:
    def test_schedule(self):
        r = requests.get(f"{BASE_URL}/api/public/live-classes")
        assert r.status_code == 200
        d = r.json()
        nowt = datetime.now(timezone.utc)
        assert len(d["demos"]) == 4
        prev = None
        for iso in d["demos"]:
            t = datetime.fromisoformat(iso)
            assert iso.endswith("+05:30") and t.weekday() == 4 and t.hour == 16 and t.minute == 0 and t > nowt
            if prev:
                assert (t - prev).days == 7
            prev = t
        assert 1 <= len(d["batches"]) <= 4
        for b in d["batches"]:
            t = datetime.fromisoformat(b["start"])
            wk = (t.day - 1) // 7 + 1
            assert t.weekday() == 4 and wk in (2, 4) and t > nowt
            assert b["label"] == f"{'2nd' if wk == 2 else '4th'} Friday batch"
        assert d["title"]


# ---------- Live enquiries ----------
class TestLiveEnquiry:
    @pytest.fixture(scope="class")
    def sched(self):
        return requests.get(f"{BASE_URL}/api/public/live-classes").json()

    def body(self, sched, **kw):
        b = {"kind": "demo", "session_at": sched["demos"][0], "name": "TEST User", "email": f"TEST_{uuid.uuid4().hex[:6]}@example.com",
             "phone": "+91 98765 43210", "experience": "0-1 years IT", "message": "hi"}
        b.update(kw)
        return b

    def test_demo_and_batch_ok(self, sched, admin):
        b = self.body(sched)
        r = requests.post(f"{BASE_URL}/api/public/live-classes/enquiry", json=b, timeout=90)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True and "IST" in r.json()["when"]
        b2 = self.body(sched, kind="batch", session_at=sched["batches"][0]["start"], experience="3+ years IT")
        r = requests.post(f"{BASE_URL}/api/public/live-classes/enquiry", json=b2, timeout=90)
        assert r.status_code == 200, r.text
        es = admin.get(f"{BASE_URL}/api/admin/live-enquiries").json()
        mine = [e for e in es if e["email"] == b["email"].lower()]
        assert mine and mine[0]["status"] == "new" and mine[0]["kind"] == "demo" and "_id" not in mine[0]
        # status patch
        eid = mine[0]["id"]
        assert admin.patch(f"{BASE_URL}/api/admin/live-enquiries/{eid}", json={"status": "contacted"}).status_code == 200
        es = admin.get(f"{BASE_URL}/api/admin/live-enquiries").json()
        assert [e for e in es if e["id"] == eid][0]["status"] == "contacted"
        assert admin.patch(f"{BASE_URL}/api/admin/live-enquiries/{eid}", json={"status": "bogus"}).status_code == 422
        assert admin.patch(f"{BASE_URL}/api/admin/live-enquiries/nope", json={"status": "new"}).status_code == 404

    @pytest.mark.parametrize("bad,code", [({"session_at": "2020-01-03T16:00:00+05:30"}, 400), ({"kind": "batch"}, 400),
                                          ({"kind": "other"}, 422), ({"experience": "10 years"}, 422), ({"phone": "abc"}, 422),
                                          ({"email": "bad"}, 400), ({"name": "x"}, 422)])
    def test_validation(self, sched, bad, code):
        b = self.body(sched, **bad)
        if bad.get("kind") == "batch":
            b["session_at"] = sched["demos"][0] if sched["demos"][0] not in [x["start"] for x in sched["batches"]] else "x"
        r = requests.post(f"{BASE_URL}/api/public/live-classes/enquiry", json=b, timeout=90)
        assert r.status_code == code, r.text

    def test_rate_limit(self, sched):
        email = f"TEST_rl_{uuid.uuid4().hex[:6]}@example.com"
        codes = [requests.post(f"{BASE_URL}/api/public/live-classes/enquiry", json=self.body(sched, email=email), timeout=90).status_code for _ in range(6)]
        assert codes[:5] == [200] * 5 and codes[5] == 429, codes

    def test_message_with_sensitive_word_no_500(self, sched):
        # message is interpolated into admin email; email safety scanner may raise
        r = requests.post(f"{BASE_URL}/api/public/live-classes/enquiry",
                          json=self.body(sched, message="Do I need to share my CVV for fee payment?"), timeout=90)
        assert r.status_code != 500, f"500 on message containing 'cvv': {r.text}"

    def test_admin_enquiries_forbidden(self, student):
        assert student.get(f"{BASE_URL}/api/admin/live-enquiries").status_code == 403


# ---------- Live settings ----------
class TestLiveSettings:
    def test_get_put_restore(self, admin, student):
        assert student.get(f"{BASE_URL}/api/admin/live-classes/settings").status_code == 403
        orig = admin.get(f"{BASE_URL}/api/admin/live-classes/settings").json()
        assert orig["demo_link"].startswith("https://teams.microsoft.com")
        keys = ["demo_link", "demo_time", "batch_time", "notify_email", "title", "description"]
        o = {k: orig[k] for k in keys}
        try:
            r = admin.put(f"{BASE_URL}/api/admin/live-classes/settings", json={**o, "title": "TEST Live", "demo_time": "17:30"})
            assert r.status_code == 200 and r.json()["title"] == "TEST Live"
            pub = requests.get(f"{BASE_URL}/api/public/live-classes").json()
            assert pub["title"] == "TEST Live"
            assert all(datetime.fromisoformat(x).hour == 17 and datetime.fromisoformat(x).minute == 30 for x in pub["demos"])
            assert admin.put(f"{BASE_URL}/api/admin/live-classes/settings", json={**o, "notify_email": "bad"}).status_code == 400
            assert admin.put(f"{BASE_URL}/api/admin/live-classes/settings", json={**o, "demo_link": "http://x"}).status_code == 422
            assert admin.put(f"{BASE_URL}/api/admin/live-classes/settings", json={**o, "demo_time": "25:00"}).status_code == 422
        finally:
            r = admin.put(f"{BASE_URL}/api/admin/live-classes/settings", json=o)
            assert r.status_code == 200 and all(r.json()[k] == o[k] for k in keys)
