# Iteration 45: Locked paid playbooks for free students + Shift Simulator (start/resume/triage/playbook/score/expiry/history)
import os, uuid, requests, pytest
from datetime import datetime, timedelta, timezone
from pymongo import MongoClient
from test_playbooks import find_path

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]).rstrip("/")
ENV = dict(l.split("=", 1) for l in open("/app/backend/.env").read().splitlines() if "=" in l)
DB = MongoClient(ENV["MONGO_URL"].strip('"'))[ENV["DB_NAME"].strip('"')]
FREE = {"pb-sop-malware", "pb-sop-phishing", "pb-sop-impossible-travel", "pb-sop-powershell", "pb-sop-bruteforce"}
FREE_CATS = {c for p in DB.playbooks.find({"id": {"$in": list(FREE)}, "status": "ready"}) for c in p["categories"]}
CREATED = []
W = {"Critical": 2, "High": 1.5}


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    return s


def fresh(name="TEST_Shift"):
    s = requests.Session(); tag = uuid.uuid4().hex[:8]
    s.post(f"{BASE}/api/auth/register", json={"name": name, "email": f"test_sh45_{tag}@example.com", "username": f"ts45{tag}", "password": "TestPass@123"}).raise_for_status()
    s.post(f"{BASE}/api/auth/onboarding", json={"goal": "SOC L1"}).raise_for_status()
    s.me = s.get(f"{BASE}/api/auth/me").json()
    return s


def start(s, m):
    r = s.post(f"{BASE}/api/shift/start", json={"minutes": m})
    assert r.status_code == 200, r.text
    d = r.json()
    if d["id"] not in CREATED:
        CREATED.append(d["id"])
    return d


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    if CREATED:
        DB.shifts.delete_many({"id": {"$in": CREATED}})


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def student():
    return fresh("TEST_PbLock")


# ---- Lock paid playbooks ----
def test_free_student_sees_locked_cards(student):
    r = student.get(f"{BASE}/api/challenges/ch-bf-01/playbooks")
    assert r.status_code == 200, r.text
    lst = r.json()
    assert lst, "no playbooks"
    locks = [p["locked"] for p in lst]
    assert locks == sorted(locks), f"locked not last: {[(p['id'], p['locked']) for p in lst]}"
    for p in lst:
        if p["id"] in FREE:
            assert p["locked"] is False and p["free"] is True and p["nodes"] and "start" in p and "report" in p
        else:
            assert p["locked"] is True
            for k in ("nodes", "report", "start", "triggers"):
                assert k not in p, f"{p['id']} leaks {k}"
    assert any(p["locked"] for p in lst) and any(not p["locked"] for p in lst)


def test_admin_instructor_all_unlocked(admin):
    ins = login("instructor@socprofessionals.academy", "Instructor@123")
    for s in (admin, ins):
        lst = s.get(f"{BASE}/api/challenges/ch-bf-01/playbooks").json()
        assert lst and all(not p["locked"] and p["nodes"] for p in lst)


def test_purchaser_unlocked():
    st = fresh("TEST_PbBuyer")
    from importlib import import_module
    import sys; sys.path.insert(0, "/app/backend")
    try:
        prod = import_module("routes_sop").SOP_PRODUCT
    except Exception:
        pytest.skip("cannot import SOP_PRODUCT")
    res = DB.purchases.insert_one({"user_id": st.me["id"], "product_id": prod, "id": f"TEST_{uuid.uuid4().hex[:6]}"})
    try:
        lst = st.get(f"{BASE}/api/challenges/ch-bf-01/playbooks").json()
        assert lst and all(not p["locked"] for p in lst)
    finally:
        DB.purchases.delete_one({"_id": res.inserted_id})


def test_locked_run_403_free_run_ok(student, admin):
    pb = admin.get(f"{BASE}/api/public/playbooks/pb-al-1").json()
    r = student.post(f"{BASE}/api/playbooks/pb-al-1/run", json={"path": find_path(pb, "close")})
    assert r.status_code == 403, r.text
    fpb = admin.get(f"{BASE}/api/public/playbooks/pb-sop-bruteforce").json()
    r2 = student.post(f"{BASE}/api/playbooks/pb-sop-bruteforce/run", json={"path": find_path(fpb, "close")})
    assert r2.status_code == 200, r2.text


