# Helper: simulate a paid consultation (insert a db.payments doc then call activate) or clean up test data.
# Usage: python3 tests/consult_pay_sim.py pay <hold_id> <user_id> | cleanup <payment_id_prefix>
import asyncio
import sys
import uuid
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402
load_dotenv("/app/backend/.env")
from core import db, now_iso  # noqa: E402
from routes_manage import activate  # noqa: E402


async def pay(hold_id, user_id):
    pid = f"TEST_order_{uuid.uuid4().hex[:10]}"
    await db.payments.insert_one({"id": pid, "provider": "razorpay", "user_id": user_id, "plan": "soc-consultation",
                                  "plan_name": "Cyber & SOC Expert Consultation (30 min)", "ref": hold_id, "amount": 99,
                                  "status": "created", "created_at": now_iso()})
    await activate(user_id, pid)
    p = await db.payments.find_one({"id": pid}, {"_id": 0})
    print(pid, p["status"])


async def cleanup():
    a = await db.payments.delete_many({"id": {"$regex": "^TEST_order_"}})
    b = await db.consultations.delete_many({"notes": {"$regex": "^TEST_"}})
    c = await db.live_enquiries.delete_many({"email": {"$regex": "^test_"}})
    print("deleted", a.deleted_count, b.deleted_count, c.deleted_count)


if __name__ == "__main__":
    if sys.argv[1] == "pay":
        asyncio.run(pay(sys.argv[2], sys.argv[3]))
    else:
        asyncio.run(cleanup())
