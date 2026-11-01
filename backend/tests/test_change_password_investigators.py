# Iteration 23: Change password (token_version session revocation) + Weekly Investigator Leaderboard
import os
import uuid
import datetime as dt
import pytest
import requests
from pathlib import Path


def _base():
    u = os.environ.get("REACT_APP_BACKEND_URL")
    if not u:
        for line in Path("/app/frontend/.env").read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                u = line.split("=", 1)[1].strip()
    return u.rstrip("/")


BASE = _base()
REPORT = "Investigated the alert: checked process tree, hashes, network connections and user context thoroughly."


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    return s, r


def register(prefix="TEST_cp"):
    tag = uuid.uuid4().hex[:8]
    email = f"{prefix.lower()}_{tag}@example.com"
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/register", json={"name": f"{prefix} {tag}", "email": email, "username": f"tcp{tag}", "password": "Orig1234pass"})
    assert r.status_code == 200, r.text
    return s, email, r.json()


@pytest.fixture(scope="module")
def admin():
    s, r = login("admin@socprofessionals.academy", "Admin@123")
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return s


@pytest.fixture(scope="module")
def created(admin):
    ids = []
    yield ids
    for uid in ids:
        admin.delete(f"{BASE}/api/admin/users/{uid}")


# ---- Regression: seeded logins / me / refresh / logout ----
@pytest.mark.parametrize("email,pw", [("admin@socprofessionals.academy", "Admin@123"), ("instructor@socprofessionals.academy", "Instructor@123"), ("student@socprofessionals.academy", "Student@123")])
def test_seeded_login_me_refresh_logout(email, pw):
    s, r = login(email, pw)
    assert r.status_code == 200, r.text
    assert "password_hash" not in r.json() and "token_version" not in r.json()
    assert s.get(f"{BASE}/api/auth/me").json()["email"] == email
    rr = s.post(f"{BASE}/api/auth/refresh")
    assert rr.status_code == 200 and rr.json()["email"] == email
    assert s.post(f"{BASE}/api/auth/logout").status_code == 200


def test_change_password_unauthenticated():
    r = requests.post(f"{BASE}/api/auth/change-password", json={"current_password": "x", "new_password": "Abcdefg123"})
    assert r.status_code == 401


class TestChangePassword:
    def test_validation_errors(self, created):
        s, email, u = register()
        created.append(u["id"])
        r = s.post(f"{BASE}/api/auth/change-password", json={"current_password": "WrongPass1", "new_password": "Newpass123"})
        assert r.status_code == 400 and r.json()["detail"] == "Current password is incorrect"
        r = s.post(f"{BASE}/api/auth/change-password", json={"current_password": "Orig1234pass", "new_password": "Orig1234pass"})
        assert r.status_code == 400
        r = s.post(f"{BASE}/api/auth/change-password", json={"current_password": "Orig1234pass", "new_password": "nodigitshere"})
        assert r.status_code in (400, 422)
        r = s.post(f"{BASE}/api/auth/change-password", json={"current_password": "Orig1234pass", "new_password": "Ab1"})
        assert r.status_code in (400, 422)
        r = s.post(f"{BASE}/api/auth/change-password", json={"current_password": "Orig1234pass", "new_password": "12345678"})
        assert r.status_code in (400, 422)
        # still able to log in with original password
        assert login(email, "Orig1234pass")[1].status_code == 200

    def test_success_revokes_other_sessions(self, created):
        s, email, u = register()
        created.append(u["id"])
        other, r = login(email, "Orig1234pass")
        assert r.status_code == 200
        assert other.get(f"{BASE}/api/auth/me").status_code == 200
        r = s.post(f"{BASE}/api/auth/change-password", json={"current_password": "Orig1234pass", "new_password": "Brandnew456"})
        assert r.status_code == 200 and r.json() == {"ok": True}
        # caller session remains valid (incl. refresh)
        assert s.get(f"{BASE}/api/auth/me").status_code == 200
        assert s.post(f"{BASE}/api/auth/refresh").status_code == 200
        assert s.get(f"{BASE}/api/auth/me").status_code == 200
        # other device signed out
        assert other.get(f"{BASE}/api/auth/me").status_code == 401
        assert other.post(f"{BASE}/api/auth/refresh").status_code == 401
        # old pw fails, new pw works
        assert login(email, "Orig1234pass")[1].status_code == 401
        assert login(email, "Brandnew456")[1].status_code == 200

    def test_reset_password_flow_bumps_token_version(self, created):
        from pymongo import MongoClient
        env = dict(l.split("=", 1) for l in Path("/app/backend/.env").read_text().splitlines() if "=" in l)
        db = MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]
        s, email, u = register()
        created.append(u["id"])
        assert requests.post(f"{BASE}/api/auth/forgot-password", json={"email": email}).status_code == 200
        tok = db.password_reset_tokens.find_one({"user_id": u["id"]})["token"]
        r = requests.post(f"{BASE}/api/auth/reset-password", json={"token": tok, "password": "Resetpw789"})
        assert r.status_code == 200
        assert s.get(f"{BASE}/api/auth/me").status_code == 401
        assert login(email, "Resetpw789")[1].status_code == 200
        assert requests.post(f"{BASE}/api/auth/reset-password", json={"token": tok, "password": "Resetpw789"}).status_code == 400