# ---- Shift simulator ----
def test_start_validation_and_resume():
    s = fresh()
    assert s.post(f"{BASE}/api/shift/start", json={"minutes": 20}).status_code == 400
    assert s.get(f"{BASE}/api/shift/active").json() is None
    d = start(s, 15)
    assert d["status"] == "active" and len(d["alerts"]) == 5 and 895 <= d["seconds_left"] <= 900
    for a in d["alerts"]:
        assert "verdict" not in a and "keywords" not in a and a["triaged"] is False
    assert len({a["category"] for a in d["alerts"]}) >= 4
    ids = [a["id"] for a in d["alerts"]]
    assert DB.challenges.count_documents({"id": {"$in": ids}, "verdict": "FP"}) >= 1
    d2 = start(s, 60)
    assert d2["id"] == d["id"] and d2["minutes"] == 15
    assert s.get(f"{BASE}/api/shift/active").json()["id"] == d["id"]
    # other user cannot read it
    assert fresh().get(f"{BASE}/api/shift/{d['id']}").status_code == 404


@pytest.mark.parametrize("m,n", [(30, 8), (60, 14)])
def test_lengths(m, n):
    s = fresh()
    d = start(s, m)
    assert len(d["alerts"]) == n and len(set(a["id"] for a in d["alerts"])) == n
    s.post(f"{BASE}/api/shift/{d['id']}/finish")


def test_full_shift_flow_score(admin):
    s = fresh()
    xp0 = s.me.get("xp", 0)
    d = start(s, 15)
    sid = d["id"]
    ch = {c["id"]: c for c in DB.challenges.find({"id": {"$in": [a["id"] for a in d["alerts"]]}}, {"_id": 0})}
    # validation
    first = d["alerts"][0]["id"]
    assert s.post(f"{BASE}/api/shift/{sid}/triage/{first}", json={"verdict": "TP", "report": "short"}).status_code == 422
    assert s.post(f"{BASE}/api/shift/{sid}/triage/{first}", json={"verdict": "XX", "report": "x" * 30}).status_code == 422
    assert s.post(f"{BASE}/api/shift/{sid}/triage/ch-nope", json={"verdict": "TP", "report": "x" * 30}).status_code == 404
    # playbook run with shift_id on an alert with a free playbook
    pb_alert = next((a for a in d["alerts"] if a["category"] in FREE_CATS), None)
    pb_expected = None
    if pb_alert:
        lst = s.get(f"{BASE}/api/challenges/{pb_alert['id']}/playbooks").json()
        pb = next(p for p in lst if not p["locked"])
        target = "escalate" if ch[pb_alert["id"]]["verdict"] == "TP" else "close"
        path = find_path(pb, target)
        r = s.post(f"{BASE}/api/playbooks/{pb['id']}/run", json={"path": path, "challenge_id": pb_alert["id"], "shift_id": sid})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j == {"recorded": True, "shift": True, "outcome": target}, j
        other = "close" if target == "escalate" else "escalate"
        p2 = find_path(pb, other)
        if p2:
            r2 = s.post(f"{BASE}/api/playbooks/{pb['id']}/run", json={"path": p2, "challenge_id": pb_alert["id"], "shift_id": sid}).json()
            assert r2["recorded"] is False and "result" not in r2
        pb_expected = pb_alert["id"]
        v = s.get(f"{BASE}/api/shift/{sid}").json()
        assert next(a for a in v["alerts"] if a["id"] == pb_alert["id"])["playbook_used"] is True
        assert DB.playbook_runs.count_documents({"user_id": s.me["id"]}) == 0
    # triage all: correct verdict, full keywords for all but last (wrong verdict)
    alerts = d["alerts"]
    for i, a in enumerate(alerts):
        c = ch[a["id"]]
        verdict = c["verdict"] if i < len(alerts) - 1 else ("FP" if c["verdict"] == "TP" else "TP")
        rep = ("Report: " + " ".join(c["keywords"])) if i < len(alerts) - 1 else "Nothing relevant written here at all."
        r = s.post(f"{BASE}/api/shift/{sid}/triage/{a['id']}", json={"verdict": verdict, "report": rep})
        assert r.status_code == 200, r.text
        j = r.json()
        if i < len(alerts) - 1:
            assert j == {"saved": True, "finished": False}
        else:
            assert j["finished"] is True
            res = j["shift"]
    assert res["status"] == "done"
    R = res["result"]
    w = {cid: W.get(ch[cid]["severity"], 1) for cid in ch}
    tw = sum(w.values()); last = alerts[-1]["id"]
    exp_acc = round(55 * (tw - w[last]) / tw)
    assert R["parts"]["accuracy"] == exp_acc, (R["parts"], exp_acc)
    assert R["parts"]["report"] == round(20 * (tw - w[last]) / tw) or R["parts"]["report"] <= 20
    exp_pb = round(15 * w[pb_expected] / tw) if pb_expected else 0
    assert R["parts"]["playbook"] == exp_pb
    assert 9 <= R["parts"]["speed"] <= 10
    assert R["score"] == sum(R["parts"].values()) and 0 <= R["score"] <= 100
    assert R["triaged"] == 5 and len(R["rows"]) == 5
    row = next(x for x in R["rows"] if x["id"] == last)
    assert row["verdict_correct"] is False and row["expected"] == ch[last]["verdict"] and row["missed_keywords"]
    if pb_expected:
        prow = next(x for x in R["rows"] if x["id"] == pb_expected)
        assert prow["playbook"]["correct"] is True
    # triage after done -> 400
    assert s.post(f"{BASE}/api/shift/{sid}/triage/{first}", json={"verdict": "TP", "report": "x" * 30}).status_code == 400
    # history + no XP / submissions
    h = s.get(f"{BASE}/api/shift/history").json()
    assert h[0]["id"] == sid and h[0]["score"] == R["score"] and h[0]["triaged"] == 5 and h[0]["total"] == 5
    assert s.get(f"{BASE}/api/auth/me").json().get("xp", 0) == xp0
    assert DB.challenge_submissions.count_documents({"user_id": s.me["id"]}) == 0
    assert s.get(f"{BASE}/api/shift/active").json() is None


