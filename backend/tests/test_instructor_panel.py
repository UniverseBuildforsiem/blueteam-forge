# Instructor panel: catalog courses CRUD, grading (challenges + labs), monitoring (at-risk, detail, CSV), RBAC
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text[:200]}")
    return s


@pytest.fixture(scope="module")
def inst():
    return login("instructor@socprofessionals.academy", "Instructor@123")


@pytest.fixture(scope="module")
def adm():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def stu():
    return login("student@socprofessionals.academy", "Student@123")


@pytest.fixture(scope="module")
def stu_id(stu):
    return stu.get(f"{API}/auth/me").json()["id"]


COURSE = {"title": "TEST_ Instructor Course", "type": "Videos", "price": 499, "mrp": 1999, "image": "",
          "url": "https://www.socprofessionals.com/courses/test", "videos": 5, "tests": 2, "files": 1,
          "tags": ["New", " Free "], "order": 1, "active": True}


# --- RBAC
class TestRBAC:
    @pytest.mark.parametrize("path", ["/instructor/courses", "/instructor/at-risk", "/instructor/students.csv", "/instructor/submissions"])
    def test_student_forbidden(self, stu, path):
        assert stu.get(f"{API}{path}").status_code == 403

    def test_student_cannot_create_course(self, stu):
        assert stu.post(f"{API}/instructor/courses", json=COURSE).status_code == 403

    def test_student_cannot_grade(self, stu):
        assert stu.post(f"{API}/instructor/submissions/x/grade", json={"grade": 50}).status_code == 403

    def test_unauth(self):
        assert requests.get(f"{API}/instructor/courses").status_code == 401

    def test_admin_allowed(self, adm):
        assert adm.get(f"{API}/instructor/courses").status_code == 200


# --- Catalog courses CRUD
class TestCourses:
    def test_list_editable_flags(self, inst):
        r = inst.get(f"{API}/instructor/courses")
        assert r.status_code == 200
        cs = r.json()
        assert len(cs) > 0
        for c in cs:
            assert "_id" not in c
            assert c["editable"] == (c.get("source") == "instructor")
        assert any(c["id"] == 803635 and c["editable"] is False for c in cs)

    def test_full_lifecycle(self, inst):
        r = inst.post(f"{API}/instructor/courses", json=COURSE)
        assert r.status_code == 200, r.text
        c = r.json()
        cid = c["id"]
        try:
            assert cid >= 9000001 and c["source"] == "instructor"
            assert c["content"] == {"videos": 5, "tests": 2, "files": 1}
            assert c["tags"] == ["New", "Free"]
            pub = requests.get(f"{API}/public/courses").json()
            pub = pub if isinstance(pub, list) else pub.get("courses", pub)
            assert any(p["id"] == cid for p in pub), "active course missing in public"
            # edit -> hide
            r = inst.put(f"{API}/instructor/courses/{cid}", json={**COURSE, "title": "TEST_ Edited", "active": False})
            assert r.status_code == 200 and r.json()["title"] == "TEST_ Edited" and r.json()["active"] is False
            pub = requests.get(f"{API}/public/courses").json()
            pub = pub if isinstance(pub, list) else pub.get("courses", pub)
            assert not any(p["id"] == cid for p in pub), "inactive course still public"
            lst = inst.get(f"{API}/instructor/courses").json()
            assert any(x["id"] == cid and x["title"] == "TEST_ Edited" for x in lst)
        finally:
            d = inst.delete(f"{API}/instructor/courses/{cid}")
            assert d.status_code == 200
        assert not any(x["id"] == cid for x in inst.get(f"{API}/instructor/courses").json())
        assert inst.delete(f"{API}/instructor/courses/{cid}").status_code == 404

    def test_mrp_floor(self, inst):
        r = inst.post(f"{API}/instructor/courses", json={**COURSE, "price": 3000, "mrp": 100, "active": False})
        assert r.status_code == 200
        assert r.json()["mrp"] == 3000
        inst.delete(f"{API}/instructor/courses/{r.json()['id']}")

    def test_synced_readonly(self, inst):
        assert inst.put(f"{API}/instructor/courses/803635", json=COURSE).status_code == 403
        assert inst.delete(f"{API}/instructor/courses/803635").status_code == 403

    @pytest.mark.parametrize("bad", [{"url": "ftp://x.com/abc"}, {"title": "ab"}, {"type": "Books"}, {"price": -1}, {"url": "javascript:alert(1)"}])
    def test_validation(self, inst, bad):
        assert inst.post(f"{API}/instructor/courses", json={**COURSE, **bad}).status_code == 422


