# Iteration 12: level-up reveal, badge share cards, rank on leaderboards
import os
import io
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
STUDENT = {"email": "student@socprofessionals.academy", "password": "Student@123"}
ADMIN = {"email": "admin@socprofessionals.academy", "password": "Admin@123"}
RANKS = {"Recruit", "Analyst", "Hunter", "Elite"}


def login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def student():
    return login(STUDENT)


# Level-up: dashboard level_up + seen endpoint
class TestLevelUp:
    def test_dashboard_level_up_shape(self, student):
        r = student.get(f"{BASE_URL}/api/dashboard")
        assert r.status_code == 200
        lu = r.json().get("level_up")
        assert "level_up" in r.json()
        if lu:
            assert lu["level"] in ("Hunter", "Elite")
            assert set(lu) == {"level", "badge_id", "badge_name", "description"}
            print("level_up pending:", lu)

    def test_seen_invalid_level(self, student):
        for lvl in ("Recruit", "Analyst", "foo", "hunter"):
            r = student.post(f"{BASE_URL}/api/me/level-up/{lvl}/seen")
            assert r.status_code == 400, lvl

    def test_seen_requires_auth(self):
        r = requests.post(f"{BASE_URL}/api/me/level-up/Hunter/seen")
        assert r.status_code == 401

    def test_seen_clears_pending(self, student):
        lu = student.get(f"{BASE_URL}/api/dashboard").json().get("level_up")
        if not lu:
            pytest.skip("no pending level-up")
        r = student.post(f"{BASE_URL}/api/me/level-up/{lu['level']}/seen")
        assert r.status_code == 200 and r.json() == {"ok": True}
        lu2 = student.get(f"{BASE_URL}/api/dashboard").json().get("level_up")
        assert not lu2 or lu2["level"] != lu["level"]
        # idempotent
        assert student.post(f"{BASE_URL}/api/me/level-up/{lu['level']}/seen").status_code == 200


# Badge share cards
class TestBadgeShareCards:
    def test_earned_badge_card(self, student):
        badges = student.get(f"{BASE_URL}/api/dashboard").json()["badges"]
        earned = [b for b in badges if b["earned"] and b.get("kind") != "course"]
        assert earned, "no earned std badge"
        for b in earned:
            r = student.post(f"{BASE_URL}/api/me/badges/{b['id']}/share-card")
            assert r.status_code == 200, b
            d = r.json()
            assert d["image_url"] == d["share_url"] + ".png"
            assert f"/api/public/badge/" in d["share_url"] and d["share_url"].endswith(b["id"])
            img = requests.get(d["image_url"])
            assert img.status_code == 200 and img.headers["content-type"] == "image/png"
            im = Image.open(io.BytesIO(img.content))
            assert im.size == (1200, 627)
            page = requests.get(d["share_url"], allow_redirects=False)
            assert page.status_code == 200
            assert 'og:image' in page.text and d["image_url"] in page.text
            assert "/u/" in page.text and "http-equiv=\"refresh\"" in page.text
            assert b["name"] in page.text

    def test_unearned_and_unknown_404(self, student):
        badges = student.get(f"{BASE_URL}/api/dashboard").json()["badges"]
        unearned = [b["id"] for b in badges if not b["earned"]]
        for bid in unearned + ["nonexistent"]:
            r = student.post(f"{BASE_URL}/api/me/badges/{bid}/share-card")
            assert r.status_code == 404, bid

    def test_course_id_via_std_badge_404(self, student):
        badges = student.get(f"{BASE_URL}/api/dashboard").json()["badges"]
        course = [b for b in badges if b.get("kind") == "course"]
        if not course:
            pytest.skip("no course badges")
        r = student.post(f"{BASE_URL}/api/me/badges/{course[0]['id']}/share-card")
        assert r.status_code == 404

    def test_public_png_unearned_and_bad_token(self, student):
        badges = student.get(f"{BASE_URL}/api/dashboard").json()["badges"]
        earned = next(b for b in badges if b["earned"] and b.get("kind") != "course")
        d = student.post(f"{BASE_URL}/api/me/badges/{earned['id']}/share-card").json()
        token = d["share_url"].split("/public/badge/")[1].split("/")[0]
        unearned = next((b["id"] for b in badges if not b["earned"]), None)
        if unearned:
            assert requests.get(f"{BASE_URL}/api/public/badge/{token}/{unearned}.png").status_code == 404
        assert requests.get(f"{BASE_URL}/api/public/badge/badtoken/{earned['id']}.png").status_code == 404
        assert requests.get(f"{BASE_URL}/api/public/badge/{token}/bogus").status_code == 404

    def test_course_badge_card_regression(self, student):
        badges = student.get(f"{BASE_URL}/api/dashboard").json()["badges"]
        course = [b for b in badges if b.get("kind") == "course"]
        if not course:
            pytest.skip("no course badges")
        cid = int(course[0]["id"].split("-", 1)[1])
        r = student.post(f"{BASE_URL}/api/me/courses/{cid}/share-card")
        assert r.status_code == 200
        img = requests.get(r.json()["image_url"])
        assert img.status_code == 200
        assert Image.open(io.BytesIO(img.content)).size == (1200, 627)
        assert requests.get(r.json()["share_url"]).status_code == 200


# Rank fields on leaderboards and talent
class TestRanks:
    def test_dashboard_leaderboard_rank(self, student):
        r = student.get(f"{BASE_URL}/api/leaderboard")
        assert r.status_code == 200
        assert all(u["rank"] in RANKS for u in r.json())

    def test_ctf_scoreboard_rank(self, student):
        r = student.get(f"{BASE_URL}/api/ctf/scoreboard")
        assert r.status_code == 200
        rows = r.json()
        print("ctf rows", len(rows))
        assert all(row["rank"] in RANKS and "username" in row for row in rows)

    def test_drill_leaderboard_rank(self, student):
        r = student.get(f"{BASE_URL}/api/drill/leaderboard")
        assert r.status_code == 200
        rows = r.json() if isinstance(r.json(), list) else r.json().get("rows", r.json().get("leaderboard", []))
        print("drill rows", len(rows))
        assert all(row["rank"] in RANKS for row in rows)

    def test_talent_and_profile_rank(self):
        r = requests.get(f"{BASE_URL}/api/public/talent")
        assert r.status_code == 200
        for row in r.json()["results"]:
            assert row["rank"] in RANKS
            xp = row["xp"]
            exp = "Recruit" if xp < 500 else "Analyst" if xp < 1500 else "Hunter" if xp < 3000 else "Elite"
            assert row["rank"] == exp, row

    def test_level_images_served(self):
        for f in ("level-recruit.jpg", "level-analyst.jpg", "level-hunter.png", "level-elite.jpg", "lab-rat.jpg", "course.jpg"):
            r = requests.get(f"{BASE_URL}/badges/{f}")
            assert r.status_code == 200 and r.headers["content-type"].startswith("image/"), f
