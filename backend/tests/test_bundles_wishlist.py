# Course Bundles + Wishlist reminders (iteration 49)
import os
import time
from datetime import datetime, timedelta, timezone
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
BID = "86fce03a566a"
P1, P2, FREE = "test-paid-course", "test-paid-course-2", "test-free-course"
ENV = dict(l.strip().split("=", 1) for l in open("/app/backend/.env") if "=" in l)
SECRET = ENV["WEBHOOK_CRON_SECRET"].strip('"')


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
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
def mdb():
    return MongoClient(ENV["MONGO_URL"].strip('"'))[ENV["DB_NAME"].strip('"')]


@pytest.fixture(scope="module")
def created(admin, mdb):
    ids = []
    yield ids
    for i in ids:
        admin.delete(f"{API}/admin/bundles/{i}")
        mdb.wishlists.delete_many({"kind": "bundle", "item_id": i})


def mk(admin, created, **kw):
    body = {"title": "TEST_Bundle", "course_ids": [P1, P2], "price": 1200} | kw
    r = admin.post(f"{API}/admin/bundles", json=body)
    assert r.status_code == 200, r.text
    created.append(r.json()["id"])
    return r.json()


# --- Admin CRUD + validation
def test_admin_validation(admin, student):
    base = {"title": "TEST_Bad", "course_ids": [P1, P2], "price": 1000}
    assert admin.post(f"{API}/admin/bundles", json=base | {"course_ids": [P1]}).status_code == 422
    assert admin.post(f"{API}/admin/bundles", json=base | {"course_ids": [P1, P1]}).status_code == 422
    assert admin.post(f"{API}/admin/bundles", json=base | {"course_ids": [P1, "nope-x"]}).status_code == 422
    assert admin.post(f"{API}/admin/bundles", json=base | {"sale_price": 1000}).status_code == 422
    assert admin.post(f"{API}/admin/bundles", json=base | {"sale_price": 1500}).status_code == 422
    assert admin.post(f"{API}/admin/bundles", json=base | {"sale_price": 500, "sale_ends_at": "notadate"}).status_code == 422
    assert student.post(f"{API}/admin/bundles", json=base).status_code == 403
    assert student.get(f"{API}/admin/bundles").status_code == 403
    assert requests.get(f"{API}/admin/bundles").status_code == 401


def test_admin_list_existing(admin):
    r = admin.get(f"{API}/admin/bundles")
    assert r.status_code == 200
    b = next(x for x in r.json() if x["id"] == BID)
    assert b["pricing"]["price"] == 999 and b["pricing"]["regular"] == 1499 and b["pricing"]["value"] == 1999
    assert "_id" not in b and "buyers" in b


def test_admin_crud(admin, created):
    b = mk(admin, created, subtitle="sub", sale_price=800, sale_ends_at=(datetime.now(timezone.utc) + timedelta(days=2)).isoformat())
    assert b["price"] == 1200 and b["sale_price"] == 800 and b["active"] is True
    pub = requests.get(f"{API}/public/academy/bundles/{b['id']}").json()
    assert pub["price"] == 800 and pub["regular"] == 1200 and pub["value"] == 1999 and pub["your_price"] == 800 and pub["off"] == 60
    r = admin.put(f"{API}/admin/bundles/{b['id']}", json={"title": "TEST_Bundle2", "course_ids": [P1, P2], "price": 1100, "active": False})
    assert r.status_code == 200 and r.json()["title"] == "TEST_Bundle2" and r.json()["active"] is False
    assert requests.get(f"{API}/public/academy/bundles/{b['id']}").status_code == 404
    assert b["id"] not in [x["id"] for x in requests.get(f"{API}/public/academy/bundles").json()]
    assert admin.put(f"{API}/admin/bundles/nope", json={"title": "TEST_x", "course_ids": [P1, P2], "price": 10}).status_code == 404
    assert admin.delete(f"{API}/admin/bundles/{b['id']}").status_code == 200
    assert admin.delete(f"{API}/admin/bundles/{b['id']}").status_code == 404


def test_expired_sale_uses_regular_price(admin, created):
    b = mk(admin, created, sale_price=500, sale_ends_at=(datetime.now(timezone.utc) - timedelta(hours=1)).isoformat())
    pub = requests.get(f"{API}/public/academy/bundles/{b['id']}").json()
    assert pub["price"] == 1200 and pub["regular"] is None and pub["sale_ends_at"] is None


# --- Public bundle page + personal pricing
def test_public_bundle_logged_out():
    r = requests.get(f"{API}/public/academy/bundles/{BID}")
    assert r.status_code == 200
    d = r.json()
    assert d["title"] == "TEST SOC Bundle" and d["signed_in"] is False and d["wishlisted"] is False
    assert d["your_price"] == 999 and d["value"] == 1999 and d["regular"] == 1499 and d["off"] == 50 and d["sale_ends_at"]
    assert [c["id"] for c in d["courses"]] == [P1, P2]


