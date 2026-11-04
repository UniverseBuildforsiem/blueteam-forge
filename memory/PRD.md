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

## 2026-06 Challenge Hint Unlocks (DONE)
- Every SOC challenge has 2 hints (key evidence line, then report keywords), unlocked in order for a flat 25 points each (XP deducted immediately, needs >=25). Stored in `challenge_hints`; never charged twice. Endpoint: POST /api/challenges/{id}/hint/{idx}.

## 2026-06 Blog, SOPs, SIEM v2, Scenario Labs Engine (DONE — iteration_18)
- Security Blog (/blog, /blog/:slug, public, on landing + nav): daily cron `blog-sync` (07:00 IST) pulls The Hacker News RSS + BleepingComputer (its RSS is Cloudflare-blocked from server → Google News RSS fallback, headline/snippet only), Claude writes summary, key points, SOC action items, IOCs, MITRE. `routes_blog.py`, collection `blog_posts`. Admin manual: POST /api/admin/blog/sync.
- SOP Library (/sops, /sops/:id): 12 SOPs in `sop_data.py` (phases, roles, tools, SPL+KQL queries, escalation, SLA, MITRE, closure). First 5 free; rest unlock via product `sop-bundle` ₹499 (Razorpay/Cashfree, keys not yet configured) — admin/instructor/Pro get all. `routes_sop.py`.
- SIEM v2: `siem_engine.py` supports Splunk SPL (index/sourcetype, wildcards, OR/NOT, comparisons, earliest=, stats/table/head/sort/dedup/where) and Sentinel KQL (tables mapped to sourcetypes, where ==/has/contains/in~/startswith/endswith/ago(), summarize, project, take, sort by, distinct). ~870 realistic events incl. password spray, Kerberoasting, web shell, DNS tunnel, exfil. Custom time range, clickable timeline, column tables, saved searches per language, 8 alerts.
- Scenario Labs: 6 labs (2 upgraded + kerberoast, BEC M365, IIS web shell, DNS tunnel) with briefing, phases, text + MCQ tasks, keyword auto-scored final report (variants supported), best score kept.

## Backlog
- P1: Instructor panel improvements (author labs/SOPs), Admin panel (users, analytics)
- P2: Blog email digest, more SOPs, SIEM eval/bin commands

## 2026-06 Weekly Threat Digest + Practice From News (DONE — iteration_19)
- Weekly digest: cron `weekly-digest` Monday 09:00 IST → POST /api/cron/weekly-digest; top 5 most severe posts of last 7 days (severity, then newest; published_at normalised to UTC), 3 SOC actions each, to all active students with `digest_emails != False`; per-week dedupe in `digest_sends`; HMAC unsubscribe /api/public/unsubscribe/digest; toggle on /blog (GET/PATCH /api/me/preferences). Admin test: POST /api/admin/blog/digest-test. Preview: GET /api/public/blog-digest/preview.
- Hunt buttons: blog posts get a category-matched practice hunt (HUNTS in routes_blog.py, SPL+KQL); SOP queries have simulator-adjusted `hunt` versions (SOP_HUNTS in sop_data.py, all 72 return hits). Links open /app/siem?lang=&q= (prefilled + auto-run; login redirect keeps query).
- Note: seed accounts use @socprofessionals.academy, which the email provider rejects as undeliverable; real addresses work.

## 2026-06 Instructor Panel v2 + Landing Blog/SOP showcase (DONE — iteration_20)
- `routes_instructor.py`: catalog course CRUD (/api/instructor/courses, ids 9000001+ via `counters`, source=instructor, never deactivated by sync, new visible courses trigger course alert emails); grading with email for challenge reports and lab reports (/api/instructor/lab-reports/{uid}/{lid}/grade; lab resubmits set review_status=resubmitted); monitoring: /at-risk, /students/{uid} detail, /students.csv.
- Frontend: `components/InstructorExtras.jsx` (CatalogCourses, StudentsPanel + StudentDetail sheet + CSV, GradingPanel with pending/reviewed filters). Instructor tabs: Content, Catalog courses, Students, Quiz analytics, Grading, Attendance.
- Landing: `components/LandingIntel.jsx` — live threat ticker under hero, magazine blog section, SOP showcase (live SPL/KQL preview, 12-tile grid, ₹499 offer).
- Backlog: Admin panel (users, analytics, learning path builder), cover image upload for catalog courses (object storage).

