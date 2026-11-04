# Threat Intel platform API tests (/api/intel/*): auth, lookup per IOC type, extract, bulk, myip, history, export
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
STUDENT = {"email": "student@socprofessionals.academy", "password": "Student@123"}


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    r = ses.post(f"{BASE_URL}/api/auth/login", json=STUDENT)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    return ses


def look(s, ioc):
    return s.post(f"{BASE_URL}/api/intel/lookup", json={"ioc": ioc}, timeout=120)


# Auth: unauthenticated requests are rejected
class TestIntelAuth:
    @pytest.mark.parametrize("method,path", [("post", "/api/intel/lookup"), ("post", "/api/intel/extract"), ("post", "/api/intel/bulk"),
                                             ("get", "/api/intel/myip"), ("get", "/api/intel/history"), ("get", "/api/intel/history/export"), ("delete", "/api/intel/history")])
    def test_unauth_401(self, method, path):
        r = getattr(requests, method)(f"{BASE_URL}{path}", json={"ioc": "1.1.1.1", "text": "x", "iocs": ["1.1.1.1"]})
        assert r.status_code == 401, r.text


# Lookup per IOC type
class TestIntelLookup:
    def test_malicious_ip(self, s):
        r = look(s, "45.95.147.236")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "ip" and d["verdict"] == "malicious"
        vt = d["sources"]["virustotal"]
        assert vt["status"] == "ok" and vt["data"]["malicious"] > 0
        assert d["sources"]["abuseipdb"]["status"] == "no_key"
        assert "_id" not in d and isinstance(d["remaining"], int) and d["id"]

    def test_tor_ip(self, s):
        r = look(s, "185.220.101.1")
        assert r.status_code == 200, r.text
        d = r.json()
        print("TOR", d["verdict"], d["score"], d["reasons"], d["sources"]["geo"].get("data", {}).get("proxy"))
        assert d["sources"]["blocklists"]["data"]["tor_exit"] is True
        assert any("Tor exit" in x for x in d["reasons"])

    def test_domain(self, s):
        r = look(s, "microsoft.com")
        assert r.status_code == 200, r.text
        d = r.json()
        print("DOMAIN", d["verdict"], {k: v["status"] for k, v in d["sources"].items()})
        assert d["type"] == "domain"
        for k in ("dns", "whois", "certificates", "blocklists", "virustotal"):
            assert k in d["sources"]
        assert d["sources"]["dns"]["status"] == "ok" and d["sources"]["dns"]["data"]["A"]

    def test_eicar_hash(self, s):
        r = look(s, "44D88612FEA8A8F36DE82E1278ABB02F")
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["type"] == "hash" and d["ioc"] == "44d88612fea8a8f36de82e1278abb02f"
        assert d["verdict"] == "malicious"
        vt = d["sources"]["virustotal"]["data"]
        print("HASH", vt.get("threat_label"), len(vt.get("yara") or []))
        assert vt.get("threat_label") and vt.get("yara")

    def test_defanged_url(self, s):
        r = look(s, "hxxps://example[.]com/login")
        assert r.status_code == 200, r.text
        d = r.json()
        print("URL", d["verdict"], {k: v["status"] for k, v in d["sources"].items()})
        assert d["type"] == "url" and d["ioc"] == "https://example.com/login"

    @pytest.mark.parametrize("ioc", ["10.0.0.1", "127.0.0.1", "not an ioc !!", "192.168.1.5"])
    def test_invalid_400(self, s, ioc):
        r = look(s, ioc)
        assert r.status_code == 400, r.text
        assert r.json().get("detail")

    def test_url_with_private_ip_host(self, s):
        r = look(s, "http://10.1.1.1/x")
        assert r.status_code == 400, r.text

    def test_empty_422(self, s):
        assert look(s, "").status_code == 422


# Extract + bulk
class TestIntelBulk:
    TEXT = ("Received: from mail.evil-login[.]xyz (45.95.147.236) and 10.0.0.5\n"
            "hxxp://bad-update[.]top/invoice.exe\nmd5 44d88612fea8a8f36de82e1278abb02f\nfile payload.exe")

    def test_extract(self, s):
        r = s.post(f"{BASE_URL}/api/intel/extract", json={"text": self.TEXT})
        assert r.status_code == 200, r.text
        d = r.json()
        got = {(x["type"], x["ioc"]) for x in d["iocs"]}
        print(got)
        assert ("ip", "45.95.147.236") in got
        assert ("hash", "44d88612fea8a8f36de82e1278abb02f") in got
        assert ("url", "http://bad-update.top/invoice.exe") in got
        assert ("domain", "mail.evil-login.xyz") in got
        assert not any(x["ioc"] == "10.0.0.5" for x in d["iocs"])
        assert not any(x["ioc"] == "payload.exe" for x in d["iocs"])
        assert not any(x["ioc"] == "bad-update.top" for x in d["iocs"])

    def test_bulk_over_25_422(self, s):
        r = s.post(f"{BASE_URL}/api/intel/bulk", json={"iocs": [f"8.8.4.{i}" for i in range(26)]})
        assert r.status_code == 422

    def test_bulk_empty_422(self, s):
        assert s.post(f"{BASE_URL}/api/intel/bulk", json={"iocs": []}).status_code == 422

    def test_bulk_check(self, s):
        r = s.post(f"{BASE_URL}/api/intel/bulk", json={"iocs": ["45.95.147.236", "44d88612fea8a8f36de82e1278abb02f", "garbage!!", "10.0.0.1"]}, timeout=120)
        assert r.status_code == 200, r.text
        res = {x["ioc"]: x for x in r.json()["results"]}
        print({k: (v["verdict"], v["score"]) for k, v in res.items()})
        assert res["garbage!!"]["verdict"] == "invalid"
        assert res["10.0.0.1"]["verdict"] == "invalid"
        assert res["45.95.147.236"]["verdict"] == "malicious" and res["45.95.147.236"]["id"]
        assert "_id" not in res["45.95.147.236"]


# My IP + history
class TestIntelHistory:
    def test_myip(self, s):
        r = s.get(f"{BASE_URL}/api/intel/myip")
        assert r.status_code == 200, r.text
        d = r.json()
        print("MYIP", d.get("ip"), d.get("public"))
        assert d["ip"]

    def test_history_and_item_and_export(self, s):
        r = s.get(f"{BASE_URL}/api/intel/history")
        assert r.status_code == 200
        d = r.json()
        assert d["limit"] == 150 and d["used_today"] >= 1
        assert d["items"] and "sources" not in d["items"][0] and "_id" not in d["items"][0]
        hid = d["items"][0]["id"]
        it = s.get(f"{BASE_URL}/api/intel/history/{hid}")
        assert it.status_code == 200 and it.json()["sources"]
        assert s.get(f"{BASE_URL}/api/intel/history/nope-123").status_code == 404
        e = s.get(f"{BASE_URL}/api/intel/history/export")
        assert e.status_code == 200 and "text/csv" in e.headers["content-type"]
        assert e.text.startswith("checked_at_utc,type,indicator")

    def test_other_user_cannot_read_item(self, s):
        hid = s.get(f"{BASE_URL}/api/intel/history").json()["items"][0]["id"]
        a = requests.Session()
        a.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@socprofessionals.academy", "password": "Admin@123"})
        assert a.get(f"{BASE_URL}/api/intel/history/{hid}").status_code == 404
