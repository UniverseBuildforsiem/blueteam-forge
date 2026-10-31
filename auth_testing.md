# Auth testing
- Credentials in /app/memory/test_credentials.md
- Login: POST /api/auth/login sets httpOnly cookies access_token (15m) + refresh_token (7d). /api/auth/me returns user.
- Brute force: 5 failed logins per ip+email => 15 min lockout (429).
- bcrypt hashes start with $2b$. Indexes: users.email unique, users.username unique, login_attempts.identifier, password_reset_tokens.expires_at TTL.
- Forgot password: POST /api/auth/forgot-password stores token in password_reset_tokens and emails link (Emergent managed email). For testing, read token from mongo: db.password_reset_tokens.find().sort({_id:-1}).limit(1)
