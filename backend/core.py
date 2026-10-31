import os
import re
import ipaddress
import logging
import uuid
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from pathlib import Path

import bcrypt
import jwt
import httpx
from dotenv import load_dotenv
from fastapi import Request, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")
logger = logging.getLogger("socforge")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
JWT_ALGORITHM = "HS256"


def now():
    return datetime.now(timezone.utc)


def now_iso():
    return now().isoformat()


def new_id():
    return uuid.uuid4().hex[:12]


def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def verify_password(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())


def create_access_token(uid: str, email: str) -> str:
    return jwt.encode({"sub": uid, "email": email, "type": "access", "exp": now() + timedelta(minutes=15)},
                      os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def create_refresh_token(uid: str) -> str:
    return jwt.encode({"sub": uid, "type": "refresh", "exp": now() + timedelta(days=7)},
                      os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


def set_auth_cookies(response, user):
    response.set_cookie("access_token", create_access_token(user["id"], user["email"]), httponly=True, secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie("refresh_token", create_refresh_token(user["id"]), httponly=True, secure=True, samesite="none", max_age=604800, path="/")


PUBLIC_USER_FIELDS = {"_id": 0, "password_hash": 0}


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    auth = request.headers.get("Authorization", "")
    if not token and auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(401, "Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]}, PUBLIC_USER_FIELDS)
    if not user:
        raise HTTPException(401, "User not found")
    if user.get("status") == "suspended":
        raise HTTPException(403, "Account suspended")
    return user


def require_roles(*roles):
    async def dep(user=Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(403, "Insufficient permissions")
        return user
    return dep


staff = require_roles("instructor", "admin")
admin_only = require_roles("admin")


async def audit(actor, action, target=""):
    await db.audit_logs.insert_one({"id": new_id(), "actor": actor.get("email", "system"), "action": action,
                                    "target": target, "created_at": now_iso()})


RANKS = [(0, "Recruit"), (500, "Analyst"), (1500, "Hunter"), (3000, "Elite")]


def rank_for(xp):
    r = "Recruit"
    for t, n in RANKS:
        if xp >= t:
            r = n
    return r


async def award(user_id, xp, activity):
    today = now().date().isoformat()
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "last_active": 1, "streak": 1})
    streak = u.get("streak", 0) or 0
    last = u.get("last_active")
    if last != today:
        yesterday = (now().date() - timedelta(days=1)).isoformat()
        streak = streak + 1 if last == yesterday else 1
    await db.users.update_one({"id": user_id}, {"$inc": {"xp": xp}, "$set": {"last_active": today, "streak": streak}})
    await db.activity.insert_one({"id": new_id(), "user_id": user_id, "text": activity, "xp": xp, "created_at": now_iso()})


# ---------- Email (Emergent managed Resend) ----------
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host):
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown, real):
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject, html):
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks for credentials: {p!r}")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links must be https: {url!r}")
        if not _host_ok(urlparse(low).hostname or "") or urlparse(low).username is not None:
            raise ValueError(f"Bad URL: {url!r}")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError("Anchor text host mismatch")


async def send_email(*, to: str, subject: str, html: str):
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": os.environ["EMAIL_FROM_NAME"]}
    if os.environ.get("EMAIL_REPLY_TO"):
        payload["contact_email"] = os.environ["EMAIL_REPLY_TO"]
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f"{EMAIL_BASE_URL}/api/v1/email/send", headers={"X-Email-Key": os.environ["EMERGENT_EMAIL_KEY"]}, json=payload)
        r.raise_for_status()
        return r.json().get("id")
    except Exception as e:
        logger.warning(f"Email send failed: {e}")
        return None


def email_template(name, lines, link=None, link_text=None):
    brand = escape(os.environ["EMAIL_FROM_NAME"])
    body = "".join(f"<p style='margin:0 0 12px'>{escape(line)}</p>" for line in lines)
    btn = (f"<p><a href='{escape(link)}' style='background:#00F0FF;color:#0B0F1A;padding:10px 18px;text-decoration:none;font-weight:bold'>{escape(link_text)}</a></p>" if link else "")
    return (f"<table role='presentation' width='100%' style='background:#0B0F1A'><tr><td style='padding:28px;font-family:Arial,sans-serif;color:#E2E8F0'>"
            f"<h2 style='color:#00F0FF;font-family:monospace'>{brand}</h2><p>Hi {escape(name)},</p>{body}{btn}"
            f"<p style='font-size:12px;color:#64748B'>Sent by {brand}. We never ask for your password by email.</p></td></tr></table>")
