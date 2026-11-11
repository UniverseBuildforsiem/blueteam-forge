# Iteration 42 UI setup: fresh onboarded student with l1-l1 position 222 (not watched)
import uuid, requests
from test_video_progress import BASE
s = requests.Session()
tag = uuid.uuid4().hex[:8]
email = f"test_res42_{tag}@example.com"
s.post(f"{BASE}/api/auth/register", json={"name": "TEST_Res42", "email": email, "username": f"tr42{tag}", "password": "TestPass@123"}).raise_for_status()
s.post(f"{BASE}/api/auth/onboarding", json={"goal": "SOC L1"}).raise_for_status()
s.post(f"{BASE}/api/paths/soc-l1/lessons/l1-l1/video", json={"duration": 600, "segments": [], "position": 222}).raise_for_status()
print(email, s.get(f"{BASE}/api/paths/soc-l1").json().get("video_resume"))
