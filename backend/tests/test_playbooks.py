# Playbooks & runbooks: public list/detail, locking, challenge panel, run recording/verdict, instructor runs, manage CRUD validation
import os, uuid, requests, pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL") or open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0]
BASE = BASE.rstrip("/")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def instructor():
    return login("instructor@socprofessionals.academy", "Instructor@123")


@pytest.fixture(scope="module")
def student():
    s = requests.Session()
    tag = uuid.uuid4().hex[:8]
    s.post(f"{BASE}/api/auth/register", json={"name": "TEST_Pb", "email": f"test_pb_{tag}@example.com", "username": f"tpb{tag}", "password": "TestPass@123"}).raise_for_status()
    s.post(f"{BASE}/api/auth/onboarding", json={"goal": "SOC L1"}).raise_for_status()
    return s


def find_path(pb, target, first_choice=None):
    """DFS a path (list of steps) to a terminal of type target."""
    nodes = {n["id"]: n for n in pb["nodes"]}

    def dfs(nid, acc, depth=0):
        n = nodes[nid]
        if n["type"] in ("escalate", "close"):
            return acc + [{"node": nid, "answer": None}] if n["type"] == target else None
        if n["type"] == "action":
            return dfs(n["next"], acc + [{"node": nid, "answer": None}])
        order = range(len(n["answers"]))
        if depth == 0 and first_choice is not None:
            order = [first_choice]
        for i in order:
            r = dfs(n["answers"][i]["next"], acc + [{"node": nid, "answer": i}], depth + 1)
            if r:
                return r
        return None
    return dfs(pb["start"], [])


# Public list
def test_public_list_anon():
    r = requests.get(f"{BASE}/api/public/playbooks")
    assert r.status_code == 200
    d = r.json()
    ids = [p["id"] for p in d["playbooks"]]
    assert "pb-al-1" in ids and d["logged_in"] is False and isinstance(d["pending"], int)
    p = d["playbooks"][0]
    for k in ("severity", "mitre", "source", "question_count", "locked", "free"):
        assert k in p
    assert "nodes" not in p


# Detail locked for anon / student, unlocked for admin
def test_detail_locked_anon():
    d = requests.get(f"{BASE}/api/public/playbooks/pb-al-1").json()
    assert d["locked"] is True and "nodes" not in d and "report" not in d and d["preview"]["title"]
    assert d["triggers"]


def test_detail_free_unlocked_anon():
    lst = requests.get(f"{BASE}/api/public/playbooks").json()["playbooks"]
    free = [p for p in lst if p["free"]]
    assert free, "no free playbook ready"
    d = requests.get(f"{BASE}/api/public/playbooks/{free[0]['id']}").json()
    assert d["locked"] is False and d["nodes"] and d["report"]


def test_detail_admin_unlocked(admin):
    d = admin.get(f"{BASE}/api/public/playbooks/pb-al-1").json()
    assert d["locked"] is False and len(d["nodes"]) > 3


def test_detail_404():
    assert requests.get(f"{BASE}/api/public/playbooks/pb-nope").status_code == 404


def test_student_locked(student):
    d = student.get(f"{BASE}/api/public/playbooks/pb-al-1").json()
    assert d["locked"] is True and "nodes" not in d


# Challenge panel list
def test_challenge_playbooks(student):
    r = student.get(f"{BASE}/api/challenges/ch-bf-01/playbooks")
    assert r.status_code == 200
    lst = r.json()
    assert lst and all("Brute Force" in p["categories"] for p in lst)
    assert lst[0]["source"]["type"] == "siem"


# Run validation
def test_run_invalid_paths(student, admin):
    pb = admin.get(f"{BASE}/api/public/playbooks/pb-al-1").json()
    r = student.post(f"{BASE}/api/playbooks/pb-al-1/run", json={"path": [{"node": "zzz", "answer": 0}]})
    assert r.status_code == 400
    nodes = {n["id"]: n for n in pb["nodes"]}
    i = next(i for i, a in enumerate(nodes[pb["start"]]["answers"]) if nodes[a["next"]]["type"] not in ("escalate", "close"))
    r = student.post(f"{BASE}/api/playbooks/pb-al-1/run", json={"path": [{"node": pb["start"], "answer": i}]})
    assert r.status_code == 400 and "Finish" in r.json()["detail"]
    r = student.post(f"{BASE}/api/playbooks/pb-al-1/run", json={"path": []})
    assert r.status_code == 422


