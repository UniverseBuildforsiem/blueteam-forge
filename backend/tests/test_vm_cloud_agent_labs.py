# VM Lab Module 1 - Cloud Agent labs 1..10 (iteration 60). Run serially: pytest -n0
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api/vmlab"
CID = "7a1c2e9b-4d3f-4b8a-9c11-5e2f6a7b8c90"
AID = "3f9e8d7c-6b5a-4c3d-8e1f-0a9b8c7d6e5f"
URI = "https://agent.socp-vmdr.test/CloudAgent/"
UUID = "c0ffee00-1ab5-4e2d-9f00-00000000a11e"
CTL = '"C:\\Program Files\\SOCP\\CloudAgent\\SOCPAgentCtl.exe"'
ORDER = ["vm-lab-ca-01-deploy", "vm-lab-ca-02-components", "vm-lab-agent-win-cli", "vm-lab-ca-04-msi", "vm-lab-ca-05-validate", "vm-lab-ca-06-logs",
         "vm-lab-ca-07-assets", "vm-lab-ca-08-selfprotect", "vm-lab-ca-09-scan", "vm-lab-ca-10-lifecycle", "vm-quiz-agent-basics", "vm-ctf-agent-logs"]


def login(email, pw):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw})
    if r.status_code != 200:
        pytest.skip(f"login failed {email}")
    return s


@pytest.fixture(scope="module")
def admin():
    return login("admin@socprofessionals.academy", "Admin@123")


@pytest.fixture(scope="module")
def student():
    return login("student@socprofessionals.academy", "Student@123")


@pytest.fixture(scope="module")
def sid(student):
    me = student.get(f"{BASE_URL}/api/auth/me").json()
    return me.get("id") or me["user"]["id"]


@pytest.fixture(scope="module")
def granted(admin, student, sid):
    r = admin.patch(f"{BASE_URL}/api/admin/users/{sid}/access", json={"vmlab": True})
    assert r.status_code == 200 and r.json()["access"]["vmlab"] is True
    yield student
    for lab in ORDER[:10]:
        student.post(f"{API}/labs/{lab}/reset")
    admin.patch(f"{BASE_URL}/api/admin/users/{sid}/access", json={"vmlab": False})


def ex(s, lab, c):
    r = s.post(f"{API}/labs/{lab}/exec", json={"command": c})
    assert r.status_code == 200, r.text
    return r.json()


def ev(s, lab, e, **data):
    r = s.post(f"{API}/labs/{lab}/event", json={"event": e, "data": data})
    assert r.status_code == 200, r.text
    return r.json()


def ans(s, lab, t, a):
    r = s.post(f"{API}/labs/{lab}/answer", json={"task_id": t, "answer": a})
    assert r.status_code == 200, r.text
    return r.json()


def done(r):
    return set(t["id"] for t in r["lab"]["tasks"] if t["done"])


class TestHubAndGating:
    def test_hub_order_and_lock(self, student, admin, sid):
        admin.patch(f"{BASE_URL}/api/admin/users/{sid}/access", json={"vmlab": False})
        d = student.get(API).json()
        items = d["modules"][0]["items"]
        assert [i["id"] for i in items] == ORDER
        assert [i["title"].split(" ·")[0] for i in items[:10]] == [f"Lab {n}" for n in range(1, 11)]
        unlocked = [i["id"] for i in items if not i["locked"]]
        assert unlocked == ["vm-lab-ca-01-deploy"]

    def test_paid_lab_403(self, student):
        assert student.get(f"{API}/labs/vm-lab-ca-05-validate").status_code == 403
        assert student.get(f"{API}/labs/vm-lab-agent-win-cli").status_code == 403


