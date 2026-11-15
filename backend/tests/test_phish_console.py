# Phishing Simulator v2: public offer, types (deep content), case leak check, gating/grants, run engine, scoring, payment product
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
FREE = ["ph-email-1", "ph-spear-1", "ph-whaling-1"]


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


@pytest.fixture(scope="module")
def student_id(student):
    return student.get(f"{API}/auth/me").json().get("id") or student.get(f"{API}/auth/me").json()["user"]["id"]


def fresh_run(s, cid):
    r = s.post(f"{API}/phish/cases/{cid}/run")
    assert r.status_code == 200, r.text
    run = r.json()
    if run["hints"] or run["actions"]:
        run = s.post(f"{API}/phish/runs/{run['id']}/restart").json()
    return run


# Public offer
def test_public_phish():
    d = requests.get(f"{API}/public/phish").json()
    assert d["price"] == 199 and len(d["groups"]) == 4 and d["total_cases"] >= 28 and d["free_count"] == 3
    assert len(d["types"]) == 14
    for t in d["types"]:
        assert t["group"] and t["channel"] and t["case_count"] >= 2


# Types deep content
def test_types_deep(student):
    d = student.get(f"{API}/phish/types").json()
    assert d["paid"] is False and d["price"] == 199 and len(d["groups"]) == 4
    total = 0
    for t in d["types"]:
        assert t["group"] and t["channel"] and t["checklist"] and t["mistakes"]
        assert t["queries"] and all(q["kql"] and q["spl"] for q in t["queries"])
        total += len(t["cases"])
    assert total >= 28


# No answer leak
def test_case_no_leak(student):
    r = student.get(f"{API}/phish/cases/ph-email-1")
    assert r.status_code == 200
    c = r.json()
    for k in ("verdict", "iocs", "hints", "sandbox", "debrief"):
        assert k not in c, k
    assert all(isinstance(x, str) for x in c["red_flags"]) and all(isinstance(x, str) for x in c["response"])
    assert "correct" not in r.text
    assert c["mitre"] and c["artifacts"] and c["sla_minutes"] == 10 and c["playbook"] == "/sops/sop-phishing"
    h = c["headers"][0]
    print("HEADER KEYS", list(h.keys()))
    assert h


# Gating + admin grant
def test_gating(student, admin, student_id):
    for cid in FREE:
        assert student.get(f"{API}/phish/cases/{cid}").status_code == 200
    assert student.get(f"{API}/phish/cases/ph-spear-2").status_code == 403
    assert student.post(f"{API}/phish/cases/ph-spear-2/run").status_code == 403
    assert admin.get(f"{API}/phish/cases/ph-spear-2").status_code == 200
    try:
        r = admin.patch(f"{API}/admin/users/{student_id}/access", json={"phish": True})
        assert r.status_code == 200 and r.json()["access"]["phish"] is True
        assert student.get(f"{API}/phish/cases/ph-spear-2").status_code == 200
        assert student.get(f"{API}/phish/types").json()["paid"] is True
    finally:
        r = admin.patch(f"{API}/admin/users/{student_id}/access", json={"phish": False})
        assert r.json()["access"]["phish"] is False
    assert student.get(f"{API}/phish/cases/ph-spear-2").status_code == 403


