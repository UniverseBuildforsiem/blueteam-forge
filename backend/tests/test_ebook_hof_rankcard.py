# Iteration 14: Ebook store (/book), Elite Hall of Fame, rank share cards, rank-up email, next-badge data
import os
import asyncio
import uuid
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
load_dotenv(Path("/app/backend/.env"))
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
UDEMY = "https://www.udemy.com/course/soc-interview-preparation-100questions-from-top-interviews/?referralCode=EB7475E7369B8DD58A38"


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text[:100]}")
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
def bot():
    return login("bot0@socprofessionals.academy", "BotUser@123!x")


# ---- Ebook public info ----
def test_public_book_info():
    r = requests.get(f"{API}/public/book")
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == "soc-interview-ebook" and d["amount"] == 973 and d["mrp"] == 2999
    assert d["off"] == 67 and d["author"] == "Gopi Pakanati" and d["udemy_url"] == UDEMY


def test_book_requires_auth():
    assert requests.get(f"{API}/me/book").status_code == 401
    assert requests.get(f"{API}/me/book/file").status_code == 401


# ---- Non-owner ----
def test_non_owner_locked(student):
    db = mongo()
    uid = student.get(f"{API}/auth/me").json()["id"]
    db.purchases.delete_many({"user_id": uid, "product_id": "soc-interview-ebook"})
    assert student.get(f"{API}/me/book").json() == {"owned": False}
    r = student.get(f"{API}/me/book/file")
    assert r.status_code == 402


def test_payments_not_configured(student):
    cfg = student.get(f"{API}/payments/config").json()
    assert cfg["razorpay"] is False and cfg["cashfree"] is False
    r = student.post(f"{API}/payments/razorpay/order", json={"plan": "soc-interview-ebook"})
    assert r.status_code == 503
    r = student.post(f"{API}/payments/cashfree/order", json={"plan": "soc-interview-ebook", "phone": "9876543210"})
    assert r.status_code == 503


def test_invalid_plan_400(student):
    assert student.post(f"{API}/payments/razorpay/order", json={"plan": "nope"}).status_code == 400
    assert student.post(f"{API}/payments/cashfree/order", json={"plan": "nope"}).status_code == 400


# ---- Owner (simulated purchase) ----
def test_owner_access_and_download(student):
    db = mongo()
    uid = student.get(f"{API}/auth/me").json()["id"]
    db.purchases.update_one({"user_id": uid, "product_id": "soc-interview-ebook"},
                            {"$setOnInsert": {"user_id": uid, "product_id": "soc-interview-ebook", "at": "2026-01-01T00:00:00+00:00", "test": True}}, upsert=True)
    try:
        assert student.get(f"{API}/me/book").json() == {"owned": True}
        r = student.get(f"{API}/me/book/file")
        assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
        assert r.headers["content-disposition"].startswith("inline")
        assert r.content[:4] == b"%PDF" and len(r.content) > 12_000_000
        r = student.get(f"{API}/me/book/file?download=true", stream=True)
        assert r.status_code == 200 and r.headers["content-disposition"].startswith("attachment")
        assert "SOC-Interview-Preparation-Ebook-Gopi-Pakanati.pdf" in r.headers["content-disposition"]
        r.close()
    finally:
        db.purchases.delete_many({"user_id": uid, "product_id": "soc-interview-ebook", "test": True})


def test_admin_always_owns(admin):
    assert admin.get(f"{API}/me/book").json() == {"owned": True}
    r = admin.get(f"{API}/me/book/file", stream=True)
    assert r.status_code == 200
    r.close()


def test_activate_product_and_plan():
    import sys
    sys.path.insert(0, "/app/backend")
    from routes_manage import activate
    db = mongo()
    uid = f"TEST_{uuid.uuid4().hex[:8]}"
    db.users.insert_one({"id": uid, "email": f"{uid}@x.io", "name": "T", "role": "student", "plan": "free"})
    db.payments.insert_many([{"id": f"{uid}_p1", "user_id": uid, "plan": "soc-interview-ebook", "plan_name": "Ebook", "status": "created"},
                             {"id": f"{uid}_p2", "user_id": uid, "plan": "pro_monthly", "plan_name": "Pro Monthly", "status": "created"}])
    try:
        async def run():
            await activate(uid, f"{uid}_p1")
            await activate(uid, f"{uid}_p1")
            await activate(uid, f"{uid}_p2")
        asyncio.run(run())
        assert db.purchases.count_documents({"user_id": uid, "product_id": "soc-interview-ebook"}) == 1
        assert db.users.find_one({"id": uid})["plan"] == "pro"
        assert db.payments.find_one({"id": f"{uid}_p1"})["status"] == "paid"
    finally:
        db.users.delete_one({"id": uid})
        db.payments.delete_many({"user_id": uid})
        db.purchases.delete_many({"user_id": uid})


