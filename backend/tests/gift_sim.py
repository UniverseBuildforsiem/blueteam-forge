# Helper: simulate a paid gift (insert payment + activate) or run scheduled gift delivery. Prints JSON.
import asyncio
import json
import sys

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402
load_dotenv("/app/backend/.env")
from core import db  # noqa: E402


async def main():
    cmd = sys.argv[1]
    if cmd == "activate":
        pid, user_id, plan, send_on = sys.argv[2], sys.argv[3], sys.argv[4], (sys.argv[5] if len(sys.argv) > 5 and sys.argv[5] != "none" else None)
        import routes_manage
        courses = None
        name = "Course: Test"
        if plan.startswith("bundle:"):
            b = await db.academy_bundles.find_one({"id": plan[7:]}, {"_id": 0})
            courses, name = b["course_ids"], f"Bundle: {b['title']}"
        else:
            c = await db.academy_courses.find_one({"id": plan[7:]}, {"_id": 0})
            name = f"Course: {c['title']}"
        await db.payments.insert_one({"id": pid, "provider": "razorpay", "user_id": user_id, "plan": plan, "plan_name": name, "amount": 499,
                                      "courses": courses, "gift": {"to_name": "TEST_Recipient", "to_email": "delivered@resend.dev", "message": "TEST msg", "send_on": send_on},
                                      "status": "created", "created_at": "2026-01-01T00:00:00+00:00"})
        await routes_manage.activate(user_id, pid)
        g = await db.gifts.find_one({"payment_id": pid}, {"_id": 0})
        buyer_purchase = await db.purchases.find_one({"user_id": user_id, "payment_id": pid}, {"_id": 0})
        print(json.dumps({"gift": g, "buyer_purchase": buyer_purchase}))
    elif cmd == "set_past":
        await db.gifts.update_one({"id": sys.argv[2]}, {"$set": {"send_on": "2025-01-01T08:00:00+00:00"}})
        print(json.dumps({"ok": True}))
    elif cmd == "get":
        print(json.dumps(await db.gifts.find_one({"id": sys.argv[2]}, {"_id": 0})))
    elif cmd == "purchases":
        print(json.dumps(await db.purchases.find({"user_id": sys.argv[2]}, {"_id": 0}).to_list(50)))
    elif cmd == "cleanup":
        pids = sys.argv[2].split(",") if sys.argv[2] else []
        uids = sys.argv[3].split(",") if len(sys.argv) > 3 and sys.argv[3] else []
        gids = [g["id"] for g in await db.gifts.find({"payment_id": {"$in": pids}}, {"_id": 0, "id": 1}).to_list(50)]
        r1 = await db.purchases.delete_many({"gift_id": {"$in": gids}})
        r2 = await db.gifts.delete_many({"id": {"$in": gids}})
        r3 = await db.payments.delete_many({"id": {"$in": pids}})
        r4 = await db.users.delete_many({"id": {"$in": uids}, "email": {"$regex": "^test_"}})
        await db.purchases.delete_many({"user_id": {"$in": uids}})
        print(json.dumps({"purchases": r1.deleted_count, "gifts": r2.deleted_count, "payments": r3.deleted_count, "users": r4.deleted_count}))


asyncio.run(main())
