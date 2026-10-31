# SOCForge — PRD

## Original problem statement
Full-stack cybersecurity learning platform "SOCForge" for aspiring SOC analysts: dark cyber/SOC theme (#0B0F1A, neon cyan/green, grid bg, glassmorphism, JetBrains Mono, severity badges). Public landing + catalog (titles only), JWT auth with roles (Student/Instructor/Admin), onboarding goal, student panel (dashboard, learning paths, live sessions, quizzes, real-time progress, SOC triage challenges, CTF, scenario labs, certificates with PDF/QR/verify), lab environment (Kali terminal simulator, SIEM simulator, investigation tools), instructor panel, admin panel.

## User choices
- Email: Emergent managed Resend (password reset, RSVP reminders, certificate emails)
- Payments: Razorpay + Cashfree (keys pending from user)
- Instructor role: only admin can promote users

## Architecture
- Backend FastAPI: core.py (db, auth helpers, email, XP/streak), routes_auth.py, routes_learn.py (paths, lessons, quizzes, certificates+PDF, sessions, dashboard, analytics), routes_practice.py (challenges, CTF, labs, SIEM, tools, cases), routes_manage.py (generic content CRUD, instructor, admin, payments), seed_data.py (all JSON seed content, SIEM log generator).
- Frontend React: pages/ (Landing, Catalog, AuthPages, Onboarding, Verify, Instructor, Admin, app/*), components (AppShell, Terminal, ContentEditor, common), lib/kali.js (scripted command engine), lib/api.js (axios + refresh).
- Auth: httpOnly cookies (15m access + 7d refresh), bcrypt, email-based lockout (5 fails/15min).

## Implemented (2026-06)
- All public pages, auth flows, onboarding, role-based routing
- Student: dashboard (rings, XP/rank, streak, badges, leaderboard, sessions, activity; 10s polling), 5 learning paths with modules/lessons/video/resources, sessions calendar + RSVP + join + recordings, quizzes (mcq/multi/tf, timer, instant feedback except finals, retries), progress analytics (radar, history, weak topics, 8s polling), 5 triage challenges auto-graded, 8 CTFs with hints + scoreboard, 2 scenario labs with Kali terminal, tasks, hints, notes, final report, certificates PDF + QR + /verify
- SIEM: query syntax, time range, histogram, fields, stats, saved searches, dashboards, alerts
- Tools: intel lookup, email header analyzer, sandbox reports, decoder recipes, threat feed, cases with timeline
- Instructor: path/quiz builders, JSON editors for CTF/labs/challenges, session form, students, quiz analytics, grading, attendance
- Admin: analytics, users (role/suspend), publishing, path builder, categories, certificates revoke, announcements, audit logs, settings (allow_signups enforced)
- Payments: Razorpay order/verify + Cashfree order/status code in place; inactive until keys are added
- Landing alert queue: severity counters + filter, pause on hover, clickable alerts -> sign-up prompt, optional Critical ping with mute; clicked case carried through sign-up/login
- Mission briefing dialog before the clicked case opens
- Daily Alert Drill (/app/drill): deterministic daily case from templates, +50 XP bonus, drill streak, dashboard banner
- Session reminders: platform cron (.emergent/crons.yml, every 15 min) -> POST /api/cron/session-reminders emails RSVP'd students for sessions starting within the hour (once per RSVP)
- Drill archive (last 14 days, practice replays, no XP), weekly drill streak leaderboard, evening streak-rescue email (cron 19:00 Asia/Kolkata -> /api/cron/streak-rescue, once per user/day, opt-out toggle on Drill page)
- Drill badges: Week Watch (7-day) and Night Shift (30-day) based on longest streak, shown on dashboard
- Share streak card: PIL-rendered 1200x627 PNG + public OG page (/api/public/streak/{token}) for LinkedIn share-offsite, download, copy link (fonts bundled in backend/assets/fonts)
- Certificates: "Add to LinkedIn profile" (linkedin.com/profile/add prefilled with name, org, issue date, verify URL, cert ID)
- Public badge showcase /u/:username (rank, XP, earned badges, valid certificates, drill streak); public/private toggle on Certificates page
- Recruiter view /talent (public): search public student profiles by name, rank, certificate, verified skill (>=70% accuracy topics)
- Profile links on verify page, streak share page redirect + card handle, dashboard/CTF/drill leaderboards (private profiles plain text)
- Streak freeze: 100 XP each, max 2 held, auto-applied for one missed day (on owner's drill visit or in streak-rescue cron); public reads count it virtually without side effects
- Open to Work (toggle, location, work mode on Certificates page); talent filters open-only + location/remote
- Contact candidate: public form on /u/:username (open-to-work only) emails student, recruiter email shown in body, student email never exposed; limits 5/day per IP or sender, 1/day per sender+candidate
- Skill radar on public profile (accuracy by topic; bars if <3 topics)

- Landing feature showcase (2026-06): 10 tabbed features with mock live previews (Kali, SIEM, Drill, CTF, Labs, Tools, Skill radar, Certificates, Sessions, Talent), auto-rotates every 5s, pauses on hover
- Self-paced courses (2026-06): 13 SOC Professionals courses (static data in frontend/src/lib/courses.js, scraped from classplus API) — landing shows 8 in a 4-column grid + /courses page with type filters & search; each card links to socprofessionals.com/courses/{id}
- Mobile nav menu on public pages
- Live course sync (2026-06): backend routes_courses.py, db.courses synced from the store's classplus API; cron course-sync 06:00 Asia/Kolkata -> POST /api/cron/course-sync; startup sync (seed fallback if empty + unreachable); failed sync keeps last list (meta.course_sync.last_error); GET /api/public/courses
- Course-to-lab links: keyword rules map each course to SOCForge labs/CTF/drill/tools/paths + skill topics; course card opens details popup with practice links (logged-out -> /register)
- Recommended course: GET /api/courses/recommended (lowest-accuracy topic from analytics -> most specific matching course), dashboard card
- New course alerts (2026-06): sync detects never-seen course ids and emails every active student with course_emails != false (db.course_alerts unique user+course, no resend); dashboard switch (PATCH /api/me/preferences {course_emails}); signed unsubscribe link GET /api/public/unsubscribe/course-alerts
- Course completion badges: POST/DELETE /api/me/courses/{id}/complete, GET /api/me/courses; badges kind 'course' in dashboard badges and public profile; "Mark as watched" in course popup
- Note: seed accounts (@socforge.io) are undeliverable for email (422) — use real addresses or delivered+x@resend.dev to test emails
- Watched course bonus (2026-06): +100 XP once per course (db.course_bonus unique) when a trackable matching item is completed after watched_at; SIEM/Kali/Tools untracked; evaluated on GET /api/me/courses/progress and /api/dashboard (toasts via awarded/course_bonus)
- Course badge share card: POST /api/me/courses/{id}/share-card -> /api/public/course-badge/{token}/{id}(.png) PIL card + OG page (LinkedIn)
- My courses page /app/courses: watched courses, badge, bonus status, matching items done/to finish, share
- Rebrand (2026-06): SOCForge -> SOCProfessionals Academy everywhere (UI, emails, cards, PDF); logins now @socprofessionals.academy (startup `rebrand` migration in server.py); badge email with card image + LinkedIn button after course bonus (respects course_emails)
- Badge levels: 4 levels Recruit/Analyst (3D kid style), Hunter (cyber boy), Elite (hooded skull) from user-supplied art; unique AI character per badge in frontend/public/badges; mapping in frontend/src/lib/badges.js; BadgeTile used on dashboard + public profile; landing BadgeShowcase section
- Level-up reveal (2026-06): first Hunter/Elite badge -> full-screen character reveal on dashboard (dashboard.level_up, POST /api/me/level-up/{level}/seen, users.levelups_seen)
- Character share cards for all 8 badges: POST /api/me/badges/{id}/share-card -> /api/public/badge/{token}/{id}(.png); course cards + badge email card now include character (backend/assets/badges, BADGE_LEVEL in routes_learn.py)
- Rank avatars (XP rank -> level character) on dashboard/CTF/drill leaderboards, talent search, public profile (RankAvatar component)
- Rank-up reveal (2026-06): dashboard.rank_up + POST /api/me/rank-up/{rank}/seen (users.rankups_seen); queued after badge level-up reveal
- Badge collection page /app/badges (GET /api/me/badges): 4 level sections, locked characters + unlock rule, share earned, course badges
- Elite avatar frames ember/neon/glitch (PATCH /api/me/avatar-frame, users.avatar_frame, frame_for in core) shown on dashboard/CTF/drill leaderboards only
- SOC Interview ebook (2026-06): /book page (routes_book.py; PDF at backend/assets/book, cover at frontend/public/book), ₹973 (MRP ₹2,999) via Razorpay/Cashfree (PRODUCTS in routes_manage.py, activate() -> db.purchases), in-browser reader + download for owners (admins/instructors free), Udemy video link; landing BookPromo with animated cover
- Rank-up email (core.award -> routes_share.send_rank_email, db.rank_emails unique) + rank share cards /api/public/rank/{token}/{rank}(.png); share button on rank-up reveal
- Dashboard "next badge to chase" (NextBadge); landing Elite Hall of Fame (GET /api/public/hall-of-fame, all Elite; private ones not linked)
- PENDING: RAZORPAY_KEY_ID/SECRET and CASHFREE_CLIENT_ID/SECRET not yet provided — pay buttons disabled until set
- Free ebook sample (2026-06): first 10 pages (backend/assets/book/sample.pdf) at GET /api/me/book/sample, free account required; SampleBox on /book
- Interview Ready badge (Analyst, interview-ready.jpg) earned via db.purchases; dashboard EbookCard links to /book
- AI mock interview (2026-06): /app/interview, buyers only; 30 random of 108 book Q&As (backend/assets/book/questions.json, extracted via scripts/extract_book_questions.py) in 30 min; typed answers graded by Claude claude-sonnet-5-5 (EMERGENT_LLM_KEY) in background (routes_interview.py, db.interviews); drafts autosave, server-side expiry, expired sessions auto-graded
- Ebook receipt email from activate() (routes_book.send_book_receipt)
- Sample viewer: page images GET /api/me/book/sample/{n}.jpg + "Keep reading, unlock the other 158 pages" nudge at page 10 or 3 min
- NOTE: demo student has a TEST db.purchases row (test:true) for the ebook — remove before go-live if desired
- Course cards show real store content counts (content.videos/tests/files from classplus resources); store lists no hours so none shown
- SOC Challenges: 65 total (5 original + 60 AI-generated in backend/assets/challenges.json via scripts/generate_challenges.py, 12 categories, Easy/Medium/Hard, 15 FP); table filters (search, category, difficulty, open/attempted)

## Backlog
- P0: Add Razorpay/Cashfree keys and test live checkout; webhooks
- P1: Gate Pro-only content by plan; file uploads for lesson resources (object storage)
- P2: WebSocket push instead of polling; more labs/datasets; rich-text editor
