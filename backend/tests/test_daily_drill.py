# Daily Alert Drill API + cron auth quick check (iteration 3)
import os
import time
import requests
import pytest
from datetime import datetime, timezone
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
TS = int(time.time())
EMAIL = f"test_drill_{TS}@example.com"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/register", json={"name": "TEST Drill", "email": EMAIL, "username": f"tdrill{TS}", "password": "Passw0rd!x"})
    assert r.status_code == 200, r.text
    yield s
    mc = MongoClient("mongodb://localhost:27017")["test_database"]
    u = mc.users.find_one({"email": EMAIL})
    if u:
        for col in ("drill_submissions", "activity"):
            mc[col].delete_many({"user_id": u["id"]})
        mc.users.delete_one({"id": u["id"]})


# Drill GET (unauth + shape)
def test_drill_requires_auth():
    assert requests.get(f"{BASE_URL}/api/drill/today").status_code == 401


def test_drill_today_shape(client):
    r = client.get(f"{BASE_URL}/api/drill/today")
    assert r.status_code == 200
    d = r.json()
    print("drill", d["id"], d["title"], d["severity"])
    assert d["id"].startswith("drill-") and len(d["id"]) == len("drill-YYYY-MM-DD")
    assert d["date"] == d["id"][6:]
    for k in ("title", "severity", "alert", "evidence", "description", "category"):
        assert d.get(k)
    assert d["bonus_xp"] == 50
    assert d["drill_streak"] == 0
    assert d["submission"] is None
    assert "verdict" not in d and "keywords" not in d
    assert set(d["alert"]).issuperset({"rule", "host", "user", "time"})


# Drill validation
def test_drill_submit_validation(client):
    assert client.post(f"{BASE_URL}/api/drill/today/submit", json={"verdict": "XX", "report": "a" * 30}).status_code == 422
    assert client.post(f"{BASE_URL}/api/drill/today/submit", json={"verdict": "TP", "report": "short"}).status_code == 422


# Drill submit, XP, activity, duplicate, streak
def test_drill_submit_flow(client):
    before = client.get(f"{BASE_URL}/api/dashboard").json()["xp"]
    report = "Checked dmarc macro powershell isolate block 4625 4624 reset password mfa change ticket signed legitimate tuning vssadmin shadow upd.exe backup 7045 lateral credential disable pass procurement pdf benign"
    r = client.post(f"{BASE_URL}/api/drill/today/submit", json={"verdict": "TP", "report": report})
    assert r.status_code == 200, r.text
    s = r.json()
    print("submit", s["auto_score"], s["xp"], s["expected_verdict"], s["keywords_hit"], s["missed_keywords"])
    exp_score = (60 if s["verdict_correct"] else 0) + round(40 * len(s["keywords_hit"]) / (len(s["keywords_hit"]) + len(s["missed_keywords"])))
    assert s["auto_score"] == exp_score
    assert s["xp"] == round(100 * s["auto_score"] / 100) + 50
    assert "_id" not in s
    dash = client.get(f"{BASE_URL}/api/dashboard").json()
    assert dash["xp"] == before + s["xp"]
    assert any("Daily drill" in a["text"] and a["xp"] == s["xp"] for a in dash["activity"])
    r2 = client.post(f"{BASE_URL}/api/drill/today/submit", json={"verdict": "FP", "report": "another report text here ok"})
    assert r2.status_code == 400
    g = client.get(f"{BASE_URL}/api/drill/today").json()
    assert g["submission"]["auto_score"] == s["auto_score"]
    assert g["drill_streak"] >= 1
    assert client.get(f"{BASE_URL}/api/dashboard").json()["xp"] == before + s["xp"]


def test_drill_deterministic_across_users(client):
    s2 = requests.Session()
    s2.post(f"{BASE_URL}/api/auth/login", json={"email": "student@socforge.io", "password": "Student@123"})
    a = client.get(f"{BASE_URL}/api/drill/today").json()
    b = s2.get(f"{BASE_URL}/api/drill/today").json()
    assert a["id"] == b["id"] and a["title"] == b["title"] and a["evidence"] == b["evidence"]
    print("student drill submission:", b["submission"])


# Cron auth quick check
def test_cron_requires_auth():
    assert requests.post(f"{BASE_URL}/api/cron/session-reminders").status_code == 401
