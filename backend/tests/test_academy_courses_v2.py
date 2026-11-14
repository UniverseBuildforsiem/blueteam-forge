# Academy Courses v2 (iteration 48): LP-style builder + pricing, public landing, ownership gating,
# admin approval of instructor edits, reviews, certificates, payments amount, regression of paths/certs.
# Run: pytest tests/test_academy_courses_v2.py -n 0
import os
import uuid
from datetime import datetime, timedelta, timezone
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

ADMIN = ("admin@socprofessionals.academy", "Admin@123")
INSTR = ("instructor@socprofessionals.academy", "Instructor@123")
STUD = ("student@socprofessionals.academy", "Student@123")
STATE = {"courses": [], "users": []}


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def admin():
    return login(*ADMIN)


@pytest.fixture(scope="module")
def instr():
    return login(*INSTR)


@pytest.fixture(scope="module")
def stud():
    return login(*STUD)


def new_user():
    u = uuid.uuid4().hex[:8]
    email = f"test_acv2_{u}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": "TEST AcV2 Student", "email": email, "username": f"tacv{u}", "password": "TestPass@123"})
    assert r.status_code in (200, 201), r.text
    s = login(email, "TestPass@123")
    s.uid = s.get(f"{API}/auth/me").json().get("id") or s.get(f"{API}/auth/me").json()["user"]["id"]
    STATE["users"].append(s.uid)
    return s


@pytest.fixture(scope="module")
def fresh():
    return new_user()


def body(title="TEST_V2 Course", price=0, mrp=0, ends=None, lessons=None, **kw):
    ls = lessons or [{"id": f"tl-{uuid.uuid4().hex[:6]}", "title": "Text lesson 1", "content": "Hello", "minutes": 7, "preview": True},
                     {"id": f"tl-{uuid.uuid4().hex[:6]}", "title": "Text lesson 2", "content": "Body", "minutes": 5}]
    return {"title": title, "subtitle": "TEST sub", "description": "TEST desc", "level": "Beginner", "category": "SOC", "price": price, "mrp": mrp,
            "sale_ends_at": ends, "promo_video": "https://www.youtube.com/watch?v=inWWhr5tnEA", "outcomes": ["o1", " ", "o2"], "requirements": ["r1"],
            "audience": ["a1"], "modules": [{"id": f"m-{uuid.uuid4().hex[:6]}", "title": "M1", "lessons": ls}], **kw}


def create(sess, b, publish_with=None):
    r = sess.post(f"{API}/academy/manage", json=b)
    assert r.status_code == 200, r.text
    c = r.json()
    STATE["courses"].append(c["id"])
    if publish_with:
        assert publish_with.post(f"{API}/academy/manage/{c['id']}/review", json={"action": "approve"}).status_code == 200
    return c


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for cid in STATE["courses"]:
        mdb.academy_courses.delete_one({"id": cid})
        for col in ("academy_certs", "academy_reviews"):
            mdb[col].delete_many({"course_id": cid})
        mdb.lesson_progress.delete_many({"path_id": cid})
        mdb.purchases.delete_many({"product_id": f"course:{cid}"})
    for uid in STATE["users"]:
        for col in ("lesson_progress", "purchases", "academy_reviews", "academy_certs", "quiz_attempts", "xp_events"):
            mdb[col].delete_many({"user_id": uid})
        mdb.users.delete_one({"id": uid})


# ---- public landing (no auth)
class TestPublic:
    def test_public_list(self):
        r = requests.get(f"{API}/public/academy/courses")
        assert r.status_code == 200
        c = next(x for x in r.json() if x["id"] == "test-paid-course")
        assert c["price"] == 499 and c["mrp"] == 3499 and c["off"] == 86 and c["sale_ends_at"] and c["previews"] >= 1 and c["owned"] is False

    def test_public_detail_only_previews_have_content(self):
        r = requests.get(f"{API}/public/academy/courses/test-paid-course")
        assert r.status_code == 200
        d = r.json()
        assert d["signed_in"] is False and d["owned"] is False and d["can_review"] is False
        ls = [l for m in d["modules"] for l in m["lessons"]]
        for l in ls:
            if l["preview"]:
                assert "video_url" in l and "content" in l
            else:
                assert "video_url" not in l and "content" not in l
        assert any(l["id"] == "l-tp1" and l["preview"] for l in ls)
        assert "instructor_id" not in d and "user_id" not in str(d["reviews"])

    def test_unpublished_404_public_visible_admin(self, admin):
        c = create(admin, body(title="TEST_V2 Draft"))
        assert requests.get(f"{API}/public/academy/courses/{c['id']}").status_code == 404
        assert admin.get(f"{API}/public/academy/courses/{c['id']}").status_code == 200
        assert requests.get(f"{API}/public/academy/courses/nope-x").status_code == 404


