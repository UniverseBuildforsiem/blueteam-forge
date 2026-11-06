# Iteration 37: Bulk Intel CTFs (/builder/ctf-bulk), CTF writeups (hidden until solved), seeded writeups, manage CTF writeup persistence
import os, time, uuid, pytest, requests
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
SEEDED = ["ctf-log-1", "ctf-log-2", "ctf-for-1", "ctf-net-1", "ctf-net-2", "ctf-mal-1", "ctf-web-1", "ctf-web-2"]
CREATED = []


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    return s


@pytest.fixture(scope="module")
def inst():
    s = login("instructor@socprofessionals.academy", "Instructor@123")
    yield s
    for cid in CREATED:
        s.delete(f"{API}/manage/ctfs/{cid}")


@pytest.fixture(scope="module")
def student():
    u = uuid.uuid4().hex[:8]
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={"name": "TEST Stud", "email": f"test_{u}@example.com", "username": f"test_{u}", "password": "TestPass123"})
    assert r.status_code in (200, 201), r.text
    return s


def poll(s, jid, tries=30):
    r = None
    for _ in range(tries):
        time.sleep(3)
        r = s.get(f"{API}/builder/jobs/{jid}").json()
        if r["status"] != "running":
            break
    return r


# Seeded writeups
def test_seeded_ctfs_have_writeups(inst):
    items = {c["id"]: c for c in inst.get(f"{API}/manage/ctfs").json()}
    for cid in SEEDED:
        assert cid in items, cid
        assert len((items[cid].get("writeup") or "").strip()) > 40, cid


# Writeup hidden until solved
def test_writeup_hidden_then_shown(student):
    b = {c["id"]: c for c in student.get(f"{API}/ctf").json()}
    assert all("writeup" not in c for c in b.values())
    assert "flag" not in b["ctf-net-2"]
    assert student.post(f"{API}/ctf/ctf-net-2/submit", json={"flag": "22"}).json()["correct"] is False
    b = {c["id"]: c for c in student.get(f"{API}/ctf").json()}
    assert "writeup" not in b["ctf-net-2"]
    r = student.post(f"{API}/ctf/ctf-net-2/submit", json={"flag": " 3389 "}).json()
    assert r["correct"] is True and r["points"] == 100
    b = {c["id"]: c for c in student.get(f"{API}/ctf").json()}
    assert b["ctf-net-2"]["solved"] and "RDP" in b["ctf-net-2"]["writeup"]
    assert "writeup" not in b["ctf-web-1"]


# Bulk validation
def test_bulk_validation(inst, student):
    assert student.post(f"{API}/builder/ctf-bulk", json={"iocs": ["8.8.8.8"]}).status_code == 403
    r = inst.post(f"{API}/builder/ctf-bulk", json={"iocs": ["8.8.8.8", "not an ioc"]})
    assert r.status_code == 400 and "not an ioc" in r.json()["detail"]
    assert inst.post(f"{API}/builder/ctf-bulk", json={"iocs": ["8.8.8.8", "8.8.8.8"]}).status_code == 400
    assert inst.post(f"{API}/builder/ctf-bulk", json={"iocs": []}).status_code == 422
    assert inst.post(f"{API}/builder/ctf-bulk", json={"iocs": [f"1.1.1.{i}" for i in range(11)]}).status_code == 422
    assert inst.post(f"{API}/builder/ctf-bulk", json={"iocs": ["10.0.0.1"]}).status_code == 400


# Bulk real draft (2 IOCs) -> save -> board
def test_bulk_draft_and_save(inst, student):
    r = inst.post(f"{API}/builder/ctf-bulk", json={"iocs": ["8.8.8.8", "44d88612fea8a8f36de82e1278abb02f"], "level": "Beginner"})
    assert r.status_code == 200, r.text
    jobs = r.json()["jobs"]
    assert [j["ioc"] for j in jobs] == ["8.8.8.8", "44d88612fea8a8f36de82e1278abb02f"]
    for j in jobs:
        res = poll(inst, j["job_id"])
        assert res["status"] == "done", res
        c = res["ctf"]
        assert c["category"] == "Threat Intel" and c["ioc"] == j["ioc"]
        assert c["flag"] and "SOCF" not in c["flag"] and "SOCF" not in c["description"]
        assert len(c["writeup"]) > 40 and c["hints"]
        c["title"] = "TEST_" + c["title"]
        s = inst.post(f"{API}/manage/ctfs", json={**c, "published": True})
        assert s.status_code in (200, 201), s.text
        CREATED.append(s.json()["id"])
    b = {c["id"]: c for c in student.get(f"{API}/ctf").json()}
    for cid in CREATED:
        assert cid in b and b[cid]["category"] == "Threat Intel" and "writeup" not in b[cid] and "flag" not in b[cid]


# Manual CTF writeup create/update persistence
def test_manage_writeup_persist(inst):
    r = inst.post(f"{API}/manage/ctfs", json={"category": "Web", "title": "TEST_writeup ctf", "points": 100, "flag": "abc", "description": "q?", "hints": [], "writeup": "first", "published": False})
    assert r.status_code in (200, 201), r.text
    d = r.json(); CREATED.append(d["id"])
    d["writeup"] = "updated writeup"
    assert inst.put(f"{API}/manage/ctfs/{d['id']}", json=d).status_code == 200
    got = [c for c in inst.get(f"{API}/manage/ctfs").json() if c["id"] == d["id"]][0]
    assert got["writeup"] == "updated writeup" and got["flag"] == "abc"


# Single (non-intel) AI draft includes writeup
def test_single_draft_writeup(inst):
    j = inst.post(f"{API}/builder/ctf-draft", json={"title": "Windows logon types", "content": "Event 4624 logon types 2,3,10", "level": "Beginner"}).json()
    res = poll(inst, j["job_id"])
    assert res["status"] == "done", res
    assert len(res["ctf"]["writeup"]) > 40 and "ioc" not in res["ctf"]
