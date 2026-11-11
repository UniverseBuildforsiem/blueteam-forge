# Iteration 42: YouTube unknown-duration denominator = median of per-user $max'ed reports (video_meta.reports.<uid>), 30s floor.
# Mutates video_meta.reports for yt:inWWhr5tnEA -> run ALONE and serially:  pytest tests/test_video_median.py -n 0
import time
import pytest
import requests
from pathlib import Path
from pymongo import MongoClient
from test_video_progress import BASE, YPID, YVID, QS, RIGHT, CONTENT, fresh_student, vpost, xp

env = dict(l.split("=", 1) for l in Path("/app/backend/.env").read_text().splitlines() if "=" in l)
mdb = MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]
KEY = "yt:inWWhr5tnEA:"


def uid(s):
    return s.get(f"{BASE}/api/auth/me").json()["id"]


def reports():
    return (mdb.video_meta.find_one({"key": KEY}) or {}).get("reports", {})


def stored_dur(u):
    return mdb.video_progress.find_one({"user_id": u, "lesson_id": YVID})["duration"]


@pytest.fixture(autouse=True)
def clean_reports():
    mdb.video_meta.update_one({"key": KEY}, {"$unset": {"reports": ""}})
    yield
    mdb.video_meta.update_one({"key": KEY}, {"$unset": {"reports": ""}})


class TestMedian:
    def test_meta_has_no_server_duration(self):
        m = mdb.video_meta.find_one({"key": KEY})
        assert m and m.get("duration") is None and "client_max" not in m

    def test_floor_30(self):
        s = fresh_student()
        d = vpost(s, YVID, 10, [[0, 10]]).json()
        u = uid(s)
        assert reports()[u] == 10 and stored_dur(u) == 30.0
        assert d["percent"] == 33 and d["watched"] is False

    def test_own_report_cannot_be_lowered(self):
        s = fresh_student()
        vpost(s, YVID, 600, [[0, 10]])
        time.sleep(2)
        d = vpost(s, YVID, 31, [[10, 15]]).json()
        u = uid(s)
        assert reports()[u] == 600 and stored_dur(u) == 600.0
        assert d["percent"] == round(100 * 15 / 600)

    def test_reports_are_per_user(self):
        a, b = fresh_student(), fresh_student()
        vpost(a, YVID, 600, [])
        vpost(b, YVID, 60, [])
        r = reports()
        assert r[uid(a)] == 600 and r[uid(b)] == 60 and len(r) == 2

    def test_single_reporter_watch_then_complete(self):
        s = fresh_student()
        d = vpost(s, YVID, 60, [[0, 12]]).json()
        assert d["percent"] == 20
        assert s.post(f"{BASE}/api/paths/{YPID}/lessons/{YVID}/complete").status_code == 400
        time.sleep(20)
        d = vpost(s, YVID, 60, [[12, 60]]).json()
        assert d["watched"] is True and d["newly"] is True, d
        assert s.post(f"{BASE}/api/paths/{YPID}/lessons/{YVID}/complete").status_code == 200
        assert xp(s) == 10

    def test_attacker_outvoted_by_two_honest(self):
        atk = fresh_student()
        vpost(atk, YVID, 86400, [])
        h1, h2 = fresh_student(), fresh_student()
        vpost(h1, YVID, 60, [[0, 12]])
        d = vpost(h2, YVID, 60, [[0, 12]]).json()
        assert stored_dur(uid(h2)) == 60.0 and d["percent"] == 20, d
        time.sleep(20)
        d = vpost(h2, YVID, 60, [[12, 60]]).json()
        assert d["watched"] is True, d

    def test_attacker_with_one_honest_reporter(self):
        """2 reporters: [60, 86400] -> upper median picks 86400 (honest user still blocked)."""
        atk, h = fresh_student(), fresh_student()
        vpost(atk, YVID, 86400, [])
        vpost(h, YVID, 60, [[0, 12]])
        print("2-reporter stored dur for honest user:", stored_dur(uid(h)))
        assert stored_dur(uid(h)) <= 600, f"honest user denominator={stored_dur(uid(h))} with 2 reporters (upper median)"

    def test_quiz_video_flow_admin_path(self):
        a = requests.Session()
        assert a.post(f"{BASE}/api/auth/login", json={"email": "admin@socprofessionals.academy", "password": "Admin@123"}).status_code == 200
        body = {"title": "TEST_Video Median Path", "description": "test", "level": "Beginner", "published": True, "order": 99,
                "modules": [{"id": "m1", "title": "M1", "lessons": [{"id": "l-vq-m1", "title": "VQ", "content": CONTENT, "video_url": "https://www.youtube.com/embed/inWWhr5tnEA", "quiz": {"required": True, "questions": QS}}]}]}
        pid = a.post(f"{BASE}/api/manage/paths", json=body).json()["id"]
        try:
            s = fresh_student()
            assert s.post(f"{BASE}/api/paths/{pid}/lessons/l-vq-m1/quiz", json={"answers": RIGHT}).json()["passed"] is True
            vpost(s, "l-vq-m1", 50, [[0, 12]], pid)
            time.sleep(20)
            assert vpost(s, "l-vq-m1", 50, [[12, 50]], pid).json()["watched"] is True
            assert s.post(f"{BASE}/api/paths/{pid}/lessons/l-vq-m1/complete").status_code == 200
        finally:
            assert a.delete(f"{BASE}/api/manage/paths/{pid}").status_code == 200
