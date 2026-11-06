# SOCForge backend regression tests (auth, learn, practice, manage, admin, payments)
import os
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
MONGO = MongoClient("mongodb://localhost:27017")["test_database"]
RID = uuid.uuid4().hex[:6]


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="session", autouse=True)
def cleanup():
    """Teardown: remove TEST data created by this run"""
    yield
    ids = [u["id"] for u in MONGO.users.find({"email": {"$regex": f"_{RID}@example\\.com$"}})]
    for c in ["lesson_progress", "quiz_attempts", "activity", "rsvps", "ctf_solves", "ctf_hints", "challenge_submissions",
              "lab_progress", "cases", "saved_searches", "certificates", "password_reset_tokens"]:
        MONGO[c].delete_many({"user_id": {"$in": ids}})
    MONGO.users.delete_many({"id": {"$in": ids}})
    MONGO.login_attempts.delete_many({"identifier": {"$regex": f"_{RID}@example"}})


@pytest.fixture(scope="session")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="session")
def instructor():
    return login("instructor@socprofessionals.academy", "Instructor@123")


@pytest.fixture(scope="session")
def student():
    return login("student@socprofessionals.academy", "Student@123")


@pytest.fixture(scope="session")
def newuser():
    s = requests.Session()
    email = f"test_{RID}@example.com"
    r = s.post(f"{API}/auth/register", json={"name": "TEST User", "email": email, "username": f"test_{RID}", "password": "Passw0rd!"})
    assert r.status_code == 200, r.text
    s.email = email
    s.uid = r.json()["id"]
    return s