class TestInvestigatorBoard:
    def test_shape(self, admin):
        d = admin.get(f"{BASE}/api/leaderboard/investigators").json()
        ws = dt.date.fromisoformat(d["week_start"])
        assert ws.weekday() == 0
        assert dt.date.fromisoformat(d["resets_on"]) == ws + dt.timedelta(days=7)
        assert len(d["top"]) <= 10
        for i, row in enumerate(d["top"]):
            assert {"name", "username", "count", "rank", "frame", "public"} <= set(row)
        assert {"count", "position"} <= set(d["me"])
        assert "last_champion" in d
        # admin isn't a student -> not ranked
        assert d["me"]["position"] is None

    def test_unauth(self):
        assert requests.get(f"{BASE}/api/leaderboard/investigators").status_code == 401

    def test_counting(self, created):
        s, email, u = register("TEST_inv")
        created.append(u["id"])
        board = lambda: s.get(f"{BASE}/api/leaderboard/investigators").json()
        assert board()["me"] == {"count": 0, "position": None}
        # submission without lookup -> not counted
        r = s.post(f"{BASE}/api/challenges/ch-phish-01/submit", json={"verdict": "TP", "report": REPORT})
        assert r.status_code == 200 and r.json()["investigated"] is False
        assert board()["me"]["count"] == 0
        # intel lookup then submit -> counted
        assert s.get(f"{BASE}/api/tools/intel", params={"q": "185.220.101.45", "kind": "challenge", "id": "ch-bf-01"}).status_code == 200
        r = s.post(f"{BASE}/api/challenges/ch-bf-01/submit", json={"verdict": "TP", "report": REPORT})
        assert r.json()["investigated"] is True
        d = board()
        assert d["me"]["count"] == 1 and isinstance(d["me"]["position"], int)
        assert any(x["username"] == u["username"] and x["count"] == 1 for x in d["top"]) or d["me"]["position"] > 10
        # sandbox report then submit -> counted
        files = s.get(f"{BASE}/api/tools/alert-iocs", params={"kind": "challenge", "id": "ch-mal-01"}).json()["files"]
        assert s.get(f"{BASE}/api/tools/sandbox/report", params={"file": files[0], "kind": "challenge", "id": "ch-mal-01"}).status_code == 200
        r = s.post(f"{BASE}/api/challenges/ch-mal-01/submit", json={"verdict": "FP", "report": REPORT})
        assert r.json()["investigated"] is True
        assert board()["me"]["count"] == 2
        # lookup for a different kind / bogus challenge id doesn't count
        s.get(f"{BASE}/api/tools/intel", params={"q": "185.220.101.45", "kind": "lab", "id": "ch-rw-01"})
        s.get(f"{BASE}/api/tools/intel", params={"q": "185.220.101.45", "kind": "challenge", "id": "nope-xyz"})
        r = s.post(f"{BASE}/api/challenges/ch-rw-01/submit", json={"verdict": "TP", "report": REPORT})
        assert r.json()["investigated"] is False
        assert board()["me"]["count"] == 2

    def test_only_students(self, admin):
        d = admin.get(f"{BASE}/api/leaderboard/investigators").json()
        users = {u["username"]: u for u in admin.get(f"{BASE}/api/admin/users").json()} if isinstance(admin.get(f"{BASE}/api/admin/users").json(), list) else {}
        for row in d["top"]:
            if row["username"] in users:
                assert users[row["username"]]["role"] == "student"