class TestLabs:
    def test_lab1_deploy(self, granted):
        s, L = granted, "vm-lab-ca-01-deploy"
        s.post(f"{API}/labs/{L}/reset")
        assert "t1" in ev(s, L, "console.activation_key_viewed", name="Windows Servers")["new"]
        r = ev(s, L, "key.created", title="Finance Servers", tag="Finance", limit="25", expiry="", modules="AI,VM,PC")
        assert set(r["new"]) == {"t2", "t3", "t4"}
        assert r["lab"]["state"]["console"]["keys"][0]["title"] == "Finance Servers"
        assert ans(s, L, "t5", "wrong")["correct"] is False
        r = ans(s, L, "t5", "EDR")
        assert r["correct"] and r["lab"]["completed_at"] and r["lab"]["score"] == 100

    def test_lab1_key_partial_does_not_complete(self, granted):
        s, L = granted, "vm-lab-ca-01-deploy"
        s.post(f"{API}/labs/{L}/reset")
        r = ev(s, L, "key.created", title="Finance Servers", tag="", limit="10", modules="AI,VM")
        assert r["new"] == []

    def test_lab2_components(self, granted):
        s, L = granted, "vm-lab-ca-02-components"
        s.post(f"{API}/labs/{L}/reset")
        assert ev(s, L, "install_instructions.viewed", os="Windows (.exe)", key="Windows Servers")["new"] == ["t1"]
        assert ev(s, L, "installer.downloaded", os="Windows (.exe)")["new"] == ["t2"]
        assert ev(s, L, "install_instructions.viewed", os="Linux (.rpm)")["new"] == ["t3"]
        r = ex(s, L, "whoami /groups")
        assert "BUILTIN\\Administrators" in r["output"] and r["new"] == ["t4"]
        assert ans(s, L, "t5", "443")["lab"]["completed_at"]

    def test_lab3_win_cli(self, granted):
        s, L = granted, "vm-lab-agent-win-cli"
        s.post(f"{API}/labs/{L}/reset")
        ex(s, L, "cd Downloads"); ex(s, L, "dir")
        ev(s, L, "console.activation_key_viewed", name="Windows Servers")
        ex(s, L, "certutil -hashfile SOCPCloudAgent.exe SHA256")
        ex(s, L, f"SOCPCloudAgent.exe CustomerId={{{CID}}} ActivationId={{{AID}}} WebServiceUri={URI}")
        ex(s, L, "sc query SOCPCloudAgent")
        ex(s, L, 'type "C:\\ProgramData\\SOCP\\CloudAgent\\Log.txt"')
        ans(s, L, "t7", UUID)
        r = ev(s, L, "console.agent_viewed", host="WIN-LAB-01")
        assert r["lab"]["completed_at"], done(r)

    def test_lab4_msi(self, granted):
        s, L = granted, "vm-lab-ca-04-msi"
        s.post(f"{API}/labs/{L}/reset")
        ex(s, L, "cd Downloads")
        r = ex(s, L, "dir")
        assert "SOCPCloudAgent.msi" in r["output"] and r["new"] == ["t1"]
        r = ex(s, L, f"msiexec /i SOCPCloudAgent.msi CustomerId={{{CID}}} ActivationId={{{AID}}} WebServiceUri={URI}")
        assert "/qn" in r["output"] and r["new"] == [] and not r["lab"]["state"]["installed"]
        r = ex(s, L, f"msiexec /i SOCPCloudAgent.msi CustomerId={{{CID}}} ActivationId={{{AID}}} WebServiceUri={URI} /qn")
        assert "completed successfully" in r["output"] and r["new"] == ["t2"]
        r = ex(s, L, "sc query SOCPCloudAgent")
        assert "RUNNING" in r["output"] and r["new"] == ["t3"]
        assert ans(s, L, "t4", "/qn")["lab"]["completed_at"]

    def test_lab5_validate_preset(self, granted):
        s, L = granted, "vm-lab-ca-05-validate"
        r = s.post(f"{API}/labs/{L}/reset").json()
        assert r["state"]["installed"] and r["state"]["running"]
        r = ex(s, L, "tasklist")
        assert "SOCPCloudAgent.exe" in r["output"] and r["new"] == ["t1"]
        r = ex(s, L, "reg query HKLM\\SOFTWARE\\SOCP")
        assert UUID in r["output"] and r["new"] == ["t2"]
        assert ans(s, L, "t3", "{" + UUID + "}")["correct"]
        assert ex(s, L, "sc query SOCPCloudAgent")["new"] == ["t4"]
        assert ev(s, L, "console.agent_viewed", host="WIN-LAB-01")["lab"]["completed_at"]

    def test_lab6_logs(self, granted):
        s, L = granted, "vm-lab-ca-06-logs"
        s.post(f"{API}/labs/{L}/reset")
        ex(s, L, "cd C:\\ProgramData\\SOCP\\CloudAgent")
        assert ex(s, L, "dir")["new"] == ["t1"]
        assert ex(s, L, "type Log.txt")["new"] == ["t2"]
        r = ex(s, L, 'findstr /i "error" Log.txt')
        assert "503" in r["output"] and r["new"] == ["t3"]
        ans(s, L, "t4", "503")
        r = ex(s, L, 'Compress-Archive -Path "C:\\ProgramData\\SOCP\\CloudAgent" -DestinationPath C:\\Users\\student\\Desktop\\agent-logs.zip')
        assert r["lab"]["completed_at"]

    def test_lab7_assets(self, granted):
        s, L = granted, "vm-lab-ca-07-assets"
        s.post(f"{API}/labs/{L}/reset")
        assert ev(s, L, "agent.searched", q="WIN-LAB-01")["new"] == ["t1"]
        assert ev(s, L, "console.agent_viewed", host="WIN-LAB-01")["new"] == ["t2"]
        ans(s, L, "t3", "412")
        assert ev(s, L, "agent.searched", q="Windows Servers")["new"] == ["t4"]
        r = ev(s, L, "query.saved", name="All Windows Servers", q="Windows Servers")
        assert r["lab"]["completed_at"] and r["lab"]["state"]["console"]["queries"][0]["name"] == "All Windows Servers"

    def test_lab8_selfprotect(self, granted):
        s, L = granted, "vm-lab-ca-08-selfprotect"
        s.post(f"{API}/labs/{L}/reset")
        r = ex(s, L, f"{CTL} SelfProtection Status")
        assert "Disabled" in r["output"] and r["new"] == ["t1"]
        ev(s, L, "profile.saved", name="Default Windows Profile")
        r = ev(s, L, "selfprot.enabled", name="Default Windows Profile")
        assert r["new"] == ["t2"] and r["lab"]["state"]["selfprot"] is True
        r = ex(s, L, "net stop SOCPCloudAgent")
        assert "Access is denied" in r["output"] and r["new"] == ["t3"]
        r = ex(s, L, "taskkill /im SOCPCloudAgent.exe /f")
        assert "denied" in r["output"].lower() and r["lab"]["completed_at"]

    def test_lab9_scan(self, granted):
        s, L = granted, "vm-lab-ca-09-scan"
        s.post(f"{API}/labs/{L}/reset")
        for t, typ in (("t1", "VM"), ("t2", "PC"), ("t3", "Inventory")):
            r = ex(s, L, f"{CTL} ScanOnDemand Type={typ}")
            assert "queued" in r["output"] and r["new"] == [t]
        r = ex(s, L, 'Get-Content "C:\\ProgramData\\SOCP\\CloudAgent\\Log.txt" -Tail 5')
        assert len(r["output"].splitlines()) == 5 and "On-demand" in r["output"] and r["new"] == ["t4"]
        assert ans(s, L, "t5", "4")["lab"]["completed_at"]

    def test_lab10_lifecycle(self, granted):
        s, L = granted, "vm-lab-ca-10-lifecycle"
        s.post(f"{API}/labs/{L}/reset")
        r = ev(s, L, "console.module_deactivated", module="PC", host="WIN-LAB-01")
        assert r["new"] == ["t1"] and r["lab"]["state"]["console"]["modules"]["PC"] is False
        r = ev(s, L, "console.module_activated", module="PC", host="WIN-LAB-01")
        assert r["new"] == ["t2"] and r["lab"]["state"]["console"]["modules"]["PC"] is True
        assert ev(s, L, "console.agent_uninstall_requested", host="WIN-LAB-01")["new"] == ["t3"]
        r = ex(s, L, '"C:\\Program Files\\SOCP\\CloudAgent\\Uninstall.exe" Uninstall=True')
        assert "uninstalled" in r["output"] and r["new"] == ["t4"] and not r["lab"]["state"]["installed"]
        r = ex(s, L, "sc query SOCPCloudAgent")
        assert "1060" in r["output"] and r["lab"]["completed_at"]


