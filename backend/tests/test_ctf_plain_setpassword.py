# Iteration 35: plain CTF flags, builder CTF creation/AI draft, set-password / change-password for Google-only users
import os
import time
import uuid
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient  # noqa
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

CREATED_CTFS = []
CREATED_USERS = []


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


def register():
    s = requests.Session()
    u = uuid.uuid4().hex[:8]
    email = f"test_{u}@example.com"
    r = s.post(f"{API}/auth/register", json={"name": "TEST User", "email": email, "username": f"test_{u}", "password": "TestPass123"})
    assert r.status_code == 200, r.text
    CREATED_USERS.append(r.json()["id"])
    return s, r.json()


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for cid in CREATED_CTFS:
        mdb.ctfs.delete_one({"id": cid})
    for uid in CREATED_USERS:
        mdb.users.delete_one({"id": uid, "email": {"$regex": "^test_"}})


# CTF plain flags
class TestCtfPlain:
    def test_list_no_socf(self):
        s, _ = register()
        r = s.get(f"{API}/ctf")
        assert r.status_code == 200
        assert "SOCF" not in r.text.upper()

    def test_submit_socf_wrong_plain_right(self):
        s, _ = register()
        r = s.post(f"{API}/ctf/ctf-net-2/submit", json={"flag": "SOCF{3389}"})
        assert r.status_code == 200 and r.json()["correct"] is False
        r = s.post(f"{API}/ctf/ctf-net-2/submit", json={"flag": "3389"})
        assert r.status_code == 200 and r.json()["correct"] is True

    def test_hints_no_socf(self):
        s, _ = register()
        for c in s.get(f"{API}/ctf").json() if isinstance(s.get(f"{API}/ctf").json(), list) else s.get(f"{API}/ctf").json().get("challenges", []):
            for i in range(len(c.get("hints", [])) or 1):
                r = s.post(f"{API}/ctf/{c['id']}/hint/{i}")
                if r.status_code == 200:
                    assert "SOCF" not in r.text.upper()


# Manage CTF create validation
class TestManageCtf:
    def test_socf_flag_rejected(self, admin):
        r = admin.post(f"{API}/manage/ctfs", json={"category": "Network", "title": "TEST_ctf_bad", "points": 100, "flag": "SOCF{a}", "description": "d", "hints": [], "published": True})
        assert r.status_code == 422
        assert "without SOCF" in r.text

    def test_plain_flag_created_and_in_arena(self, admin):
        r = admin.post(f"{API}/manage/ctfs", json={"category": "Network", "title": "TEST_ctf_plain", "points": 100, "flag": " abc ", "description": "What?", "hints": [{"text": "h", "cost": 20}], "published": True})
        assert r.status_code in (200, 201), r.text
        d = r.json()
        CREATED_CTFS.append(d["id"])
        assert d["flag"] == "abc"
        s, _ = register()
        lst = s.get(f"{API}/ctf").json()
        assert d["id"] in str(lst)
        assert s.post(f"{API}/ctf/{d['id']}/submit", json={"flag": "abc"}).json()["correct"] is True

    def test_student_cannot_create(self):
        s, _ = register()
        r = s.post(f"{API}/manage/ctfs", json={"category": "Network", "title": "TEST_x", "points": 100, "flag": "a", "description": "d", "hints": []})
        assert r.status_code in (401, 403)


# AI CTF draft
class TestCtfDraft:
    def test_student_forbidden(self):
        s, _ = register()
        assert s.post(f"{API}/builder/ctf-draft", json={"title": "Windows logons"}).status_code in (401, 403)

    def test_ai_draft(self, admin):
        r = admin.post(f"{API}/builder/ctf-draft", json={"title": "Windows logon events", "content": "Event 4624 and 4625, logon types", "level": "Beginner"})
        assert r.status_code == 200
        jid = r.json()["job_id"]
        j = None
        for _ in range(30):
            time.sleep(3)
            j = admin.get(f"{API}/builder/jobs/{jid}").json()
            if j["status"] != "running":
                break
        assert j["status"] == "done", j
        c = j["ctf"]
        assert c["title"] and c["description"] and c["flag"]
        assert "SOCF" not in str(c).upper()
        assert "{" not in c["flag"]


# Set/change password
class TestSetPassword:
    def test_set_password_rejected_when_has_password(self):
        s, _ = register()
        r = s.post(f"{API}/auth/set-password", json={"new_password": "NewPass1234"})
        assert r.status_code == 400

    def test_google_only_flow(self):
        s, u = register()
        mdb.users.update_one({"id": u["id"]}, {"$set": {"password_set": False, "google_linked": True}})
        me = s.get(f"{API}/auth/me").json()
        assert me.get("password_set") is False and me.get("google_linked") is True
        assert "password_hash" not in me
        r = s.post(f"{API}/auth/change-password", json={"current_password": "TestPass123", "new_password": "Another1234"})
        assert r.status_code == 400
        assert s.post(f"{API}/auth/set-password", json={"new_password": "short"}).status_code == 422
        assert s.post(f"{API}/auth/set-password", json={"new_password": "abcdefghij"}).status_code == 400
        r = s.post(f"{API}/auth/set-password", json={"new_password": "GoogleSet123"})
        assert r.status_code == 200, r.text
        # session still valid after set (cookies re-issued)
        assert s.get(f"{API}/auth/me").json().get("password_set") is True
        assert requests.post(f"{API}/auth/login", json={"email": u["email"], "password": "GoogleSet123"}).status_code == 200
        assert s.post(f"{API}/auth/set-password", json={"new_password": "GoogleSet456"}).status_code == 400

    def test_forgot_password_link(self):
        s, u = register()
        r = s.post(f"{API}/auth/forgot-password", json={"email": u["email"]})
        assert r.status_code == 200 and r.json()["ok"] is True
        assert mdb.password_reset_tokens.find_one({"user_id": u["id"]}) is not None
