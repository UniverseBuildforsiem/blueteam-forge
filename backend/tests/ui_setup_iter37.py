# Iteration 37 UI setup: fresh onboarded student + TEST_ path whose lesson attaches ctf-web-1 (writeup popup check). "cleanup" arg removes them + TEST_ ctfs listed in state.
import os, sys, uuid, json, requests
from pymongo import MongoClient
from dotenv import load_dotenv
load_dotenv("/app/frontend/.env"); load_dotenv("/app/backend/.env")
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
mdb = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
STATE = "/tmp/iter37.json"

if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
    st = json.load(open(STATE))
    for cid in st.get("ctfs", []):
        print("ctf", cid, mdb.ctfs.delete_one({"id": cid, "title": {"$regex": "^TEST_"}}).deleted_count)
        mdb.ctf_solves.delete_many({"ctf_id": cid}); mdb.ctf_hints.delete_many({"ctf_id": cid})
    mdb.ctf_solves.delete_many({"user_id": st["user_id"]}); mdb.ctf_hints.delete_many({"user_id": st["user_id"]})
    print("path", mdb.paths.delete_one({"id": st["path_id"], "title": {"$regex": "^TEST_"}}).deleted_count)
    print("user", mdb.users.delete_one({"id": st["user_id"], "email": {"$regex": "^test_"}}).deleted_count)
    sys.exit()

a = requests.Session(); a.post(f"{API}/auth/login", json={"email": "admin@socprofessionals.academy", "password": "Admin@123"})
pid = "test-wu-" + uuid.uuid4().hex[:6]
r = a.post(f"{API}/manage/paths", json={"id": pid, "title": "TEST_Writeup Path", "description": "TEST", "level": "Beginner", "category": "Analyst", "order": 99, "published": True,
                                        "modules": [{"id": "m-t1", "title": "TEST module", "lessons": [{"id": "l-t1", "title": "SQLi basics", "content": "Spot SQL injection.", "minutes": 10, "attachments": [{"type": "ctf", "id": "ctf-web-1", "title": "Injected"}]}]}]})
print(r.status_code, r.text[:120])
u = uuid.uuid4().hex[:8]
r = requests.post(f"{API}/auth/register", json={"name": "TEST Student", "email": f"test_{u}@example.com", "username": f"test_{u}", "password": "TestPass123"})
uid = r.json()["id"]
mdb.users.update_one({"id": uid}, {"$set": {"onboarded": True}})
st = {"path_id": pid, "user_id": uid, "email": f"test_{u}@example.com", "ctfs": sys.argv[1:]}
json.dump(st, open(STATE, "w")); print(json.dumps(st))
