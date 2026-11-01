# Consultation booking (slots, holds, payments gating, simulated paid flow, admin) + batch seats + live settings API tests
import os
import subprocess
import uuid
from datetime import datetime, timedelta, timezone
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
IST = timezone(timedelta(hours=5, minutes=30))
SIM = "/app/backend/tests/consult_pay_sim.py"


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    s.me = s.get(f"{BASE_URL}/api/auth/me").json()
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


@pytest.fixture(scope="module")
def bot():
    return login("bot1@socprofessionals.academy", "BotUser@123!x")


@pytest.fixture(scope="module")
def info():
    return requests.get(f"{BASE_URL}/api/public/consultation").json()


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    subprocess.run(["python3", SIM, "cleanup"], cwd="/app/backend", capture_output=True)


def free_slots(info):
    return [s["at"] for d in info["days"] for s in d["slots"] if s["free"]]


def hold(sess, slot, topic="Other", **kw):
    body = {"slot_at": slot, "topic": topic, "phone": "9876543210", "notes": "TEST_consult"}
    body.update(kw)
    return sess.post(f"{BASE_URL}/api/consultations/hold", json=body)


def slot_free(slot):
    i = requests.get(f"{BASE_URL}/api/public/consultation").json()
    for d in i["days"]:
        for s in d["slots"]:
            if s["at"] == slot:
                return s["free"]
    return None


# ---------- Public consultation info ----------
class TestConsultInfo:
    def test_info_shape(self, info):
        assert info["price"] == 99 and info["mrp"] == 999 and info["minutes"] == 30
        assert info["whatsapp"] == "919381203090"
        assert "Other" in info["topics"] and len(info["topics"]) == 6
        assert 1 <= len(info["days"]) <= 14

    def test_slots_window_and_lead(self, info):
        earliest = datetime.now(timezone.utc) + timedelta(hours=2)
        for d in info["days"]:
            for s in d["slots"]:
                t = datetime.fromisoformat(s["at"]).astimezone(IST)
                assert "16:00" <= t.strftime("%H:%M") <= "22:30"
                assert t.minute in (0, 30)
                assert t > earliest - timedelta(minutes=5)
                assert isinstance(s["free"], bool)
        # a full future day has 14 slots
        assert len(info["days"][-1]["slots"]) == 14


# ---------- Holds ----------
class TestHold:
    def test_unauth(self, info):
        r = requests.post(f"{BASE_URL}/api/consultations/hold", json={"slot_at": free_slots(info)[0], "topic": "Other", "phone": "9876543210"})
        assert r.status_code == 401

    def test_invalid_topic(self, student, info):
        r = hold(student, free_slots(info)[0], topic="Hacking NASA")
        assert r.status_code == 422

    def test_invalid_slot(self, student):
        r = hold(student, "2026-01-01T03:00:00+05:30")
        assert r.status_code == 409

    def test_hold_conflict_and_replace(self, student, bot, info):
        slots = free_slots(info)
        a, b = slots[-1], slots[-2]
        r = hold(student, a)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["hold_minutes"] == 15 and isinstance(d["id"], str) and "IST" in d["when"]
        assert slot_free(a) is False
        # other user cannot take it
        r2 = hold(bot, a)
        assert r2.status_code == 409
        # same user can re-hold same slot
        assert hold(student, a).status_code == 200
        # new hold replaces old one
        r3 = hold(student, b)
        assert r3.status_code == 200
        assert slot_free(b) is False
        assert slot_free(a) is True


# ---------- Payment gating ----------
class TestPaymentGating:
    @pytest.mark.parametrize("prov", ["razorpay", "cashfree"])
    def test_ref_required(self, student, prov):
        r = student.post(f"{BASE_URL}/api/payments/{prov}/order", json={"plan": "soc-consultation"})
        assert r.status_code == 400
        assert "Pick a consultation slot first" in r.json()["detail"]

    @pytest.mark.parametrize("prov", ["razorpay", "cashfree"])
    def test_valid_ref_not_configured(self, student, info, prov):
        h = hold(student, free_slots(info)[-3]).json()
        r = student.post(f"{BASE_URL}/api/payments/{prov}/order", json={"plan": "soc-consultation", "ref": h["id"]})
        assert r.status_code == 503
        assert "not configured" in r.json()["detail"]

    def test_foreign_ref_rejected(self, bot, student, info):
        h = hold(student, free_slots(info)[-4]).json()
        r = bot.post(f"{BASE_URL}/api/payments/razorpay/order", json={"plan": "soc-consultation", "ref": h["id"]})
        assert r.status_code == 400


