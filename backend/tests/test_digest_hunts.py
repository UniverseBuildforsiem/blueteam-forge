# Iteration 19: Weekly Threat Digest (preview, cron, admin test, unsubscribe, prefs) + Hunt-from-news (blog/SOP hunt queries in SIEM)
import hashlib
import hmac
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
import pytest
import requests

sys.path.insert(0, "/app/backend")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ENV = {}
for line in open("/app/backend/.env"):
    if "=" in line:
        k, v = line.split("=", 1)
        ENV[k.strip()] = v.strip().strip('"')
CRON = ENV["WEBHOOK_CRON_SECRET"]
JWT = ENV["JWT_SECRET"]
SEV = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
CATS = ["Ransomware", "Vulnerability", "Phishing", "Malware", "Data Breach", "APT", "Cloud", "Supply Chain", "AI Security", "Other"]


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


def tok(uid):
    return hmac.new(JWT.encode(), f"digest-unsub:{uid}".encode(), hashlib.sha256).hexdigest()[:32]


def ts(s):
    return datetime.fromisoformat(s).astimezone(timezone.utc)


# ---------- Digest preview ----------
class TestDigestPreview:
    def test_preview_sorted(self):
        r = requests.get(f"{API}/public/blog-digest/preview")
        assert r.status_code == 200
        posts = r.json()["posts"]
        assert 0 < len(posts) <= 5
        ranks = [SEV[p["severity"]] for p in posts]
        assert ranks == sorted(ranks), ranks
        for p in posts:
            assert set(p) >= {"title", "slug", "severity", "category", "source", "soc_actions"}

    def test_preview_matches_true_order(self):
        # compute expected from full list using real UTC timestamps
        allp = requests.get(f"{API}/public/blog", params={"limit": 200}).json()["posts"]
        since = datetime.now(timezone.utc) - timedelta(days=7)
        recent = [p for p in allp if ts(p["published_at"]) >= since]
        recent.sort(key=lambda p: ts(p["published_at"]), reverse=True)
        recent.sort(key=lambda p: SEV.get(p["severity"], 4))
        exp = [p["slug"] for p in recent[:5]]
        got = [p["slug"] for p in requests.get(f"{API}/public/blog-digest/preview").json()["posts"]]
        assert got == exp, f"\ngot={got}\nexp={exp}"


# ---------- Cron ----------
class TestCron:
    def test_no_auth(self):
        assert requests.post(f"{API}/cron/weekly-digest", json={}).status_code == 401

    def test_bad_auth(self):
        assert requests.post(f"{API}/cron/weekly-digest", json={}, headers={"Authorization": "Bearer nope"}).status_code == 401

    def test_ok_and_duplicate(self):
        wid = f"TEST_{uuid.uuid4().hex}"
        h = {"Authorization": f"Bearer {CRON}", "X-Webhook-Id": wid}
        r = requests.post(f"{API}/cron/weekly-digest", json={}, headers=h)
        assert r.status_code == 200 and r.json() == {"ok": True}
        r2 = requests.post(f"{API}/cron/weekly-digest", json={}, headers=h)
        assert r2.status_code == 200 and r2.json().get("duplicate") is True


# ---------- Admin test send ----------
class TestAdminDigest:
    def test_student_forbidden(self, student):
        assert student.post(f"{API}/admin/blog/digest-test").status_code == 403

    def test_anon(self):
        assert requests.post(f"{API}/admin/blog/digest-test").status_code in (401, 403)

    def test_admin_sent(self, admin):
        r = admin.post(f"{API}/admin/blog/digest-test")
        assert r.status_code == 200 and r.json() == {"sent": 1}