# Full flow: TP challenge, wrong path (close) -> hidden before submit, revealed after with wrong_step
def test_run_wrong_then_submit(student, admin):
    pb = admin.get(f"{BASE}/api/public/playbooks/pb-al-1").json()
    path = find_path(pb, "close")
    assert path
    r = student.post(f"{BASE}/api/playbooks/pb-al-1/run", json={"path": path, "challenge_id": "ch-bf-01"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["recorded"] and d["outcome"] == "close" and "result" not in d
    lst = student.get(f"{BASE}/api/challenges").json()
    c = next(x for x in (lst if isinstance(lst, list) else lst.get("challenges", [])) if x["id"] == "ch-bf-01")
    assert "verdict" not in c
    pr = c.get("playbook_run")
    assert pr is None or "correct" not in pr or pr.get("correct") is None, f"verdict leaked pre-submit: {pr}"
    me0 = student.get(f"{BASE}/api/auth/me").json()
    sub = student.post(f"{BASE}/api/challenges/ch-bf-01/submit", json={"verdict": "TP", "report": "TEST_ brute force from single IP many failed logons 4625"}).json()
    run = sub["playbook_run"]
    assert run["correct"] is False and run["expected_outcome"] == "escalate" and run["outcome"] == "close"
    assert run["wrong_step"] and run["wrong_step"]["title"]
    pytest.STUDENT_SUB_XP = (me0, sub)


def test_run_correct_after_submit_reveals(student, admin):
    pb = admin.get(f"{BASE}/api/public/playbooks/pb-al-1").json()
    path = find_path(pb, "escalate")
    r = student.post(f"{BASE}/api/playbooks/pb-al-1/run", json={"path": path, "challenge_id": "ch-bf-01"})
    d = r.json()
    # iter44: post-submit re-run is practice only; stored (first) run kept
    assert d["recorded"] is False and d["result"]["correct"] is False
    assert d["practice"]["correct"] is True and d["practice"]["wrong_step"] is None


def test_fp_challenge_close_correct(student, admin):
    lst = student.get(f"{BASE}/api/challenges/ch-mal-01/playbooks").json()
    pb = lst[0]
    path = find_path(pb, "close")
    r = student.post(f"{BASE}/api/playbooks/{pb['id']}/run", json={"path": path, "challenge_id": "ch-mal-01"})
    assert r.status_code == 200
    sub = student.post(f"{BASE}/api/challenges/ch-mal-01/submit", json={"verdict": "FP", "report": "TEST_ benign admin tool signed binary false positive"}).json()
    assert sub["playbook_run"]["correct"] is True and sub["playbook_run"]["expected_outcome"] == "close"


# Instructor runs
def test_instructor_runs(student, instructor):
    assert student.get(f"{BASE}/api/instructor/playbook-runs").status_code == 403
    r = instructor.get(f"{BASE}/api/instructor/playbook-runs")
    assert r.status_code == 200
    rows = [x for x in r.json() if x["user_name"] == "TEST_Pb"]
    assert rows and all("_id" not in x for x in rows)


# Manage: invalid trees rejected, custom playbook create -> public -> delete
def tree(close=True, empty_next=False):
    return {"title": "TEST_ Playbook custom", "severity": "Low", "summary": "TEST", "source": {"type": "custom", "id": "x", "title": "TEST"},
            "categories": ["Brute Force"], "mitre": ["T1110 Brute Force"], "triggers": ["t"], "labs": [], "start": "q1",
            "nodes": [{"id": "q1", "type": "question", "title": "Q1", "text": "q?", "answers": [{"label": "A", "next": "" if empty_next else "e1"}, {"label": "B", "next": "c1" if close else "e1"}]},
                      {"id": "e1", "type": "escalate", "title": "Esc", "text": ""}, {"id": "c1", "type": "close", "title": "Close", "text": ""}],
            "report": [{"section": "Summary", "prompt": "x"}]}


def test_manage_invalid(instructor):
    r = instructor.post(f"{BASE}/api/manage/playbooks", json=tree(close=False))
    assert r.status_code == 422 and "Decision tree problem" in r.json()["detail"]
    r = instructor.post(f"{BASE}/api/manage/playbooks", json=tree(empty_next=True))
    assert r.status_code == 422 and "Decision tree problem" in r.json()["detail"]


def test_manage_custom_crud(instructor, student):
    r = instructor.post(f"{BASE}/api/manage/playbooks", json=tree())
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    try:
        d = requests.get(f"{BASE}/api/public/playbooks/{pid}").json()
        assert d["title"] == "TEST_ Playbook custom"
        # challenge panel with custom (no 'order' field) must not 500
        r2 = student.get(f"{BASE}/api/challenges/ch-bf-01/playbooks")
        assert r2.status_code == 200, f"challenge playbooks with custom pb: {r2.status_code}"
        doc = {**tree(), "title": "TEST_ Playbook edited"}
        assert instructor.put(f"{BASE}/api/manage/playbooks/{pid}", json=doc).status_code == 200
        assert requests.get(f"{BASE}/api/public/playbooks/{pid}").json()["title"] == "TEST_ Playbook edited"
    finally:
        instructor.delete(f"{BASE}/api/manage/playbooks/{pid}")
    assert requests.get(f"{BASE}/api/public/playbooks/{pid}").status_code == 404


def test_student_manage_forbidden(student):
    assert student.get(f"{BASE}/api/manage/playbooks").status_code == 403