# ---- ownership gating
class TestGating:
    def test_paid_not_owned_403(self, fresh):
        assert fresh.get(f"{API}/academy/courses/test-paid-course").status_code == 403
        assert fresh.post(f"{API}/paths/test-paid-course/lessons/i1/complete").status_code == 403
        assert fresh.post(f"{API}/paths/test-paid-course/lessons/l-tp1/video", json={"duration": 100, "spans": [[0, 10]]}).status_code in (403, 422)
        assert fresh.post(f"{API}/academy/courses/test-paid-course/reviews", json={"rating": 5}).status_code == 403

    def test_free_course_owned(self, stud):
        r = stud.get(f"{API}/academy/courses/test-free-course")
        assert r.status_code == 200
        d = r.json()
        assert d["kind"] == "course" and d["owned"] and d["certificate"]["id"] == "SOCP-C-E2592278" and d["percent"] == 100

    def test_purchase_unlocks(self, fresh):
        mdb.purchases.insert_one({"user_id": fresh.uid, "product_id": "course:test-paid-course", "TEST": True})
        try:
            r = fresh.get(f"{API}/academy/courses/test-paid-course")
            assert r.status_code == 200 and r.json()["owned"] is True
            assert fresh.get(f"{API}/public/academy/courses/test-paid-course").json()["owned"] is True
        finally:
            mdb.purchases.delete_many({"user_id": fresh.uid, "product_id": "course:test-paid-course"})


# ---- pricing / payments / coupons
class TestPricing:
    def test_coupon_launch30(self, fresh):
        r = fresh.post(f"{API}/academy/coupons/check", json={"code": "LAUNCH30", "course_id": "test-paid-course"})
        assert r.status_code == 200, r.text
        assert r.json()["amount"] == 349 and r.json()["original"] == 499

    def test_payment_order_not_configured(self, fresh):
        assert fresh.post(f"{API}/payments/razorpay/order", json={"plan": "course:test-paid-course"}).status_code == 503
        assert fresh.post(f"{API}/payments/razorpay/order", json={"plan": "course:test-free-course"}).status_code == 400

    def test_expired_sale_uses_mrp(self, admin, fresh):
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        c = create(admin, body(title="TEST_V2 Expired", price=100, mrp=500, ends=past), publish_with=admin)
        d = requests.get(f"{API}/public/academy/courses/{c['id']}").json()
        assert d["price"] == 500 and d["mrp"] is None and d["off"] == 0 and d["sale_ends_at"] is None
        r = fresh.post(f"{API}/academy/coupons/check", json={"code": "LAUNCH30", "course_id": c["id"]})
        assert r.status_code == 200 and r.json()["original"] == 500

    def test_naive_sale_end_does_not_500(self, admin):
        c = create(admin, body(title="TEST_V2 Naive", price=100, mrp=500, ends="2030-01-01T10:00"))
        r = admin.get(f"{API}/public/academy/courses/{c['id']}")
        assert r.status_code != 500, "naive sale_ends_at crashes pricing()"

    def test_sale_ends_invalid_422(self, admin):
        assert admin.post(f"{API}/academy/manage", json=body(ends="not-a-date")).status_code == 422


# ---- builder / approval flow
class TestBuilderFlow:
    def test_student_forbidden(self, stud):
        assert stud.post(f"{API}/academy/manage", json=body()).status_code == 403

    def test_invalid_quiz_422(self, instr):
        ls = [{"id": "tq1", "title": "Q", "quiz": {"required": True, "questions": [{"text": "x", "options": ["a", "b"], "answer": 0}]}}]
        assert instr.post(f"{API}/academy/manage", json=body(lessons=ls)).status_code == 422

    def test_create_fields_persist(self, instr):
        c = create(instr, body(price=499, mrp=3499))
        got = next(x for x in instr.get(f"{API}/academy/manage").json() if x["id"] == c["id"])
        assert got["status"] == "draft" and got["outcomes"] == ["o1", "o2"] and got["mrp"] == 3499
        assert got["modules"][0]["lessons"][0]["preview"] is True and got["modules"][0]["lessons"][1]["preview"] is False
        STATE["ic"] = c["id"]

    def test_submit_approve_then_pending_edit(self, instr, admin):
        cid = STATE["ic"]
        assert instr.post(f"{API}/academy/manage/{cid}/submit").json()["status"] == "pending"
        assert instr.post(f"{API}/academy/manage/{cid}/review", json={"action": "approve"}).status_code == 403
        assert admin.post(f"{API}/academy/manage/{cid}/review", json={"action": "approve"}).json()["status"] == "published"
        b = body(title="TEST_V2 Course EDITED", price=299, mrp=3499)
        r = instr.put(f"{API}/academy/manage/{cid}", json=b)
        assert r.status_code == 200 and r.json()["pending_changes"]["title"] == "TEST_V2 Course EDITED"
        live = requests.get(f"{API}/public/academy/courses/{cid}").json()
        assert live["title"] == "TEST_V2 Course" and live["price"] == 499
        assert instr.post(f"{API}/academy/manage/{cid}/submit").json()["changes"] == "pending"
        assert admin.post(f"{API}/academy/manage/{cid}/review", json={"action": "approve"}).json()["changes"] == "approve"
        live = requests.get(f"{API}/public/academy/courses/{cid}").json()
        assert live["title"] == "TEST_V2 Course EDITED" and live["price"] == 299
        row = next(x for x in admin.get(f"{API}/academy/manage").json() if x["id"] == cid)
        assert not row.get("pending_changes") and not row.get("changes_submitted")

    def test_reject_changes_keeps_live(self, instr, admin):
        cid = STATE["ic"]
        instr.put(f"{API}/academy/manage/{cid}", json=body(title="TEST_V2 BAD"))
        instr.post(f"{API}/academy/manage/{cid}/submit")
        assert admin.post(f"{API}/academy/manage/{cid}/review", json={"action": "reject", "note": "no"}).json()["changes"] == "reject"
        assert requests.get(f"{API}/public/academy/courses/{cid}").json()["title"] == "TEST_V2 Course EDITED"
        assert instr.delete(f"{API}/academy/manage/{cid}").status_code == 400