class TestResetAndXp:
    def test_reset_restores_preset(self, granted):
        s, L = granted, "vm-lab-ca-05-validate"
        ex(s, L, "net stop SOCPCloudAgent")
        r = s.post(f"{API}/labs/{L}/reset").json()
        assert r["state"]["installed"] and r["state"]["running"] and r["tasks"][0]["done"] is False and not r["completed_at"]
        r = s.post(f"{API}/labs/vm-lab-ca-10-lifecycle/reset").json()
        assert r["state"]["installed"] and r["state"]["console"] == {}

    def test_xp_once(self, granted):
        s, L = granted, "vm-lab-ca-07-assets"
        xp0 = s.get(f"{BASE_URL}/api/auth/me").json()
        xp0 = xp0.get("xp", xp0.get("user", {}).get("xp"))
        ev(s, L, "agent.searched", q="WIN-LAB-01"); ev(s, L, "console.agent_viewed", host="WIN-LAB-01"); ans(s, L, "t3", "412")
        ev(s, L, "agent.searched", q="Windows Servers")
        assert ev(s, L, "query.saved", name="All Windows Servers")["lab"]["completed_at"]
        xp1 = s.get(f"{BASE_URL}/api/auth/me").json()
        xp1 = xp1.get("xp", xp1.get("user", {}).get("xp"))
        assert xp1 == xp0
