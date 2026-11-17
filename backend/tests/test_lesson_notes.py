# Lesson Notes feature: upsert/delete, list, isolation, export (pdf/md)
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
COURSE = "384eef11de47"
COURSE_LESSON = "l-3zyafu0"
PATH = "soc-fundamentals"
PATH_LESSONS = ["sf-l1", "sf-l2"]


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    return s


@pytest.fixture(scope="module")
def student():
    s = login("student@socprofessionals.academy", "Student@123")
    yield s
    for pid, lid in [(COURSE, COURSE_LESSON)] + [(PATH, l) for l in PATH_LESSONS]:
        s.put(f"{BASE_URL}/api/notes/{pid}/{lid}", json={"text": ""})


@pytest.fixture(scope="module")
def admin():
    s = login("admin@socprofessionals.academy", "Admin@123")
    yield s
    s.put(f"{BASE_URL}/api/notes/{PATH}/sf-l1", json={"text": ""})


def test_unauth_401():
    assert requests.put(f"{BASE_URL}/api/notes/{COURSE}/{COURSE_LESSON}", json={"text": "x"}).status_code == 401
    assert requests.get(f"{BASE_URL}/api/notes").status_code == 401
    assert requests.get(f"{BASE_URL}/api/notes/export?format=md").status_code == 401


def test_unknown_lesson_404(student):
    assert student.put(f"{BASE_URL}/api/notes/{COURSE}/nope-{uuid.uuid4().hex[:5]}", json={"text": "x"}).status_code == 404
    assert student.put(f"{BASE_URL}/api/notes/nopath/{COURSE_LESSON}", json={"text": "x"}).status_code == 404


def test_export_404_when_none(student):
    # make sure none exist first
    for pid, lid in [(COURSE, COURSE_LESSON)] + [(PATH, l) for l in PATH_LESSONS]:
        student.put(f"{BASE_URL}/api/notes/{pid}/{lid}", json={"text": ""})
    if student.get(f"{BASE_URL}/api/notes").json():
        pytest.skip("student has pre-existing notes")
    assert student.get(f"{BASE_URL}/api/notes/export?format=pdf").status_code == 404


def test_upsert_and_list(student):
    r = student.put(f"{BASE_URL}/api/notes/{COURSE}/{COURSE_LESSON}", json={"text": "TEST_ first"})
    assert r.status_code == 200 and r.json()["ok"]
    r = student.put(f"{BASE_URL}/api/notes/{COURSE}/{COURSE_LESSON}", json={"text": "TEST_ <b>bold</b> & <script>alert(1)</script> ü 中文 ›"})
    assert r.status_code == 200
    for l in PATH_LESSONS:
        assert student.put(f"{BASE_URL}/api/notes/{PATH}/{l}", json={"text": f"TEST_ note {l}\nline2"}).status_code == 200
    allr = student.get(f"{BASE_URL}/api/notes").json()
    mine = [n for n in allr if n["lesson_id"] in [COURSE_LESSON] + PATH_LESSONS]
    assert len(mine) == 3
    c = next(n for n in mine if n["lesson_id"] == COURSE_LESSON)
    assert c["kind"] == "course" and c["path_title"] and c["module_title"] and c["lesson_title"]
    assert "<script>" in c["text"] and "_id" not in c and "user_id" not in c
    p = student.get(f"{BASE_URL}/api/notes", params={"path_id": PATH}).json()
    assert {n["lesson_id"] for n in p} == set(PATH_LESSONS) and all(n["kind"] == "path" for n in p)


def test_isolation(student, admin):
    admin.put(f"{BASE_URL}/api/notes/{PATH}/sf-l1", json={"text": "TEST_ admin note"})
    a = admin.get(f"{BASE_URL}/api/notes", params={"path_id": PATH}).json()
    assert [n["text"] for n in a] == ["TEST_ admin note"]
    s = student.get(f"{BASE_URL}/api/notes", params={"path_id": PATH}).json()
    assert all("admin" not in n["text"] for n in s)


def test_export_md(student):
    r = student.get(f"{BASE_URL}/api/notes/export", params={"format": "md"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/markdown")
    assert "attachment" in r.headers["content-disposition"]
    t = r.text
    assert t.startswith("# My SOC Notes") and "## SOC Fundamentals" in t and "### " in t and "TEST_ note sf-l1" in t
    r2 = student.get(f"{BASE_URL}/api/notes/export", params={"format": "md", "path_id": PATH})
    assert r2.status_code == 200 and "notes-soc-fundamentals.md" in r2.headers["content-disposition"]
    assert "SOC Analyst Interview" not in r2.text


def test_export_pdf_special_chars(student):
    r = student.get(f"{BASE_URL}/api/notes/export", params={"format": "pdf"})
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert r.content[:4] == b"%PDF" and len(r.content) > 1000
    r = student.get(f"{BASE_URL}/api/notes/export", params={"format": "pdf", "path_id": COURSE})
    assert r.status_code == 200 and r.content[:4] == b"%PDF"


def test_bad_format_422(student):
    assert student.get(f"{BASE_URL}/api/notes/export", params={"format": "xyz"}).status_code == 422


def test_empty_deletes(student):
    r = student.put(f"{BASE_URL}/api/notes/{PATH}/sf-l2", json={"text": "   "})
    assert r.json().get("deleted") is True
    p = student.get(f"{BASE_URL}/api/notes", params={"path_id": PATH}).json()
    assert {n["lesson_id"] for n in p} == {"sf-l1"}


def test_max_length_422(student):
    assert student.put(f"{BASE_URL}/api/notes/{PATH}/sf-l1", json={"text": "a" * 20001}).status_code == 422
