# Iteration 22 UI setup: create/delete a published path with required + practice quiz lessons and a bulk-quiz test path
import sys
import requests
from test_toolkit_graded_quiz import BASE, QS, CONTENT

s = requests.Session()
s.post(f"{BASE}/api/auth/login", json={"email": "admin@socprofessionals.academy", "password": "Admin@123"})
if sys.argv[1] == "create":
    g = s.post(f"{BASE}/api/manage/paths", json={"title": "TEST_UI Graded", "description": "t", "level": "Beginner", "published": True, "order": 99,
        "modules": [{"id": "m1", "title": "M1", "lessons": [
            {"id": "l-ui-graded", "title": "Graded lesson", "content": CONTENT, "quiz": {"required": True, "questions": QS}},
            {"id": "l-ui-practice", "title": "Practice lesson", "content": CONTENT, "quiz": {"questions": QS}}]}]}).json()
    b = s.post(f"{BASE}/api/manage/paths", json={"title": "TEST_UI Bulk", "description": "t", "level": "Beginner", "published": True, "order": 99,
        "modules": [{"id": "m1", "title": "M1", "lessons": [
            {"id": "l-bulk-1", "title": "Phishing headers", "content": CONTENT},
            {"id": "l-bulk-2", "title": "Already quizzed", "content": CONTENT, "quiz": {"questions": QS}},
            {"id": "l-bulk-3", "title": "Short one", "content": "too short"}]}]}).json()
    print(g["id"], b["id"])
else:
    for pid in sys.argv[2:]:
        print(pid, s.delete(f"{BASE}/api/manage/paths/{pid}").status_code)
