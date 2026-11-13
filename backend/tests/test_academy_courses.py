# Academy courses: instructor builder, admin review, student purchase gating, progress & certificates
# Run with: pytest tests/test_academy_courses.py -n 0  (tests share module state; xdist loadscope splits classes)
import os
import uuid
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
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
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


@pytest.fixture(scope="module")
def fresh():
    u = uuid.uuid4().hex[:8]
    email = f"test_acad_{u}@example.com"
    r = requests.post(f"{API}/auth/register", json={"name": "TEST Academy Student", "email": email, "username": f"tacad{u}", "password": "TestPass@123"})
    assert r.status_code in (200, 201), r.text
    s = login(email, "TestPass@123")
    me = s.get(f"{API}/auth/me").json()
    uid = me.get("id") or me.get("user", {}).get("id")
    STATE["users"].append(uid)
    s.uid = uid
    return s


@pytest.fixture(scope="module")
def opts(instr):
    r = instr.get(f"{API}/academy/manage/options")
    assert r.status_code == 200
    d = r.json()
    for k in ("quiz", "lab", "scenario", "sop"):
        assert d[k], f"no {k} options"
    return d


def course_body(opts, price=0, title="TEST_Academy Course"):
    lab = next(l for l in opts["lab"])
    return {"title": title, "subtitle": "sub", "description": "TEST desc", "level": "Intermediate", "price": price, "cover": "",
            "modules": [{"title": "M1", "items": [
                {"type": "video", "title": "Intro video", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "minutes": 5},
                {"type": "quiz", "title": "Quiz", "ref": opts["quiz"][0]["id"]},
                {"type": "sop", "title": "SOP", "ref": opts["sop"][0]["id"]}]},
                {"title": "M2", "items": [
                    {"type": "lab", "title": "Lab", "ref": lab["id"]},
                    {"type": "scenario", "title": "Scen", "ref": opts["scenario"][0]["id"]},
                    {"type": "siem", "title": "SIEM", "note": "hunt"},
                    {"type": "shift", "title": "Shift"}]}]}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    a = login(*ADMIN)
    for cid in STATE["courses"]:
        a.delete(f"{API}/academy/manage/{cid}")
        mdb.academy_progress.delete_many({"course_id": cid})
        mdb.academy_certs.delete_many({"course_id": cid})
        mdb.purchases.delete_many({"product_id": f"course:{cid}"})
    for uid in STATE["users"]:
        for col in ("quiz_attempts", "lab_progress", "challenge_submissions", "academy_progress", "purchases"):
            mdb[col].delete_many({"user_id": uid})
        mdb.users.delete_one({"id": uid})


# ---- instructor builder & validation
class TestBuilder:
    def test_validation_video_without_link(self, instr, opts):
        b = course_body(opts)
        b["modules"][0]["items"][0]["url"] = ""
        assert instr.post(f"{API}/academy/manage", json=b).status_code == 422

    def test_validation_quiz_without_ref(self, instr, opts):
        b = course_body(opts)
        b["modules"][0]["items"][1]["ref"] = ""
        assert instr.post(f"{API}/academy/manage", json=b).status_code == 422

    def test_validation_bad_type_and_level(self, instr, opts):
        b = course_body(opts)
        b["modules"][0]["items"][0]["type"] = "bogus"
        assert instr.post(f"{API}/academy/manage", json=b).status_code == 422
        b = course_body(opts)
        b["level"] = "Expert"
        assert instr.post(f"{API}/academy/manage", json=b).status_code == 422

    def test_student_forbidden(self, stud, opts):
        assert stud.get(f"{API}/academy/manage").status_code == 403
        assert stud.post(f"{API}/academy/manage", json=course_body(opts)).status_code == 403

    def test_create_draft_submit_and_instructor_cannot_approve(self, instr, opts):
        r = instr.post(f"{API}/academy/manage", json=course_body(opts, price=0, title="TEST_Free Course"))
        assert r.status_code == 200, r.text
        c = r.json()
        STATE["courses"].append(c["id"])
        STATE["free"] = c["id"]
        assert c["status"] == "draft" and "_id" not in c and len(c["modules"]) == 2 and len(c["modules"][1]["items"]) == 4
        mine = instr.get(f"{API}/academy/manage").json()
        assert any(x["id"] == c["id"] for x in mine)
        me = instr.get(f"{API}/auth/me").json()
        iid = me.get("id") or me.get("user", {}).get("id")
        assert all(x["instructor_id"] == iid for x in mine)
        assert instr.post(f"{API}/academy/manage/{c['id']}/submit").status_code == 200
        assert instr.post(f"{API}/academy/manage/{c['id']}/review", json={"action": "approve"}).status_code == 403

    def test_submit_empty_course_400(self, instr):
        r = instr.post(f"{API}/academy/manage", json={"title": "TEST_Empty", "modules": [{"title": "M", "items": []}]})
        assert r.status_code == 200
        STATE["courses"].append(r.json()["id"])
        assert instr.post(f"{API}/academy/manage/{r.json()['id']}/submit").status_code == 400


