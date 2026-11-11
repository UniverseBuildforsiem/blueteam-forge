# Iteration 41 UI setup: fresh onboarded student with l1-l1 position 222 then marked watched in mongo
import uuid, requests
from pathlib import Path
from pymongo import MongoClient
from test_video_progress import BASE

env = dict(l.split("=", 1) for l in Path("/app/backend/.env").read_text().splitlines() if "=" in l)
mdb = MongoClient(env["MONGO_URL"].strip('"'))[env["DB_NAME"].strip('"')]
s = requests.Session()
tag = uuid.uuid4().hex[:8]
email = f"test_resw_{tag}@example.com"
s.post(f"{BASE}/api/auth/register", json={"name": "TEST_ResW", "email": email, "username": f"trw{tag}", "password": "TestPass@123"}).raise_for_status()
s.post(f"{BASE}/api/auth/onboarding", json={"goal": "SOC L1"}).raise_for_status()
uid = s.get(f"{BASE}/api/auth/me").json()["id"]
s.post(f"{BASE}/api/paths/soc-l1/lessons/l1-l1/video", json={"duration": 600, "segments": [], "position": 222}).raise_for_status()
mdb.video_progress.update_one({"user_id": uid, "lesson_id": "l1-l1"}, {"$set": {"watched": True, "percent": 100}})
print(email)
