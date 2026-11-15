# Phishing simulator: types, cases, access gating, scoring, OSINT tools, manage (staff)
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
TYPE_IDS = ["email", "spear", "whaling", "bec", "smishing", "vishing", "quishing", "clone", "calendar", "aitm", "angler", "pharming", "eviltwin", "watering"]
STARTERS = [f"ph-{t}-1" for t in TYPE_IDS]
AI_DRAFT = "ph-ai-9ea4aebc"


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


def correct_payload(c):
    ok_flags = ["zero instead", "SPF fail", "Return-Path and Reply-To", "Generic greeting"]
    ok_resp = ["Block the sender domain", "Search all mailboxes", "Check proxy logs", "Reply to the user"]
    return {"verdict": "Phishing — malicious",
            "flags": [i for i, t in enumerate(c["red_flags"]) if any(k in t for k in ok_flags)],
            "response": [i for i, t in enumerate(c["response"]) if any(t.startswith(k) for k in ok_resp)],
            "iocs": ["micros0ft-securemail[.]com", "185.234.219[.]12", "mailer-svc.top", "hxxps://micros0ft-securemail[.]com/owa/keep?u=priya.n"]}


# --- Types & access gating
class TestTypesAndAccess:
    def test_types_student(self, student):
        r = student.get(f"{API}/phish/types")
        assert r.status_code == 200
        d = r.json()
        assert d["paid"] is False
        assert [t["id"] for t in d["types"]] == TYPE_IDS
        cards = {c["id"]: c for t in d["types"] for c in t["cases"]}
        for cid in ("ph-email-1", "ph-spear-1", "ph-whaling-1"):
            assert cards[cid]["locked"] is False and cards[cid]["free"] is True
        for cid in STARTERS[3:]:
            assert cards[cid]["locked"] is True
        for t in d["types"]:
            for k in ("how", "red_flags", "defenses", "example", "mitre"):
                assert t[k], f"{t['id']} missing {k}"

    def test_types_admin_paid(self, admin):
        d = admin.get(f"{API}/phish/types").json()
        assert d["paid"] is True
        assert all(not c["locked"] for t in d["types"] for c in t["cases"])

    def test_student_free_case_ok_paid_403(self, student):
        assert student.get(f"{API}/phish/cases/ph-email-1").status_code == 200
        r = student.get(f"{API}/phish/cases/ph-bec-1")
        assert r.status_code == 403
        assert student.post(f"{API}/phish/cases/ph-bec-1/submit", json={"verdict": "x"}).status_code == 403

    def test_case_public_shape_no_answers(self, student):
        c = student.get(f"{API}/phish/cases/ph-email-1").json()
        assert "verdict" not in c and "iocs" not in c and "debrief" not in c
        assert c["ioc_count"] == 4 and len(c["verdicts"]) == 3
        assert all(isinstance(x, str) for x in c["red_flags"])

    @pytest.mark.parametrize("cid", STARTERS)
    def test_admin_opens_all_starters(self, admin, cid):
        r = admin.get(f"{API}/phish/cases/{cid}")
        assert r.status_code == 200, r.text
        c = r.json()
        assert c["panels"] and c["red_flags"] and c["response"]

    def test_unknown_case_404(self, admin):
        assert admin.get(f"{API}/phish/cases/ph-nope").status_code == 404

    def test_unauth_401(self):
        assert requests.get(f"{API}/phish/types").status_code in (401, 403)


