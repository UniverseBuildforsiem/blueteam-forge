# Festival Gift Campaigns backend tests (iteration 51): admin CRUD, validation, coupon sync, public endpoint, coupon check for course/bundle/gift
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TAG = uuid.uuid4().hex[:6].upper()
COURSE = "test-paid-course"
BUNDLE = "86fce03a566a"
CREATED = []


def iso(d):
    return d.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    return s


@pytest.fixture(scope="module")
def admin():
    s = login("admin@socprofessionals.academy", "Admin@123")
    yield s
    for cid in CREATED:
        s.delete(f"{API}/admin/campaigns/{cid}")


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


@pytest.fixture(scope="module")
def fresh():
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={"name": "TEST Camp User", "email": f"test_camp_{TAG.lower()}@example.com",
                                            "username": f"testcamp{TAG.lower()}", "password": "TestCamp@123!"})
    assert r.status_code == 200, r.text
    return s


def body(code, start, end, **kw):
    b = {"name": f"TEST_Camp {code}", "theme": "festive", "headline": "TEST headline", "subtext": "sub", "coupon_code": code,
         "coupon_kind": "percent", "coupon_value": 10, "starts_at": iso(start), "ends_at": iso(end), "active": True}
    b.update(kw)
    return b


NOW = datetime.now(timezone.utc)


# Public endpoint
class TestPublic:
    def test_live_diwali(self):
        r = requests.get(f"{API}/public/campaign")
        assert r.status_code == 200
        d = r.json()
        assert d and d["coupon_code"] == "DIWALI25" and d["theme"] == "diwali" and d["coupon_value"] == 25
        assert "_id" not in d

    def test_admin_list_has_future_ny(self, admin):
        r = admin.get(f"{API}/admin/campaigns")
        assert r.status_code == 200
        codes = {c["coupon_code"]: c for c in r.json()}
        assert "DIWALI25" in codes and "NY2027" in codes
        assert codes["NY2027"]["coupon_kind"] == "flat" and codes["NY2027"]["coupon_value"] == 200


# Validation + auth
class TestValidation:
    def test_end_before_start(self, admin):
        r = admin.post(f"{API}/admin/campaigns", json=body(f"TV{TAG}", NOW, NOW - timedelta(hours=1)))
        assert r.status_code == 422

    def test_percent_over_99(self, admin):
        r = admin.post(f"{API}/admin/campaigns", json=body(f"TP{TAG}", NOW, NOW + timedelta(days=1), coupon_value=100))
        assert r.status_code == 422

    def test_code_conflict_launch30(self, admin):
        r = admin.post(f"{API}/admin/campaigns", json=body("LAUNCH30", NOW, NOW + timedelta(days=1)))
        assert r.status_code == 409

    def test_code_conflict_other_campaign(self, admin):
        r = admin.post(f"{API}/admin/campaigns", json=body("diwali25", NOW + timedelta(days=30), NOW + timedelta(days=31)))
        assert r.status_code == 409

    def test_bad_theme(self, admin):
        r = admin.post(f"{API}/admin/campaigns", json=body(f"TT{TAG}", NOW, NOW + timedelta(days=1), theme="eid"))
        assert r.status_code == 422

    def test_non_admin(self, student):
        assert student.get(f"{API}/admin/campaigns").status_code == 403
        assert student.post(f"{API}/admin/campaigns", json=body(f"TS{TAG}", NOW, NOW + timedelta(days=1))).status_code == 403

    def test_anon(self):
        assert requests.get(f"{API}/admin/campaigns").status_code == 401


