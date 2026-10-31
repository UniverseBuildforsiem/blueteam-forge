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

## Backlog
- P0: Add Razorpay/Cashfree keys and test live checkout; webhooks
- P1: Gate Pro-only content by plan; file uploads for lesson resources (object storage)
- P2: WebSocket push instead of polling; more labs/datasets; rich-text editor
