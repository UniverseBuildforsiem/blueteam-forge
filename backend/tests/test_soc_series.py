# SOC Analyst Technical Blog Series: public list/post, admin CRUD, publish, reorder, AI write, RBAC (iteration 27)
import os
import time
import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN = ("admin@socprofessionals.academy", "Admin@123")
STUD = ("student@socprofessionals.academy", "Student@123")


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers["Authorization"] = f"Bearer {tok}"
    return s


@pytest.fixture(scope="module")
def admin():
    return login(*ADMIN)


@pytest.fixture(scope="module")
def student():
    return login(*STUD)


@pytest.fixture(scope="module")
def created(admin):
    ids = []
    yield ids
    for i in ids:
        g = admin.get(f"{API}/admin/series/{i}")
        if g.status_code == 200 and g.json()["status"] == "generating" and os.environ.get("KEEP_GEN"):
            print(f"KEEPING generating post {i}")
            continue
        admin.delete(f"{API}/admin/series/{i}")


def admin_posts(admin):
    return admin.get(f"{API}/admin/series").json()["posts"]


# Public list
def test_public_list():
    r = requests.get(f"{API}/public/series")
    assert r.status_code == 200
    d = r.json()
    assert d["total"] >= 125
    assert len(d["sections"]) == 7
    assert d["written"] >= 1
    p = d["sections"][0]["posts"][0]
    assert "body" not in p and p["number"] == 1 and p["cover"]
    nums = [p["number"] for s in d["sections"] for p in s["posts"]]
    assert nums == list(range(1, len(nums) + 1))


# Public post detail and 404s
def test_public_post_detail_and_404():
    d = requests.get(f"{API}/public/series").json()
    posts = [p for s in d["sections"] for p in s["posts"]]
    ready = [p for p in posts if p["status"] == "ready"]
    planned = [p for p in posts if p["status"] == "planned"]
    r = requests.get(f"{API}/public/series/{ready[0]['slug']}")
    assert r.status_code == 200
    j = r.json()
    assert j["number"] == 1 and j["total"] == d["total"] and "_id" not in j
    assert "## " in j["body"] and j["prev"] is None
    if len(ready) > 1:
        assert j["next"]["slug"] == ready[1]["slug"]
    assert requests.get(f"{API}/public/series/{planned[0]['slug']}").status_code == 404
    assert requests.get(f"{API}/public/series/nope-xyz-123").status_code == 404


# RBAC
def test_rbac(student):
    assert student.get(f"{API}/admin/series").status_code == 403
    assert student.post(f"{API}/admin/series", json={"title": "TEST_x", "section": "SOC Fundamentals"}).status_code == 403
    assert requests.get(f"{API}/admin/series").status_code in (401, 403)


# Admin list
def test_admin_list(admin):
    r = admin.get(f"{API}/admin/series")
    assert r.status_code == 200
    d = r.json()
    assert len(d["sections"]) == 7 and len(d["posts"]) >= 125
    assert "body" not in d["posts"][0]


# Create -> GET -> public
def test_create_and_public(admin, created):
    body = "## Intro\n\nHello **world**\n\n```spl\nindex=main | stats count\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |"
    r = admin.post(f"{API}/admin/series", json={"title": "TEST_ Series Post", "section": "Splunk & SIEM", "excerpt": "ex",
                                                  "tags": ["t1", " ", "t2"], "mitre": ["T1110"], "body": body})
    assert r.status_code == 200, r.text
    p = r.json()
    created.append(p["id"])
    assert p["status"] == "ready" and p["slug"] == "test-series-post" and p["tags"] == ["t1", "t2"] and "_id" not in p
    g = admin.get(f"{API}/admin/series/{p['id']}").json()
    assert g["body"] == body
    pub = requests.get(f"{API}/public/series/{p['slug']}")
    assert pub.status_code == 200 and pub.json()["section"] == "Splunk & SIEM"
    lst = requests.get(f"{API}/public/series").json()
    sec = next(s for s in lst["sections"] if s["name"] == "Splunk & SIEM")
    assert sec["posts"][-1]["id"] == p["id"]
    # duplicate slug
    r2 = admin.post(f"{API}/admin/series", json={"title": "TEST_ Series Post", "section": "Splunk & SIEM"})
    assert r2.status_code == 200
    created.append(r2.json()["id"])
    assert r2.json()["slug"] == "test-series-post-2" and r2.json()["status"] == "planned"


