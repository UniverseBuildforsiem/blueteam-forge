# Iteration 41: Video resume position (POST position, GET video_resume rules)
import time
import pytest
from test_video_progress import BASE, YPID, YVID, fresh_student


def vpos(s, dur, segs, pos):
    return s.post(f"{BASE}/api/paths/{YPID}/lessons/{YVID}/video", json={"duration": dur, "segments": segs, "position": pos})


def resume(s):
    return s.get(f"{BASE}/api/paths/{YPID}").json()["video_resume"]


def dur_of(s):
    from pymongo import MongoClient  # noqa
    return None


class TestResume:
    def test_empty_by_default(self):
        assert resume(fresh_student()) == {}

    def test_position_empty_segments_stored(self):
        s = fresh_student()
        r = vpos(s, 600, [], 222)
        assert r.status_code == 200, r.text
        assert resume(s) == {YVID: 222}

    def test_position_update_overwrites(self):
        s = fresh_student()
        vpos(s, 600, [], 222)
        vpos(s, 600, [], 100.4)
        assert resume(s)[YVID] == 100.4

    def test_below_3s_absent(self):
        s = fresh_student()
        vpos(s, 600, [], 2.5)
        assert YVID not in resume(s)

    def test_exactly_3s_present(self):
        s = fresh_student()
        vpos(s, 600, [], 3)
        assert resume(s).get(YVID) == 3

    def test_start_over_zero_clears(self):
        s = fresh_student()
        vpos(s, 600, [], 222)
        vpos(s, 600, [], 0)
        assert YVID not in resume(s)

    def test_no_position_keeps_previous(self):
        s = fresh_student()
        vpos(s, 600, [], 222)
        s.post(f"{BASE}/api/paths/{YPID}/lessons/{YVID}/video", json={"duration": 600, "segments": [[0, 5]]})
        assert resume(s).get(YVID) == 222

    def test_near_end_absent(self):
        s = fresh_student()
        vpos(s, 600, [], 10)
        # server duration is max(client_max, ...) -> position clipped to dur; huge position => near end
        vpos(s, 600, [], 86400)
        assert YVID not in resume(s)

    def test_negative_and_too_large_422(self):
        s = fresh_student()
        assert vpos(s, 600, [], -1).status_code == 422
        assert vpos(s, 600, [], 90000).status_code == 422

    def test_watched_absent(self):
        import os
        from pathlib import Path
        from pymongo import MongoClient
        env = dict(l.split("=", 1) for l in Path("/app/backend/.env").read_text().splitlines() if "=" in l)
        mdb = MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]
        s = fresh_student()
        vpos(s, 600, [[0, 5]], 222)
        uid = s.get(f"{BASE}/api/auth/me").json()["id"]
        assert resume(s).get(YVID) == 222
        mdb.video_progress.update_one({"user_id": uid, "lesson_id": YVID}, {"$set": {"watched": True, "percent": 100}})
        g = s.get(f"{BASE}/api/paths/{YPID}").json()
        assert YVID in g["watched_lessons"]
        assert YVID not in g["video_resume"]
        # position updates after watched still never resume
        vpos(s, 600, [], 300)
        assert YVID not in resume(s)

    def test_other_user_isolated(self):
        a, b = fresh_student(), fresh_student()
        vpos(a, 600, [], 222)
        assert resume(b) == {}