# ---- admin review flow
class TestReview:
    def test_admin_sees_all_and_reject_then_approve(self, admin, instr, stud):
        cid = STATE["free"]
        allc = admin.get(f"{API}/academy/manage").json()
        assert any(x["id"] == cid and x["status"] == "pending" for x in allc)
        assert stud.get(f"{API}/academy/courses/{cid}").status_code == 404  # not published yet
        r = admin.post(f"{API}/academy/manage/{cid}/review", json={"action": "reject", "note": "TEST fix intro"})
        assert r.json()["status"] == "rejected"
        c = next(x for x in instr.get(f"{API}/academy/manage").json() if x["id"] == cid)
        assert c["status"] == "rejected" and c["review_note"] == "TEST fix intro"
        instr.post(f"{API}/academy/manage/{cid}/submit")
        assert admin.post(f"{API}/academy/manage/{cid}/review", json={"action": "approve"}).json()["status"] == "published"
        assert any(x["id"] == cid for x in stud.get(f"{API}/academy/courses").json())

    def test_unpublish_and_republish(self, admin, stud):
        cid = STATE["free"]
        assert admin.post(f"{API}/academy/manage/{cid}/review", json={"action": "unpublish"}).json()["status"] == "draft"
        assert stud.get(f"{API}/academy/courses/{cid}").status_code == 404
        assert admin.post(f"{API}/academy/manage/{cid}/review", json={"action": "approve"}).json()["status"] == "published"

    def test_invalid_review_action(self, admin):
        assert admin.post(f"{API}/academy/manage/{STATE['free']}/review", json={"action": "nuke"}).status_code == 422


# ---- paid course gating & payments
class TestPaid:
    def test_create_paid_published(self, admin, opts):
        r = admin.post(f"{API}/academy/manage", json=course_body(opts, price=499, title="TEST_Paid Course"))
        cid = r.json()["id"]
        STATE["courses"].append(cid)
        STATE["paid"] = cid
        assert admin.post(f"{API}/academy/manage/{cid}/review", json={"action": "approve"}).status_code == 200

    def test_paid_outline_hidden(self, fresh):
        cid = STATE["paid"]
        card = next(x for x in fresh.get(f"{API}/academy/courses").json() if x["id"] == cid)
        assert card["owned"] is False and card["price"] == 499 and card["items_count"] == 7 and card["modules_count"] == 2
        d = fresh.get(f"{API}/academy/courses/{cid}").json()
        assert d["owned"] is False
        for m in d["modules"]:
            for it in m["items"]:
                assert set(it.keys()) == {"id", "type", "title", "minutes"}
        it0 = d["modules"][0]["items"][0]["id"]
        STATE["paid_item"] = it0
        assert fresh.post(f"{API}/academy/courses/{cid}/items/{it0}/done").status_code == 403

    def test_payment_orders(self, fresh):
        r = fresh.post(f"{API}/payments/razorpay/order", json={"plan": f"course:{STATE['paid']}"})
        assert r.status_code == 503, r.text  # passes item_for, fails at provider config
        assert fresh.post(f"{API}/payments/razorpay/order", json={"plan": f"course:{STATE['free']}"}).status_code == 400
        assert fresh.post(f"{API}/payments/razorpay/order", json={"plan": "course:nope"}).status_code == 400
        assert fresh.post(f"{API}/payments/cashfree/order", json={"plan": "course:nope"}).status_code == 400
        assert fresh.post(f"{API}/payments/razorpay/order", json={"plan": "sop-bundle"}).status_code == 503  # regression

    def test_simulated_purchase_unlocks(self, fresh):
        cid = STATE["paid"]
        mdb.purchases.insert_one({"user_id": fresh.uid, "product_id": f"course:{cid}"})
        d = fresh.get(f"{API}/academy/courses/{cid}").json()
        assert d["owned"] is True
        v = d["modules"][0]["items"][0]
        assert v["url"].startswith("https://www.youtube.com")
        assert fresh.post(f"{API}/academy/courses/{cid}/items/{v['id']}/done").status_code == 200