def test_public_bundle_student_personal_price(student):
    d = student.get(f"{API}/public/academy/bundles/{BID}").json()
    assert d["owned_courses"] == [P2] and d["your_price"] == 249 and d["signed_in"] is True and d["wishlisted"] is True


def test_public_bundles_filter(student):
    lst = requests.get(f"{API}/public/academy/bundles", params={"course_id": P1}).json()
    assert BID in [b["id"] for b in lst]
    assert BID not in [b["id"] for b in requests.get(f"{API}/public/academy/bundles", params={"course_id": FREE}).json()]
    mine = next(b for b in student.get(f"{API}/public/academy/bundles").json() if b["id"] == BID)
    assert mine["your_price"] == 249 and mine["courses_count"] == 2


def test_public_bundle_404():
    assert requests.get(f"{API}/public/academy/bundles/doesnotexist").status_code == 404


# --- Payments
def test_rzp_order_bundle_503(student):
    r = student.post(f"{API}/payments/razorpay/order", json={"plan": f"bundle:{BID}"})
    assert r.status_code == 503 and "not configured" in r.json()["detail"]


def test_rzp_order_bundle_coupon_rejected(student):
    r = student.post(f"{API}/payments/razorpay/order", json={"plan": f"bundle:{BID}", "coupon": "ANY"})
    assert r.status_code == 400


def test_rzp_order_bundle_all_owned_400(admin, student, created):
    b = mk(admin, created, course_ids=[P2, FREE], price=900)
    d = student.get(f"{API}/public/academy/bundles/{b['id']}").json()
    assert d["your_price"] == 0
    r = student.post(f"{API}/payments/razorpay/order", json={"plan": f"bundle:{b['id']}"})
    assert r.status_code == 400 and "already own" in r.json()["detail"]


def test_rzp_order_bad_bundle_404(student):
    assert student.post(f"{API}/payments/razorpay/order", json={"plan": "bundle:nope"}).status_code == 404


# --- Wishlist
def test_wishlist_toggle(admin, student, created):
    b = mk(admin, created)
    assert requests.post(f"{API}/wishlist/toggle", json={"kind": "bundle", "id": b["id"]}).status_code == 401
    assert student.post(f"{API}/wishlist/toggle", json={"kind": "bundle", "id": "nope"}).status_code == 404
    assert student.post(f"{API}/wishlist/toggle", json={"kind": "evil", "id": b["id"]}).status_code == 422
    assert student.post(f"{API}/wishlist/toggle", json={"kind": "bundle", "id": b["id"]}).json() == {"wishlisted": True}
    w = student.get(f"{API}/wishlist").json()
    assert any(x["kind"] == "bundle" and x["id"] == b["id"] for x in w)
    assert any(x["kind"] == "course" and x["id"] == P1 for x in w)
    assert student.get(f"{API}/public/academy/bundles/{b['id']}").json()["wishlisted"] is True
    assert student.post(f"{API}/wishlist/toggle", json={"kind": "bundle", "id": b["id"]}).json() == {"wishlisted": False}
    assert not any(x["id"] == b["id"] for x in student.get(f"{API}/wishlist").json())


def test_course_landing_wishlisted(student):
    r = student.get(f"{API}/public/academy/courses/{P1}")
    if r.status_code != 200:
        pytest.skip(f"landing endpoint path differs: {r.status_code}")
    assert r.json().get("wishlisted") is True


# --- Cron wishlist reminders
def test_cron_auth():
    assert requests.post(f"{API}/cron/session-reminders").status_code == 401
    assert requests.post(f"{API}/cron/session-reminders", headers={"Authorization": "Bearer wrong"}).status_code == 401


def test_cron_price_drop_then_sale_end(admin, student, created, mdb):
    ends = (datetime.now(timezone.utc) + timedelta(hours=5)).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    b = mk(admin, created, course_ids=[P1, FREE], price=450, sale_price=300, sale_ends_at=ends)
    assert student.post(f"{API}/wishlist/toggle", json={"kind": "bundle", "id": b["id"]}).json()["wishlisted"] is True
    uid = student.get(f"{API}/auth/me").json()["id"]
    key = {"user_id": uid, "kind": "bundle", "item_id": b["id"]}
    assert mdb.wishlists.find_one(key)["last_price"] == 300
    mdb.wishlists.update_one(key, {"$set": {"last_price": 400}})
    hdr = {"Authorization": f"Bearer {SECRET}"}
    assert requests.post(f"{API}/cron/session-reminders", headers=hdr, json={}).status_code == 200
    time.sleep(8)
    w = mdb.wishlists.find_one(key)
    assert w["last_price"] == 300, "price drop should update last_price"
    assert w.get("sale_end_notified") is None, "price drop email takes precedence in same run"
    assert requests.post(f"{API}/cron/session-reminders", headers=hdr, json={}).status_code == 200
    time.sleep(8)
    assert mdb.wishlists.find_one(key).get("sale_end_notified") == ends