# ---- Auth ----
class TestAuth:
    def test_root(self):
        assert requests.get(f"{API}/").json()["status"] == "ok"

    def test_login_cookies_httponly(self):
        r = requests.post(f"{API}/auth/login", json={"email": "student@socprofessionals.academy", "password": "Student@123"})
        assert r.status_code == 200
        sc = r.headers.get("set-cookie", "")
        assert "access_token" in sc and "HttpOnly" in sc
        assert "password_hash" not in r.json()

    def test_bcrypt_hash(self):
        u = MONGO.users.find_one({"email": "admin@socprofessionals.academy"})
        assert u["password_hash"].startswith("$2b$")

    def test_bearer_accepted(self):
        r = requests.post(f"{API}/auth/login", json={"email": "student@socprofessionals.academy", "password": "Student@123"})
        tok = r.cookies.get("access_token")
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
        assert me.status_code == 200 and me.json()["email"] == "student@socprofessionals.academy"

    def test_register_validation(self):
        r = requests.post(f"{API}/auth/register", json={"name": "X Y", "email": "bad-email", "username": "abc_x", "password": "Passw0rd!"})
        assert r.status_code == 400
        r = requests.post(f"{API}/auth/register", json={"name": "X Y", "email": "student@socprofessionals.academy", "username": f"u{RID}", "password": "Passw0rd!"})
        assert r.status_code == 400

    def test_register_onboarding(self, newuser):
        me = newuser.get(f"{API}/auth/me").json()
        assert me["onboarded"] is False and me["role"] == "student"
        r = newuser.post(f"{API}/auth/onboarding", json={"goal": "SOC L1"})
        assert r.status_code == 200 and r.json()["current_path"] == "soc-l1" and r.json()["onboarded"]

    def test_bruteforce_lockout(self):
        email = f"lock_{RID}@example.com"
        codes = [requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong"}).status_code for _ in range(6)]
        assert codes[:5] == [401] * 5 and codes[5] == 429

    def test_forgot_reset(self, newuser):
        r = requests.post(f"{API}/auth/forgot-password", json={"email": newuser.email})
        assert r.status_code == 200 and r.json()["ok"]
        rec = MONGO.password_reset_tokens.find_one({"user_id": newuser.uid}, sort=[("_id", -1)])
        assert rec
        r = requests.post(f"{API}/auth/reset-password", json={"token": rec["token"], "password": "NewPassw0rd!"})
        assert r.status_code == 200
        r2 = requests.post(f"{API}/auth/reset-password", json={"token": rec["token"], "password": "NewPassw0rd!"})
        assert r2.status_code == 400
        login(newuser.email, "NewPassw0rd!")

    def test_role_protection(self, student):
        assert student.get(f"{API}/admin/users").status_code == 403
        assert student.get(f"{API}/instructor/students").status_code == 403
        assert student.post(f"{API}/manage/quizzes", json={"title": "x"}).status_code == 403
        assert requests.get(f"{API}/paths").status_code == 401


# ---- Learning ----
class TestLearn:
    def test_public(self):
        p = requests.get(f"{API}/public/paths").json()
        assert len(p) >= 5 and "content" not in str(p[0].keys())

    def test_lesson_complete_xp(self, newuser):
        before = newuser.get(f"{API}/auth/me").json()["xp"]
        path = newuser.get(f"{API}/paths/soc-fundamentals").json()
        lids = [l["id"] for m in path["modules"] for l in m["lessons"]]
        r = newuser.post(f"{API}/paths/soc-fundamentals/lessons/{lids[0]}/complete")
        assert r.status_code == 200
        after = newuser.get(f"{API}/auth/me").json()["xp"]
        assert after == before + 10
        assert newuser.get(f"{API}/paths/soc-fundamentals").json()["percent"] > 0

    def test_quiz_check_and_submit(self, newuser):
        q = newuser.get(f"{API}/quizzes/quiz-winlogs").json()
        assert "answer" not in q["questions"][0]
        r = newuser.post(f"{API}/quizzes/quiz-winlogs/check", json={"question_id": "q1", "answer": [1]}).json()
        assert r["correct"] is True and r["explanation"]
        r = newuser.post(f"{API}/quizzes/quiz-winlogs/submit", json={"answers": {"q1": [1], "q2": [0], "q11": [1]}}).json()
        assert r["score"] == 67 and r["correct"] == 2

    def test_final_exam_certificate(self, newuser):
        path = newuser.get(f"{API}/paths/soc-fundamentals").json()
        for m in path["modules"]:
            for l in m["lessons"]:
                newuser.post(f"{API}/paths/soc-fundamentals/lessons/{l['id']}/complete")
        r = newuser.post(f"{API}/quizzes/final-soc-fundamentals/submit",
                         json={"answers": {"q1": [1], "q4": [0], "q7": [1], "q10": [1], "q6": [1]}}).json()
        assert r["passed"] and r["certificate"] and r["certificate"]["id"].startswith("SOCF-")
        cid = r["certificate"]["id"]
        v = requests.get(f"{API}/public/verify/{cid}")
        assert v.status_code == 200 and v.json()["status"] == "valid"
        pdf = requests.get(f"{API}/public/certificates/{cid}/pdf")
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"
        pytest.cert_id = cid

    def test_sessions_rsvp_toggle(self, newuser):
        ss = newuser.get(f"{API}/sessions").json()
        up = next(s for s in ss if not s["is_past"])
        assert newuser.post(f"{API}/sessions/{up['id']}/rsvp").json()["registered"] is True
        assert newuser.post(f"{API}/sessions/{up['id']}/rsvp").json()["registered"] is False
        assert newuser.post(f"{API}/sessions/{up['id']}/rsvp").json()["registered"] is True
        pytest.session_id = up["id"]

    def test_dashboard_analytics(self, newuser):
        d = newuser.get(f"{API}/dashboard").json()
        assert d["xp"] > 0 and len(d["badges"]) == 8 and d["leaderboard"]
        a = newuser.get(f"{API}/me/analytics").json()
        assert a["attempts"] >= 2


# ---- Practice ----
class TestPractice:
    def test_challenge_submit(self, newuser):
        cs = newuser.get(f"{API}/challenges").json()
        assert "verdict" not in cs[0] and "keywords" not in cs[0]
        r = newuser.post(f"{API}/challenges/ch-bf-01/submit", json={"verdict": "TP", "report": "4625 burst then 4624 successful from 45.155.205.12, reset password, enforce mfa"}).json()
        assert r["verdict_correct"] and r["auto_score"] == 100
        pytest.sub_id = r["id"]

    def test_ctf(self, newuser):
        board = newuser.get(f"{API}/ctf").json()
        assert "flag" not in board[0]
        assert newuser.post(f"{API}/ctf/ctf-log-1/submit", json={"flag": "nope"}).json()["correct"] is False
        h = newuser.post(f"{API}/ctf/ctf-net-2/hint/0")
        assert h.status_code == 200 and h.json()["text"]
        r = newuser.post(f"{API}/ctf/ctf-log-1/submit", json={"flag": "45.155.205.12"}).json()
        assert r["correct"] and r["points"] == 100
        sb = newuser.get(f"{API}/ctf/scoreboard").json()
        assert any(x["user_id"] == newuser.uid for x in sb)

    def test_ctf_hint_cost(self, newuser):
        board = {c["id"]: c for c in newuser.get(f"{API}/ctf").json()}
        cost = board["ctf-net-2"]["hints"][0]["cost"]
        r = newuser.post(f"{API}/ctf/ctf-net-2/submit", json={"flag": "3389"}).json()
        assert r["points"] == 100 - cost

    def test_lab(self, newuser):
        lab = newuser.get(f"{API}/labs/lab-phish-ransom").json()
        assert "answer" not in lab["tasks"][0]
        assert newuser.post(f"{API}/labs/lab-phish-ransom/report", json={"report": "x" * 30}).status_code == 400
        assert newuser.post(f"{API}/labs/lab-phish-ransom/tasks/t1", json={"answer": "1.1.1.1"}).json()["correct"] is False
        for t, a in [("t1", "91.243.44.10"), ("t2", "185.220.101.45"), ("t3", "cdn-update.top"), ("t4", "svch0st.exe"), ("t5", "password")]:
            assert newuser.post(f"{API}/labs/lab-phish-ransom/tasks/{t}", json={"answer": a}).json()["correct"], t
        assert newuser.post(f"{API}/labs/lab-phish-ransom/report", json={"report": "Full kill chain report from phishing to ransomware."}).status_code == 200

    def test_siem(self, newuser):
        r = newuser.get(f"{API}/siem/search", params={"q": "event_id=4625 | stats count by src_ip"}).json()
        assert r["total"] > 0 and r["stats"]["field"] == "src_ip" and r["stats"]["rows"]
        al = newuser.get(f"{API}/siem/alerts").json()
        assert any(a["triggered"] for a in al)
        s = newuser.post(f"{API}/siem/saved", json={"name": "TEST_s", "query": "vssadmin"}).json()
        assert any(x["id"] == s["id"] for x in newuser.get(f"{API}/siem/saved").json())
        newuser.delete(f"{API}/siem/saved/{s['id']}")
        assert newuser.get(f"{API}/siem/dashboard").json()["total"] > 0

    def test_siem_bad_query(self, newuser):
        r = newuser.get(f"{API}/siem/search", params={"q": 'user="unterminated'})
        assert r.status_code == 200

    def test_tools(self, newuser):
        assert newuser.get(f"{API}/tools/intel", params={"q": "185.220.101.45"}).json()["verdict"] == "malicious"
        assert newuser.get(f"{API}/tools/intel", params={"q": "hxxp://cdn-update[.]top/gate.php"}).json()["verdict"] == "malicious"
        raw = "From: billing@paypa1-invoices.com\nReturn-Path: <x@evil.ru>\nAuthentication-Results: spf=fail dkim=none dmarc=fail\nReceived: from [91.243.44.10]\nSubject: hi\n\n"
        h = newuser.post(f"{API}/tools/email-header", json={"raw": raw}).json()
        assert h["verdict"] == "suspicious" and len(h["findings"]) >= 3
        assert newuser.get(f"{API}/tools/sandbox").status_code == 200
        assert newuser.get(f"{API}/tools/feed").status_code == 200

    def test_cases(self, newuser):
        c = newuser.post(f"{API}/cases", json={"title": "TEST case", "severity": "High"}).json()
        u = newuser.patch(f"{API}/cases/{c['id']}", json={"status": "In Progress", "note": "triaging"}).json()
        assert u["status"] == "In Progress" and len(u["timeline"]) == 3
        e = newuser.patch(f"{API}/cases/{c['id']}", json={})
        assert e.status_code == 200


# ---- Instructor / Admin ----
class TestManage:
    def test_instructor_crud(self, instructor):
        qid = f"test-quiz-{RID}"
        r = instructor.post(f"{API}/manage/quizzes", json={"id": qid, "title": "TEST quiz", "topic": "T", "time_limit_sec": 0, "pass_mark": 70,
                                                           "questions": [{"id": "x1", "type": "tf", "text": "t?", "options": ["True", "False"], "answer": [0], "explanation": "e", "topic": "T"}]})
        assert r.status_code == 200
        assert any(q["id"] == qid for q in instructor.get(f"{API}/manage/quizzes").json())
        assert instructor.delete(f"{API}/manage/quizzes/{qid}").json()["ok"]
        assert instructor.get(f"{API}/manage/categories").status_code == 403

    def test_instructor_views(self, instructor):
        assert instructor.get(f"{API}/instructor/students").status_code == 200
        assert instructor.get(f"{API}/instructor/quiz-analytics").status_code == 200
        subs = instructor.get(f"{API}/instructor/submissions").json()
        assert "challenges" in subs
        sid = getattr(pytest, "sub_id", None)
        if sid:
            assert instructor.post(f"{API}/instructor/submissions/{sid}/grade", json={"grade": 90, "feedback": "good"}).status_code == 200
        ses = getattr(pytest, "session_id", None)
        if ses:
            att = instructor.get(f"{API}/instructor/sessions/{ses}/attendees").json()
            assert att
            assert instructor.post(f"{API}/instructor/sessions/{ses}/attendance", json={"user_id": att[0]["user_id"], "attended": True}).status_code == 200

    def test_admin_users(self, admin):
        s = requests.Session()
        r = s.post(f"{API}/auth/register", json={"name": "TEST Victim", "email": f"victim_{RID}@example.com", "username": f"victim_{RID}", "password": "Passw0rd!"})
        uid = r.json()["id"]
        assert admin.patch(f"{API}/admin/users/{uid}", json={"role": "instructor"}).status_code == 200
        assert admin.patch(f"{API}/admin/users/{uid}", json={"status": "suspended"}).status_code == 200
        assert s.get(f"{API}/auth/me").status_code == 403
        assert admin.patch(f"{API}/admin/users/{uid}", json={"status": "active"}).status_code == 200
        u = next(x for x in admin.get(f"{API}/admin/users").json() if x["id"] == uid)
        assert u["role"] == "instructor" and u["status"] == "active"

    def test_admin_user_empty_patch(self, admin):
        u = next(x for x in admin.get(f"{API}/admin/users").json() if x["email"].startswith("bot0"))
        r = admin.patch(f"{API}/admin/users/{u['id']}", json={})
        assert r.status_code in (200, 400), r.status_code

    def test_admin_cert_revoke(self, admin):
        cid = getattr(pytest, "cert_id", None)
        if not cid:
            pytest.skip("no cert")
        admin.patch(f"{API}/admin/certificates/{cid}", json={"status": "revoked"})
        assert requests.get(f"{API}/public/verify/{cid}").json()["status"] == "revoked"
        admin.patch(f"{API}/admin/certificates/{cid}", json={"status": "valid"})

    def test_admin_misc(self, admin):
        r = admin.post(f"{API}/manage/announcements", json={"title": "TEST ann", "body": "b", "active": True, "created_at": "2026-01-01"})
        assert r.status_code == 200
        admin.delete(f"{API}/manage/announcements/{r.json()['id']}")
        assert admin.get(f"{API}/admin/analytics").json()["total_users"] > 0
        s = admin.get(f"{API}/admin/settings").json()
        assert admin.put(f"{API}/admin/settings", json=s).status_code == 200
        logs = admin.get(f"{API}/admin/audit-logs").json()
        assert len(logs) > 0

    def test_payments_not_configured(self, student):
        cfg = requests.get(f"{API}/payments/config").json()
        assert cfg["razorpay"] is False and cfg["cashfree"] is False
        assert student.post(f"{API}/payments/razorpay/order", json={"plan": "pro_monthly"}).status_code == 503
        assert student.post(f"{API}/payments/cashfree/order", json={"plan": "pro_monthly"}).status_code == 503