# --- Scoring
class TestScoring:
    def test_perfect_score_refanged(self, admin):
        c = admin.get(f"{API}/phish/cases/ph-email-1").json()
        r = admin.post(f"{API}/phish/cases/ph-email-1/submit", json=correct_payload(c))
        assert r.status_code == 200
        d = r.json()
        assert d["parts"] == {"verdict": 30, "red_flags": 30, "iocs": 20, "response": 20}, d["parts"]
        assert d["score"] == 100 and d["passed"] is True
        assert len(d["ioc_hits"]) == 4
        assert d["xp"] in (0, 40)
        # second pass gives no XP
        d2 = admin.post(f"{API}/phish/cases/ph-email-1/submit", json=correct_payload(c)).json()
        assert d2["xp"] == 0 and d2["score"] == 100

    def test_wrong_picks_penalise(self, admin):
        c = admin.get(f"{API}/phish/cases/ph-email-1").json()
        p = correct_payload(c)
        p["flags"] = list(range(len(c["red_flags"])))  # 4 right, 3 wrong -> (4-3)/4*30 = 8
        p["verdict"] = "Legitimate email / message"
        p["iocs"] = []
        p["response"] = []
        d = admin.post(f"{API}/phish/cases/ph-email-1/submit", json=p).json()
        assert d["parts"]["verdict"] == 0
        assert d["parts"]["red_flags"] == 8
        assert d["parts"]["iocs"] == 0 and d["parts"]["response"] == 0
        assert d["passed"] is False

    def test_single_domain_ioc_partial(self, admin):
        c = admin.get(f"{API}/phish/cases/ph-email-1").json()
        p = correct_payload(c)
        p["iocs"] = ["micros0ft-securemail.com"]
        d = admin.post(f"{API}/phish/cases/ph-email-1/submit", json=p).json()
        print("domain-only ioc hits:", d["ioc_hits"], d["parts"]["iocs"])
        # Only 1 of 4 IOCs given -> expect 5/20; report if prefix-match inflates
        assert d["parts"]["iocs"] == 5, f"one IOC counted as {len(d['ioc_hits'])}: {d['ioc_hits']}"

    def test_student_free_submit(self, student):
        c = student.get(f"{API}/phish/cases/ph-email-1").json()
        d = student.post(f"{API}/phish/cases/ph-email-1/submit", json={"verdict": c["verdicts"][2]}).json()
        assert d["passed"] is False and d["xp"] == 0
        last = student.get(f"{API}/phish/cases/ph-email-1").json()["last"]
        assert last and last["score"] == d["score"]


# --- OSINT tools
class TestOsint:
    HEADERS = ("Return-Path: <bounce@mailer-svc.top>\nReceived: from mailer-svc.top (unknown [185.234.219.12]) by mx.acme-corp.in with ESMTP; Mon, 13 Jan 2025 02:44:11 +0000\n"
               "Authentication-Results: mx.acme-corp.in; spf=fail smtp.mailfrom=mailer-svc.top; dkim=none; dmarc=fail header.from=micros0ft-securemail.com\n"
               "From: Microsoft 365 Admin <no-reply@micros0ft-securemail.com>\nReply-To: support@mailer-svc.top\nMessage-ID: <20250113024411.88@mailer-svc.top>\nSubject: Action required")

    def test_headers(self, student):
        r = student.post(f"{API}/phish/osint/headers", json={"raw": self.HEADERS})
        assert r.status_code == 200
        d = r.json()
        assert d["auth"] == {"spf": "fail", "dkim": "none", "dmarc": "fail"}
        w = " ".join(d["warnings"])
        assert "Reply-To" in w and "Return-Path" in w
        assert d["hops"][0]["ip"] == "185.234.219.12"
        assert "185.234.219.12" in d["iocs"]["ips"]
        assert "mailer-svc.top" in d["iocs"]["domains"]

    def test_expand_bitly(self, student):
        r = student.post(f"{API}/phish/osint/expand", json={"url": "http://bit.ly/3IndPst"}, timeout=60)
        assert r.status_code == 200
        d = r.json()
        print("expand chain:", d)
        assert d["hops"] >= 1 and d["chain"][0]["url"].startswith("http://bit.ly")

    @pytest.mark.parametrize("u", ["http://169.254.169.254/latest/meta-data", "http://127.0.0.1:8001/api", "http://localhost/", "http://10.0.0.1"])
    def test_expand_ssrf_blocked(self, student, u):
        d = student.post(f"{API}/phish/osint/expand", json={"url": u}, timeout=30).json()
        assert d["chain"][0].get("error"), d
        assert "status" not in d["chain"][0]

    def test_lookalike(self, student):
        r = student.post(f"{API}/phish/osint/lookalike", json={"domain": "paypal.com"}, timeout=90)
        assert r.status_code == 200
        d = r.json()
        assert d["domain"] == "paypal.com" and d["checked"] > 50
        assert len(d["registered"]) > 0
        assert all(x["domain"] != "paypal.com" for x in d["registered"])

    def test_qr_png(self):
        r = requests.get(f"{API}/phish/qr", params={"data": "https://example.com"})
        assert r.status_code == 200 and r.headers["content-type"] == "image/png"
        assert r.content[:4] == b"\x89PNG"

    def test_reputation_intel(self, student):
        r = student.post(f"{API}/intel/lookup", json={"ioc": "185.234.219.12"}, timeout=90)
        print("intel", r.status_code, r.text[:300])
        assert r.status_code in (200, 429)
        if r.status_code == 200:
            assert "verdict" in r.json()


