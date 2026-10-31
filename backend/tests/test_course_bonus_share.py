# Iteration 9: Watched-course bonus XP, course badge share card, My courses progress API
import io
import os
import re
import time
import uuid

import pytest
import requests
from dotenv import dotenv_values
from PIL import Image
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")).rstrip("/")
ENV = dotenv_values("/app/backend/.env")
db = MongoClient(ENV["MONGO_URL"].strip('"'))[ENV["DB_NAME"].strip('"')]
API = f"{BASE_URL}/api"
WS = 585979  # Wireshark: ctf-net, kali, siem
KALI = 584863  # Kali: kali, lab-brute, ctf-for


def new_student():
    s = requests.Session()
    u = uuid.uuid4().hex[:8]
    r = s.post(f"{API}/auth/register", json={"name": f"TEST Bonus {u}", "email": f"test_bonus_{u}@example.com", "username": f"tb_{u}", "password": "Test@12345"})
    assert r.status_code in (200, 201), r.text
    assert s.post(f"{API}/auth/onboarding", json={"goal": "SOC L1"}).status_code == 200
    me = s.get(f"{API}/auth/me").json()
    return s, me


def xp(s):
    return s.get(f"{API}/auth/me").json().get("xp", 0)


def row(data, cid):
    return next((r for r in data["courses"] if r["course"]["id"] == cid), None)


@pytest.fixture(scope="module")
def created():
    users = []
    yield users
    for uid in users:
        for c in ("course_completions", "course_bonus", "ctf_solves", "activity", "lab_progress"):
            db[c].delete_many({"user_id": uid})
        db.users.delete_one({"id": uid})


# Progress API: auth + empty state
def test_progress_requires_auth():
    assert requests.get(f"{API}/me/courses/progress").status_code == 401


def test_progress_empty(created):
    s, me = new_student()
    created.append(me["id"])
    d = s.get(f"{API}/me/courses/progress").json()
    assert d == {"courses": [], "bonus_xp": 100, "awarded": []}


# Bonus: watch then solve CTF -> +100 once
def test_bonus_paid_once_after_watch(created):
    s, me = new_student()
    created.append(me["id"])
    assert s.post(f"{API}/me/courses/{WS}/complete").status_code == 200
    d = s.get(f"{API}/me/courses/progress").json()
    r = row(d, WS)
    assert r and r["bonus_paid"] is False and d["awarded"] == []
    assert r["badge_name"] and r["watched_at"]
    keys = {i["key"]: i for i in r["items"]}
    assert {"ctf-net", "kali", "siem"} <= set(keys)
    assert keys["kali"]["trackable"] is False and keys["siem"]["trackable"] is False and keys["ctf-net"]["trackable"] is True
    assert r["trackable_count"] == sum(1 for k in keys if k not in ("kali", "siem", "tools")) and r["done_count"] == 0
    for k in ("key", "title", "link", "kind", "trackable", "done", "done_after_watch"):
        assert k in keys["ctf-net"]
    x0 = xp(s)
    time.sleep(0.05)
    sub = s.post(f"{API}/ctf/ctf-net-2/submit", json={"flag": "SOCF{3389}"}).json()
    assert sub["correct"] is True
    pts = sub["points"]
    d = s.get(f"{API}/me/courses/progress").json()
    assert len(d["awarded"]) == 1
    r = row(d, WS)
    assert r["bonus_paid"] and r["done_count"] == 1
    assert xp(s) == x0 + pts + 100
    acts = list(db.activity.find({"user_id": me["id"], "text": {"$regex": "^Course bonus"}}))
    assert len(acts) == 1 and acts[0]["xp"] == 100
    d2 = s.get(f"{API}/me/courses/progress").json()
    assert d2["awarded"] == [] and row(d2, WS)["bonus_paid"]
    assert s.get(f"{API}/dashboard").status_code == 200
    assert xp(s) == x0 + pts + 100
    # unwatch + rewatch + new completion should not repay
    s.delete(f"{API}/me/courses/{WS}/complete")
    s.post(f"{API}/me/courses/{WS}/complete")
    s.post(f"{API}/ctf/ctf-net-1/submit", json={"flag": "SOCF{60}"})
    x1 = xp(s)
    assert s.get(f"{API}/me/courses/progress").json()["awarded"] == []
    assert xp(s) == x1


