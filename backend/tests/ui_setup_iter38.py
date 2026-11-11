# UI setup/cleanup for iteration 38: TEST path for video field. usage: python ui_setup_iter38.py create|publish|delete|show
import os, sys, json, requests
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
PID = "TEST_video_ui_it38"
s = requests.Session()
s.post(f"{BASE}/api/auth/login", json={"email": "admin@socprofessionals.academy", "password": "Admin@123"}, timeout=20).raise_for_status()
cmd = sys.argv[1]
if cmd == "create":
    s.delete(f"{BASE}/api/manage/paths/{PID}")
    doc = {"id": PID, "title": "TEST_ Video UI Path", "level": "beginner", "description": "test", "published": False, "order": 999,
           "modules": [{"title": "M1", "lessons": [{"id": "l-it38", "title": "TEST video lesson", "content": "hello", "minutes": 5, "video_url": "", "resources": [], "attachments": []}]}]}
    print(s.post(f"{BASE}/api/manage/paths", json=doc).status_code)
elif cmd in ("publish", "show"):
    p = next(x for x in s.get(f"{BASE}/api/manage/paths").json() if x["id"] == PID)
    if cmd == "publish":
        p["published"] = True
        print(s.put(f"{BASE}/api/manage/paths/{PID}", json=p).status_code)
    print(json.dumps(p["modules"][0]["lessons"][0].get("video_url")))
elif cmd == "delete":
    print(s.delete(f"{BASE}/api/manage/paths/{PID}").status_code)
