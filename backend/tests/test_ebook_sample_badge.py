# Iteration 15: Ebook free sample (/api/me/book/sample) + Interview Ready badge (purchase-based)
import os
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
load_dotenv(Path("/app/backend/.env"))
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
BID = "interview-ready"


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


def mongo():
    from pymongo import MongoClient
    return MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def student_id(student):
    return student.get(f"{API}/auth/me").json()["id"]


def badge(sess, path="/me/badges"):
    return next((b for b in sess.get(f"{API}{path}").json()["badges"] if b["id"] == BID), None)


# --- Sample endpoint ---
def test_sample_logged_out_401():
    r = requests.get(f"{API}/me/book/sample")
    assert r.status_code == 401


def test_sample_student_non_buyer(student, student_id):
    assert not mongo().purchases.find_one({"user_id": student_id, "product_id": "soc-interview-ebook"})
    r = student.get(f"{API}/me/book/sample")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/pdf")
    assert r.headers["content-disposition"].startswith("inline")
    assert 2_000_000 < len(r.content) < 3_000_000
    assert r.content[:4] == b"%PDF"
    # full file still locked
    assert student.get(f"{API}/me/book/file").status_code == 402


def test_sample_has_10_pages(student):
    import io
    try:
        from pypdf import PdfReader
    except ImportError:
        try:
            from PyPDF2 import PdfReader
        except ImportError:
            pytest.skip("no pdf lib")
    r = student.get(f"{API}/me/book/sample")
    assert len(PdfReader(io.BytesIO(r.content)).pages) == 10


def test_sample_fresh_user():
    s = requests.Session()
    email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "TestPass@123", "name": "TEST Sample", "username": f"test{uuid.uuid4().hex[:8]}"})
    assert r.status_code in (200, 201), r.text
    try:
        r = s.get(f"{API}/me/book/sample")
        assert r.status_code == 200 and r.content[:4] == b"%PDF"
        assert badge(s)["earned"] is False
    finally:
        mongo().users.delete_one({"email": email})


# --- Badge ---
def test_badge_not_earned_without_purchase(student, admin):
    b = badge(student)
    assert b and b["earned"] is False and b["level"] == "Analyst"
    assert b["name"] == "Interview Ready"
    ab = badge(admin)
    assert ab and ab["earned"] is False  # admin owns book but no purchase -> no badge
    assert admin.get(f"{API}/me/book").json()["owned"] is True
    assert student.post(f"{API}/me/badges/{BID}/share-card").status_code == 404


def test_badge_earned_with_purchase(student, student_id):
    db = mongo()
    db.purchases.insert_one({"user_id": student_id, "product_id": "soc-interview-ebook", "id": "TEST_purchase"})
    try:
        b = badge(student)
        assert b["earned"] is True and b["level"] == "Analyst"
        d = badge(student, "/dashboard")
        assert d["earned"] is True
        assert student.get(f"{API}/me/book").json()["owned"] is True
        r = student.post(f"{API}/me/badges/{BID}/share-card")
        assert r.status_code == 200, r.text
        img = requests.get(r.json()["image_url"])
        assert img.status_code == 200 and img.headers["content-type"] == "image/png" and img.content[:4] == b"\x89PNG"
        page = requests.get(r.json()["share_url"])
        assert page.status_code == 200 and "Interview Ready" in page.text and "Analyst" in page.text
    finally:
        db.purchases.delete_one({"id": "TEST_purchase"})
    assert badge(student)["earned"] is False


# --- Regression ---
def test_book_public_info():
    r = requests.get(f"{API}/public/book").json()
    assert r["amount"] == 973 and r["mrp"] == 2999 and "udemy.com" in r["udemy_url"]
