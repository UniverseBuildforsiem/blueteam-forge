# Iteration 10: SOCProfessionals Academy rebrand + badge email after course bonus
import asyncio
import io
import os
import re
import sys
import time
import uuid
from urllib.parse import quote

import pytest
import requests
from dotenv import dotenv_values, load_dotenv
from PIL import Image
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", dotenv_values("/app/frontend/.env").get("REACT_APP_BACKEND_URL")).rstrip("/")
ENV = dotenv_values("/app/backend/.env")
db = MongoClient(ENV["MONGO_URL"].strip('"'))[ENV["DB_NAME"].strip('"')]
API = f"{BASE_URL}/api"
WS = 585979
LOG = "/var/log/supervisor/backend.err.log"

CREDS = [("admin@socprofessionals.academy", "Admin@123", "admin"),
         ("instructor@socprofessionals.academy", "Instructor@123", "instructor"),
         ("student@socprofessionals.academy", "Student@123", "student")]


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    return s, r


def new_student(label):
    s = requests.Session()
    u = uuid.uuid4().hex[:8]
    r = s.post(f"{API}/auth/register", json={"name": f"TEST Badge {u}", "email": f"delivered+{label}{u}@resend.dev", "username": f"tbe_{u}", "password": "Test@12345"})
    assert r.status_code in (200, 201), r.text
    assert s.post(f"{API}/auth/onboarding", json={"goal": "SOC L1"}).status_code == 200
    return s, s.get(f"{API}/auth/me").json()


def log_size():
    return os.path.getsize(LOG)


def log_since(pos):
    with open(LOG, "rb") as f:
        f.seek(pos)
        return f.read().decode(errors="ignore")


# --- Auth with new emails ---
@pytest.mark.parametrize("email,pw,role", CREDS)
def test_login_new_emails(email, pw, role):
    s, r = login(email, pw)
    assert r.status_code == 200, r.text
    assert s.get(f"{API}/auth/me").json()["role"] == role


@pytest.mark.parametrize("email", ["admin@socforge.io", "instructor@socforge.io", "student@socforge.io"])
def test_old_emails_gone(email):
    _, r = login(email, "Admin@123" if "admin" in email else "x")
    assert r.status_code in (400, 401)
    assert db.users.count_documents({"email": email}) == 0


def test_no_socforge_users_in_db():
    assert db.users.count_documents({"email": {"$regex": "socforge"}}) == 0


# --- Backend brand ---
def test_root_service_name():
    r = requests.get(f"{API}/")
    assert r.status_code == 200
    assert "SOCProfessionals Academy" in str(r.json())
    assert "SOCForge" not in str(r.json())


def test_admin_settings_platform_name():
    s, _ = login(*CREDS[0][:2])
    r = s.get(f"{API}/admin/settings")
    assert r.status_code == 200
    assert r.json().get("platform_name") == "SOCProfessionals Academy"


def test_certificate_pdf_brand():
    c = db.certificates.find_one({}, {"_id": 0, "id": 1})
    if not c:
        pytest.skip("no certificates")
    r = requests.get(f"{API}/public/certificates/{c['id']}/pdf")
    assert r.status_code == 200
    assert r.content[:4] == b"%PDF"
    import pypdf  # noqa
    txt = "".join(p.extract_text() or "" for p in pypdf.PdfReader(io.BytesIO(r.content)).pages)
    assert "SOCForge" not in txt
    assert "SOC" in txt and "Professionals" in txt, txt[:300]


def test_streak_card_png_and_og():
    s, _ = login(*CREDS[2][:2])
    d = s.post(f"{API}/me/share-card").json()
    png = requests.get(d["image_url"])
    assert png.status_code == 200 and png.headers["content-type"] == "image/png"
    assert Image.open(io.BytesIO(png.content)).size == (1200, 627)
    html = requests.get(d["share_url"]).text
    assert "SOCProfessionals Academy" in html and "SOCForge" not in html


# --- Badge email ---
@pytest.fixture(scope="module")
def bonus_student():
    s, me = new_student("badge")
    assert s.post(f"{API}/me/courses/{WS}/complete").status_code == 200
    time.sleep(1.1)
    r = s.post(f"{API}/ctf/ctf-net-2/submit", json={"flag": "SOCF{3389}"})
    assert r.json().get("correct") is True, r.text
    return s, me


