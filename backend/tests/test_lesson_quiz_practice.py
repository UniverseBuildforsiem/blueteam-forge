# Iteration 21: AI lesson quiz generator, lesson quiz validation on paths, new Networking/Linux practice content, L1 suggest coverage
import os
import time
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
CONTENT = ("Phishing triage starts with the headers. Check SPF, DKIM and DMARC results, the Return-Path versus From domain, and the sending IP reputation. "
           "Then inspect URLs without clicking: expand shorteners, check domain age, and detonate in a sandbox. Attachments such as macro-enabled invoices "
           "should be hashed and checked on VirusTotal. If a user clicked, reset their password, revoke sessions and search the mailbox for the same sender.")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def instructor():
    return login("instructor@socprofessionals.academy", "Instructor@123")


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


# ---- AI lesson quiz generation ----
class TestLessonQuizGen:
    def test_short_content_422(self, admin):
        r = admin.post(f"{BASE}/api/builder/lesson-quiz", json={"title": "x lesson", "content": "too short", "level": "Beginner"})
        assert r.status_code == 422

    def test_student_forbidden(self, student):
        r = student.post(f"{BASE}/api/builder/lesson-quiz", json={"title": "Phishing", "content": CONTENT, "level": "Beginner"})
        assert r.status_code == 403

    def test_instructor_can_start(self, instructor):
        r = instructor.post(f"{BASE}/api/builder/lesson-quiz", json={"title": "Phishing triage", "content": CONTENT})
        assert r.status_code == 200 and r.json()["status"] == "running"

    def test_generate_and_poll(self, admin):
        r = admin.post(f"{BASE}/api/builder/lesson-quiz", json={"title": "Phishing triage", "content": CONTENT, "level": "Beginner"})
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "running" and isinstance(d["job_id"], str)
        j = None
        for _ in range(45):
            time.sleep(4)
            j = admin.get(f"{BASE}/api/builder/jobs/{d['job_id']}").json()
            if j["status"] != "running":
                break
        assert j["status"] == "done", j
        qs = j["questions"]
        assert len(qs) == 5
        for q in qs:
            assert q["text"].strip() and len(q["options"]) == 4 and all(o.strip() for o in q["options"])
            assert isinstance(q["answer"], int) and 0 <= q["answer"] <= 3
            assert q["explanation"].strip()
        TestLessonQuizGen.questions = qs

    def test_job_not_visible_to_other_user(self, instructor, admin):
        r = admin.post(f"{BASE}/api/builder/lesson-quiz", json={"title": "Phishing triage", "content": CONTENT})
        jid = r.json()["job_id"]
        assert instructor.get(f"{BASE}/api/builder/jobs/{jid}").status_code == 404


# ---- Path save with lesson quiz ----
def make_path(quiz):
    return {"title": "TEST_LessonQuiz Path", "description": "test", "level": "Beginner", "published": True, "order": 99,
            "modules": [{"id": "m1", "title": "M1", "lessons": [{"id": "l-test1", "title": "Phishing triage", "content": CONTENT, "quiz": quiz}]}]}


GOOD_Q = [{"id": f"q{i}", "text": f"Question {i}?", "options": ["a", "b", "c", "d"], "answer": i % 4, "explanation": "because"} for i in range(5)]


class TestPathQuizPersist:
    pid = None

    def test_create_with_quiz_and_get(self, admin, student):
        r = admin.post(f"{BASE}/api/manage/paths", json=make_path({"questions": GOOD_Q}))
        assert r.status_code == 200, r.text
        TestPathQuizPersist.pid = r.json()["id"]
        g = student.get(f"{BASE}/api/paths/{self.pid}")
        assert g.status_code == 200
        q = g.json()["modules"][0]["lessons"][0]["quiz"]["questions"]
        assert len(q) == 5 and q[2]["answer"] == 2

    @pytest.mark.parametrize("bad", [
        [{"text": "Q", "options": ["a", "b", "c"], "answer": 0}],
        [{"text": "Q", "options": ["a", "b", "c", "d"], "answer": 4}],
        [{"text": "  ", "options": ["a", "b", "c", "d"], "answer": 0}],
        [{"text": "Q", "options": ["a", "", "c", "d"], "answer": 0}],
    ])
    def test_invalid_quiz_422(self, admin, bad):
        assert self.pid
        r = admin.put(f"{BASE}/api/manage/paths/{self.pid}", json=make_path({"questions": bad}))
        assert r.status_code == 422, r.text

    def test_update_and_cleanup(self, admin):
        new = [dict(q, text="Edited " + q["text"]) for q in GOOD_Q]
        r = admin.put(f"{BASE}/api/manage/paths/{self.pid}", json=make_path({"questions": new}))
        assert r.status_code == 200
        g = admin.get(f"{BASE}/api/paths/{self.pid}").json()
        assert g["modules"][0]["lessons"][0]["quiz"]["questions"][0]["text"].startswith("Edited")
        assert admin.delete(f"{BASE}/api/manage/paths/{self.pid}").status_code == 200
        assert admin.get(f"{BASE}/api/paths/{self.pid}").status_code == 404