## 2026-06 Admin Panel v2 (DONE — iteration_21 backend 20/20 + self-tested builder)
- `routes_admin.py`: invite users (72h single-use set-password email via password_reset_tokens kind=invite, `invite_pending` cleared on reset), resend invite, user detail, plan/SOP/ebook access grants + reset XP, hard delete (user data collections; payments kept for accounting; self/last-admin protected), full analytics (/api/admin/analytics/full?days=7|30|90: KPIs w/ change, daily series, revenue by product, engagement, 6-stage funnel, top performers, popular content), /api/builder/assets.
- Frontend: `AdminAnalytics.jsx`, `AdminUsers.jsx` (invite dialog, detail sheet, type-email-to-delete), `PathBuilder.jsx` (drag & drop + arrows for modules/lessons incl. cross-module, lesson editor, attachments to quiz/lab/challenge/ctf/course/sop, student preview). Students see "practice this lesson" links (Paths.jsx LessonBody).

## 2026-06 Path Templates (DONE — self-tested curl + UI)
- `path_templates.py`: 5 built-in outline templates (SOC L1 in 30 Days, Threat Hunting Bootcamp, IR Essentials, Cloud SOC M365/Azure, SIEM Engineer). Custom templates in `path_templates` collection (admin saves any path incl. content/attachments).
- Endpoints (routes_admin.py): GET /api/builder/templates (staff), POST /api/builder/templates/{id}/use → unpublished draft with fresh ids, POST /api/builder/templates (admin, from path_id), DELETE (admin, custom only).
- UI: `PathTemplates.jsx` — "Start from template" gallery (outline preview) in path Content editors; "Save as template" on existing paths (admin).

## 2026-06 Auto Practice Links + AI Lesson Writer (DONE — self-tested curl + UI)
- POST /api/builder/suggest {title, content} (staff): keyword + synonym matching over labs, quizzes, challenges, SOPs; top 2 per type, max 6.
- POST /api/builder/write-lesson (staff) → background job (Claude Sonnet via Emergent LLM key, 600-900 words plain text) in `lesson_jobs`; poll GET /api/builder/write-lesson/{job_id}. Background job avoids ingress timeout.
- PathBuilder: "Suggest practice" + "Attach all" chips, "Write this lesson" (draft into editor, confirm before replacing). setMods/upL are functional so edits made while the AI writes are preserved.

## 2026-06 Lesson Quiz Generator + Networking/Linux Practice (DONE — iteration_21 backend 22/22, frontend 100%)
- Path Builder: "Generate 5-question quiz" per lesson (Claude Sonnet via Emergent LLM key, POST /api/builder/lesson-quiz, poll GET /api/builder/jobs/{id}); admin edits questions/options/correct answer/explanations, then attaches (lesson.quiz). Validated on path save.
- Students: "Check your understanding" block in lessons — MCQ, instant feedback + explanations, retry, practice only (no XP).
- New content in backend/practice_extra.py: 4 labs (Networking: port scan→SMB, C2 beaconing; Linux: cron persistence, sudo privesc), 10 challenges (5 Networking, 5 Linux), 4 quizzes (Networking, Linux, SOC Workflow, Security Foundations). Expanded suggest keyword map → every SOC L1 30-day template lesson + seeded soc-l1 lessons get a practice match (backend/tests/check_l1_matches.py).

## 2026-06 Investigation Toolkit v2 + Quiz All Lessons + Graded Lesson Quizzes (DONE — iteration_22, backend 23/23 + 22/22 regression)
- backend/toolkit.py: SIMULATED VirusTotal-style intel (vendor table, detections, community score, details, relations, seen-in) derived from INTEL + challenge/lab evidence; per-alert IOC/file extraction; generated sandbox reports per alert file. Endpoints: GET /api/tools/intel, /api/tools/alert-iocs, /api/tools/sandbox/report. Cache invalidated on challenge/lab CRUD.
- In-alert toolkit (components/InvestigationKit.jsx) inside challenge sheets and a lab "investigate" tab; Tools page uses the same views.
- Graded lesson quizzes: lesson.quiz.required; pass 3/5 (ceil 60%), unlimited retries, server-side grading POST /api/paths/{pid}/lessons/{lid}/quiz, auto-complete +10 XP once; answers stripped from student path view; manual complete blocked.
- "Quiz all lessons" (components/BulkQuiz.jsx): AI drafts for lessons missing a quiz (>=150 chars content), 3 in parallel, review one by one (edit, required toggle, attach/regenerate/skip).

## 2026-06 Investigation (Evidence) Badges (DONE — self-tested curl + screenshot)
- Any toolkit lookup/sandbox on a SOC challenge (kind=challenge) logs db.toolkit_usage; challenge submissions store investigated=True if toolkit was used before the verdict (counts from now on).
- Tiers: Evidence Seeker (3, Recruit), Evidence First (10, Analyst), Master Investigator (25, Hunter); progress bar on Badges page; share cards work; art in frontend/public/badges + backend/assets/badges.

