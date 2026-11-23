# UI test setup: create TEST_ exams for bundle + strict-mode UI testing (prints ids)
import os, json, requests
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
s = requests.Session()
s.post(f"{BASE}/api/auth/login", json={"email": "admin@socprofessionals.academy", "password": "Admin@123"})
qs = s.get(f"{BASE}/api/admin/questions", params={"domain": "Incidents, Events & Logging"}).json()["questions"][:4]
out = {}
for key, title, kind, price in [("A", "TEST_ UI Strict Exam", "exam", 0), ("B", "TEST_ UI Paid Exam", "exam", 450), ("C", "TEST_ UI Strict Cert", "certification", 0)]:
    body = {"title": title, "kind": kind, "price": price, "duration_min": 30, "strict_mode": key == "C", "identity": "name",
            "selection": {"mode": "fixed", "ids": [q["qid"] for q in qs]}}
    e = s.post(f"{BASE}/api/admin/exams", json=body).json()
    s.post(f"{BASE}/api/admin/exams/{e['id']}/status", json={"status": "published"})
    out[key] = e["id"]
print(json.dumps(out))
