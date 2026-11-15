import os
import re
import logging
from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from core import db, client, hash_password, now_iso, new_id, logger
import seed_data as S
from routes_auth import router as auth_router
from routes_learn import router as learn_router
from routes_practice import router as practice_router
from routes_manage import router as manage_router
from routes_cron import router as cron_router
from routes_share import router as share_router
from routes_courses import router as courses_router, ensure_courses
from routes_book import router as book_router
from routes_interview import router as interview_router
from routes_sop import router as sop_router
from routes_blog import router as blog_router, ensure_blog
from routes_series import router as series_router, ensure_series
from series_cover import router as cover_router
from series_share import router as series_share_router
from sop_writer import ensure_sop_extra
from routes_sop_lab import router as sop_lab_router, ensure_sop_labs
from routes_intel import router as intel_router, guest_router as intel_guest_router, ensure_intel
from series_email import router as series_email_router, ensure_series_email
from routes_instructor import router as instructor_router
from routes_admin import router as admin_router
from routes_promo import router as promo_router, ensure_promos
from routes_consult import router as consult_router
from routes_playbooks import router as playbooks_router
from routes_shift import router as shift_router
from routes_academy import router as academy_router
from routes_coupons import router as coupons_router
from routes_bundles import router as bundles_router
from routes_gifts import router as gifts_router
from routes_campaigns import router as campaigns_router
from routes_phish import router as phish_router, public_router as phish_public_router, fail_stale as phish_fail_stale
from routes_phish_run import router as phish_run_router
from playbook_writer import ensure_playbooks

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
app = FastAPI(title="SOCProfessionals Academy API")
for r in (auth_router, learn_router, practice_router, manage_router, cron_router, share_router, courses_router, book_router, interview_router, sop_router, blog_router, instructor_router, admin_router, promo_router, consult_router, series_router, cover_router, series_email_router, series_share_router, intel_router, intel_guest_router, sop_lab_router, playbooks_router, shift_router, academy_router, coupons_router, bundles_router, gifts_router, campaigns_router, phish_router, phish_public_router, phish_run_router):
    app.include_router(r)

app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=os.environ["CORS_ORIGINS"].split(","), allow_methods=["*"], allow_headers=["*"])


@app.get("/api/")
async def root():
    return {"service": "SOCProfessionals Academy", "status": "ok"}


async def seed_collection(name, items):
    for it in items:
        if not await db[name].find_one({"id": it["id"]}):
            await db[name].insert_one({"published": True, **it})


async def seed_user(email, password, name, username, role, xp=0, streak=0):
    if not await db.users.find_one({"email": email}):
        await db.users.insert_one({"id": new_id(), "name": name, "email": email, "username": username, "password_hash": hash_password(password),
                                   "role": role, "status": "active", "plan": "free", "goal": "SOC L1", "current_path": "soc-l1",
                                   "onboarded": True, "xp": xp, "streak": streak, "last_active": None, "created_at": now_iso()})


async def rebrand():
    old, new = "@socforge.io", "@socprofessionals.academy"
    async for u in db.users.find({"email": {"$regex": "@socforge\\.io$"}}, {"_id": 0, "id": 1, "email": 1}):
        target = u["email"].replace(old, new)
        if await db.users.find_one({"email": target}):
            continue
        await db.users.update_one({"id": u["id"]}, {"$set": {"email": target}})
    async for s in db.sessions.find({"join_link": {"$regex": "socforge"}}, {"_id": 0, "id": 1, "join_link": 1}):
        await db.sessions.update_one({"id": s["id"]}, {"$set": {"join_link": s["join_link"].replace("socforge", "socpro")}})
    await db.settings.update_many({"platform_name": "SOCForge"}, {"$set": {"platform_name": "SOCProfessionals Academy"}})
    await db.settings.update_many({"support_email": "support@socforge.io"}, {"$set": {"support_email": "support@socprofessionals.academy"}})


async def plain_ctf_flags():
    seeded = {c["id"]: c for c in S.CTFS}
    async for c in db.ctfs.find({"$or": [{"flag": {"$regex": "^SOCF\\{"}}, {"description": {"$regex": "SOCF\\{"}}]}, {"_id": 0}):
        if c["id"] in seeded:
            upd = {k: seeded[c["id"]][k] for k in ("flag", "description")}
        else:
            m = re.match(r"^SOCF\{(.*)\}$", c["flag"])
            upd = {"flag": m.group(1) if m else c["flag"], "description": re.sub(r"\s*SOCF\{[^}]*\}", "", c["description"])}
        await db.ctfs.update_one({"id": c["id"]}, {"$set": upd})
    for c in S.CTFS:
        await db.ctfs.update_one({"id": c["id"], "writeup": {"$in": [None, ""]}}, {"$set": {"writeup": c["writeup"]}})