# ---------- Simulated paid flow + admin ----------
class TestPaidFlow:
    def test_paid_flow(self, student, bot, admin, info):
        slot = free_slots(info)[-5]
        h = hold(student, slot, topic="Career switch into SOC").json()
        out = subprocess.run(["python3", SIM, "pay", h["id"], student.me["id"]], cwd="/app/backend", capture_output=True, text=True, timeout=90)
        assert out.returncode == 0, out.stderr
        assert "paid" in out.stdout
        mine = student.get(f"{BASE_URL}/api/consultations/mine").json()
        c = next(x for x in mine if x["id"] == h["id"])
        assert c["status"] == "paid" and c["amount"] == 99 and c["topic"] == "Career switch into SOC"
        assert "_id" not in c
        assert slot_free(slot) is False
        # paid slot cannot be held by another user
        assert hold(bot, slot).status_code == 409
        # student's next hold must not delete the paid booking
        hold(student, free_slots(info)[-6])
        assert any(x["id"] == h["id"] for x in student.get(f"{BASE_URL}/api/consultations/mine").json())
        # admin list
        al = admin.get(f"{BASE_URL}/api/admin/consultations").json()
        assert any(x["id"] == h["id"] and x["status"] == "paid" for x in al)
        assert student.get(f"{BASE_URL}/api/admin/consultations").status_code == 403
        # admin status changes
        for st in ["completed", "cancelled"]:
            r = admin.patch(f"{BASE_URL}/api/admin/consultations/{h['id']}", json={"status": st})
            assert r.status_code == 200
            assert next(x for x in admin.get(f"{BASE_URL}/api/admin/consultations").json() if x["id"] == h["id"])["status"] == st
        assert slot_free(slot) is True  # cancelled frees slot
        assert admin.patch(f"{BASE_URL}/api/admin/consultations/{h['id']}", json={"status": "pending"}).status_code == 422
        assert admin.patch(f"{BASE_URL}/api/admin/consultations/nope", json={"status": "paid"}).status_code == 404


# ---------- Batch seats ----------
class TestSeats:
    def test_seats_full_and_restore(self, admin):
        bs = admin.get(f"{BASE_URL}/api/admin/live-classes/batches").json()
        assert len(bs) == 4 and all({"start", "seats", "taken", "left"} <= set(b) for b in bs)
        b = bs[-1]
        try:
            r = admin.put(f"{BASE_URL}/api/admin/live-classes/batches", json={"start": b["start"], "seats": 3})
            assert r.status_code == 200
            assert next(x for x in r.json() if x["start"] == b["start"])["seats"] == 3
            pub = requests.get(f"{BASE_URL}/api/public/live-classes").json()
            pb = next(x for x in pub["batches"] if x["start"] == b["start"])
            assert pb["seats_left"] == 3 - b["taken"] and pb["seats"] == 3
            assert pub["whatsapp"] == "919381203090"
            admin.put(f"{BASE_URL}/api/admin/live-classes/batches", json={"start": b["start"], "seats": b["taken"]})
            pub = requests.get(f"{BASE_URL}/api/public/live-classes").json()
            assert next(x for x in pub["batches"] if x["start"] == b["start"])["seats_left"] == 0
            r = requests.post(f"{BASE_URL}/api/public/live-classes/enquiry", json={"kind": "batch", "session_at": b["start"], "name": "TEST full",
                              "email": f"test_full_{uuid.uuid4().hex[:6]}@example.com", "phone": "9876543210", "experience": "0-1 years IT"})
            assert r.status_code == 409 and "This batch is full" in r.json()["detail"]
            assert admin.put(f"{BASE_URL}/api/admin/live-classes/batches", json={"start": b["start"], "seats": -1}).status_code == 422
        finally:
            admin.put(f"{BASE_URL}/api/admin/live-classes/batches", json={"start": b["start"], "seats": 8})

    def test_enquiry_takes_seat(self, admin):
        b = admin.get(f"{BASE_URL}/api/admin/live-classes/batches").json()[-2]
        r = requests.post(f"{BASE_URL}/api/public/live-classes/enquiry", json={"kind": "batch", "session_at": b["start"], "name": "TEST seat",
                          "email": f"test_seat_{uuid.uuid4().hex[:6]}@example.com", "phone": "9876543210", "experience": "0-1 years IT"})
        assert r.status_code == 200
        b2 = next(x for x in admin.get(f"{BASE_URL}/api/admin/live-classes/batches").json() if x["start"] == b["start"])
        assert b2["taken"] == b["taken"] + 1 and b2["left"] == b["left"] - 1


# ---------- Settings ----------
class TestSettings:
    def test_settings_update_and_validation(self, admin):
        orig = admin.get(f"{BASE_URL}/api/admin/live-classes/settings").json()
        orig.pop("id", None)
        try:
            bad = {**orig, "consult_start": "20:00", "consult_end": "18:00"}
            assert admin.put(f"{BASE_URL}/api/admin/live-classes/settings", json=bad).status_code == 400
            assert admin.put(f"{BASE_URL}/api/admin/live-classes/settings", json={**orig, "consult_days": []}).status_code == 400
            assert admin.put(f"{BASE_URL}/api/admin/live-classes/settings", json={**orig, "consult_days": [9]}).status_code == 400
            assert admin.put(f"{BASE_URL}/api/admin/live-classes/settings", json={**orig, "whatsapp_number": "abc"}).status_code == 422
            new = {**orig, "default_seats": 5, "whatsapp_number": "911234567890", "consult_start": "18:00", "consult_end": "20:00", "consult_days": [2, 1, 1]}
            r = admin.put(f"{BASE_URL}/api/admin/live-classes/settings", json=new)
            assert r.status_code == 200
            d = r.json()
            assert d["default_seats"] == 5 and d["consult_days"] == [1, 2] and d["whatsapp_number"] == "911234567890"
            info = requests.get(f"{BASE_URL}/api/public/consultation").json()
            assert info["whatsapp"] == "911234567890"
            for day in info["days"]:
                assert datetime.fromisoformat(day["date"]).weekday() in (1, 2)
                for s in day["slots"]:
                    assert "18:00" <= datetime.fromisoformat(s["at"]).astimezone(IST).strftime("%H:%M") <= "19:30"
        finally:
            r = admin.put(f"{BASE_URL}/api/admin/live-classes/settings", json=orig)
            assert r.status_code == 200
