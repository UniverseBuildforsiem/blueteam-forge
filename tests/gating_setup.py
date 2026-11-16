# Setup/teardown for course-tab gating UI test
import os, sys, json, requests
BASE = open('/app/frontend/.env').read().split('REACT_APP_BACKEND_URL=')[1].split()[0].rstrip('/') + '/api'
s = requests.Session()
r = s.post(f"{BASE}/auth/login", json={"email": "admin@socprofessionals.academy", "password": "Admin@123"}); r.raise_for_status()
if sys.argv[1] == "setup":
    qz = s.get(f"{BASE}/quizzes").json()
    sp = s.get(f"{BASE}/public/sops").json()["sops"]
    ct = s.get(f"{BASE}/ctf").json()
    q, so, c = qz[:2], [x for x in sp if not x.get("locked")][:2] or sp[:2], ct[:2]
    att = lambda i: [{"type": "quiz", "id": q[i]["id"], "title": q[i]["title"]}, {"type": "sop", "id": so[i]["id"], "title": so[i]["title"]}, {"type": "ctf", "id": c[i]["id"], "title": c[i]["title"]}]
    p1 = {"title": "TEST Gating Path", "description": "gating test", "level": "Beginner", "modules": [{"id": "m1", "title": "M1", "lessons": [
        {"id": "l1", "title": "Lesson One", "minutes": 5, "content": "x", "attachments": att(0)},
        {"id": "l2", "title": "Lesson Two", "minutes": 5, "content": "y", "attachments": att(1)}]}]}
    p2 = {"title": "TEST Siem Only Path", "description": "siem only", "level": "Beginner", "modules": [{"id": "m1", "title": "M1", "lessons": [
        {"id": "l1", "title": "Siem Lesson", "minutes": 5, "content": "z", "attachments": [{"type": "siem", "id": "siem", "title": "SIEM sim"}]}]}]}
    r1 = s.post(f"{BASE}/manage/paths", json=p1); r2 = s.post(f"{BASE}/manage/paths", json=p2)
    print(r1.status_code, r2.status_code, r1.text[:200])
    out = {"p1": r1.json()["id"], "p2": r2.json()["id"], "q": [x["id"] for x in q], "s": [x["id"] for x in so], "c": [x["id"] for x in c],
           "nq": len(qz), "nc": len(ct), "ctitles": [x["title"] for x in c], "ccat": [x["category"] for x in c]}
    json.dump(out, open('/tmp/gating.json', 'w')); print(json.dumps(out))
else:
    d = json.load(open('/tmp/gating.json'))
    for k in ("p1", "p2"):
        print(k, s.delete(f"{BASE}/manage/paths/{d[k]}").status_code)
