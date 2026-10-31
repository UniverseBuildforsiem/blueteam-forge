# Iteration 16: Mock interview API, sample page images, receipt-email wiring
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
STUDENT = ("student@socprofessionals.academy", "Student@123")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def owner():
    return login(*STUDENT)


@pytest.fixture(scope="module")
def fresh():
    email = f"test_iv_{uuid.uuid4().hex[:8]}@example.com"
    s = requests.Session()
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "TestPass@123!", "name": "TEST Interview", "username": f"tiv{uuid.uuid4().hex[:8]}"})
    assert r.status_code in (200, 201), r.text
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


# --- history/meta
def test_history_owner(owner):
    d = owner.get(f"{API}/mock-interview/history").json()
    assert d["owned"] is True and d["count"] == 30 and d["minutes"] == 30 and d["pass_mark"] == 70 and d["pool"] == 108
    assert isinstance(d["history"], list)


def test_history_nonowner(fresh):
    d = fresh.get(f"{API}/mock-interview/history").json()
    assert d["owned"] is False and d["history"] == []


def test_start_nonowner_402(fresh):
    assert fresh.post(f"{API}/mock-interview/start").status_code == 402


def test_unauth():
    assert requests.get(f"{API}/mock-interview/history").status_code == 401
    assert requests.get(f"{API}/me/book/sample/1.jpg").status_code == 401


# --- sample pages
def test_sample_pages(fresh):
    for n in (1, 10):
        r = fresh.get(f"{API}/me/book/sample/{n}.jpg")
        assert r.status_code == 200 and r.headers["content-type"].startswith("image/jpeg") and len(r.content) > 1000
    for n in (0, 11):
        assert fresh.get(f"{API}/me/book/sample/{n}.jpg").status_code == 404


# --- full session flow
STATE = {}


def test_start_session(owner):
    r = owner.post(f"{API}/mock-interview/start")
    assert r.status_code == 200, r.text
    s = r.json()
    assert s["status"] == "in_progress" and len(s["questions"]) == 30
    assert len({q["id"] for q in s["questions"]}) == 30
    for q in s["questions"]:
        assert set(q.keys()) == {"id", "q", "topic"}
    assert "user_id" not in s and "results" not in s
    STATE["s"] = s
    r2 = owner.post(f"{API}/mock-interview/start").json()
    assert r2["id"] == s["id"]


def test_draft_and_other_user_404(owner, fresh):
    s = STATE["s"]
    q = s["questions"]
    ans = {q[0]["id"]: "Phishing triage: check headers, sender, links in sandbox, block IOCs, reset creds.",
           q[1]["id"]: "SIEM correlates logs from many sources to detect threats."}
    r = owner.put(f"{API}/mock-interview/{s['id']}/draft", json={"answers": {**ans, "bogus": "x"}})
    assert r.status_code == 200
    g = owner.get(f"{API}/mock-interview/{s['id']}").json()
    assert g["answers"] == ans  # bogus id filtered
    assert fresh.get(f"{API}/mock-interview/{s['id']}").status_code == 404
    assert fresh.post(f"{API}/mock-interview/{s['id']}/submit", json={"answers": {}}).status_code == 404
    STATE["ans"] = ans


def test_submit_and_grade(owner):
    s = STATE["s"]
    r = owner.post(f"{API}/mock-interview/{s['id']}/submit", json={"answers": STATE["ans"]})
    assert r.status_code == 200 and r.json()["status"] == "grading"
    assert owner.post(f"{API}/mock-interview/{s['id']}/submit", json={"answers": {}}).status_code == 409
    assert owner.put(f"{API}/mock-interview/{s['id']}/draft", json={"answers": {}}).status_code == 409
    g = None
    for _ in range(30):
        g = owner.get(f"{API}/mock-interview/{s['id']}").json()
        if g["status"] != "grading":
            break
        time.sleep(5)
    print("final status", g["status"], g.get("score"))
    assert g["status"] == "graded", f"grading ended with {g['status']}"
    assert len(g["results"]) == 30
    for q in g["questions"]:
        assert q["reference"]
        r = g["results"][q["id"]]
        assert 0 <= r["score"] <= 10
        if q["id"] not in STATE["ans"]:
            assert r["score"] == 0
    answered = [g["results"][k] for k in STATE["ans"]]
    print("answered results", answered)
    assert all(x["feedback"] and x["feedback"] != "Not graded." for x in answered)
    assert g["score"] == round(sum(r["score"] for r in g["results"].values()) * 10 / 30)
    assert g["passed"] == (g["score"] >= 70)
    h = owner.get(f"{API}/mock-interview/history").json()["history"]
    assert any(x["id"] == s["id"] and x["status"] == "graded" for x in h)
