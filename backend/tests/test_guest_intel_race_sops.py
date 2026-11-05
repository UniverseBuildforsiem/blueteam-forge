# Guest threat-intel quota (atomic claim + real-IP keying) and SOP library access rules.
# NOTE: guest quota is keyed by real client IP -> requires db.intel_guest cleared before running (all runs share 1 IP).
import os
import uuid
import concurrent.futures as cf
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "admin@socprofessionals.academy", "password": "Admin@123"}
STUDENT = {"email": "student@socprofessionals.academy", "password": "Student@123"}
NEW_IDS = ["sop-okta-impossible-travel", "sop-m365-password-spray", "sop-hosts-file-modified"]


def gid():
    return "gTEST" + uuid.uuid4().hex[:16]


def login(creds):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json=creds)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    return s


# --- Guest intel: invalid IOC not counted, parallel race, spoofed XFF ---
class TestGuestQuota:
    g = gid()

    def test_fresh_status_3(self):
        r = requests.get(f"{BASE_URL}/api/public/intel/guest", params={"guest_id": self.g})
        assert r.status_code == 200 and r.json()["remaining"] == 3, r.text

    def test_invalid_ioc_400_not_counted(self):
        r = requests.post(f"{BASE_URL}/api/public/intel/lookup", json={"ioc": "not an ioc!!", "guest_id": self.g})
        assert r.status_code == 400
        assert requests.get(f"{BASE_URL}/api/public/intel/guest", params={"guest_id": self.g}).json()["remaining"] == 3

    def test_parallel_6_exactly_3_succeed(self):
        def hit(i):
            return requests.post(f"{BASE_URL}/api/public/intel/lookup", json={"ioc": f"8.8.4.{i+1}", "guest_id": self.g}, timeout=120)
        with cf.ThreadPoolExecutor(6) as ex:
            res = list(ex.map(hit, range(6)))
        codes = sorted(r.status_code for r in res)
        print("codes", codes)
        assert codes.count(200) == 3, codes
        assert codes.count(402) == 3, codes
        ok = [r.json() for r in res if r.status_code == 200]
        assert sorted(x["remaining"] for x in ok) == [0, 1, 2]
        for x in ok:
            assert x["sources"]["virustotal"]["status"] == "guest"
            assert x["sources"]["abuseipdb"]["status"] == "guest"

    def test_status_zero_after(self):
        assert requests.get(f"{BASE_URL}/api/public/intel/guest", params={"guest_id": self.g}).json()["remaining"] == 0

    def test_new_guest_id_same_ip_402(self):
        r = requests.post(f"{BASE_URL}/api/public/intel/lookup", json={"ioc": "1.1.1.1", "guest_id": gid()})
        assert r.status_code == 402, r.text

    def test_spoofed_xff_new_guest_402(self):
        for xff in ["5.5.5.5", "5.5.5.5, 6.6.6.6", "203.0.113.9, 5.5.5.5, 7.7.7.7"]:
            r = requests.post(f"{BASE_URL}/api/public/intel/lookup", json={"ioc": "1.1.1.1", "guest_id": gid()}, headers={"X-Forwarded-For": xff})
            assert r.status_code == 402, f"{xff}: {r.status_code} {r.text[:200]}"
            st = requests.get(f"{BASE_URL}/api/public/intel/guest", params={"guest_id": gid()}, headers={"X-Forwarded-For": xff}).json()
            assert st["remaining"] == 0, f"{xff}: status {st}"


# --- SOP library: list, new SOPs, access rules ---
class TestSops:
    def test_list_contains_new_sops(self):
        d = requests.get(f"{BASE_URL}/api/public/sops").json()
        ids = {s["id"] for s in d["sops"]}
        print("count", len(ids))
        for i in NEW_IDS:
            assert i in ids, i
        assert d["owned"] is False
        assert sum(s["free"] for s in d["sops"]) == 5
        for s in d["sops"]:
            if s["id"] in NEW_IDS:
                assert s["locked"] is True and s["free"] is False

    @pytest.mark.parametrize("sid", NEW_IDS)
    def test_logged_out_detail_locked(self, sid):
        r = requests.get(f"{BASE_URL}/api/public/sops/{sid}")
        assert r.status_code == 200
        d = r.json()
        assert d["locked"] is True
        for k in ("steps", "queries", "analysis", "escalation", "closure", "sla"):
            assert k not in d, f"{k} leaked"
        assert d["objective"] and d["triggers"]
        assert isinstance(d["phases"], list) and all(isinstance(p, str) for p in d["phases"])

    def test_student_free_plan_locked(self):
        s = login(STUDENT)
        me = s.get(f"{BASE_URL}/api/auth/me").json()
        d = s.get(f"{BASE_URL}/api/public/sops/sop-m365-password-spray").json()
        if me.get("plan") == "pro":
            pytest.skip("student is pro")
        owned = s.get(f"{BASE_URL}/api/public/sops").json()["owned"]
        if not owned:
            assert d["locked"] is True and "steps" not in d

    def test_admin_full_new_sop(self):
        s = login(ADMIN)
        d = s.get(f"{BASE_URL}/api/public/sops/sop-m365-password-spray").json()
        assert d["locked"] is False
        assert len(d["analysis"]) >= 3
        for a in d["analysis"]:
            assert a["check"] and a["how"] and a["malicious_if"] and a["benign_if"]
        assert len(d["steps"]) == 5, [p["phase"] for p in d["steps"]]
        assert all(p["actions"] for p in d["steps"])
        assert len(d["queries"]) >= 2
        for q in d["queries"]:
            assert q["spl"].strip() and q["kql"].strip()
        assert d["escalation"] and d["sla"] and d["mitre"] and d["closure"]
        assert "_id" not in d

    def test_unknown_sop_404(self):
        assert requests.get(f"{BASE_URL}/api/public/sops/sop-does-not-exist").status_code == 404