# Validation
def test_create_validation(admin):
    assert admin.post(f"{API}/admin/series", json={"title": "TEST_bad", "section": "Nope"}).status_code == 400
    assert admin.post(f"{API}/admin/series", json={"title": "ab", "section": "SOC Fundamentals"}).status_code == 422
    assert admin.post(f"{API}/admin/series", json={"title": "TEST_c", "section": "SOC Fundamentals", "cover": "javascript:alert(1)"}).status_code == 400


# Update -> slug, cover validation
def test_update(admin, created):
    pid = created[0]
    r = admin.put(f"{API}/admin/series/{pid}", json={"title": "TEST_ Renamed Post", "excerpt": "new ex", "cover": "https://example.com/a.jpg"})
    assert r.status_code == 200
    j = r.json()
    assert j["slug"] == "test-renamed-post" and j["excerpt"] == "new ex" and j["status"] == "ready"
    assert admin.put(f"{API}/admin/series/{pid}", json={"cover": "ftp://x/y.jpg"}).status_code == 400
    assert admin.get(f"{API}/admin/series/{pid}").json()["cover"] == "https://example.com/a.jpg"
    assert requests.get(f"{API}/public/series/test-renamed-post").json()["cover"] == "https://example.com/a.jpg"
    assert admin.put(f"{API}/admin/series/does-not-exist", json={"excerpt": "x"}).status_code == 404


# Publish toggle on seeded post (restored)
def test_publish_toggle(admin):
    p = next(x for x in admin_posts(admin) if x.get("seed") == 1)
    try:
        assert admin.put(f"{API}/admin/series/{p['id']}", json={"published": False}).status_code == 200
        lst = requests.get(f"{API}/public/series").json()
        assert all(x["id"] != p["id"] for s in lst["sections"] for x in s["posts"])
        assert requests.get(f"{API}/public/series/{p['slug']}").status_code == 404
        # status must not change when only toggling publish
        assert admin.get(f"{API}/admin/series/{p['id']}").json()["status"] == "ready"
    finally:
        admin.put(f"{API}/admin/series/{p['id']}", json={"published": True})
    assert requests.get(f"{API}/public/series/{p['slug']}").status_code == 200


# Reorder within section (restored)
def test_move(admin):
    posts = [x for x in admin_posts(admin) if x["section"] == "Advanced SOC Operations"]
    a, b = posts[0], posts[1]
    r = admin.post(f"{API}/admin/series/{a['id']}/move", json={"dir": 1})
    assert r.json()["ok"] is True
    after = [x for x in admin_posts(admin) if x["section"] == "Advanced SOC Operations"]
    assert after[0]["id"] == b["id"] and after[1]["id"] == a["id"]
    r = admin.post(f"{API}/admin/series/{a['id']}/move", json={"dir": -1})
    assert r.json()["ok"] is True
    back = [x for x in admin_posts(admin) if x["section"] == "Advanced SOC Operations"]
    assert back[0]["id"] == a["id"]
    # edge: cannot move first up
    assert admin.post(f"{API}/admin/series/{a['id']}/move", json={"dir": -1}).json()["ok"] is False
    assert admin.post(f"{API}/admin/series/{a['id']}/move", json={"dir": 5}).status_code == 422


# AI write on a TEST_ planned post (only one)
def test_generate(admin, created):
    pid = created[1]
    r = admin.post(f"{API}/admin/series/{pid}/generate")
    assert r.status_code == 200 and r.json()["status"] == "generating"
    assert admin.get(f"{API}/admin/series/{pid}").json()["status"] == "generating"
    assert admin.post(f"{API}/admin/series/nope/generate").status_code == 404


# Delete
def test_delete(admin):
    r = admin.post(f"{API}/admin/series", json={"title": "TEST_ To Delete", "section": "SOC Fundamentals"})
    pid = r.json()["id"]
    assert admin.delete(f"{API}/admin/series/{pid}").json()["ok"] is True
    assert admin.get(f"{API}/admin/series/{pid}").status_code == 404
    assert admin.delete(f"{API}/admin/series/{pid}").status_code == 404
