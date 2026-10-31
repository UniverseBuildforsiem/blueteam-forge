# Iteration 13: rank-up reveal, badge collection, avatar frames on leaderboards
import os
import pytest
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
STUDENT = {"email": "student@socprofessionals.academy", "password": "Student@123"}
ELITE = {"email": "bot0@socprofessionals.academy", "password": "BotUser@123!x"}
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code} {r.text[:100]}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def student():
    return login(STUDENT)


@pytest.fixture(scope="module")
def elite():
    s = login(ELITE)
    orig = mdb.users.find_one({"email": ELITE["email"]}, {"_id": 0, "rankups_seen": 1, "avatar_frame": 1})
    yield s
    # restore: leave rank_up pending for UI test, frame neon
    mdb.users.update_one({"email": ELITE["email"]}, {"$unset": {"rankups_seen": ""}, "$set": {"avatar_frame": orig.get("avatar_frame", "neon")}})


# Rank-up pending + seen endpoint
class TestRankUp:
    def test_rank_up_pending_when_unseen(self, elite):
        mdb.users.update_one({"email": ELITE["email"]}, {"$unset": {"rankups_seen": ""}})
        d = elite.get(f"{BASE_URL}/api/dashboard").json()
        assert d["rank"] == "Elite"
        assert d["rank_up"] == {"rank": "Elite", "xp": d["xp"]}

    def test_rank_up_seen_marks_lower(self, elite):
        r = elite.post(f"{BASE_URL}/api/me/rank-up/Elite/seen")
        assert r.status_code == 200 and r.json() == {"ok": True}
        u = mdb.users.find_one({"email": ELITE["email"]})
        assert set(u["rankups_seen"]) == {"Analyst", "Hunter", "Elite"}
        assert elite.get(f"{BASE_URL}/api/dashboard").json()["rank_up"] is None

    def test_rank_up_seen_partial(self, elite):
        mdb.users.update_one({"email": ELITE["email"]}, {"$unset": {"rankups_seen": ""}})
        elite.post(f"{BASE_URL}/api/me/rank-up/Analyst/seen")
        u = mdb.users.find_one({"email": ELITE["email"]})
        assert u["rankups_seen"] == ["Analyst"]
        assert elite.get(f"{BASE_URL}/api/dashboard").json()["rank_up"]["rank"] == "Elite"

    def test_rank_up_invalid(self, elite):
        for rk in ("Recruit", "elite", "foo"):
            assert elite.post(f"{BASE_URL}/api/me/rank-up/{rk}/seen").status_code == 400, rk

    def test_rank_up_requires_auth(self):
        assert requests.post(f"{BASE_URL}/api/me/rank-up/Elite/seen").status_code == 401

    def test_student_recruit_no_rank_up(self, student):
        d = student.get(f"{BASE_URL}/api/dashboard").json()
        print("demo rank", d["rank"], d["xp"], "level_up", d["level_up"])
        if d["rank"] == "Recruit":
            assert d["rank_up"] is None


# Badge collection endpoint
class TestMyBadges:
    def test_shape(self, student):
        r = student.get(f"{BASE_URL}/api/me/badges")
        assert r.status_code == 200
        d = r.json()
        assert set(["badges", "rank", "xp", "frame", "frames"]) <= set(d)
        assert d["frames"] == ["ember", "neon", "glitch"]
        std = [b for b in d["badges"] if b.get("kind") != "course"]
        assert len(std) == 8
        from collections import Counter
        c = Counter(b["level"] for b in std)
        assert c == {"Recruit": 2, "Analyst": 2, "Hunter": 2, "Elite": 2}, c
        for b in d["badges"]:
            assert {"id", "name", "description", "earned", "level"} <= set(b)

    def test_requires_auth(self):
        assert requests.get(f"{BASE_URL}/api/me/badges").status_code == 401


# Avatar frame PATCH
class TestFrames:
    def test_non_elite_403(self, student):
        r = student.patch(f"{BASE_URL}/api/me/avatar-frame", json={"frame": "ember"})
        assert r.status_code == 403

    def test_unknown_400(self, elite):
        assert elite.patch(f"{BASE_URL}/api/me/avatar-frame", json={"frame": "rainbow"}).status_code == 400

    @pytest.mark.parametrize("frame", ["ember", "glitch", None, "neon"])
    def test_set_and_persist(self, elite, frame):
        r = elite.patch(f"{BASE_URL}/api/me/avatar-frame", json={"frame": frame})
        assert r.status_code == 200 and r.json() == {"frame": frame}
        assert elite.get(f"{BASE_URL}/api/me/badges").json()["frame"] == frame
        lb = elite.get(f"{BASE_URL}/api/leaderboard").json()
        kai = next(u for u in lb if u["username"] == "kai0")
        assert kai["frame"] == frame
        assert "avatar_frame" not in kai

    def test_leaderboard_frames_only_elite(self, elite):
        elite.patch(f"{BASE_URL}/api/me/avatar-frame", json={"frame": "neon"})
        # give a non-elite a stored frame; must not leak
        mdb.users.update_one({"username": "amara1"}, {"$set": {"avatar_frame": "ember"}})
        try:
            lb = elite.get(f"{BASE_URL}/api/leaderboard").json()
            for u in lb:
                if u["rank"] != "Elite":
                    assert u["frame"] is None, u
        finally:
            mdb.users.update_one({"username": "amara1"}, {"$unset": {"avatar_frame": ""}})

    def test_ctf_and_drill_include_frame(self, elite):
        for path in ("/api/ctf/scoreboard", "/api/drill/leaderboard"):
            r = elite.get(f"{BASE_URL}{path}")
            print(path, r.status_code, str(r.json())[:300])
            assert r.status_code == 200
            rows = r.json()
            rows = rows if isinstance(rows, list) else rows.get("leaderboard") or rows.get("rows") or []
            for row in rows:
                assert "frame" in row
                if row.get("username") == "kai0":
                    assert row["frame"] == "neon"

    def test_public_profile_no_frame(self, elite):
        r = requests.get(f"{BASE_URL}/api/public/profile/kai0")
        print("public", r.status_code, r.text[:200])
        if r.status_code == 200:
            assert "avatar_frame" not in r.text and '"frame"' not in r.text