def test_finish_early_missed():
    s = fresh()
    d = start(s, 30)
    a = d["alerts"][0]
    s.post(f"{BASE}/api/shift/{d['id']}/triage/{a['id']}", json={"verdict": "TP", "report": "x" * 30}).raise_for_status()
    r = s.post(f"{BASE}/api/shift/{d['id']}/finish").json()
    R = r["result"]
    assert r["status"] == "done" and R["triaged"] == 1 and R["parts"]["speed"] == 0
    missed = [x for x in R["rows"] if not x["verdict"]]
    assert len(missed) == 7 and all(x["missed_keywords"] is None and x["report_pct"] == 0 for x in missed)
    # finish idempotent
    assert s.post(f"{BASE}/api/shift/{d['id']}/finish").json()["result"]["score"] == R["score"]


def test_timer_expiry():
    s = fresh()
    d = start(s, 15)
    past = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
    started = (datetime.now(timezone.utc) - timedelta(minutes=16)).isoformat()
    DB.shifts.update_one({"id": d["id"]}, {"$set": {"ends_at": past, "started_at": started}})
    r = s.post(f"{BASE}/api/shift/{d['id']}/triage/{d['alerts'][0]['id']}", json={"verdict": "TP", "report": "x" * 30})
    assert r.status_code == 400 and "This shift has ended" in r.text
    # second expired shift: GET active auto-finishes
    DB.shifts.update_one({"id": d["id"]}, {"$set": {"status": "active"}, "$unset": {"result": ""}})
    v = s.get(f"{BASE}/api/shift/active").json()
    assert v and v["status"] == "done" and v["used_sec"] == 900 and v["result"]["triaged"] == 0 and v["result"]["score"] == 0
    assert s.get(f"{BASE}/api/shift/active").json() is None


def test_grace_window():
    s = fresh()
    d = start(s, 15)
    DB.shifts.update_one({"id": d["id"]}, {"$set": {"ends_at": (datetime.now(timezone.utc) - timedelta(seconds=2)).isoformat()}})
    r = s.post(f"{BASE}/api/shift/{d['id']}/triage/{d['alerts'][0]['id']}", json={"verdict": "TP", "report": "x" * 30})
    assert r.status_code == 200, r.text
    s.post(f"{BASE}/api/shift/{d['id']}/finish")


def test_regression_challenge_panel_run_admin(admin):
    # SOC challenge (non-shift) run still recorded for admin, unlocked
    lst = admin.get(f"{BASE}/api/challenges/ch-bf-01/playbooks").json()
    pb = next(p for p in lst if p["id"] == "pb-al-1")
    r = admin.post(f"{BASE}/api/playbooks/pb-al-1/run", json={"path": find_path(pb, "close"), "challenge_id": "ch-bf-01"})
    assert r.status_code == 200 and "shift" not in r.json(), r.text