# Completion before watching must not pay
def test_completion_before_watch_no_bonus(created):
    s, me = new_student()
    created.append(me["id"])
    assert s.post(f"{API}/ctf/ctf-net-2/submit", json={"flag": "SOCF{3389}"}).json()["correct"]
    time.sleep(0.05)
    s.post(f"{API}/me/courses/{WS}/complete")
    x0 = xp(s)
    d = s.get(f"{API}/me/courses/progress").json()
    r = row(d, WS)
    assert d["awarded"] == [] and r["bonus_paid"] is False
    item = next(i for i in r["items"] if i["key"] == "ctf-net")
    assert item["done"] is True and item["done_after_watch"] is False
    assert r["done_count"] == 1
    assert xp(s) == x0


# Dashboard applies bonus too
def test_dashboard_applies_bonus(created):
    s, me = new_student()
    created.append(me["id"])
    s.post(f"{API}/me/courses/{WS}/complete")
    time.sleep(0.05)
    pts = s.post(f"{API}/ctf/ctf-net-2/submit", json={"flag": "SOCF{3389}"}).json()["points"]
    x0 = xp(s)
    assert s.get(f"{API}/dashboard").status_code == 200
    assert xp(s) == x0 + 100
    assert db.course_bonus.count_documents({"user_id": me["id"], "course_id": WS}) == 1
    assert s.get(f"{API}/me/courses/progress").json()["awarded"] == []


# Concurrency: parallel calls must still pay once
def test_parallel_calls_pay_once(created):
    import concurrent.futures as cf
    s, me = new_student()
    created.append(me["id"])
    s.post(f"{API}/me/courses/{WS}/complete")
    time.sleep(0.05)
    pts = s.post(f"{API}/ctf/ctf-net-2/submit", json={"flag": "SOCF{3389}"}).json()["points"]
    x0 = xp(s)
    with cf.ThreadPoolExecutor(6) as ex:
        list(ex.map(lambda _: s.get(f"{API}/me/courses/progress"), range(6)))
    assert xp(s) == x0 + 100


# Share card
def test_share_card_flow(created):
    s, me = new_student()
    created.append(me["id"])
    assert s.post(f"{API}/me/courses/{WS}/share-card").status_code == 404
    s.post(f"{API}/me/courses/{WS}/complete")
    r = s.post(f"{API}/me/courses/{WS}/share-card")
    assert r.status_code == 200
    d = r.json()
    assert d["image_url"] == d["share_url"] + ".png"
    path = d["share_url"].split("/api", 1)[1]
    img = requests.get(f"{API}{path}.png")
    assert img.status_code == 200 and img.headers["content-type"] == "image/png"
    assert Image.open(io.BytesIO(img.content)).size == (1200, 627)
    page = requests.get(f"{API}{path}", allow_redirects=False)
    assert page.status_code == 200
    html = page.text
    assert 'property="og:title"' in html and "course badge" in html
    og = re.search(r'og:image" content="([^"]+)"', html).group(1)
    assert og.endswith(f"/{WS}.png")
    assert f"/u/{me['username']}" in html
    token = path.split("/")[3]
    assert requests.get(f"{API}/public/course-badge/badtoken123/{WS}.png").status_code == 404
    assert requests.get(f"{API}/public/course-badge/badtoken123/{WS}").status_code == 404
    assert requests.get(f"{API}/public/course-badge/{token}/{KALI}.png").status_code == 404
    assert requests.get(f"{API}/public/course-badge/{token}/{KALI}").status_code == 404
    assert requests.post(f"{API}/me/courses/{WS}/share-card").status_code == 401


# Demo student sanity
def test_demo_student_progress():
    s = requests.Session()
    assert s.post(f"{API}/auth/login", json={"email": "student@socforge.io", "password": "Student@123"}).status_code == 200
    d = s.get(f"{API}/me/courses/progress").json()
    r = row(d, WS)
    assert r and r["bonus_paid"] is True and d["awarded"] == []