# ---- Hall of Fame ----
def test_hall_of_fame():
    r = requests.get(f"{API}/public/hall-of-fame")
    assert r.status_code == 200
    rows = r.json()
    assert isinstance(rows, list) and len(rows) >= 1
    kai = next(x for x in rows if x["username"] == "kai0")
    assert kai["xp"] >= 3000 and kai["frame"] == "neon" and kai["rank"] == "Elite"
    for x in rows:
        assert set(x) == {"name", "username", "xp", "rank", "frame"} and x["xp"] >= 3000


def test_hall_of_fame_private_hides_username(bot):
    try:
        bot.patch(f"{API}/me/profile-visibility", json={"public_profile": False})
        rows = requests.get(f"{API}/public/hall-of-fame").json()
        kai = next(x for x in rows if x["name"] == "Kai Brooks")
        assert kai["username"] is None
    finally:
        bot.patch(f"{API}/me/profile-visibility", json={"public_profile": True})


# ---- Rank share card ----
def test_rank_share_card_bot(bot):
    r = bot.post(f"{API}/me/rank/share-card")
    assert r.status_code == 200
    d = r.json()
    assert d["rank"] == "Elite" and d["share_url"].endswith("/Elite") and d["image_url"] == d["share_url"] + ".png"
    token = d["share_url"].split("/public/rank/")[1].split("/")[0]
    for rk in ("Recruit", "Analyst", "Hunter", "Elite"):
        p = requests.get(f"{API}/public/rank/{token}/{rk}.png")
        assert p.status_code == 200 and p.headers["content-type"] == "image/png" and p.content[:4] == b"\x89PNG"
    h = requests.get(f"{API}/public/rank/{token}/Elite", allow_redirects=False)
    assert h.status_code == 200 and 'og:image' in h.text and "/u/kai0" in h.text
    assert requests.get(f"{API}/public/rank/{token}/Bogus.png").status_code == 404


def test_rank_card_404_above_rank(student):
    d = student.post(f"{API}/me/rank/share-card").json()
    token = d["share_url"].split("/public/rank/")[1].split("/")[0]
    order = ["Recruit", "Analyst", "Hunter", "Elite"]
    i = order.index(d["rank"])
    assert requests.get(f"{API}/public/rank/{token}/{d['rank']}.png").status_code == 200
    for rk in order[i + 1:]:
        assert requests.get(f"{API}/public/rank/{token}/{rk}.png").status_code == 404
        assert requests.get(f"{API}/public/rank/{token}/{rk}").status_code == 404
    assert requests.get(f"{API}/public/rank/badtoken/Recruit.png").status_code == 404


# ---- Rank-up email (core.award) ----
def test_award_triggers_rank_email_once():
    import sys
    sys.path.insert(0, "/app/backend")
    import routes_share
    import core
    db = mongo()
    uid = f"TEST_{uuid.uuid4().hex[:8]}"
    uid2 = f"TEST_{uuid.uuid4().hex[:8]}"
    db.users.insert_many([{"id": uid, "email": f"{uid}@x.io", "name": "T", "role": "student", "xp": 490, "username": uid.lower()},
                          {"id": uid2, "email": f"{uid2}@x.io", "name": "T2", "role": "student", "xp": 490, "username": uid2.lower(), "course_emails": False}])
    sent = []

    async def fake_send(**kw):
        sent.append(kw)
        return "id"
    orig = routes_share.send_email
    routes_share.send_email = fake_send
    try:
        async def run():
            # motor client bound to this loop
            from motor.motor_asyncio import AsyncIOMotorClient
            core.db = routes_share.db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
            await core.award(uid, 20, "test")
            await core.award(uid, 5, "test")
            await routes_share.send_rank_email(uid, "Analyst")
            await core.award(uid2, 20, "test")
            await asyncio.sleep(1.5)
        asyncio.run(run())
        mine = [s for s in sent if s["to"] == f"{uid}@x.io"]
        assert len(mine) == 1
        assert "Analyst" in mine[0]["subject"] and "linkedin.com/sharing" in mine[0]["html"]
        assert "/public/rank/" in mine[0]["html"] and ".png" in mine[0]["html"] and "unsubscribe" in mine[0]["html"].lower()
        assert not [s for s in sent if s["to"] == f"{uid2}@x.io"]
        assert db.rank_emails.count_documents({"user_id": uid}) == 1
    finally:
        routes_share.send_email = orig
        for u in (uid, uid2):
            db.users.delete_one({"id": u})
            db.rank_emails.delete_many({"user_id": u})
            db.activity.delete_many({"user_id": u})


# ---- Next badge data ----
def test_badges_endpoint_has_order_ids(student):
    r = student.get(f"{API}/me/badges")
    assert r.status_code == 200
    ids = {b["id"] for b in r.json()["badges"]}
    for i in ["first-blood", "on-fire", "triage-pro", "quiz-master", "lab-rat", "drill-7", "pathfinder", "drill-30"]:
        assert i in ids, i
