# Iteration 36 UI setup: create TEST_ path + fresh student (prints ids). Run with "cleanup" arg to remove them.
import os, sys, uuid, json, requests
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env"); load_dotenv("/app/backend/.env")
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
STATE = "/tmp/iter36.json"

if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
    st = json.load(open(STATE))
    p = mdb.paths.find_one({"id": st["path_id"]}, {"_id": 0})
    ctf_ids = [a["id"] for m in (p or {}).get("modules", []) for l in m["lessons"] for a in l.get("attachments", []) if a["type"] == "ctf"]
    for cid in ctf_ids + st.get("extra_ctfs", []):
        c = mdb.ctfs.find_one({"id": cid})
        if c and c.get("title", "") and c.get("created_by") == "admin@socprofessionals.academy":
            print("delete ctf", cid, c["title"], mdb.ctfs.delete_one({"id": cid}).deleted_count)
            mdb.ctf_solves.delete_many({"ctf_id": cid}); mdb.ctf_hints.delete_many({"ctf_id": cid})
    print("delete path", mdb.paths.delete_one({"id": st["path_id"], "title": {"$regex": "^TEST_"}}).deleted_count)
    print("delete user", mdb.users.delete_one({"id": st["user_id"], "email": {"$regex": "^test_"}}).deleted_count)
    sys.exit()

a = requests.Session(); a.post(f"{API}/auth/login", json={"email": "admin@socprofessionals.academy", "password": "Admin@123"})
pid = "test-intel-" + uuid.uuid4().hex[:6]
r = a.post(f"{API}/manage/paths", json={"id": pid, "title": "TEST_Intel CTF Path", "description": "TEST path for intel ctf", "level": "Beginner", "category": "Analyst", "order": 99, "published": True,
                                        "modules": [{"id": "m-t1", "title": "TEST module", "lessons": [{"id": "l-t1", "title": "IP reputation and Tor exits", "content": "Investigate IPs with threat intel.", "minutes": 10, "attachments": [{"type": "quiz", "id": "q-phish", "title": "TEST quiz link"}]}]}]})
print(r.status_code, r.text[:200])
u = uuid.uuid4().hex[:8]
s = requests.Session()
r = s.post(f"{API}/auth/register", json={"name": "TEST Student", "email": f"test_{u}@example.com", "username": f"test_{u}", "password": "TestPass123"})
print(r.status_code)
json.dump({"path_id": pid, "user_id": r.json()["id"], "email": f"test_{u}@example.com"}, open(STATE, "w"))
print(open(STATE).read())