# --- Grading
class TestGrading:
    def test_grade_challenge(self, inst, stu_id):
        d = inst.get(f"{API}/instructor/submissions").json()
        subs = [s for s in d["challenges"] if s["user_id"] == stu_id] or d["challenges"]
        assert subs, "no submissions"
        sid = subs[0]["id"]
        r = inst.post(f"{API}/instructor/submissions/{sid}/grade", json={"grade": 77, "feedback": "TEST_ good triage"})
        assert r.status_code == 200
        s = next(x for x in inst.get(f"{API}/instructor/submissions").json()["challenges"] if x["id"] == sid)
        assert s["instructor_grade"] == 77 and s["feedback"] == "TEST_ good triage" and s["status"] == "reviewed"

    def test_grade_challenge_404_422(self, inst):
        assert inst.post(f"{API}/instructor/submissions/nope/grade", json={"grade": 50}).status_code == 404
        assert inst.post(f"{API}/instructor/submissions/nope/grade", json={"grade": 101}).status_code == 422

    def test_grade_lab(self, inst, stu, stu_id):
        reps = [r for r in inst.get(f"{API}/instructor/submissions").json()["lab_reports"] if r["user_id"] == stu_id]
        assert reps, "no lab reports"
        lid = reps[0]["lab_id"]
        r = inst.post(f"{API}/instructor/lab-reports/{stu_id}/{lid}/grade", json={"grade": 88, "feedback": "TEST_ nice timeline"})
        assert r.status_code == 200
        lab = stu.get(f"{API}/labs/{lid}").json()
        assert lab["progress"]["instructor_grade"] == 88
        assert lab["progress"]["feedback"] == "TEST_ nice timeline"
        # review_status not exposed to students (minor)

    def test_grade_lab_404(self, inst, stu_id):
        assert inst.post(f"{API}/instructor/lab-reports/{stu_id}/no-lab/grade", json={"grade": 50}).status_code == 404


# --- Monitoring
class TestMonitoring:
    def test_at_risk(self, inst):
        r = inst.get(f"{API}/instructor/at-risk")
        assert r.status_code == 200
        for s in r.json():
            assert s["reasons"] and isinstance(s["reasons"], list)

    def test_student_detail(self, inst, stu_id):
        r = inst.get(f"{API}/instructor/students/{stu_id}")
        assert r.status_code == 200
        d = r.json()
        for k in ["student", "reasons", "labs", "challenges", "quizzes", "drills", "activity"]:
            assert k in d
        assert d["student"]["id"] == stu_id
        assert len(d["challenges"]) >= 1 and len(d["labs"]) >= 1

    def test_detail_404_for_non_student(self, inst):
        me = inst.get(f"{API}/auth/me").json()["id"]
        assert inst.get(f"{API}/instructor/students/{me}").status_code == 404
        assert inst.get(f"{API}/instructor/students/does-not-exist").status_code == 404

    def test_csv(self, inst):
        r = inst.get(f"{API}/instructor/students.csv")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/csv")
        lines = [l for l in r.text.strip().splitlines() if l]
        assert lines[0].startswith("name,email,username")
        n = len(inst.get(f"{API}/instructor/students").json())
        assert len(lines) - 1 == n
