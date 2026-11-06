# Google social login (Emergent auth) failure paths + email/password auth regression
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
CREDS = {
    "admin": ("admin@socprofessionals.academy", "Admin@123"),
    "instructor": ("instructor@socprofessionals.academy", "Instructor@123"),
    "student": ("student@socprofessionals.academy", "Student@123"),
}


# --- Google endpoint failure paths ---
class TestGoogleEndpoint:
    def test_bogus_session_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/auth/google", json={"session_id": "bogus_" + uuid.uuid4().hex})
        assert r.status_code == 401
        assert r.json()["detail"] == "Google sign-in failed — please try again"
        assert "access_token" not in r.cookies

    def test_missing_session_returns_422(self):
        r = requests.post(f"{BASE_URL}/api/auth/google", json={})
        assert r.status_code == 422

    def test_empty_session_returns_422(self):
        r = requests.post(f"{BASE_URL}/api/auth/google", json={"session_id": ""})
        assert r.status_code == 422

    def test_too_long_session_returns_422(self):
        r = requests.post(f"{BASE_URL}/api/auth/google", json={"session_id": "x" * 600})
        assert r.status_code == 422


# --- Email/password regression ---
class TestPasswordAuthRegression:
    @pytest.mark.parametrize("role", ["admin", "instructor", "student"])
    def test_login_me_refresh_logout(self, role):
        s = requests.Session()
        email, pw = CREDS[role]
        r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == role and d["email"] == email
        assert "password_hash" not in d and "_id" not in d
        assert "access_token" in s.cookies and "refresh_token" in s.cookies
        me = s.get(f"{BASE_URL}/api/auth/me")
        assert me.status_code == 200 and me.json()["email"] == email
        assert "password_hash" not in me.json()
        rf = s.post(f"{BASE_URL}/api/auth/refresh")
        assert rf.status_code == 200 and rf.json()["email"] == email
        lo = s.post(f"{BASE_URL}/api/auth/logout")
        assert lo.status_code == 200
        s.cookies.clear()
        assert s.get(f"{BASE_URL}/api/auth/me").status_code == 401

    def test_register_new_user(self):
        s = requests.Session()
        u = "test_g" + uuid.uuid4().hex[:8]
        r = s.post(f"{BASE_URL}/api/auth/register", json={"name": "TEST_ Google", "email": f"{u}@example.com", "username": u, "password": "TestPass123"})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == "student" and r.json()["onboarded"] is False
        assert s.get(f"{BASE_URL}/api/auth/me").json()["email"] == f"{u}@example.com"
