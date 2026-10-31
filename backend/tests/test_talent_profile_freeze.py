# Iteration 4: Recruiter talent search, profile links (verify/leaderboards/streak card), streak freeze
import os
import time
import requests
import pytest
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
TS = int(time.time())
mc = MongoClient("mongodb://localhost:27017")["test_database"]


def mk_user(tag, onboard=True):
    s = requests.Session()
    email = f"test_{tag}_{TS}@example.com"
    r = s.post(f"{BASE_URL}/api/auth/register", json={"name": f"TEST {tag}", "email": email, "username": f"t{tag}{TS}", "password": "Passw0rd!x"})
    assert r.status_code == 200, r.text
    if onboard:
        assert s.post(f"{BASE_URL}/api/auth/onboarding", json={"goal": "SOC L1"}).status_code == 200
    u = mc.users.find_one({"email": email}, {"_id": 0})
    return s, u


def cleanup(u):
    for col in ("drill_submissions", "drill_freezes", "activity", "challenge_submissions", "quiz_attempts", "certificates", "ctf_solves"):
        mc[col].delete_many({"user_id": u["id"]})
    mc.users.delete_one({"id": u["id"]})


@pytest.fixture(scope="module")
def tal():
    s, u = mk_user("tal")
    # give skill: correct Phishing triage
    mc.challenge_submissions.insert_one({"user_id": u["id"], "challenge_id": "x-test", "category": "Phishing", "verdict_correct": True})
    cid = f"TEST-CERT-{TS}"
    mc.certificates.insert_one({"id": cid, "user_id": u["id"], "name": u["name"], "path_id": "soc-l1", "path_title": "SOC L1 Analyst",
                                "score": 90, "issued_at": datetime.now(timezone.utc).isoformat(), "status": "valid"})
    mc.users.update_one({"id": u["id"]}, {"$set": {"xp": 1234}})
    yield s, u, cid
    cleanup(u)


# ---- Talent ----
def test_talent_public_no_auth():
    r = requests.get(f"{BASE_URL}/api/public/talent")
    assert r.status_code == 200
    d = r.json()
    assert {"results", "total", "options"} <= set(d)
    assert d["options"]["ranks"] == ["Recruit", "Analyst", "Hunter", "Elite"]
    assert "SOC L1 Analyst" in d["options"]["certificates"]
    names = [x["username"] for x in d["results"]]
    assert "demo" in names and "kai0" in names
    for x in d["results"]:
        assert "user_id" not in x and "email" not in x and "password_hash" not in x


def test_talent_filters(tal):
    s, u, cid = tal
    un = u["username"]
    r = requests.get(f"{BASE_URL}/api/public/talent", params={"q": un}).json()
    assert r["total"] == 1 and r["results"][0]["username"] == un
    row = r["results"][0]
    assert row["skills"] == ["Phishing"] and row["certificates"] == ["SOC L1 Analyst"] and row["rank"] == "Analyst"
    assert un in [x["username"] for x in requests.get(f"{BASE_URL}/api/public/talent", params={"cert": "SOC L1 Analyst"}).json()["results"]]
    assert un in [x["username"] for x in requests.get(f"{BASE_URL}/api/public/talent", params={"skill": "Phishing"}).json()["results"]]
    rk = requests.get(f"{BASE_URL}/api/public/talent", params={"rank": "Analyst"}).json()["results"]
    assert un in [x["username"] for x in rk] and all(x["rank"] == "Analyst" for x in rk)
    assert requests.get(f"{BASE_URL}/api/public/talent", params={"q": un, "rank": "Elite"}).json()["total"] == 0
    assert requests.get(f"{BASE_URL}/api/public/talent", params={"q": un, "skill": "Malware"}).json()["total"] == 0


def test_public_profile_skills(tal):
    s, u, cid = tal
    r = requests.get(f"{BASE_URL}/api/public/profile/{u['username']}")
    assert r.status_code == 200
    d = r.json()
    assert d["skills"] == ["Phishing"] and d["certificates"][0]["id"] == cid
    assert "user_id" not in d and "email" not in d


def test_verify_public_returns_username(tal):
    s, u, cid = tal
    d = requests.get(f"{BASE_URL}/api/public/verify/{cid}").json()
    assert d["username"] == u["username"] and "user_id" not in d and d["status"] == "valid"