# ---- progress verification & certificate (free course)
class TestProgress:
    def test_full_completion_and_cert(self, fresh):
        cid = STATE["free"]
        d = fresh.get(f"{API}/academy/courses/{cid}").json()
        assert d["owned"] is True and d["percent"] == 0
        its = [it for m in d["modules"] for it in m["items"]]
        byt = {it["type"]: it for it in its}
        # verification gates
        for t in ("quiz", "lab", "scenario"):
            r = fresh.post(f"{API}/academy/courses/{cid}/items/{byt[t]['id']}/done")
            assert r.status_code == 400, (t, r.text)
        for t in ("video", "sop", "siem", "shift"):
            r = fresh.post(f"{API}/academy/courses/{cid}/items/{byt[t]['id']}/done")
            assert r.status_code == 200 and r.json()["certificate"] is None
        assert r.json()["percent"] == round(100 * 4 / 7)
        mdb.quiz_attempts.insert_one({"id": "TEST_" + uuid.uuid4().hex, "user_id": fresh.uid, "quiz_id": byt["quiz"]["ref"], "score": 0})
        lab = mdb.labs.find_one({"id": byt["lab"]["ref"]}, {"_id": 0, "tasks": 1})
        mdb.lab_progress.insert_one({"user_id": fresh.uid, "lab_id": byt["lab"]["ref"], "answered": {t["id"]: "x" for t in lab.get("tasks", [])}})
        mdb.challenge_submissions.insert_one({"id": "TEST_" + uuid.uuid4().hex, "user_id": fresh.uid, "challenge_id": byt["scenario"]["ref"]})
        for t in ("quiz", "lab"):
            assert fresh.post(f"{API}/academy/courses/{cid}/items/{byt[t]['id']}/done").status_code == 200
        r = fresh.post(f"{API}/academy/courses/{cid}/items/{byt['scenario']['id']}/done")
        assert r.status_code == 200 and r.json()["percent"] == 100
        cert = r.json()["certificate"]
        assert cert and cert["id"].startswith("SOCP-C-") and cert["course_title"] == "TEST_Free Course" and "_id" not in cert
        STATE["cert"] = cert["id"]
        # idempotent
        r2 = fresh.post(f"{API}/academy/courses/{cid}/items/{byt['video']['id']}/done")
        assert r2.json()["certificate"]["id"] == cert["id"]
        pub = requests.get(f"{API}/academy/certificates/{cert['id']}")
        assert pub.status_code == 200 and pub.json()["name"] == "TEST Academy Student" and "user_id" not in pub.json()
        assert requests.get(f"{API}/academy/certificates/NOPE").status_code == 404

    def test_unknown_item_404(self, fresh):
        assert fresh.post(f"{API}/academy/courses/{STATE['free']}/items/nope/done").status_code == 404


# ---- delete permissions
class TestDelete:
    def test_instructor_cannot_delete_published(self, instr):
        assert instr.delete(f"{API}/academy/manage/{STATE['free']}").status_code == 400

    def test_instructor_cannot_edit_others(self, instr, opts):
        # paid course was created by admin
        assert instr.put(f"{API}/academy/manage/{STATE['paid']}", json=course_body(opts)).status_code == 404
