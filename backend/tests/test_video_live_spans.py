# Iteration 58: video POST returns spans+duration; course/path views expose video_spans / video_duration
import os
import time
import pytest
import requests
from pathlib import Path
from pymongo import MongoClient


def _base():
    u = os.environ.get("REACT_APP_BACKEND_URL")
    if not u:
        for line in Path("/app/frontend/.env").read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                u = line.split("=", 1)[1].strip()
    return u.rstrip("/")


def _env(k):
    for line in Path("/app/backend/.env").read_text().splitlines():
        if line.startswith(k + "="):
            return line.split("=", 1)[1].strip().strip('"')


BASE = _base()
CID, LID = "384eef11de47", "l-3zyafu0"
db = MongoClient(_env("MONGO_URL"))[_env("DB_NAME")]


@pytest.fixture(scope="module")
def student():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": "student@socprofessionals.academy", "password": "Student@123"})
    if r.status_code != 200:
        pytest.skip("student login failed")
    uid = s.get(f"{BASE}/api/auth/me").json()["id"]
    db.video_progress.delete_many({"user_id": uid, "path_id": CID, "lesson_id": LID})
    s.uid = uid
    pre = db.course_enrollments.find_one({"user_id": uid, "course_id": CID})
    assert s.post(f"{BASE}/api/academy/courses/{CID}/enroll").status_code == 200
    yield s
    db.video_progress.delete_many({"user_id": uid, "path_id": CID, "lesson_id": LID})
    if not pre:
        db.course_enrollments.delete_one({"user_id": uid, "course_id": CID})


class TestVideoSpans:
    def test_flow(self, student):
        c = student.get(f"{BASE}/api/academy/courses/{CID}")
        assert c.status_code == 200, c.text
        d = c.json()
        assert LID in d.get("video_lessons", []), d.get("video_lessons")
        assert "video_spans" in d and "video_duration" in d
        r = student.post(f"{BASE}/api/paths/{CID}/lessons/{LID}/video", json={"duration": 421, "segments": [[0, 10]], "position": 10})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["duration"] == 421 and j["spans"] == [[0, 10]] and j["percent"] == round(1000 / 421)
        time.sleep(5.5)
        r = student.post(f"{BASE}/api/paths/{CID}/lessons/{LID}/video", json={"duration": 421, "segments": [[10, 20]], "position": 20})
        j = r.json()
        assert j["spans"] == [[0, 20]] and j["percent"] == round(2000 / 421), j
        # far-ahead skip is clipped by budget (2.2x elapsed + 5)
        r = student.post(f"{BASE}/api/paths/{CID}/lessons/{LID}/video", json={"duration": 421, "segments": [[300, 400]]})
        j = r.json()
        extra = sum(b - a for a, b in j["spans"]) - 20
        assert extra < 10, j
        d = student.get(f"{BASE}/api/academy/courses/{CID}").json()
        assert d["video_duration"][LID] == 421
        assert d["video_spans"][LID] == j["spans"]
        assert d["video_percent"][LID] == j["percent"]

    def test_unauth(self):
        r = requests.post(f"{BASE}/api/paths/{CID}/lessons/{LID}/video", json={"duration": 421, "segments": [[0, 5]]})
        assert r.status_code == 401

    def test_validation(self, student):
        r = student.post(f"{BASE}/api/paths/{CID}/lessons/{LID}/video", json={"duration": 0, "segments": []})
        assert r.status_code == 422

