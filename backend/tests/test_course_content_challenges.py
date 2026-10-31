# Iteration 17: course content counts (videos/tests/files) + 65 SOC challenges with difficulty
import os
import json
import collections
from pathlib import Path
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
STUDENT = {"email": "student@socprofessionals.academy", "password": "Student@123"}

EXPECTED = {803635: {"videos": 464}, 586238: {"videos": 211}, 585279: {"videos": 315}, 711866: {"videos": 99},
            585979: {"videos": 52}, 584863: {"videos": 52}, 584264: {"videos": 58}, 712610: {"files": 1},
            715800: {"tests": 1}, 715797: {"tests": 1}, 715790: {"tests": 1}, 715679: {"tests": 1}, 715668: {"tests": 1}}


@pytest.fixture(scope="module")
def s():
    x = requests.Session()
    r = x.post(f"{BASE_URL}/api/auth/login", json=STUDENT)
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        x.headers["Authorization"] = f"Bearer {tok}"
    return x


# --- Courses content ---
def test_public_courses_content():
    r = requests.get(f"{BASE_URL}/api/public/courses")
    assert r.status_code == 200
    cs = {c["id"]: c for c in r.json()["courses"]}
    for c in cs.values():
        assert set(c["content"]) == {"videos", "tests", "files"}
        assert all(isinstance(v, int) for v in c["content"].values())
    missing = [cid for cid in EXPECTED if cid not in cs]
    assert not missing, f"missing courses {missing}"
    for cid, exp in EXPECTED.items():
        for k, v in exp.items():
            assert cs[cid]["content"][k] == v, f"{cid} {k}={cs[cid]['content'][k]} expected {v}"


# --- Challenges list ---
def test_challenges_list(s):
    r = s.get(f"{BASE_URL}/api/challenges")
    assert r.status_code == 200
    cs = r.json()
    assert len(cs) == 65
    assert len({c["id"] for c in cs}) == 65
    for c in cs:
        assert c.get("difficulty") in ("Easy", "Medium", "Hard"), c["id"]
        assert "verdict" not in c and "keywords" not in c
        assert c["alert"].get("rule") and c["alert"].get("host") and c["evidence"]
    cats = collections.Counter(c["category"] for c in cs)
    assert len(cats) >= 12
    new = [c for c in cs if c["id"].startswith("ch-02-") or c["id"] not in
           ("ch-phish-01", "ch-bf-01", "ch-mal-01", "ch-ran-01", "ch-lat-01")]
    assert len(new) >= 60


def test_asset_quality():
    d = json.loads((Path(__file__).parent.parent / "assets" / "challenges.json").read_text())
    for c in d:
        assert c["verdict"] in ("TP", "FP")
        assert len(c["keywords"]) >= 3
        assert c["severity"] in ("Low", "Medium", "High", "Critical"), c["severity"]
    v = collections.Counter(c["verdict"] for c in d)
    print("verdict split", v)


# --- Submit new challenge ---
def test_submit_new_challenge(s):
    cs = s.get(f"{BASE_URL}/api/challenges").json()
    c = next(x for x in cs if x["id"].startswith("ch-02-"))
    d = json.loads((Path(__file__).parent.parent / "assets" / "challenges.json").read_text())
    src = next(x for x in d if x["id"] == c["id"])
    report = "TEST_ report: " + " ".join(src["keywords"][:2]) + " observed, escalate."
    r = s.post(f"{BASE_URL}/api/challenges/{c['id']}/submit", json={"verdict": src["verdict"], "report": report})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["verdict_correct"] is True
    assert j["auto_score"] >= 60
    assert j["expected_verdict"] == src["verdict"]
    assert set(j["keywords_hit"]) >= set(src["keywords"][:2])
    again = {x["id"]: x for x in s.get(f"{BASE_URL}/api/challenges").json()}
    assert again[c["id"]]["submission"]["auto_score"] == j["auto_score"]


def test_submit_wrong_verdict_and_validation(s):
    d = json.loads((Path(__file__).parent.parent / "assets" / "challenges.json").read_text())
    src = d[1]
    wrong = "FP" if src["verdict"] == "TP" else "TP"
    r = s.post(f"{BASE_URL}/api/challenges/{src['id']}/submit", json={"verdict": wrong, "report": "TEST_ nothing relevant here at all"})
    assert r.status_code == 200
    assert r.json()["verdict_correct"] is False and r.json()["auto_score"] < 60
    assert s.post(f"{BASE_URL}/api/challenges/{src['id']}/submit", json={"verdict": "XX", "report": "x" * 30}).status_code == 422
    assert s.post(f"{BASE_URL}/api/challenges/{src['id']}/submit", json={"verdict": "TP", "report": "short"}).status_code == 422
    assert s.post(f"{BASE_URL}/api/challenges/nope/submit", json={"verdict": "TP", "report": "x" * 30}).status_code == 404


def test_challenges_requires_auth():
    assert requests.get(f"{BASE_URL}/api/challenges").status_code == 401
