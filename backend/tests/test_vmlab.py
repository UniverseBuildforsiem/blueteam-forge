# VM Lab (SOCP Sentinel VMDR simulator) backend regression tests
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api/vmlab"
LAB = "vm-lab-agent-win-cli"
CID = "7a1c2e9b-4d3f-4b8a-9c11-5e2f6a7b8c90"
AID = "3f9e8d7c-6b5a-4c3d-8e1f-0a9b8c7d6e5f"
URI = "https://agent.socp-vmdr.test/CloudAgent/"
AGENT = "c0ffee00-1ab5-4e2d-9f00-00000000a11e"


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    return s


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def student_id(student):
    return student.get(f"{BASE_URL}/api/auth/me").json().get("id") or student.get(f"{BASE_URL}/api/auth/me").json()["user"]["id"]


def ex(s, c):
    r = s.post(f"{API}/labs/{LAB}/exec", json={"command": c})
    assert r.status_code == 200, r.text
    return r.json()


# Hub
class TestHub:
    @pytest.mark.skip(reason='Lab 3 (Windows CLI) is now paid; covered by test_vm_cloud_agent_labs.py')
    def test_student_hub(self, student):
        d = student.get(API).json()
        assert d["access"] is False and d["price"] == 999
        assert len(d["modules"]) == 4
        m1 = {i["id"]: i for i in d["modules"][0]["items"]}
        assert m1[LAB]["free"] and not m1[LAB]["locked"]
        assert m1["vm-quiz-agent-basics"]["locked"] and m1["vm-ctf-agent-logs"]["locked"]
        assert all(not m["items"] for m in d["modules"][1:])
        assert "tasks" not in m1[LAB] and "questions" not in m1["vm-quiz-agent-basics"]

    def test_gating(self, student, admin):
        assert student.get(f"{API}/quizzes/vm-quiz-agent-basics").status_code == 403
        assert student.get(f"{API}/ctf/vm-ctf-agent-logs").status_code == 403
        r = admin.get(f"{API}/quizzes/vm-quiz-agent-basics")
        assert r.status_code == 200
        assert all("answer" not in q for q in r.json()["questions"])
        c = admin.get(f"{API}/ctf/vm-ctf-agent-logs").json()
        assert all(ch["answer"] is None or ch["solved"] for ch in c["challenges"])

    def test_grant_access(self, student, admin, student_id):
        r = admin.patch(f"{BASE_URL}/api/admin/users/{student_id}/access", json={"vmlab": True})
        assert r.status_code == 200, r.text
        try:
            assert student.get(API).json()["access"] is True
            assert student.get(f"{API}/quizzes/vm-quiz-agent-basics").status_code == 200
        finally:
            admin.patch(f"{BASE_URL}/api/admin/users/{student_id}/access", json={"vmlab": False})
        assert student.get(API).json()["access"] is False


# Terminal / lab flow
class TestLabFlow:
    @pytest.mark.skip(reason='Lab 3 (Windows CLI) is now paid; covered by test_vm_cloud_agent_labs.py')
    def test_errors(self, student):
        student.post(f"{API}/labs/{LAB}/reset")
        assert "not recognized" in ex(student, "foobar")["output"] and "help" in ex(student, "foobar")["output"]
        assert "1060" in ex(student, "sc query SOCPCloudAgent")["output"]
        o = ex(student, f"SOCPCloudAgent.exe CustomerId={{{CID}}}")["output"]
        assert "cd there" in o or "Tip" in o  # wrong folder
        ex(student, "cd Downloads")
        assert "1639" in ex(student, f"SOCPCloudAgent.exe CustomerId={{{CID}}}")["output"]
        o = ex(student, f"SOCPCloudAgent.exe CustomerId={{{CID}}} ActivationId={{11111111-2222-4333-8444-555555555555}} WebServiceUri={URI}")["output"]
        assert "0x80070005" in o
        assert "unbalanced" in ex(student, 'type "abc')["output"]

    @pytest.mark.skip(reason='Lab 3 (Windows CLI) is now paid; covered by test_vm_cloud_agent_labs.py')

    def test_full_flow(self, student):
        student.post(f"{API}/labs/{LAB}/reset")
        ex(student, "cd Downloads")
        assert ex(student, "dir")["new"] == ["t1"]
        r = student.post(f"{API}/labs/{LAB}/event", json={"event": "console.activation_key_viewed", "data": {"name": "Windows Servers"}}).json()
        assert r["new"] == ["t2"]
        assert ex(student, "certutil -hashfile SOCPCloudAgent.exe SHA256")["new"] == ["t3"]
        assert ex(student, f"SOCPCloudAgent.exe CustomerId={{{CID}}} ActivationId={{{AID}}} WebServiceUri={URI}")["new"] == ["t4"]
        assert ex(student, "sc query SOCPCloudAgent")["new"] == ["t5"]
        d = ex(student, r'type "C:\ProgramData\SOCP\CloudAgent\Log.txt"')
        assert d["new"] == ["t6"] and AGENT in d["output"]
        bad = student.post(f"{API}/labs/{LAB}/answer", json={"task_id": "t7", "answer": "nope"}).json()
        assert bad["correct"] is False
        assert student.post(f"{API}/labs/{LAB}/answer", json={"task_id": "t7", "answer": AGENT}).json()["new"] == ["t7"]
        assert student.post(f"{API}/labs/{LAB}/event", json={"event": "console.agent_viewed", "data": {"host": "SRV-101"}}).json()["new"] == []
        r = student.post(f"{API}/labs/{LAB}/event", json={"event": "console.agent_viewed", "data": {"host": "WIN-LAB-01"}}).json()
        assert r["new"] == ["t8"] and r["lab"]["completed_at"] and r["lab"]["score"] == 100
        assert any(b["id"] == "first-lab" for b in student.get(API).json()["badges"])
        # persistence
        lab = student.get(f"{API}/labs/{LAB}").json()
        assert len(lab["term"]) >= 6 and lab["state"]["installed"]

    def test_unknown_event(self, student):
        assert student.post(f"{API}/labs/{LAB}/event", json={"event": "evil", "data": {}}).status_code == 422

    @pytest.mark.skip(reason='Lab 3 (Windows CLI) is now paid; covered by test_vm_cloud_agent_labs.py')

    def test_hint_solution_reset(self, student):
        student.post(f"{API}/labs/{LAB}/reset")
        ex(student, "cd Downloads"); ex(student, "dir")
        assert student.get(f"{API}/labs/{LAB}").json()["score"] == 12
        h = student.post(f"{API}/labs/{LAB}/hint/t2").json()
        assert h["score"] == 7 and next(t for t in h["tasks"] if t["id"] == "t2")["hint"]
        s = student.post(f"{API}/labs/{LAB}/solution/t3").json()
        assert s["score"] == 0 or s["score"] == max(0, 8 - 10)
        assert next(t for t in s["tasks"] if t["id"] == "t3")["solution"]
        ex(student, "cls")
        assert student.get(f"{API}/labs/{LAB}").json()["term"] == []
        r = student.post(f"{API}/labs/{LAB}/reset").json()
        assert r["score"] == 0 and r["term"] == [] and not any(t["done"] for t in r["tasks"]) and r["state"]["console"] == {}