# ---- progress / certificate / reviews
class TestProgress:
    def test_complete_all_issues_cert_and_review(self, admin):
        u = new_user()
        c = create(admin, body(title="TEST_V2 Cert"), publish_with=admin)
        d = u.get(f"{API}/academy/courses/{c['id']}").json()
        lids = [l["id"] for m in d["modules"] for l in m["lessons"]]
        pub = u.get(f"{API}/public/academy/courses/{c['id']}").json()
        assert pub["can_review"] is False
        assert u.post(f"{API}/academy/courses/{c['id']}/reviews", json={"rating": 4}).status_code == 400
        r = u.post(f"{API}/paths/{c['id']}/lessons/{lids[0]}/complete")
        assert r.status_code == 200 and r.json()["certificate"] is None
        r = u.post(f"{API}/paths/{c['id']}/lessons/{lids[1]}/complete")
        cert = r.json()["certificate"]
        assert cert and cert["id"].startswith("SOCP-C-")
        assert u.get(f"{API}/academy/certificates/{cert['id']}").status_code == 200
        # reviews: one per student
        assert u.post(f"{API}/academy/courses/{c['id']}/reviews", json={"rating": 3, "text": "TEST ok"}).json()["reviews_count"] == 1
        r = u.post(f"{API}/academy/courses/{c['id']}/reviews", json={"rating": 5, "text": "TEST great"}).json()
        assert r["reviews_count"] == 1 and r["rating"] == 5
        pub = u.get(f"{API}/public/academy/courses/{c['id']}").json()
        assert pub["can_review"] and pub["my_review"]["rating"] == 5 and pub["students"] == 1
        assert u.post(f"{API}/academy/courses/{c['id']}/reviews", json={"rating": 6}).status_code == 422

    def test_final_exam_gates_cert(self, admin):
        q = mdb.quizzes.find_one({"published": True}, {"_id": 0, "id": 1})
        u = new_user()
        c = create(admin, body(title="TEST_V2 Exam", final_quiz_id=q["id"]), publish_with=admin)
        for l in c["modules"][0]["lessons"]:
            r = u.post(f"{API}/paths/{c['id']}/lessons/{l['id']}/complete")
        assert r.status_code == 200 and r.json()["certificate"] is None

    def test_duplicate_lesson_ids_across_courses(self, admin):
        """Migrated courses reuse item ids (e.g. 'i1' in both test courses). Completing a same-id lesson in course A
        must not block completion/cert of course B."""
        u = new_user()
        dup = f"TESTdup{uuid.uuid4().hex[:4]}"
        a = create(admin, body(title="TEST_V2 DupA", lessons=[{"id": dup, "title": "L", "content": "x"}]), publish_with=admin)
        b = create(admin, body(title="TEST_V2 DupB", lessons=[{"id": dup, "title": "L", "content": "x"}]), publish_with=admin)
        u.post(f"{API}/paths/{a['id']}/lessons/{dup}/complete")
        r = u.post(f"{API}/paths/{b['id']}/lessons/{dup}/complete")
        assert r.status_code == 200
        assert r.json()["certificate"], "course B cert never issued: lesson_progress keyed by lesson_id only"


# ---- regression
class TestRegression:
    def test_paths_still_work(self, stud):
        r = stud.get(f"{API}/paths")
        assert r.status_code == 200 and len(r.json()) > 0
        pid = r.json()[0]["id"]
        assert stud.get(f"{API}/paths/{pid}").status_code == 200

    def test_cert_verify(self):
        r = requests.get(f"{API}/academy/certificates/SOCP-C-E2592278")
        assert r.status_code == 200 and r.json()["course_id"] == "test-free-course"
        assert requests.get(f"{API}/academy/certificates/SOCP-C-E2592278/png").headers["content-type"] == "image/png"

    def test_coupons_admin(self, admin):
        assert admin.get(f"{API}/admin/coupons").status_code in (200,) or admin.get(f"{API}/academy/coupons").status_code == 200