# ---------- Prefs + unsubscribe ----------
class TestPrefsUnsub:
    def test_prefs_get(self, student):
        d = student.get(f"{API}/me/preferences").json()
        assert set(d) == {"streak_emails", "course_emails", "digest_emails"}
        assert all(isinstance(v, bool) for v in d.values())

    def test_prefs_toggle(self, student):
        r = student.patch(f"{API}/me/preferences", json={"digest_emails": False})
        assert r.status_code == 200 and r.json()["digest_emails"] is False
        assert student.get(f"{API}/me/preferences").json()["digest_emails"] is False
        r = student.patch(f"{API}/me/preferences", json={"digest_emails": True})
        assert r.json()["digest_emails"] is True
        assert student.get(f"{API}/me/preferences").json()["digest_emails"] is True

    def test_prefs_anon(self):
        assert requests.get(f"{API}/me/preferences").status_code == 401

    def test_unsub_bad(self, student):
        uid = student.get(f"{API}/auth/me").json()["id"]
        r = requests.get(f"{API}/public/unsubscribe/digest", params={"u": uid, "t": "0" * 32})
        assert r.status_code == 400
        assert requests.get(f"{API}/public/unsubscribe/digest").status_code == 400
        assert student.get(f"{API}/me/preferences").json()["digest_emails"] is True

    def test_unsub_good_then_restore(self, student):
        uid = student.get(f"{API}/auth/me").json()["id"]
        r = requests.get(f"{API}/public/unsubscribe/digest", params={"u": uid, "t": tok(uid)})
        assert r.status_code == 200 and "unsubscribed" in r.text
        assert student.get(f"{API}/me/preferences").json()["digest_emails"] is False
        student.patch(f"{API}/me/preferences", json={"digest_emails": True})
        assert student.get(f"{API}/me/preferences").json()["digest_emails"] is True


# ---------- Hunts ----------
class TestHunts:
    def test_blog_post_hunt_all_posts(self, student):
        posts = requests.get(f"{API}/public/blog", params={"limit": 200}).json()["posts"]
        assert posts
        fails = []
        for p in posts:
            d = requests.get(f"{API}/public/blog/{p['slug']}").json()
            h = d["hunt"]
            assert h["title"] and h["spl"] and h["kql"]
            for lang in ("spl", "kql"):
                r = student.get(f"{API}/siem/search", params={"q": h[lang], "lang": lang})
                if r.status_code != 200 or r.json().get("total", 0) <= 0:
                    fails.append((p["category"], lang, r.status_code, r.text[:150]))
        assert not fails, fails

    def test_all_category_hunts(self, student):
        from routes_blog import HUNTS  # noqa
        fails = []
        for cat in CATS:
            spl, kql, _t = HUNTS[cat]
            for lang, q in (("spl", spl), ("kql", kql)):
                r = student.get(f"{API}/siem/search", params={"q": q, "lang": lang})
                if r.status_code != 200 or r.json().get("total", 0) <= 0:
                    fails.append((cat, lang, r.status_code, r.text[:150]))
        assert not fails, fails

    def test_sop_phishing_hunts(self):
        d = requests.get(f"{API}/public/sops/sop-phishing").json()
        assert d["queries"]
        for q in d["queries"]:
            assert q["hunt"]["spl"] and q["hunt"]["kql"]

    def test_all_sop_hunts_return_hits(self, admin):
        sops = requests.get(f"{API}/public/sops").json()
        sops = sops.get("sops", sops) if isinstance(sops, dict) else sops
        assert len(sops) == 12, len(sops)
        fails, n = [], 0
        for s in sops:
            r = admin.get(f"{API}/public/sops/{s['id']}")
            d = r.json()
            assert len(d["queries"]) == 3, s["id"]
            for i, q in enumerate(d["queries"]):
                for lang in ("spl", "kql"):
                    n += 1
                    rr = admin.get(f"{API}/siem/search", params={"q": q["hunt"][lang], "lang": lang})
                    if rr.status_code != 200 or rr.json().get("total", 0) <= 0:
                        fails.append((s["id"], i, lang, rr.status_code, rr.text[:150]))
        assert n == 72
        assert not fails, fails

    def test_siem_default_regression(self, student):
        r = student.get(f"{API}/siem/search", params={"q": "", "lang": "spl"})
        assert r.status_code == 200 and r.json().get("total", 0) > 0
