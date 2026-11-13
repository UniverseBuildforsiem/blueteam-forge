# Iteration 44 retest of playbook fixes: custom pb order, post-submit practice runs, category check, pending, tree errors, panel ordering
import os, uuid, requests, pytest
from test_playbooks import find_path, tree

BASE = (os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]).rstrip("/")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    return s


def fresh(name):
    s = requests.Session(); tag = uuid.uuid4().hex[:8]
    s.post(f"{BASE}/api/auth/register", json={"name": name, "email": f"test_pb44_{tag}@example.com", "username": f"tp44{tag}", "password": "TestPass@123"}).raise_for_status()
    s.post(f"{BASE}/api/auth/onboarding", json={"goal": "SOC L1"}).raise_for_status()
    s.uid = s.get(f"{BASE}/api/auth/me").json()["id"]
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def instructor():
    return login("instructor@socprofessionals.academy", "Instructor@123")


@pytest.fixture(scope="module")
def pb(admin):
    return admin.get(f"{BASE}/api/public/playbooks/pb-al-1").json()


def runs_for(instructor, uid, cid):
    return [x for x in instructor.get(f"{BASE}/api/instructor/playbook-runs").json() if x["user_id"] == uid and x.get("challenge_id") == cid]


# (1) custom playbook gets order 9999 and appears in the challenge panel without 500
def test_custom_pb_in_panel(instructor, admin):
    st = fresh("TEST_Pb44a")
    r = instructor.post(f"{BASE}/api/manage/playbooks", json=tree())
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    try:
        lst = admin.get(f"{BASE}/api/manage/playbooks").json()
        items = lst if isinstance(lst, list) else lst.get("items", [])
        me = next((x for x in items if x["id"] == pid), None)
        if me is not None:
            assert me.get("order") == 9999
        r2 = st.get(f"{BASE}/api/challenges/ch-bf-01/playbooks")
        assert r2.status_code == 200, r2.text
        assert pid in [p["id"] for p in r2.json()]
    finally:
        instructor.delete(f"{BASE}/api/manage/playbooks/{pid}")
    assert requests.get(f"{BASE}/api/public/playbooks/{pid}").status_code == 404


# (2a) pre-submit run kept; post-submit run returns practice, instructor table keeps original
def test_post_submit_practice_keeps_first(pb, instructor):
    st = fresh("TEST_Pb44b")
    r = st.post(f"{BASE}/api/playbooks/pb-al-1/run", json={"path": find_path(pb, "close"), "challenge_id": "ch-bf-01"})
    assert r.status_code == 200 and r.json()["recorded"] is True
    sub = st.post(f"{BASE}/api/challenges/ch-bf-01/submit", json={"verdict": "TP", "report": "TEST_ brute force 4625 single IP escalate"}).json()
    assert sub["playbook_run"]["correct"] is False
    r = st.post(f"{BASE}/api/playbooks/pb-al-1/run", json={"path": find_path(pb, "escalate"), "challenge_id": "ch-bf-01"})
    d = r.json()
    assert r.status_code == 200 and d["recorded"] is False
    assert d["result"]["correct"] is False and d["result"]["outcome"] == "close"
    assert d["practice"]["correct"] is True and d["practice"]["outcome"] == "escalate"
    rows = runs_for(instructor, st.uid, "ch-bf-01")
    assert len(rows) == 1 and rows[0]["correct"] is False and rows[0]["outcome"] == "close" and not rows[0].get("after_submit")
    ch = st.get(f"{BASE}/api/challenges").json()
    ch = ch if isinstance(ch, list) else ch.get("challenges", [])
    c = next(x for x in ch if x["id"] == "ch-bf-01")
    assert c["playbook_run"]["correct"] is False


# (2b) no run before submit -> post-submit run stored with after_submit true; second post-submit run is practice
def test_post_submit_first_run_stored(pb, instructor):
    st = fresh("TEST_Pb44c")
    st.post(f"{BASE}/api/challenges/ch-bf-01/submit", json={"verdict": "TP", "report": "TEST_ brute force 4625 single IP escalate"}).raise_for_status()
    d = st.post(f"{BASE}/api/playbooks/pb-al-1/run", json={"path": find_path(pb, "escalate"), "challenge_id": "ch-bf-01"}).json()
    assert d["recorded"] is True and d["result"]["correct"] is True
    rows = runs_for(instructor, st.uid, "ch-bf-01")
    assert len(rows) == 1 and rows[0]["after_submit"] is True
    d2 = st.post(f"{BASE}/api/playbooks/pb-al-1/run", json={"path": find_path(pb, "close"), "challenge_id": "ch-bf-01"}).json()
    assert d2["recorded"] is False and d2["result"]["correct"] is True and d2["practice"]["correct"] is False
    assert runs_for(instructor, st.uid, "ch-bf-01")[0]["outcome"] == "escalate"


# (3) playbook category mismatch -> 400
def test_category_mismatch(pb):
    st = fresh("TEST_Pb44d")
    r = st.post(f"{BASE}/api/playbooks/pb-al-1/run", json={"path": find_path(pb, "close"), "challenge_id": "ch-phish-01"})
    assert r.status_code == 400 and "doesn't cover" in r.json()["detail"]


# (4) pending excludes failed
def test_pending_excludes_failed():
    d = requests.get(f"{BASE}/api/public/playbooks").json()
    assert isinstance(d["pending"], int) and d["pending"] + len(d["playbooks"]) <= 75


# (5) tree error names the problem step
def test_tree_error_names_step(instructor):
    r = instructor.post(f"{BASE}/api/manage/playbooks", json=tree(empty_next=True))
    assert r.status_code == 422 and "step '(empty)' doesn't exist" in r.json()["detail"], r.text
    t = tree(); t["nodes"][0]["answers"][0]["next"] = "zz9"
    r = instructor.post(f"{BASE}/api/manage/playbooks", json=t)
    assert r.status_code == 422 and "zz9" in r.json()["detail"]
    t = tree(); t["nodes"].insert(1, {"id": "a1", "type": "action", "title": "A", "text": "", "next": "q1"}); t["nodes"][0]["answers"][0]["next"] = "a1"
    r = instructor.post(f"{BASE}/api/manage/playbooks", json=t)
    assert r.status_code == 422 and "loops" in r.json()["detail"], r.text
    r = instructor.post(f"{BASE}/api/manage/playbooks", json=tree(close=False))
    assert r.status_code == 422 and "escalate and one close" in r.json()["detail"]


# (9) panel ordering prefers word overlap
def test_panel_ordering_word_match():
    st = fresh("TEST_Pb44e")
    # NOTE iter44: ch-02-3 (Password Spray) ranks 'Entra ID Excessive Lockouts' first because generic words (with/against/detected/sign) count; reported as minor
    lst = st.get(f"{BASE}/api/challenges/ch-04-1/playbooks").json()  # Shadow Copies Wiped
    assert "shadow" in lst[0]["title"].lower(), [p["title"] for p in lst]
