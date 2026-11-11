# Path Builder video field: /api/builder/video-check (staff only) + video_url persistence on paths
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")


def _login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    return s


@pytest.fixture(scope="module")
def admin():
    return _login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def instructor():
    return _login("instructor@socprofessionals.academy", "Instructor@123")


@pytest.fixture(scope="module")
def student():
    return _login("student@socprofessionals.academy", "Student@123")


def chk(s, url):
    return s.get(f"{BASE_URL}/api/builder/video-check", params={"url": url}, timeout=30)


class TestVideoCheck:
    def test_vimeo_ok(self, admin):
        r = chk(admin, "https://vimeo.com/76979871")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True and isinstance(d.get("title"), str) and d["title"]

    def test_youtube_ok(self, admin):
        r = chk(admin, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_instructor_allowed(self, instructor):
        r = chk(instructor, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        assert r.status_code == 200 and r.json()["ok"] is True

    def test_vimeo_missing(self, admin):
        r = chk(admin, "https://vimeo.com/1")
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is False and "can't find" in d["reason"]

    def test_youtube_bad_id(self, admin):
        r = chk(admin, "https://www.youtube.com/watch?v=aaaaaaaaaaa")
        assert r.status_code == 200
        assert r.json()["ok"] is False

    @pytest.mark.parametrize("u", ["https://example.com/v.mp4", "https://youtu.be/dQw4w9WgXcQ", "javascript:alert(1)", "https://evil.vimeo.com.attacker.io/1"])
    def test_non_supported_400(self, admin, u):
        assert chk(admin, u).status_code == 400

    def test_student_403(self, student):
        assert chk(student, "https://vimeo.com/76979871").status_code == 403

    def test_anon_401(self):
        r = requests.get(f"{BASE_URL}/api/builder/video-check", params={"url": "https://vimeo.com/76979871"}, timeout=20)
        assert r.status_code in (401, 403)


class TestPathVideoPersist:
    def test_create_get_delete_path_with_embed(self, admin):
        pid = "TEST_video_path_it38"
        admin.delete(f"{BASE_URL}/api/manage/paths/{pid}", timeout=20)
        doc = {"id": pid, "title": "TEST_ Video Path", "level": "beginner", "description": "t", "published": False,
               "modules": [{"title": "M1", "lessons": [{"id": "l-t1", "title": "TEST lesson", "content": "x", "minutes": 5,
                                                        "video_url": "https://player.vimeo.com/video/76979871?h=8272103f6e", "resources": [], "attachments": []}]}]}
        r = admin.post(f"{BASE_URL}/api/manage/paths", json=doc, timeout=20)
        try:
            assert r.status_code == 200, r.text
            lst = admin.get(f"{BASE_URL}/api/manage/paths", timeout=20).json()
            p = next(x for x in lst if x["id"] == pid)
            assert p["modules"][0]["lessons"][0]["video_url"] == "https://player.vimeo.com/video/76979871?h=8272103f6e"
        finally:
            admin.delete(f"{BASE_URL}/api/manage/paths/{pid}", timeout=20)