# Run engine full flow
def test_run_flow(student):
    run = fresh_run(student, "ph-email-1")
    rid = run["id"]
    assert run["sla_minutes"] == 10 and run["max_score"] == 100 and run["next_hint_cost"] == 5
    # resume returns same run
    assert student.post(f"{API}/phish/cases/ph-email-1/run").json()["id"] == rid
    costs = []
    for exp in (95, 85, 70):
        s = student.post(f"{API}/phish/runs/{rid}/hint").json()
        costs.append(s["hints"][-1]["cost"])
        assert s["max_score"] == exp and s["hints"][-1]["text"]
    assert costs == [5, 10, 15]
    assert student.post(f"{API}/phish/runs/{rid}/hint").status_code == 400
    c = student.get(f"{API}/phish/cases/ph-email-1").json()
    a = student.post(f"{API}/phish/runs/{rid}/act", json={"index": 0})
    assert a.status_code == 200
    act = a.json()["actions"][-1]
    assert act["effect"] and isinstance(act["good"], bool)
    assert student.post(f"{API}/phish/runs/{rid}/act", json={"index": 0}).status_code == 409
    assert student.post(f"{API}/phish/runs/{rid}/act", json={"index": 19}).status_code == 422
    d = student.post(f"{API}/phish/runs/{rid}/detonate", json={"artifact": c["artifacts"][0]})
    assert d.status_code == 200
    dj = d.json()
    assert dj["simulated"] is True and dj["verdict"] in ("malicious", "clean") and "score" in dj and dj["behaviours"]
    d2 = student.post(f"{API}/phish/runs/{rid}/detonate", json={"artifact": c["artifacts"][0]}).json()
    assert d2["score"] == dj["score"]
    assert student.post(f"{API}/phish/runs/{rid}/detonate", json={"artifact": "https://evil.example/x"}).status_code == 422
    assert student.post(f"{API}/phish/runs/{rid}/event", json={"kind": "report", "text": "Reported"}).json()["ok"]
    assert student.post(f"{API}/phish/runs/{rid}/event", json={"kind": "bogus", "text": "x"}).status_code == 422
    body = {"verdict": "Phishing — malicious", "pins": [{"ref": "p0b1", "text": "line", "finding": 0, "note": "n"}],
            "iocs": ["micros0ft-securemail[.]com", "185.234.219[.]12"], "summary": "TEST_ summary of the incident for the run"}
    s = student.post(f"{API}/phish/runs/{rid}/submit", json=body)
    assert s.status_code == 200, s.text
    j = s.json()
    assert set(j["parts"]) == {"verdict", "evidence", "iocs", "response"} and j["parts"]["verdict"] == 30
    assert j["penalties"]["hints"] == 30 and j["penalties"]["sla"] == 0
    assert j["ioc_hits"] and j["findings"] and "pinned" in j["findings"][0] and "correct" in j["findings"][0]
    assert any(r["done"] for r in j["response"]) and j["timeline"] and j["playbook"] == "/sops/sop-phishing"
    assert j["score"] == max(0, sum(j["parts"].values()) - 30)
    assert student.post(f"{API}/phish/runs/{rid}/submit", json=body).status_code == 409
    nr = student.post(f"{API}/phish/runs/{rid}/restart").json()
    assert nr["id"] != rid and nr["hints"] == [] and nr["actions"] == [] and nr["max_score"] == 100


# Legit / spam scoring
@pytest.mark.parametrize("cid,verdict", [("ph-email-2", "Spam / marketing (harmless)"), ("ph-smishing-2", "Legitimate email / message"),
                                         ("ph-calendar-2", "Legitimate email / message")])
def test_benign_scoring(admin, cid, verdict):
    run = fresh_run(admin, cid)
    j = admin.post(f"{API}/phish/runs/{run['id']}/submit", json={"verdict": verdict, "pins": [], "iocs": [], "summary": "TEST_ benign verdict summary"}).json()
    assert j["verdict_ok"] is True and j["parts"]["verdict"] == 30 and j["parts"]["iocs"] == 20


# Payment product
def test_payment_product(student):
    r = student.post(f"{API}/payments/razorpay/order", json={"plan": "phish-sim"})
    print("ORDER", r.status_code, r.text[:200])
    assert "Invalid plan" not in r.text


# Regression: OSINT header analyzer + manage
def test_osint_and_manage(student, admin):
    raw = "Received: from a.test (a.test [192.0.2.1]) by mx.test\nFrom: x@a.test\nReturn-Path: <y@b.invalid>\nAuthentication-Results: mx; spf=fail; dkim=none; dmarc=fail"
    r = student.post(f"{API}/phish/osint/headers", json={"raw": raw})
    print("OSINT", r.status_code, r.text[:200])
    assert r.status_code == 200
    assert admin.get(f"{API}/phish/manage").status_code == 200
    assert student.get(f"{API}/phish/manage").status_code == 403