def test_badge_email_sent_on_bonus(bonus_student):
    s, me = bonus_student
    pos = log_size()
    r = s.get(f"{API}/me/courses/progress")
    assert r.status_code == 200
    d = r.json()
    assert len(d["awarded"]) == 1, d["awarded"]
    time.sleep(8)
    tail = log_since(pos)
    assert re.search(r"email/send.*202", tail), tail[-2000:]
    assert "Email send failed" not in tail
    # badge png reachable
    tok = db.users.find_one({"id": me["id"]})["share_token"]
    png = requests.get(f"{API}/public/course-badge/{tok}/{WS}.png")
    assert png.status_code == 200 and png.headers["content-type"] == "image/png"
    page = requests.get(f"{API}/public/course-badge/{tok}/{WS}").text
    assert "SOCProfessionals Academy" in page


def test_badge_email_not_resent(bonus_student):
    s, _ = bonus_student
    pos = log_size()
    d = s.get(f"{API}/me/courses/progress").json()
    assert d["awarded"] == []
    s.get(f"{API}/dashboard")
    time.sleep(5)
    assert not re.search(r"email/send", log_since(pos))


def test_badge_email_skipped_when_course_emails_off():
    s, me = new_student("off")
    r = s.patch(f"{API}/me/preferences", json={"course_emails": False})
    assert r.json()["course_emails"] is False
    s.post(f"{API}/me/courses/{WS}/complete")
    time.sleep(1.1)
    assert s.post(f"{API}/ctf/ctf-net-2/submit", json={"flag": "SOCF{3389}"}).json()["correct"]
    pos = log_size()
    d = s.get(f"{API}/dashboard")
    assert d.status_code == 200
    p = s.get(f"{API}/me/courses/progress").json()
    assert p["courses"][0]["bonus_paid"] is True
    time.sleep(6)
    assert not re.search(r"email/send", log_since(pos))


def test_badge_email_html_contents():
    """In-process: capture html built by send_badge_email."""
    load_dotenv("/app/backend/.env")
    sys.path.insert(0, "/app/backend")
    import routes_courses
    captured = {}

    async def fake_send(*, to, subject, html):
        from core import _assert_safe_email
        _assert_safe_email(subject, html)
        captured.update(to=to, subject=subject, html=html)

    async def run():
        import core
        from motor.motor_asyncio import AsyncIOMotorClient
        cli = AsyncIOMotorClient(os.environ["MONGO_URL"])
        routes_courses.db = cli[os.environ["DB_NAME"]]
        import routes_share
        routes_share.db = routes_courses.db
        routes_courses.send_email = fake_send
        u = await routes_courses.db.users.find_one({"email": "student@socprofessionals.academy"}, {"_id": 0})
        await routes_courses.send_badge_email(u, {"id": WS, "title": "Wireshark Masterclass"}, "Wireshark")
        return u

    u = asyncio.run(run())
    h = captured["html"]
    assert captured["to"] == "student@socprofessionals.academy"
    assert "Wireshark" in captured["subject"]
    share = f"{API}/public/course-badge/{u['share_token']}/{WS}"
    assert f"<img src='{share}.png'" in h
    assert "https://www.linkedin.com/sharing/share-offsite/?url=" + quote(share, safe="") in h
    assert "Share on LinkedIn" in h
    assert "/api/public/unsubscribe/course-alerts?u=" in h
    assert "SOCProfessionals Academy" in h and "SOCForge" not in h
    m = re.search(r"href='([^']*unsubscribe[^']*)'", h)
    assert m
    captured["unsub"] = m.group(1).replace("&amp;", "&")
    # unsubscribe link works (on a throwaway user, not seeded student)


def test_unsubscribe_link_flow():
    s, me = new_student("unsub")
    load_dotenv("/app/backend/.env")
    sys.path.insert(0, "/app/backend")
    from routes_courses import unsub_url
    url = unsub_url(me["id"])
    r = requests.get(url)
    assert r.status_code == 200
    assert "SOCProfessionals Academy" in r.text and "badge" in r.text
    assert s.get(f"{API}/me/courses").json()["course_emails"] is False


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    ids = [u["id"] for u in db.users.find({"email": {"$regex": r"^delivered\+(badge|off|unsub).*@resend\.dev$"}}, {"id": 1})]
    for coll in ("course_completions", "course_bonus", "ctf_solves", "xp_events", "activity"):
        db[coll].delete_many({"user_id": {"$in": ids}})
    db.users.delete_many({"id": {"$in": ids}})