## 2026-06 Change Password + Weekly Investigator Leaderboard (DONE — iteration_23 backend 11/11 + frontend; fixes self-tested)
- /app/account (Account Settings, all roles): POST /api/auth/change-password (current+new, >=8 letters+digits, not username, 5-try/15-min lockout). users.token_version bumped -> JWT "tv" claim invalidates other sessions (access + refresh); current session re-issued; confirmation email. Reset-password also bumps token_version.
- Dashboard card "Top investigators this week": GET /api/leaderboard/investigators (Mon-Sun UTC, counts first submissions with investigated=true via first_at; last week's champion).
- api.js interceptor now refreshes for all calls except auth login/register/refresh/logout.

## 2026-06 Landing Promo Spotlight (DONE — self-tested screenshot)
- components/PromoSpotlight.jsx above the Blog section: rotating spotlight (6s timer bar, pauses on hover, prev/next + named tabs) for Udemy Qualys Guard VMDR ₹499, Udemy Certified SOC Analyst ₹499 (same referral link), SOCProfessionals Android app (Google Play), SOC Learning Paths (/catalog), SOC Interview Preparation book (/book).

## 2026-06 Editable Promotions + Offer Countdown + SOC Live Classes (DONE — iteration_24, fixes self-tested)
- backend/routes_promo.py: db.promos (seeded from the 5 spotlight cards) with admin CRUD/reorder/hide + optional ends_at countdown (expired cards hidden). Public GET /api/public/promos.
- SOC Live Classes (landing, after the spotlight): free demo every Friday 16:00 IST (next 4), new batches on 2nd & 4th Fridays (next 4). Enquiry form (name/email/phone/experience/message) -> db.live_enquiries; background emails: confirmation to visitor (Teams join link for demos) + copy to notify_email (default hr@socprofessionals.com). 5/day per email limit.
- Admin tabs: "Live classes" (enquiries table, status, filters, CSV, settings: demo link/times/notify email/title) and "Promotions".

## 2026-06 ₹99 Expert Consultation + Batch Seat Counter + WhatsApp click-to-chat (DONE — iteration_25 15/15 backend + frontend; fixes self-tested)
- routes_consult.py: 30-min slots (default 16:00–23:00 IST, every day; editable start/end/days in Live settings), 15-min holds, plan "soc-consultation" (₹99, MRP ₹999) via existing Razorpay/Cashfree with PlanIn.ref; activate() -> confirm_consultation (paid, or needs_reschedule on clash) + emails to user + notify_email. Release on checkout dismiss. /consultation page (slot picker, topic, phone, notes, My bookings) + landing ConsultationPromo.
- Batch seats: default_seats 8 + per-batch override db.batch_seats; non-closed enquiries take seats; full -> 409 + 'batch full' UI.
- WhatsApp: no API (user declined) — wa.me click-to-chat to 919381203090 (editable) after enquiries/on consultation page; admin WhatsApp links to each lead.
- NOTE: RAZORPAY_KEY_ID/SECRET and CASHFREE_CLIENT_ID/SECRET/BASE_URL are NOT set — checkout shows 'payments open soon' until added.

## 2026-06 Consultation Calendar + Post-Session Reviews (DONE — iteration_26 16/16 backend + frontend; fixes self-tested)
- Admin Live tab: weekly Mon–Sun IST calendar (consult hours rows + extra rows for out-of-hours bookings, stacked clashes, status colours, detail panel with email/WhatsApp), review moderation (hide/show).
- Reviews: session-reminders cron (*/15) also runs send_review_requests -> paid/completed consultations 90 min–7 days after slot get a token email (/review/:token). 1–5★ + comment upsert; landing ConsultReviews shows non-hidden 4–5★ with comment>=10 chars as 'First L.'; average over all reviews.

## Backlog (current)
- P2: Per-user cooldown on AI quiz/lesson generation
- P2: Lesson quiz analytics for instructors (pass rates per lesson)


## SOC Analyst Technical Blog Series (2026-06)
- 125-title series in 7 tracks (backend/series_data.py, section cover images); db.series_posts {id, seed, section, order, title, slug, excerpt, tags, mitre, cover, body(markdown), status planned|generating|ready|failed, published, read_min}
- AI (Claude Sonnet via Emergent key) writes 2,000-3,000-word Markdown posts (logs, SPL/KQL, playbooks, real-world example, checklist); first 15 auto-written at startup, rest on demand via admin "write with AI"
- Public: /soc-series (tracks, search, coming-soon cards) and /soc-series/:slug (markdown, TOC, copy + try-in-SIEM code blocks, prev/next); Threat news / Series tabs on /blog
- Admin > Security blog tab (AdminSeries.jsx): add/edit/delete, markdown preview, publish toggle, reorder within track, cover link, AI write; edits blocked (409) while AI is writing
- Endpoints: GET /api/public/series, /api/public/series/{slug}; /api/admin/series CRUD, /{id}/move, /{id}/generate (routes_series.py)

## Backlog
- P2: per-post AI cover images; bulk "write next 10"; meeting link per booking (user skipped for now)

## Series cover art + weekly series email (2026-06)
- series_cover.py: Gemini Nano Banana cover per post (webp in Emergent Object Storage socpro/series-covers/, field ai_cover, cover_status); made for all ready posts at startup and automatically after each AI write; admin "New AI cover"; served via GET /api/public/series-cover/{id}?v=; admin cover link overrides
- series_email.py: every Monday 9am IST (piggybacks weekly-digest cron; 5-cron limit reached) each active student gets their next unsent ready post in series order (db.series_sends unique user+week, rolled back if send fails); users.series_emails toggle on /soc-series; signed unsubscribe /api/public/unsubscribe/series; GET /api/me/series/next; POST /api/admin/series/email-test
- Known: AI covers occasionally contain small text labels despite prompt (regenerate per post)

## Series share cards (2026-06)
- series_share.py: GET /api/public/series-share/{slug}.png (1200x627 branded card: post cover + logo, series #/total, title, track, read time; cached) and /api/public/series-share/{slug} OG page redirecting to /soc-series/{slug}; 404 for unwritten posts
- Post page: ShareBar (LinkedIn, X, WhatsApp, Copy link) under cover and ShareCard preview at the end

## Share XP + landing blogs + renames (2026-06)
- POST /api/me/series/{slug}/shared: students earn 25 XP ONE time only (users.share_xp_awarded, atomic); /api/me/series/next returns share_xp_eligible; post page share buttons call it and show "+25 XP" chip until earned
- Landing: LandingBlogs.jsx after "// learning paths" — one section with two tabs: "Zer0 Day Vulnerabilities and Attacks" (3 latest news posts) and "SOC Blog" (first 4 written series posts), View all link
- Renamed everywhere: news blog = "Zer0 Day Vulnerabilities and Attacks", series = "SOC Blog" (blog tabs, headings, admin tab, share card, weekly email subject); app sidebar link "Blogs"

## Landing tweaks (2026-06)
- Removed "// threat briefing · updated daily" magazine section (LandingIntel now renders only SOP showcase)
- Learning paths: LandingPaths.jsx image cards (5 AI images in user's reference style, mapped by path id), framer-motion slide-in stagger, slow Ken Burns zoom, hover glow + scanline sweep (index.css .path-card/.path-img)
- Path preview popup (2026-06): landing path cards open a dialog (LandingPaths.jsx PathPreview) with outline from GET /api/public/paths/{id}/outline (module/lesson titles, minutes, video/quiz flags, totals; no content). Logged out: "Sign up to start this path" stores localStorage pending_path -> after onboarding/login lands on /app/paths/{id} (takePendingCase); "View pricing" scrolls to #pricing. Logged in: "Open this path".

## Threat Intel platform (2026-06) — /app/threat-intel (logged-in only)
- Backend routes_intel.py + intel_sources.py: POST /api/intel/lookup (auto-detect + refang; IP/domain/URL/hash), /extract, /bulk (max 25), GET /myip, /history, /history/{id}, /history/export (CSV), DELETE /history (hides; quota counts by owner)
- Sources: ip-api (geo/ISP/ASN/proxy/hosting), Shodan InternetDB (ports/CVEs/tags), RDAP WHOIS, Google DoH DNS, crt.sh certs, CIRCL hashlookup (known-good), feeds cached 1h in memory (Tor exits, Feodo C2, Spamhaus DROP, Phishing Army), VirusTotal v3 (VT_API_KEY; 4/min + 480/day limiter, 6h cache), AbuseIPDB (ABUSEIPDB_API_KEY — NOT SET yet, card shows "not connected"). db.intel_cache TTL.
- Risk score 0-100 → malicious/suspicious/clean("No threats found")/unknown with reasons. Quotas: student 150/day, 20/min.
- Frontend tabs: IOC lookup, Bulk extractor, Proxy & IP finder, Defang/refang, Open-source tools directory (43 tools), History. Report download (.txt), CSV exports.
- IOC to Ticket (2026-06): IntelTicket.jsx "Create ticket" on every single lookup report (incl. opened from bulk/history) — ServiceNow-style editable fields (short description, category, subcategory, impact, urgency, priority from verdict, assignment group, state, CI, description with defanged IOCs + findings + enrichment + recommended actions per type, work notes), copy per field / copy full ticket. Frontend only.
- Landing Threat Intel section (2026-06): LandingThreatIntel.jsx before // blogs — search box + 5 feature cards; logged-out submit stores localStorage pending_intel and shows Log in / Sign up; after login/onboarding takePendingCase -> /app/threat-intel?q=... which auto-runs; logged-in users go straight there.
