# Guest (logged-out) threat-intel lookups + new logo/static assets regression tests
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def ip():
    # each test uses a unique spoofed client IP (x-forwarded-for first hop is trusted by backend)
    n = uuid.uuid4().int
    return f"203.{n % 250}.{(n >> 8) % 250}.{(n >> 16) % 250}"


def gid():
    return f"TEST_{uuid.uuid4().hex[:12]}"


def lookup(ioc, g, xff):
    return requests.post(f"{API}/public/intel/lookup", json={"ioc": ioc, "guest_id": g}, headers={"X-Forwarded-For": xff}, timeout=60)


def status(g, xff):
    return requests.get(f"{API}/public/intel/guest", params={"guest_id": g}, headers={"X-Forwarded-For": xff}, timeout=20)


# Guest status endpoint
def test_guest_status_fresh():
    r = status(gid(), ip())
    assert r.status_code == 200
    assert r.json() == {"remaining": 3, "free": 3}


# Validation: invalid / private / short guest_id
def test_invalid_ioc_400_not_counted():
    g, x = gid(), ip()
    r = lookup("not an ioc!!", g, x)
    assert r.status_code == 400
    assert "public IP" in r.json()["detail"]
    assert status(g, x).json()["remaining"] == 3


def test_private_ip_400_not_counted():
    g, x = gid(), ip()
    for p in ("10.0.0.1", "192.168.1.1", "127.0.0.1"):
        r = lookup(p, g, x)
        assert r.status_code == 400, p
    assert status(g, x).json()["remaining"] == 3


def test_short_guest_id_422():
    r = lookup("8.8.8.8", "abc", ip())
    assert r.status_code == 422


# Guest report content: VT / AbuseIPDB locked
def test_ip_lookup_guest_sources():
    g, x = gid(), ip()
    r = lookup("185.220.101.1", g, x)
    assert r.status_code == 200
    d = r.json()
    assert d["type"] == "ip" and d["ioc"] == "185.220.101.1"
    assert d["remaining"] == 2
    assert d["sources"]["virustotal"]["status"] == "guest"
    assert d["sources"]["abuseipdb"]["status"] == "guest"
    assert "geo" in d["sources"] and "blocklists" in d["sources"]
    assert d["verdict"] in ("malicious", "suspicious", "clean", "unknown")
    assert isinstance(d["reasons"], list) and "at" in d


def test_hash_and_domain_guest():
    g, x = gid(), ip()
    d = lookup("44d88612fea8a8f36de82e1278abb02f", g, x).json()
    assert d["type"] == "hash" and d["sources"]["virustotal"]["status"] == "guest"
    assert "abuseipdb" not in d["sources"] and "known_good" in d["sources"]
    d2 = lookup("microsoft.com", g, x).json()
    assert d2["type"] == "domain" and d2["sources"]["virustotal"]["status"] == "guest"
    assert d2["remaining"] == 1


# Quota: 3 -> 2 -> 1 -> 0 -> 402 (by guest_id and by IP)
def test_quota_decrements_then_402():
    g, x = gid(), ip()
    rem = [lookup("1.1.1.1", g, x).json()["remaining"] for _ in range(3)]
    assert rem == [2, 1, 0]
    assert status(g, x).json()["remaining"] == 0
    r = lookup("1.1.1.1", g, x)
    assert r.status_code == 402
    assert "3 free lookups" in r.json()["detail"]
    # same IP, new guest_id -> blocked
    assert lookup("1.1.1.1", gid(), x).status_code == 402
    # same guest_id, new IP -> blocked
    assert lookup("1.1.1.1", g, ip()).status_code == 402
    assert status(gid(), x).json()["remaining"] == 0


# Logo + static assets + share card
@pytest.mark.parametrize("path", ["/logo.png", "/favicon.png", "/apple-touch-icon.png"])
def test_static_logo_assets(path):
    r = requests.get(f"{BASE_URL}{path}", timeout=20)
    assert r.status_code == 200
    assert r.content[:8] == b"\x89PNG\r\n\x1a\n"


def test_series_share_card_png():
    r = requests.get(f"{API}/public/series-share/what-is-a-security-operations-center-soc-architecture-and-operations-explained.png", timeout=30)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/png")
    assert r.content[:4] == b"\x89PNG" and len(r.content) > 10000
