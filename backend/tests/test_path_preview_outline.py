# Path Preview Popup: public path outline endpoint
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
IDS = ["soc-fundamentals", "soc-l1", "soc-l2", "incident-response", "interview-prep"]
FORBIDDEN = {"content", "body", "markdown", "html", "video_url", "answer", "answers", "questions", "id_lesson"}


def _walk_keys(o, acc):
    if isinstance(o, dict):
        for k, v in o.items():
            acc.add(k)
            _walk_keys(v, acc)
    elif isinstance(o, list):
        for v in o:
            _walk_keys(v, acc)
    return acc


def test_public_paths_list_has_five():
    r = requests.get(f"{BASE_URL}/api/public/paths", timeout=20)
    assert r.status_code == 200
    ids = [p["id"] for p in r.json()]
    for i in IDS:
        assert i in ids


@pytest.mark.parametrize("pid", IDS)
def test_outline_structure(pid):
    r = requests.get(f"{BASE_URL}/api/public/paths/{pid}/outline", timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["id"] == pid
    assert isinstance(d["title"], str) and d["title"]
    assert isinstance(d["modules"], list) and len(d["modules"]) > 0
    total_l, total_m, vids, qz = 0, 0, 0, 0
    for m in d["modules"]:
        assert set(m.keys()) == {"title", "lessons"}
        for l in m["lessons"]:
            assert set(l.keys()) == {"title", "minutes", "video", "quiz"}
            assert isinstance(l["minutes"], int) and l["minutes"] > 0
            assert isinstance(l["video"], bool) and isinstance(l["quiz"], bool)
            total_l += 1
            total_m += l["minutes"]
            vids += l["video"]
            qz += l["quiz"]
    assert d["lesson_count"] == total_l
    assert d["minutes"] == total_m
    assert d["videos"] == vids
    assert d["quizzes"] == qz
    leaked = _walk_keys(d, set()) & FORBIDDEN
    assert not leaked, f"leaked keys {leaked}"
    assert "_id" not in r.text


def test_outline_unknown_404():
    r = requests.get(f"{BASE_URL}/api/public/paths/does-not-exist-xyz/outline", timeout=20)
    assert r.status_code == 404
    assert r.json().get("detail") == "Path not found"


def test_outline_no_auth_required():
    s = requests.Session()
    r = s.get(f"{BASE_URL}/api/public/paths/soc-l2/outline", timeout=20)
    assert r.status_code == 200