# ---- New labs ----
class TestNewLabs:
    def test_labs_listed(self, student):
        labs = {l["id"]: l for l in student.get(f"{BASE}/api/labs").json()}
        for lid, cat in [("lab-net-portscan", "Networking"), ("lab-net-beacon", "Networking"), ("lab-linux-cron", "Linux"), ("lab-linux-privesc", "Linux")]:
            assert lid in labs, lid
            assert labs[lid]["category"] == cat

    def test_lab_detail_has_evidence(self, student):
        for lid in ["lab-net-portscan", "lab-net-beacon", "lab-linux-cron", "lab-linux-privesc"]:
            d = student.get(f"{BASE}/api/labs/{lid}").json()
            fs = d["kali"]["fs"]
            assert any(k.startswith("/home/analyst/evidence/") for k in fs), lid
            assert all("answer" not in t for t in d["tasks"])

    def test_task_answers(self, student):
        for lid, tid, ans in [("lab-net-portscan", "p1", "198.51.100.23"), ("lab-net-portscan", "p3", "445"), ("lab-linux-cron", "r1", "185.243.115.9:4444")]:
            r = student.post(f"{BASE}/api/labs/{lid}/tasks/{tid}", json={"answer": ans})
            assert r.status_code == 200 and r.json()["correct"] is True, (lid, tid)
        assert student.post(f"{BASE}/api/labs/lab-net-portscan/tasks/p1", json={"answer": "1.2.3.4"}).json()["correct"] is False


# ---- New challenges ----
class TestNewChallenges:
    def test_listed(self, student):
        cs = {c["id"]: c for c in student.get(f"{BASE}/api/challenges").json()}
        for i in range(1, 6):
            assert cs[f"ch-net-0{i}"]["category"] == "Networking"
            assert cs[f"ch-lnx-0{i}"]["category"] == "Linux"
            assert len(cs[f"ch-net-0{i}"]["hints"]) == 2

    def test_hint_unlock(self, student):
        # student has XP; hint costs 25 (idempotent if already unlocked)
        r = student.post(f"{BASE}/api/challenges/ch-lnx-01/hint/0")
        assert r.status_code == 200, r.text
        assert r.json()["text"]
        cs = {c["id"]: c for c in student.get(f"{BASE}/api/challenges").json()}
        assert cs["ch-lnx-01"]["hints"][0]["text"]


# ---- New quizzes ----
class TestNewQuizzes:
    def test_listed_and_submit(self, student):
        qs = {q["id"]: q for q in student.get(f"{BASE}/api/quizzes").json()}
        for qid in ["quiz-networking", "quiz-linux", "quiz-soc-workflow", "quiz-foundations"]:
            assert qid in qs and qs[qid]["question_count"] == 5, qid
            full = student.get(f"{BASE}/api/quizzes/{qid}").json()
            assert len(full["questions"]) == 5
        full = student.get(f"{BASE}/api/quizzes/quiz-networking").json()
        r = student.post(f"{BASE}/api/quizzes/quiz-networking/submit", json={"answers": {q["id"]: [0] for q in full["questions"]}, "time_spent": 10})
        assert r.status_code == 200
        assert "score" in r.json()


# ---- Suggest practice coverage ----
L1_SAMPLES = {"Day 4 · Networking essentials for analysts": "Networking", "Day 2 · Tiers, shifts, SLAs and escalation": "SOC Workflow",
              "Day 6 · CIA triad, threats and MITRE ATT&CK": "Foundations"}


class TestSuggest:
    @pytest.mark.parametrize("title,expect", list(L1_SAMPLES.items()))
    def test_samples(self, admin, title, expect):
        r = admin.post(f"{BASE}/api/builder/suggest", json={"title": title})
        assert r.status_code == 200
        items = r.json()
        assert any(x["type"] != "sop" for x in items)
        assert any(expect.lower() in x["title"].lower() for x in items), items

    def test_all_l1_template(self, admin):
        tpl = admin.post(f"{BASE}/api/builder/templates/tpl-soc-l1-30/use").json()
        titles = [l["title"] for m in tpl["modules"] for l in m["lessons"]]
        assert len(titles) == 30
        miss = [t for t in titles if not any(x["type"] != "sop" for x in admin.post(f"{BASE}/api/builder/suggest", json={"title": t}).json())]
        assert miss == []

    def test_seeded_soc_l1_path(self, admin):
        p = admin.get(f"{BASE}/api/paths/soc-l1")
        if p.status_code != 200:
            pytest.skip("soc-l1 path not found")
        titles = [l["title"] for m in p.json()["modules"] for l in m["lessons"]]
        miss = [t for t in titles if not any(x["type"] != "sop" for x in admin.post(f"{BASE}/api/builder/suggest", json={"title": t}).json())]
        assert miss == []