# Admin CRUD + settings + payments
class TestAdmin:
    def test_student_forbidden(self, student):
        assert student.get(f"{API}/admin/items").status_code == 403

    def test_crud(self, admin, student):
        bad = admin.post(f"{API}/admin/items", json={"kind": "lab", "module": 2, "title": "TEST_lab empty", "status": "published"})
        assert bad.status_code == 422
        r = admin.post(f"{API}/admin/items", json={"kind": "quiz", "module": 2, "title": "TEST_quiz", "status": "published", "free": True,
                                                   "questions": [{"q": "1+1?", "options": ["1", "2", "3", "4"], "answer": 1}]})
        assert r.status_code == 200, r.text
        qid = r.json()["id"]
        lab = admin.post(f"{API}/admin/items", json={"kind": "lab", "module": 2, "title": "TEST_lab", "status": "published", "free": True,
                                                     "tasks": [{"id": "a1", "title": "Ans", "instruction": "x", "check": {"type": "answer", "answer": "42"}}]})
        assert lab.status_code == 200, lab.text
        lid = lab.json()["id"]
        try:
            m2 = student.get(API).json()["modules"][1]["items"]
            assert {qid, lid} <= {i["id"] for i in m2}
            assert student.post(f"{API}/quizzes/{qid}/submit", json={"answers": [1]}).json()["score"] == 100
            assert student.post(f"{API}/labs/{lid}/answer", json={"task_id": "a1", "answer": "42"}).json()["correct"]
            u = admin.put(f"{API}/admin/items/{qid}", json={"kind": "quiz", "module": 2, "title": "TEST_quiz edited", "status": "draft",
                                                           "questions": [{"q": "1+1?", "options": ["1", "2"], "answer": 1}]})
            assert u.status_code == 200 and u.json()["title"] == "TEST_quiz edited"
            assert student.get(f"{API}/quizzes/{qid}").status_code == 404
            assert admin.post(f"{API}/admin/items", json={"kind": "quiz", "module": 2, "title": "TEST_bad", "questions": [{"q": "a", "options": ["1", "2"], "answer": 3}]}).status_code == 422
        finally:
            admin.delete(f"{API}/admin/items/{qid}")
            admin.delete(f"{API}/admin/items/{lid}")
        assert admin.get(f"{API}/quizzes/{qid}").status_code == 404

    def test_payment_and_price(self, admin, student):
        orig = admin.get(f"{API}/admin/items").json()["settings"]
        r = student.post(f"{BASE_URL}/api/payments/razorpay/order", json={"plan": "vm-lab"})
        print("order", r.status_code, r.text[:200])
        assert "Invalid plan" not in r.text
        try:
            admin.put(f"{API}/admin/settings", json={"price": 0, "course_ids": orig.get("course_ids", [])})
            r = student.post(f"{BASE_URL}/api/payments/razorpay/order", json={"plan": "vm-lab"})
            assert r.status_code == 400 and "isn't for sale" in r.text
        finally:
            admin.put(f"{API}/admin/settings", json={"price": orig["price"], "course_ids": orig.get("course_ids", [])})
        assert student.get(API).json()["price"] == orig["price"]