@app.on_event("startup")
async def startup():
    await rebrand()
    await plain_ctf_flags()
    await db.users.create_index("email", unique=True)
    await db.users.create_index("username", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.login_attempts.create_index("identifier")
    await db.drill_submissions.create_index([("user_id", 1), ("date", 1)], unique=True)
    await db.drill_freezes.create_index([("user_id", 1), ("date", 1)], unique=True)
    await db.drill_rescue.create_index([("user_id", 1), ("date", 1)], unique=True)
    await seed_user(os.environ["ADMIN_EMAIL"], os.environ["ADMIN_PASSWORD"], "Platform Admin", "admin", "admin")
    await seed_user("instructor@socprofessionals.academy", "Instructor@123", "Riya Sen", "riya", "instructor")
    await seed_user("student@socprofessionals.academy", "Student@123", "Demo Student", "demo", "student", 120, 1)
    for i, (n, xp) in enumerate([("Kai Brooks", 3450), ("Amara Osei", 2210), ("Leo Fischer", 1620), ("Nina Park", 940), ("Omar Haddad", 610)]):
        await seed_user(f"bot{i}@socprofessionals.academy", "BotUser@123!x", n, n.split()[0].lower() + str(i), "student", xp, i + 1)
    await seed_collection("paths", S.PATHS)
    await seed_collection("quizzes", S.QUIZZES)
    await seed_collection("challenges", S.CHALLENGES)
    for c in S.CHALLENGES:
        await db.challenges.update_one({"id": c["id"], "$or": [{"difficulty": {"$exists": False}}, {"alert.rule": {"$ne": c["alert"]["rule"]}}]},
                                       {"$set": {"difficulty": c["difficulty"], "alert.rule": c["alert"]["rule"]}})
    await seed_collection("ctfs", S.CTFS)
    await seed_collection("labs", S.LABS)
    for l in S.LABS:
        await db.labs.update_one({"id": l["id"], "report_keywords": {"$exists": False}},
                                 {"$set": {k: l[k] for k in ("tasks", "report_keywords", "category", "scenario", "report_guide")}})
    await seed_collection("sessions", S.sessions_seed())
    await seed_collection("siem_alerts", S.SIEM_ALERTS)
    await ensure_courses()
    await db.course_alerts.create_index([("user_id", 1), ("course_id", 1)], unique=True)
    await db.course_completions.create_index([("user_id", 1), ("course_id", 1)], unique=True)
    await db.course_bonus.create_index([("user_id", 1), ("course_id", 1)], unique=True)
    await db.rank_emails.create_index([("user_id", 1), ("rank", 1)], unique=True)
    await db.purchases.create_index([("user_id", 1), ("product_id", 1)], unique=True)
    await db.toolkit_usage.create_index([("user_id", 1), ("challenge_id", 1)], unique=True)
    await seed_collection("categories", [{"id": c, "name": c} for c in ["Foundations", "Analyst", "Response", "Career"]])
    await seed_collection("announcements", [{"id": "ann-1", "title": "New lab: Phishing to Ransomware is live", "body": "Reconstruct a full kill chain in the Kali + SIEM simulators.", "active": True, "created_at": now_iso()}])
    for q in [("Failed logons", "event_id=4625 | stats count by src_ip"), ("Beacon hunting", "sourcetype=proxy url=*gate.php*"), ("Shadow copy deletion", "vssadmin")]:
        if not await db.saved_searches.find_one({"user_id": "system", "name": q[0]}):
            await db.saved_searches.insert_one({"id": new_id(), "user_id": "system", "name": q[0], "query": q[1], "created_at": now_iso()})
    await ensure_blog()
    await ensure_series()
    await ensure_series_email()
    await ensure_intel()
    await ensure_sop_extra()
    await ensure_sop_labs()
    await ensure_promos()
    await ensure_playbooks()
    from routes_academy import migrate_courses
    await migrate_courses()
    await phish_fail_stale()
    await db.gifts.create_index("code", unique=True)
    await db.campaign_emails.create_index([("campaign_id", 1), ("user_id", 1)], unique=True)
    await db.wishlists.create_index([("user_id", 1), ("kind", 1), ("item_id", 1)], unique=True)
    logger.info("Seed complete")


@app.on_event("shutdown")
async def shutdown():
    client.close()
