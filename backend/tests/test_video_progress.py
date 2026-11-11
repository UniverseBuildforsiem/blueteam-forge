# Iteration 39: Video progress tracking (90% watched gate, anti-skip, path progress fields)
import os
import time
import uuid
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
PID = "soc-fundamentals"
VID = "sf-l1"
CONTENT = "Phishing triage starts with the headers. Check SPF, DKIM and DMARC results and the sending IP reputation. " * 2
QS = [{"id": f"q{i}", "text": f"Question {i}?", "options": ["a", "b", "c", "d"], "answer": i % 4, "explanation": "x"} for i in range(5)]
RIGHT = [i % 4 for i in range(5)]


def fresh_student():
    s = requests.Session()
    tag = uuid.uuid4().hex[:8]
    r = s.post(f"{BASE}/api/auth/register", json={"name": "TEST_Vid", "email": f"test_vid_{tag}@example.com", "username": f"tvid{tag}", "password": "TestPass@123"})
    assert r.status_code == 200, r.text
    return s


def xp(s):
    return s.get(f"{BASE}/api/auth/me").json().get("xp", 0)


def vpost(s, lid, dur, segs, pid=PID):
    return s.post(f"{BASE}/api/paths/{pid}/lessons/{lid}/video", json={"duration": dur, "segments": segs})


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": "admin@socprofessionals.academy", "password": "Admin@123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return s


# ---- path fields ----
class TestPathFields:
    def test_get_path_fields(self):
        s = fresh_student()
        g = s.get(f"{BASE}/api/paths/{PID}").json()
        assert g["video_lessons"] == [VID]
        assert g["watched_lessons"] == []
        assert g["video_percent"] == {}
        assert g["quiz_passed_lessons"] == []


# ---- progress + anti-skip ----
class TestProgress:
    def test_skip_ignored(self):
        s = fresh_student()
        d = vpost(s, VID, 100, [[0, 100]]).json()
        assert d["percent"] == 0 and d["watched"] is False

    def test_merge_and_watch(self):
        s = fresh_student()
        d = vpost(s, VID, 60, [[0, 10], [5, 25]]).json()
        assert d["percent"] == round(100 * 25 / 60) and d["watched"] is False
        # overlapping replays don't add coverage
        d = vpost(s, VID, 60, [[0, 25]]).json()
        assert d["percent"] == 42
        r = s.post(f"{BASE}/api/paths/{PID}/lessons/{VID}/complete")
        assert r.status_code == 400 and "Watch at least 90%" in r.json()["detail"]
        time.sleep(12)
        d = vpost(s, VID, 60, [[25, 60]]).json()
        assert d["percent"] == 100 and d["watched"] is True and d["newly"] is True
        g = s.get(f"{BASE}/api/paths/{PID}").json()
        assert g["watched_lessons"] == [VID] and g["video_percent"][VID] == 100
        before = xp(s)
        assert before == 0  # NO XP for video
        assert s.post(f"{BASE}/api/paths/{PID}/lessons/{VID}/complete").status_code == 200
        assert xp(s) == 10
        assert VID in s.get(f"{BASE}/api/paths/{PID}").json()["completed_lessons"]

    def test_non_video_lesson_400(self):
        s = fresh_student()
        g = s.get(f"{BASE}/api/paths/{PID}").json()
        other = next(l["id"] for m in g["modules"] for l in m["lessons"] if l["id"] != VID)
        r = vpost(s, other, 60, [[0, 10]])
        assert r.status_code == 400
        assert s.post(f"{BASE}/api/paths/{PID}/lessons/{other}/complete").status_code == 200

    def test_bad_payload_422(self):
        s = fresh_student()
        assert vpost(s, VID, 0, [[0, 1]]).status_code == 422

    # --- known weaknesses (expected to FAIL if exploit works) ---
    def test_duration_spoof_bypass(self):
        """Client sets duration on first report; tiny duration => instant watched."""
        s = fresh_student()
        d = vpost(s, VID, 1, [[0, 1]]).json()
        assert d["watched"] is False, f"duration spoof bypass: {d}"

    def test_rapid_chunks_bypass(self):
        """Each request gets a free 30s allowance; 3 back-to-back 30s chunks on 100s video."""
        s = fresh_student()
        for a in (0, 30, 60):
            d = vpost(s, VID, 100, [[a, a + 30]]).json()
        assert d["watched"] is False, f"rapid chunk bypass: {d}"


# ---- quiz + video ----
class TestQuizVideo:
    pid = None

    def test_flow(self, admin):
        body = {"title": "TEST_VideoQuiz Path", "description": "test", "level": "Beginner", "published": True, "order": 99,
                "modules": [{"id": "m1", "title": "M1", "lessons": [
                    {"id": "l-vq-t1", "title": "VQ", "content": CONTENT, "video_url": "https://www.youtube.com/embed/inWWhr5tnEA", "quiz": {"required": True, "questions": QS}},
                    {"id": "l-vq-plain", "title": "Plain", "content": CONTENT}]}]}
        r = admin.post(f"{BASE}/api/manage/paths", json=body)
        assert r.status_code == 200, r.text
        pid = TestQuizVideo.pid = r.json()["id"]
        s = fresh_student()
        d = s.post(f"{BASE}/api/paths/{pid}/lessons/l-vq-t1/quiz", json={"answers": RIGHT}).json()
        assert d["passed"] is True and d["completed"] is False and d["xp"] == 0
        g = s.get(f"{BASE}/api/paths/{pid}").json()
        assert "l-vq-t1" in g["quiz_passed_lessons"] and "l-vq-t1" not in g["completed_lessons"]
        r = s.post(f"{BASE}/api/paths/{pid}/lessons/l-vq-t1/complete")
        assert r.status_code == 400 and "Watch" in r.json()["detail"]
        vpost(s, "l-vq-t1", 50, [[0, 25]], pid)
        time.sleep(8)
        d = vpost(s, "l-vq-t1", 50, [[25, 50]], pid).json()
        assert d["watched"] is True
        assert s.post(f"{BASE}/api/paths/{pid}/lessons/l-vq-t1/complete").status_code == 200
        assert xp(s) == 10

    def test_cleanup(self, admin):
        if TestQuizVideo.pid:
            assert admin.delete(f"{BASE}/api/manage/paths/{TestQuizVideo.pid}").status_code == 200
