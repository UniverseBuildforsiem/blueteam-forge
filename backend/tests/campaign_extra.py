# Ad-hoc extra checks for campaigns: course-specific coupon on bundle, code reuse after delete, cleanup of TEST coupons
import os, uuid, requests
from datetime import datetime, timedelta, timezone
API = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
a = requests.Session(); a.post(f"{API}/auth/login", json={"email": "admin@socprofessionals.academy", "password": "Admin@123"})
s = requests.Session(); s.post(f"{API}/auth/login", json={"email": "student@socprofessionals.academy", "password": "Student@123"})
T = uuid.uuid4().hex[:5].upper()
code = f"TCS{T}"
print("create specific", a.post(f"{API}/admin/coupons", json={"code": code, "kind": "flat", "value": 50, "course_id": "test-paid-course"}).status_code)
r = s.post(f"{API}/academy/coupons/check", json={"code": code, "plan": "bundle:86fce03a566a", "gift": True}); print("specific on bundle", r.status_code, r.text)
r = s.post(f"{API}/academy/coupons/check", json={"code": code, "plan": "course:test-paid-course", "gift": True}); print("specific on course gift", r.status_code, r.text)
print("del", a.delete(f"{API}/admin/coupons/{code}").status_code)
now = datetime.now(timezone.utc)
iso = lambda d: d.isoformat().replace("+00:00", "Z")
b = {"name": "TEST_Reuse", "theme": "holi", "headline": "TEST h", "subtext": "", "coupon_code": f"TR{T}", "coupon_kind": "percent", "coupon_value": 5,
     "starts_at": iso(now + timedelta(days=90)), "ends_at": iso(now + timedelta(days=91)), "active": True}
c = a.post(f"{API}/admin/campaigns", json=b).json()
print("delete", a.delete(f"{API}/admin/campaigns/{c['id']}").status_code)
r = a.post(f"{API}/admin/campaigns", json=b); print("recreate same code after delete", r.status_code, r.text[:150])
if r.status_code == 200:
    a.delete(f"{API}/admin/campaigns/{r.json()['id']}")
# naive datetime (no tz)
b2 = {**b, "coupon_code": f"TZ{T}", "starts_at": "2027-01-01T00:00", "ends_at": "2027-01-02T00:00"}
r = a.post(f"{API}/admin/campaigns", json=b2); print("naive dt", r.status_code)
if r.status_code == 200:
    a.delete(f"{API}/admin/campaigns/{r.json()['id']}")
r = requests.get(f"{API}/public/campaign"); print("public after naive", r.status_code)
# cleanup leftover TEST campaign coupons created this run & previous pytest run
for cp in a.get(f"{API}/admin/coupons").json():
    live_ids = {x["id"] for x in a.get(f"{API}/admin/campaigns").json()}
    import re
    if cp.get("campaign_id") and cp["campaign_id"] not in live_ids and re.fullmatch(r"T[FEUNRZ][0-9A-F]{5,6}", cp["code"]) and not cp["active"]:
        print("cleanup coupon", cp["code"], a.delete(f"{API}/admin/coupons/{cp['code']}").status_code)
print("remaining campaigns", [(x["name"], x["coupon_code"], x["active"]) for x in a.get(f"{API}/admin/campaigns").json()])