def test_private_profile_hidden_everywhere(tal):
    s, u, cid = tal
    r = s.patch(f"{BASE_URL}/api/me/profile-visibility", json={"public_profile": False})
    assert r.status_code == 200 and r.json()["public_profile"] is False
    try:
        assert requests.get(f"{BASE_URL}/api/public/profile/{u['username']}").status_code == 404
        assert requests.get(f"{BASE_URL}/api/public/talent", params={"q": u["username"]}).json()["total"] == 0
        d = requests.get(f"{BASE_URL}/api/public/verify/{cid}").json()
        assert d["username"] is None and "user_id" not in d
        # share card redirects to home, not profile
        sc = s.post(f"{BASE_URL}/api/me/share-card").json()
        html = requests.get(sc["share_url"]).text
        assert f"/u/{u['username']}" not in html
        # dashboard leaderboard flag
        lb = s.get(f"{BASE_URL}/api/leaderboard").json()
        me = [x for x in lb if x["username"] == u["username"]]
        if me:
            assert me[0]["public"] is False
    finally:
        s.patch(f"{BASE_URL}/api/me/profile-visibility", json={"public_profile": True})
    assert requests.get(f"{BASE_URL}/api/public/profile/{u['username']}").status_code == 200


def test_streak_share_page_points_to_profile(tal):
    s, u, cid = tal
    sc = s.post(f"{BASE_URL}/api/me/share-card").json()
    assert sc["image_url"] == sc["share_url"] + ".png"
    html = requests.get(sc["share_url"]).text
    assert f'url={os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")}/u/{u["username"]}' in html
    png = requests.get(sc["image_url"])
    assert png.status_code == 200 and png.headers["content-type"] == "image/png" and png.content[:4] == b"\x89PNG"


# ---- Leaderboards public flag ----
def test_leaderboards_public_flag():
    s = requests.Session()
    assert s.post(f"{BASE_URL}/api/auth/login", json={"email": "student@socforge.io", "password": "Student@123"}).status_code == 200
    lb = s.get(f"{BASE_URL}/api/leaderboard").json()
    assert lb and all("public" in x and "username" in x for x in lb)
    sb = s.get(f"{BASE_URL}/api/ctf/scoreboard").json()
    assert all("public" in x for x in sb)
    dl = s.get(f"{BASE_URL}/api/drill/leaderboard").json()
    assert all("public" in x and "username" in x for x in dl["rows"])


# ---- Streak freeze ----
def test_freeze_buy_rules():
    s, u = mk_user("frz")
    try:
        d = s.get(f"{BASE_URL}/api/drill/today").json()
        assert d["streak_freezes"] == 0 and d["freeze_cost"] == 100 and d["freeze_max"] == 2 and d["frozen_days"] == []
        r = s.post(f"{BASE_URL}/api/drill/freeze/buy")
        assert r.status_code == 400 and "XP" in r.json()["detail"]
        mc.users.update_one({"id": u["id"]}, {"$set": {"xp": 350}})
        r = s.post(f"{BASE_URL}/api/drill/freeze/buy")
        assert r.status_code == 200 and r.json() == {"streak_freezes": 1, "xp": 250}
        r = s.post(f"{BASE_URL}/api/drill/freeze/buy")
        assert r.status_code == 200 and r.json() == {"streak_freezes": 2, "xp": 150}
        r = s.post(f"{BASE_URL}/api/drill/freeze/buy")
        assert r.status_code == 400 and "at most" in r.json()["detail"]
        assert mc.users.find_one({"id": u["id"]})["xp"] == 150
        assert requests.post(f"{BASE_URL}/api/drill/freeze/buy").status_code == 401
    finally:
        cleanup(u)


def test_freeze_auto_apply():
    s, u = mk_user("fra")
    try:
        today = datetime.now(timezone.utc).date()
        y, y2 = (today - timedelta(days=1)).isoformat(), (today - timedelta(days=2)).isoformat()
        mc.users.update_one({"id": u["id"]}, {"$set": {"streak_freezes": 1}})
        mc.drill_submissions.insert_one({"user_id": u["id"], "date": y2, "auto_score": 80, "xp": 10, "created_at": datetime.now(timezone.utc).isoformat()})
        d = s.get(f"{BASE_URL}/api/drill/today").json()
        assert d["drill_streak"] == 2 and d["streak_freezes"] == 0 and y in d["frozen_days"]
        # idempotent
        d = s.get(f"{BASE_URL}/api/drill/today").json()
        assert d["drill_streak"] == 2 and d["streak_freezes"] == 0
        arc = {a["date"]: a for a in s.get(f"{BASE_URL}/api/drill/archive").json()}
        assert arc[y]["frozen"] is True and arc[y2]["frozen"] is False and arc[y2]["live_score"] == 80
    finally:
        cleanup(u)


def test_no_freeze_no_apply():
    s, u = mk_user("frn")
    try:
        today = datetime.now(timezone.utc).date()
        y2 = (today - timedelta(days=2)).isoformat()
        mc.drill_submissions.insert_one({"user_id": u["id"], "date": y2, "auto_score": 80, "xp": 10, "created_at": "x"})
        d = s.get(f"{BASE_URL}/api/drill/today").json()
        assert d["drill_streak"] == 0 and d["frozen_days"] == []
    finally:
        cleanup(u)