# --- Manage (staff only)
class TestManage:
    def test_student_403(self, student):
        assert student.get(f"{API}/phish/manage").status_code == 403
        assert student.post(f"{API}/phish/manage/generate", json={"type": "email"}).status_code == 403
        assert student.post(f"{API}/phish/manage/{AI_DRAFT}/publish", json={"published": True}).status_code == 403
        assert student.delete(f"{API}/phish/manage/{AI_DRAFT}").status_code == 403

    def test_admin_list_has_draft(self, admin):
        r = admin.get(f"{API}/phish/manage")
        assert r.status_code == 200
        row = next((x for x in r.json() if x["id"] == AI_DRAFT), None)
        assert row and row["status"] == "ready" and row["type"] == "quishing"

    def test_generate_bad_type_422(self, admin):
        assert admin.post(f"{API}/phish/manage/generate", json={"type": "nope"}).status_code == 422
        assert admin.post(f"{API}/phish/manage/generate", json={"type": "email", "difficulty": "Insane"}).status_code == 422

    def test_publish_toggle_visibility(self, admin, student):
        rows = {x["id"]: x for x in admin.get(f"{API}/phish/manage").json()}
        orig = rows[AI_DRAFT]["published"]
        try:
            assert admin.post(f"{API}/phish/manage/{AI_DRAFT}/publish", json={"published": True}).status_code == 200
            sd = student.get(f"{API}/phish/types").json()
            q = next(t for t in sd["types"] if t["id"] == "quishing")
            card = next((c for c in q["cases"] if c["id"] == AI_DRAFT), None)
            assert card and card["locked"] is True and card["source"] == "ai"
            assert student.get(f"{API}/phish/cases/{AI_DRAFT}").status_code == 403
            ad = admin.get(f"{API}/phish/cases/{AI_DRAFT}")
            assert ad.status_code == 200
            assert admin.post(f"{API}/phish/manage/{AI_DRAFT}/publish", json={"published": False}).status_code == 200
            sd = student.get(f"{API}/phish/types").json()
            q = next(t for t in sd["types"] if t["id"] == "quishing")
            assert all(c["id"] != AI_DRAFT for c in q["cases"])
            assert student.get(f"{API}/phish/cases/{AI_DRAFT}").status_code == 404
            assert admin.get(f"{API}/phish/cases/{AI_DRAFT}").status_code == 200
        finally:
            admin.post(f"{API}/phish/manage/{AI_DRAFT}/publish", json={"published": orig})

    def test_publish_missing_404(self, admin):
        assert admin.post(f"{API}/phish/manage/ph-ai-missing/publish", json={"published": True}).status_code == 404
        assert admin.delete(f"{API}/phish/manage/ph-ai-missing").status_code == 404
