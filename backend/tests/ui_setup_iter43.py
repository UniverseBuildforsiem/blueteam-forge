# Iteration 43 UI setup: fresh onboarded student for playbook UI tests
import uuid, requests
BASE = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split()[0].rstrip("/")
s = requests.Session(); tag = uuid.uuid4().hex[:8]
email = f"test_pbui_{tag}@example.com"
s.post(f"{BASE}/api/auth/register", json={"name": "TEST_PbUI", "email": email, "username": f"tpbu{tag}", "password": "TestPass@123"}).raise_for_status()
s.post(f"{BASE}/api/auth/onboarding", json={"goal": "SOC L1"}).raise_for_status()
print(email)
