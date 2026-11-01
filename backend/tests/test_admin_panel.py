# Admin panel: invite users, user detail/access/delete, full analytics, builder assets (iteration 21)
import os
import time
import pytest
import requests
import pymongo
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
mdb = pymongo.MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

ADMIN = ("admin@socprofessionals.academy", "Admin@123")
INSTR = ("instructor@socprofessionals.academy", "Instructor@123")
STUD = ("student@socprofessionals.academy", "Student@123")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def admin():
    return login(*ADMIN)


@pytest.fixture(scope="module")
def student():
    return login(*STUD)


@pytest.fixture(scope="module")
def instructor():
    return login(*INSTR)


@pytest.fixture(scope="module")
def invited(admin):
    email = f"test_inv_{int(time.time())}@resend.dev"
    r = admin.post(f"{API}/admin/users/invite", json={"name": "TEST Invitee", "email": email, "role": "student", "plan": "free"})
    assert r.status_code == 200, r.text
    u = r.json()
    yield u
    if mdb.users.find_one({"id": u["id"]}):
        admin.delete(f"{API}/admin/users/{u['id']}")


# ---- RBAC ----
@pytest.mark.parametrize("method,path", [("post", "/admin/users/invite"), ("get", "/admin/analytics/full"), ("get", "/admin/users/x"),
                                         ("patch", "/admin/users/x/access"), ("delete", "/admin/users/x"), ("post", "/admin/users/x/resend-invite")])
def test_rbac_student_instructor_403(student, instructor, method, path):
    body = {"name": "xx", "email": "a@resend.dev"} if "invite" == path.split("/")[-1] else {}
    for s in (student, instructor):
        r = getattr(s, method)(f"{API}{path}", json=body)
        assert r.status_code == 403, f"{method} {path} -> {r.status_code}"


def test_builder_assets_staff(instructor, student):
    r = instructor.get(f"{API}/builder/assets")
    assert r.status_code == 200
    d = r.json()
    for k in ["quiz", "lab", "challenge", "ctf", "course", "sop"]:
        assert k in d and isinstance(d[k], list)
    assert len(d["quiz"]) > 0 and len(d["lab"]) > 0 and len(d["sop"]) > 0
    assert student.get(f"{API}/builder/assets").status_code == 403


# ---- Invite ----
def test_invite_created(invited):
    assert invited["invite_pending"] is True and "password_hash" not in invited
    assert invited["username"]
    tok = mdb.password_reset_tokens.find_one({"user_id": invited["id"], "kind": "invite"})
    assert tok and tok["used"] is False
    from datetime import datetime
    hrs = (tok["expires_at"].replace(tzinfo=None) - datetime.utcnow()).total_seconds() / 3600
    assert 71 < hrs <= 72.1


def test_invite_duplicate_and_bad(admin, invited):
    r = admin.post(f"{API}/admin/users/invite", json={"name": "Dup", "email": invited["email"].upper()})
    assert r.status_code == 400
    r = admin.post(f"{API}/admin/users/invite", json={"name": "Bad", "email": "not-an-email"})
    assert r.status_code == 400
    r = admin.post(f"{API}/admin/users/invite", json={"name": "Bad", "email": "x@resend.dev", "role": "root"})
    assert r.status_code == 422


def test_user_detail(admin, invited):
    r = admin.get(f"{API}/admin/users/{invited['id']}")
    assert r.status_code == 200
    d = r.json()
    assert "password_hash" not in d["user"] and d["user"]["email"] == invited["email"]
    for k in ["counts", "access", "purchases", "payments", "activity", "audit"]:
        assert k in d
    assert d["access"] == {"sop": False, "book": False}
    assert admin.get(f"{API}/admin/users/nope-123").status_code == 404


def test_resend_invite(admin, invited):
    old = mdb.password_reset_tokens.find_one({"user_id": invited["id"], "kind": "invite", "used": False})["token"]
    r = admin.post(f"{API}/admin/users/{invited['id']}/resend-invite")
    assert r.status_code == 200
    assert mdb.password_reset_tokens.find_one({"token": old})["used"] is True
    assert mdb.password_reset_tokens.count_documents({"user_id": invited["id"], "kind": "invite", "used": False}) == 1
    assert requests.post(f"{API}/auth/reset-password", json={"token": old, "password": "Whatever@123"}).status_code == 400