# CRUD + coupon sync
class TestCrudSync:
    def test_future_campaign_coupon_not_active_yet(self, admin, fresh):
        code = f"TF{TAG}"
        r = admin.post(f"{API}/admin/campaigns", json=body(code.lower(), NOW + timedelta(days=60), NOW + timedelta(days=61)))
        assert r.status_code == 200, r.text
        c = r.json()
        CREATED.append(c["id"])
        assert c["coupon_code"] == code
        cp = [x for x in admin.get(f"{API}/admin/coupons").json() if x["code"] == code]
        assert cp and cp[0]["course_id"] == "" and cp[0]["active"] is True and cp[0]["campaign_id"] == c["id"]
        assert cp[0]["starts_at"] == c["starts_at"] and cp[0]["expires_at"] == c["ends_at"]
        chk = fresh.post(f"{API}/academy/coupons/check", json={"code": code, "plan": f"course:{COURSE}"})
        assert chk.status_code == 400 and "isn't active yet" in chk.json()["detail"]
        # public endpoint still returns the live diwali (future one not live)
        assert requests.get(f"{API}/public/campaign").json()["coupon_code"] == "DIWALI25"

    def test_expired_campaign_coupon(self, admin, fresh):
        code = f"TE{TAG}"
        r = admin.post(f"{API}/admin/campaigns", json=body(code, NOW - timedelta(days=3), NOW - timedelta(days=2)))
        assert r.status_code == 200
        CREATED.append(r.json()["id"])
        chk = fresh.post(f"{API}/academy/coupons/check", json={"code": code, "plan": f"course:{COURSE}"})
        assert chk.status_code == 400 and "expired" in chk.json()["detail"]

    def test_update_code_change_and_deactivate_and_delete(self, admin, fresh):
        code = f"TU{TAG}"
        r = admin.post(f"{API}/admin/campaigns", json=body(code, NOW - timedelta(days=60), NOW - timedelta(days=59)))
        c = r.json()
        CREATED.append(c["id"])
        # update: change code + values
        new = f"TN{TAG}"
        u = admin.put(f"{API}/admin/campaigns/{c['id']}", json=body(new, NOW - timedelta(days=60), NOW - timedelta(days=59), coupon_kind="flat", coupon_value=150))
        assert u.status_code == 200, u.text
        cps = {x["code"]: x for x in admin.get(f"{API}/admin/coupons").json()}
        assert cps[new]["kind"] == "flat" and cps[new]["value"] == 150 and cps[new]["active"] is True
        assert cps[code]["active"] is False
        # deactivate
        u = admin.put(f"{API}/admin/campaigns/{c['id']}", json=body(new, NOW - timedelta(days=60), NOW - timedelta(days=59), active=False))
        assert u.status_code == 200
        cps = {x["code"]: x for x in admin.get(f"{API}/admin/coupons").json()}
        assert cps[new]["active"] is False
        # delete
        assert admin.delete(f"{API}/admin/campaigns/{c['id']}").status_code == 200
        CREATED.remove(c["id"])
        assert admin.delete(f"{API}/admin/campaigns/{c['id']}").status_code == 404
        assert all(x["id"] != c["id"] for x in admin.get(f"{API}/admin/campaigns").json())
        cps = {x["code"]: x for x in admin.get(f"{API}/admin/coupons").json()}
        assert cps[new]["active"] is False

    def test_update_404(self, admin):
        r = admin.put(f"{API}/admin/campaigns/nope123", json=body(f"TX{TAG}", NOW, NOW + timedelta(days=1)))
        assert r.status_code == 404


# Coupon check with the live DIWALI25 campaign coupon
class TestCheck:
    def test_course(self, fresh):
        r = fresh.post(f"{API}/academy/coupons/check", json={"code": "diwali25", "plan": f"course:{COURSE}"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["original"] == 499 and d["amount"] == 374 and d["off"] == 125

    def test_course_legacy(self, fresh):
        r = fresh.post(f"{API}/academy/coupons/check", json={"code": "DIWALI25", "course_id": COURSE})
        assert r.status_code == 200 and r.json()["amount"] == 374

    def test_bundle_personal(self, fresh):
        r = fresh.post(f"{API}/academy/coupons/check", json={"code": "DIWALI25", "plan": f"bundle:{BUNDLE}"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["amount"] == d["original"] - round(d["original"] * 0.25)

    def test_bundle_gift(self, student):
        r = student.post(f"{API}/academy/coupons/check", json={"code": "DIWALI25", "plan": f"bundle:{BUNDLE}", "gift": True})
        assert r.status_code == 200, r.text
        assert r.json()["original"] == 1499 and r.json()["amount"] == 1124

    def test_course_specific_rejected_for_bundle(self, fresh, admin):
        specific = [c for c in admin.get(f"{API}/admin/coupons").json() if c.get("course_id") and c.get("active")]
        if not specific:
            pytest.skip("no active course-specific coupon")
        r = fresh.post(f"{API}/academy/coupons/check", json={"code": specific[0]["code"], "plan": f"bundle:{BUNDLE}"})
        assert r.status_code == 400 and "bundle" in r.json()["detail"]

    def test_bad_plan(self, fresh):
        r = fresh.post(f"{API}/academy/coupons/check", json={"code": "DIWALI25", "plan": "pro:monthly"})
        assert r.status_code == 422
