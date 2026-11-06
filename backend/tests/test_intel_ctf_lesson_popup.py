# Iteration 36: Intel-powered CTFs (ioc field, AI intel draft) + CTF board data for lesson popup
import os
import time
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

CREATED_CTFS = []
CREATED_USERS = []
IOC = "185.220.101.1"


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


def register():
    s = requests.Session()
    u = uuid.uuid4().hex[:8]
    r = s.post(f"{API}/auth/register", json={"name": "TEST User", "email": f"test_{u}@example.com", "username": f"test_{u}", "password": "TestPass123"})
    assert r.status_code == 200, r.text
    CREATED_USERS.append(r.json()["id"])
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for cid in CREATED_CTFS:
        mdb.ctfs.delete_one({"id": cid})
        mdb.ctf_solves.delete_many({"ctf_id": cid})
        mdb.ctf_hints.delete_many({"ctf_id": cid})
    for uid in CREATED_USERS:
        mdb.users.delete_one({"id": uid, "email": {"$regex": "^test_"}})


# Intel CTF create / board / submit
class TestIntelCtf:
    def test_create_intel_ctf_and_board(self, admin):
        r = admin.post(f"{API}/manage/ctfs", json={"category": "Threat Intel", "title": "TEST_intel_ctf", "points": 150, "flag": "DE",
                                                   "description": f"Investigate {IOC}. Country code?", "ioc": IOC,
                                                   "hints": [{"text": "geo", "cost": 20}], "published": True})
        assert r.status_code in (200, 201), r.text
        d = r.json()
        CREATED_CTFS.append(d["id"])
        assert d["ioc"] == IOC and d["category"] == "Threat Intel"
        s = register()
        board = s.get(f"{API}/ctf").json()
        c = next(x for x in board if x["id"] == d["id"])
        assert c["ioc"] == IOC
        assert "flag" not in c
        assert c["hints"][0]["text"] is None
        # hint unlock
        h = s.post(f"{API}/ctf/{d['id']}/hint/0")
        assert h.status_code == 200 and h.json()["text"] == "geo"
        assert s.post(f"{API}/ctf/{d['id']}/submit", json={"flag": "US"}).json()["correct"] is False
        ok = s.post(f"{API}/ctf/{d['id']}/submit", json={"flag": " de "}).json()
        assert ok["correct"] is True and ok["points"] == 130
        again = s.post(f"{API}/ctf/{d['id']}/submit", json={"flag": "DE"}).json()
        assert again.get("already") is True
        c2 = next(x for x in s.get(f"{API}/ctf").json() if x["id"] == d["id"])
        assert c2["solved"] is True

    def test_non_intel_ctf_no_ioc(self):
        s = register()
        board = s.get(f"{API}/ctf").json()
        c = next(x for x in board if x["id"] == "ctf-net-2")
        assert not c.get("ioc")

    def test_student_intel_lookup(self):
        s = register()
        r = s.post(f"{API}/intel/lookup", json={"ioc": IOC})
        assert r.status_code == 200, r.text
        assert r.json().get("value") == IOC or IOC in r.text


# AI intel draft
class TestIntelDraft:
    def test_bad_ioc_errors(self, admin):
        jid = admin.post(f"{API}/builder/ctf-draft", json={"title": "IP reputation", "ioc": "not an ioc"}).json()["job_id"]
        j = None
        for _ in range(10):
            time.sleep(2)
            j = admin.get(f"{API}/builder/jobs/{jid}").json()
            if j["status"] != "running":
                break
        assert j["status"] == "error"

    def test_ai_intel_draft(self, admin):
        r = admin.post(f"{API}/builder/ctf-draft", json={"title": "IP reputation and Tor exits", "content": "", "level": "Beginner", "ioc": IOC})
        assert r.status_code == 200
        jid = r.json()["job_id"]
        j = None
        for _ in range(40):
            time.sleep(3)
            j = admin.get(f"{API}/builder/jobs/{jid}").json()
            if j["status"] != "running":
                break
        assert j["status"] == "done", j
        c = j["ctf"]
        print("DRAFT:", c)
        assert c["category"] == "Threat Intel" and c["ioc"] == IOC
        assert c["title"] and c["description"] and c["flag"]
        assert "SOCF" not in str(c).upper() and "{" not in c["flag"]