def test_access_grant_and_revoke(admin, invited):
    uid = invited["id"]
    r = admin.patch(f"{API}/admin/users/{uid}/access", json={"plan": "pro", "sop": True, "book": True, "name": "TEST Renamed"})
    assert r.status_code == 200 and r.json()["access"] == {"sop": True, "book": True}
    d = admin.get(f"{API}/admin/users/{uid}").json()
    assert d["user"]["plan"] == "pro" and d["user"]["name"] == "TEST Renamed"
    r = admin.patch(f"{API}/admin/users/{uid}/access", json={"book": False})
    assert r.json()["access"] == {"sop": True, "book": False}


def test_invite_accept_login_sop_owned(admin, invited):
    admin.patch(f"{API}/admin/users/{invited['id']}/access", json={"plan": "free", "sop": True})  # pro plan implicitly owns SOPs
    tok = mdb.password_reset_tokens.find_one({"user_id": invited["id"], "kind": "invite", "used": False})["token"]
    r = requests.post(f"{API}/auth/reset-password", json={"token": tok, "password": "Invitee@123"})
    assert r.status_code == 200
    assert not mdb.users.find_one({"id": invited["id"]}).get("invite_pending")
    assert requests.post(f"{API}/auth/reset-password", json={"token": tok, "password": "Invitee@123"}).status_code == 400
    s = login(invited["email"], "Invitee@123")
    sops = s.get(f"{API}/public/sops").json()
    assert sops["owned"] is True, "SOP not owned after grant"
    admin.patch(f"{API}/admin/users/{invited['id']}/access", json={"sop": False})
    sops = s.get(f"{API}/public/sops").json()
    assert sops["owned"] is False, "SOP still owned after revoke"


def test_reset_xp(admin, invited):
    mdb.users.update_one({"id": invited["id"]}, {"$set": {"xp": 50, "streak": 3}})
    admin.patch(f"{API}/admin/users/{invited['id']}/access", json={"reset_xp": True})
    u = mdb.users.find_one({"id": invited["id"]})
    assert u["xp"] == 0 and u["streak"] == 0


def test_delete_rules(admin):
    me = admin.get(f"{API}/auth/me").json()
    me = me.get("user", me)
    r = admin.delete(f"{API}/admin/users/{me['id']}")
    assert r.status_code == 400
    assert admin.delete(f"{API}/admin/users/nope-123").status_code == 404


def test_delete_user_removes_records(admin):
    email = f"test_del_{int(time.time())}@resend.dev"
    u = admin.post(f"{API}/admin/users/invite", json={"name": "TEST Del", "email": email}).json()
    admin.patch(f"{API}/admin/users/{u['id']}/access", json={"sop": True})
    r = admin.delete(f"{API}/admin/users/{u['id']}")
    assert r.status_code == 200
    rem = r.json()["removed"]
    assert rem.get("purchases") == 1 and rem.get("password_reset_tokens") == 1
    assert mdb.users.find_one({"id": u["id"]}) is None
    assert admin.get(f"{API}/admin/users/{u['id']}").status_code == 404


# ---- Analytics ----
@pytest.mark.parametrize("days,exp", [(7, 7), (30, 30), (90, 90), (13, 30)])
def test_analytics(admin, days, exp):
    r = admin.get(f"{API}/admin/analytics/full", params={"days": days})
    assert r.status_code == 200, r.text
    a = r.json()
    assert a["days"] == exp and len(a["series"]) == exp
    k = a["kpis"]
    for key in ["signups", "active_users", "revenue"]:
        assert "value" in k[key] and "change" in k[key]
    for key in ["total_users", "paying_users", "conversion", "pro_users", "avg_daily_active"]:
        assert "value" in k[key]
    assert len(a["funnel"]) == 6
    us = [f["users"] for f in a["funnel"]]
    assert all(us[i] >= us[i + 1] for i in range(5))
    for key in ["revenue_by_product", "engagement", "top_performers", "roles"]:
        assert key in a
    for key in ["labs", "challenges", "quizzes"]:
        assert isinstance(a["popular"][key], list)
