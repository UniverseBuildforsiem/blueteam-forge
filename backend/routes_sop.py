import os
from fastapi import APIRouter, Depends, HTTPException, Request
from core import db, get_current_user, send_email, email_template, now_iso
from sop_data import SOPS

router = APIRouter(prefix="/api")
SOP_PRODUCT = "sop-bundle"
PRICE, FREE = 499, 5
FREE_IDS = {s["id"] for s in SOPS[:FREE]}


async def all_sops():
    extra = await db.sops_extra.find({"status": "ready"}, {"_id": 0, "status": 0, "error": 0}).sort("order", 1).to_list(500)
    return SOPS + extra


async def find_sop(sid):
    return next((s for s in SOPS if s["id"] == sid), None) or await db.sops_extra.find_one({"id": sid, "status": "ready"}, {"_id": 0, "status": 0, "error": 0})


async def optional_user(request: Request):
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


async def owns_sops(user):
    if not user:
        return False
    if user.get("role") in ("admin", "instructor") or user.get("plan") == "pro":
        return True
    return bool(await db.purchases.find_one({"user_id": user["id"], "product_id": SOP_PRODUCT}))


def card(s, owned, labs=()):
    return {k: s[k] for k in ("id", "title", "category", "severity", "summary", "mitre", "version", "updated")} | {
        "free": s["id"] in FREE_IDS, "has_lab": s["id"] in labs, "locked": s["id"] not in FREE_IDS and not owned, "step_count": len(s["steps"]), "query_count": len(s["queries"])}


@router.get("/public/sops")
async def list_sops(user=Depends(optional_user)):
    owned = await owns_sops(user)
    labs = set(await db.sop_labs.distinct("sop_id", {"status": "ready"}))
    return {"price": PRICE, "free_count": FREE, "owned": owned, "logged_in": bool(user), "sops": [card(s, owned, labs) for s in await all_sops()]}


@router.get("/public/sops/{sid}")
async def get_sop(sid: str, user=Depends(optional_user)):
    s = await find_sop(sid)
    if not s:
        raise HTTPException(404, "SOP not found")
    owned = await owns_sops(user)
    labs = {sid} if await db.sop_labs.find_one({"sop_id": sid, "status": "ready"}, {"_id": 1}) else set()
    if sid not in FREE_IDS and not owned:
        return {**card(s, owned, labs), "objective": s["objective"], "triggers": s["triggers"], "price": PRICE, "phases": [p["phase"] for p in s["steps"]]}
    return {**s, **card(s, owned, labs), "price": PRICE}


async def send_sop_receipt(user_id, payment):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "email": 1})
    if not u:
        return
    lines = ["Thanks for unlocking the full SOC SOP Library. Here is your receipt.", f"Item: {payment['plan_name']}", f"Amount paid: ₹{payment['amount']:,}",
             f"Order ID: {payment['id']}", f"Payment method: {payment['provider'].title()}", f"Date: {now_iso()[:10]}",
             f"All {len(await all_sops())} SOPs with SPL and KQL queries are now open in your account."]
    await send_email(to=u["email"], subject="Your SOC SOP Library receipt", html=email_template(u["name"], lines, f"{os.environ['FRONTEND_URL']}/sops", "Open the SOP library"))
