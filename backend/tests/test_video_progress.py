# Iterations 39-42: Video progress tracking (90% gate, median-of-reports duration, rate budget, availability check)
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
YPID, YVID = "soc-l1", "l1-l1"                 # tracked YouTube inWWhr5tnEA
SPID, SVID = "soc-fundamentals", "sf-l1"       # private youtube -> unavailable
VPID, VVID = "2e9692fd641c", "l-n6a2pyw"       # Vimeo raw embed, real duration 2550
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


def vpost(s, lid, dur, segs, pid=YPID):
    return s.post(f"{BASE}/api/paths/{pid}/lessons/{lid}/video", json={"duration": dur, "segments": segs})


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": "admin@socprofessionals.academy", "password": "Admin@123"})
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return s


# ---- availability / path fields ----
class TestAvailability:
    def test_tracked_path_fields(self):
        g = fresh_student().get(f"{BASE}/api/paths/{YPID}").json()
        assert YVID in g["video_lessons"] and g["unavailable_videos"] == []
        assert g["watched_lessons"] == [] and g["video_percent"] == {}

    def test_private_video_unavailable_and_completable(self):
        s = fresh_student()
        g = s.get(f"{BASE}/api/paths/{SPID}").json()
        assert SVID in g["unavailable_videos"] and SVID not in g["video_lessons"]
        assert vpost(s, SVID, 60, [[0, 10]], SPID).status_code == 400
        assert s.post(f"{BASE}/api/paths/{SPID}/lessons/{SVID}/complete").status_code == 200
        assert xp(s) == 10

    def test_vimeo_embed_tracked(self):
        s = fresh_student()
        r = s.get(f"{BASE}/api/paths/{VPID}")
        if r.status_code != 200:
            pytest.skip("vimeo path not published")
        assert VVID in r.json()["video_lessons"]

    def test_non_video_lesson_400(self):
        s = fresh_student()
        g = s.get(f"{BASE}/api/paths/{YPID}").json()
        other = next(l["id"] for m in g["modules"] for l in m["lessons"] if l["id"] not in g["video_lessons"] and not l.get("quiz"))
        assert vpost(s, other, 60, [[0, 10]]).status_code == 400
        assert s.post(f"{BASE}/api/paths/{YPID}/lessons/{other}/complete").status_code == 200


# ---- duration rules ----
class TestDuration:
    def test_tiny_duration_floored(self):
        s = fresh_student()
        d = vpost(s, YVID, 1, [[0, 1]]).json()
        assert d["watched"] is False and d["percent"] <= 4, d

    def test_duration_30_first_report(self):
        """YouTube floor is 30s and first-report grace is 30s: duration=30 + [[0,30]] should NOT complete."""
        s = fresh_student()
        d = vpost(s, YVID, 30, [[0, 30]]).json()
        assert d["watched"] is False, f"duration-30 first-report bypass: {d}"

    def test_duration_cannot_be_lowered(self):
        s = fresh_student()
        vpost(s, YVID, 600, [[0, 10]])
        time.sleep(3)
        d = vpost(s, YVID, 31, [[10, 15]]).json()
        assert d["percent"] == round(100 * 15 / 600), d

    def test_vimeo_real_duration(self):
        s = fresh_student()
        if s.get(f"{BASE}/api/paths/{VPID}").status_code != 200:
            pytest.skip("vimeo path not published")
        d = vpost(s, VVID, 10, [[0, 10]], VPID).json()
        assert d["watched"] is False and d["percent"] == 0, d


# ---- rate budget ----
class TestBudget:
    def test_skip_clipped(self):
        s = fresh_student()
        d = vpost(s, YVID, 600, [[0, 600]]).json()  # first report budget 12s; denominator = median of per-user reports
        assert d["percent"] <= 40 and d["watched"] is False, d

    def test_rapid_chunks_blocked(self):
        s = fresh_student()
        for a in (0, 30, 60):
            d = vpost(s, YVID, 100, [[a, a + 30]]).json()
        assert d["watched"] is False and d["percent"] < 50, d

    def test_spaced_reports_watch_then_complete(self):
        s = fresh_student()
        # full watch->complete with a known denominator lives in test_video_median.py (needs isolated video_meta.reports)
        d = vpost(s, YVID, 600, [[0, 25]]).json()
        assert 0 < d["percent"] < 90 and d["watched"] is False
        r = s.post(f"{BASE}/api/paths/{YPID}/lessons/{YVID}/complete")
        assert r.status_code == 400 and "Watch at least 90%" in r.json()["detail"]
        g = s.get(f"{BASE}/api/paths/{YPID}").json()
        assert g["video_percent"][YVID] == d["percent"] and YVID not in g["watched_lessons"]
        assert xp(s) == 0

    def test_bad_payload_422(self):
        assert vpost(fresh_student(), YVID, 0, [[0, 1]]).status_code == 422


# ---- admin-created paths: raw iframe embed parsing + quiz/video gate ----
class TestAdminPaths:
    pids = []

    def _mk(self, admin, lessons):
        body = {"title": "TEST_Video Path", "description": "test", "level": "Beginner", "published": True, "order": 99,
                "modules": [{"id": "m1", "title": "M1", "lessons": lessons}]}
        r = admin.post(f"{BASE}/api/manage/paths", json=body)
        assert r.status_code == 200, r.text
        TestAdminPaths.pids.append(r.json()["id"])
        return r.json()["id"]

    def test_raw_embed_parsed(self, admin):
        embed = '<iframe width="560" height="315" src="https://www.youtube.com/embed/inWWhr5tnEA?si=abc&amp;start=0" frameborder="0"></iframe>'
        pid = self._mk(admin, [{"id": "l-emb", "title": "Emb", "content": CONTENT, "video_url": embed},
                               {"id": "l-priv", "title": "Priv", "content": CONTENT, "video_url": "https://www.youtube.com/watch?v=2PNZENU07HQ"}])
        g = fresh_student().get(f"{BASE}/api/paths/{pid}").json()
        assert g["video_lessons"] == ["l-emb"] and g["unavailable_videos"] == ["l-priv"]

    def test_quiz_video_flow(self, admin):
        pid = self._mk(admin, [{"id": "l-vq-t1", "title": "VQ", "content": CONTENT, "video_url": "https://www.youtube.com/embed/inWWhr5tnEA", "quiz": {"required": True, "questions": QS}}])
        s = fresh_student()
        d = s.post(f"{BASE}/api/paths/{pid}/lessons/l-vq-t1/quiz", json={"answers": RIGHT}).json()
        assert d["passed"] is True and d["completed"] is False and d["xp"] == 0
        r = s.post(f"{BASE}/api/paths/{pid}/lessons/l-vq-t1/complete")
        assert r.status_code == 400 and "Watch" in r.json()["detail"]
        assert vpost(s, "l-vq-t1", 600, [[0, 25]], pid).json()["watched"] is False
        assert s.post(f"{BASE}/api/paths/{pid}/lessons/l-vq-t1/complete").status_code == 400
        assert xp(s) == 0  # full quiz+video completion covered in test_video_median.py

    def test_cleanup(self, admin):
        for pid in TestAdminPaths.pids:
            assert admin.delete(f"{BASE}/api/manage/paths/{pid}").status_code == 200
