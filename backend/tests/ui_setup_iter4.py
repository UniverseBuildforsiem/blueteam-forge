# Setup/teardown helper for iteration-4 UI tests: python ui_setup_iter4.py setup|teardown
import os, sys, requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
mc = MongoClient("mongodb://localhost:27017")["test_database"]
EMAIL, UN = "test_ui4@example.com", "tui4user"

if sys.argv[1] == "setup":
    s = requests.Session()
    print(s.post(f"{BASE}/api/auth/register", json={"name": "TEST UiFour", "email": EMAIL, "username": UN, "password": "Passw0rd!x"}).status_code)
    s.post(f"{BASE}/api/auth/onboarding", json={"goal": "SOC L1"})
    u = mc.users.find_one({"email": EMAIL})
    y2 = (datetime.now(timezone.utc).date() - timedelta(days=2)).isoformat()
    mc.users.update_one({"id": u["id"]}, {"$set": {"xp": 250, "streak_freezes": 1}})
    mc.drill_submissions.insert_one({"user_id": u["id"], "date": y2, "auto_score": 80, "xp": 10, "created_at": datetime.now(timezone.utc).isoformat()})
    mc.challenge_submissions.insert_one({"user_id": u["id"], "challenge_id": "x-test", "category": "Phishing", "verdict_correct": True})
    mc.certificates.insert_one({"id": "TEST-UI4-CERT", "user_id": u["id"], "name": "TEST UiFour", "path_id": "soc-l1", "path_title": "SOC L1 Analyst",
                                "score": 88, "issued_at": datetime.now(timezone.utc).isoformat(), "status": "valid"})
    print("ok", u["id"])
else:
    u = mc.users.find_one({"email": EMAIL})
    if u:
        for col in ("drill_submissions", "drill_freezes", "activity", "challenge_submissions", "certificates"):
            mc[col].delete_many({"user_id": u["id"]})
        mc.users.delete_one({"id": u["id"]})
    mc.users.update_one({"email": "student@socprofessionals.academy"}, {"$set": {"public_profile": True}})
    print("cleaned")
