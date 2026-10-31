import os
import re
import secrets
from datetime import timedelta
from fastapi import APIRouter, Request, Response, HTTPException, Depends
from pydantic import BaseModel, Field
import jwt
from core import (db, now, now_iso, new_id, hash_password, verify_password, set_auth_cookies, get_current_user,
                  create_access_token, JWT_ALGORITHM, PUBLIC_USER_FIELDS, send_email, email_template)

router = APIRouter(prefix="/api/auth")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")
GOAL_PATH = {"SOC L1": "soc-l1", "SOC L2": "soc-l2", "IR": "incident-response", "Interview Prep": "interview-prep"}


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: str
    username: str = Field(min_length=3, max_length=24, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: str
    password: str


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class GoalIn(BaseModel):
    goal: str


def clean(u):
    u.pop("_id", None)
    u.pop("password_hash", None)
    return u


@router.post("/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Invalid email format")
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    if await db.users.find_one({"username": body.username.lower()}):
        raise HTTPException(400, "Username taken")
    user = {"id": new_id(), "name": body.name.strip(), "email": email, "username": body.username.lower(),
            "password_hash": hash_password(body.password), "role": "student", "status": "active", "plan": "free",
            "goal": None, "current_path": None, "onboarded": False, "xp": 0, "streak": 0, "last_active": None, "created_at": now_iso()}
    await db.users.insert_one(user)
    set_auth_cookies(response, user)
    return clean(user)


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.strip().lower()
    ident = f"{request.client.host if request.client else 'x'}:{email}"
    att = await db.login_attempts.find_one({"identifier": ident})
    if att and att.get("count", 0) >= 5 and att.get("locked_until", "") > now_iso():
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        await db.login_attempts.update_one({"identifier": ident}, {"$inc": {"count": 1}, "$set": {"locked_until": (now() + timedelta(minutes=15)).isoformat()}}, upsert=True)
        raise HTTPException(401, "Invalid email or password")
    if user.get("status") == "suspended":
        raise HTTPException(403, "Account suspended. Contact support.")
    await db.login_attempts.delete_one({"identifier": ident})
    set_auth_cookies(response, user)
    return clean(user)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/", secure=True, samesite="none")
    response.delete_cookie("refresh_token", path="/", secure=True, samesite="none")
    return {"ok": True}


@router.get("/me")
async def me(user=Depends(get_current_user)):
    return user


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "No refresh token")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Invalid token type")
    user = await db.users.find_one({"id": payload["sub"]}, PUBLIC_USER_FIELDS)
    if not user:
        raise HTTPException(401, "User not found")
    response.set_cookie("access_token", create_access_token(user["id"], user["email"]), httponly=True, secure=True, samesite="none", max_age=900, path="/")
    return clean(user)


@router.post("/forgot-password")
async def forgot(body: ForgotIn):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Invalid email format")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user:
        token = secrets.token_urlsafe(32)
        await db.password_reset_tokens.insert_one({"token": token, "user_id": user["id"], "used": False, "expires_at": now() + timedelta(hours=1)})
        link = f"{os.environ['FRONTEND_URL']}/reset-password?token={token}"
        await send_email(to=email, subject="Reset your SOCForge password",
                         html=email_template(user["name"], ["We received a request to reset your password. This link expires in 1 hour.", "If you did not request this, you can ignore this email."], link, "Reset password"))
    return {"ok": True, "message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset(body: ResetIn):
    rec = await db.password_reset_tokens.find_one({"token": body.token})
    if not rec or rec.get("used"):
        raise HTTPException(400, "Invalid or used reset link")
    exp = rec["expires_at"]
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=now().tzinfo)
    if exp < now():
        raise HTTPException(400, "Reset link expired")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_password(body.password)}})
    await db.password_reset_tokens.update_one({"token": body.token}, {"$set": {"used": True}})
    return {"ok": True}


@router.post("/onboarding")
async def onboarding(body: GoalIn, user=Depends(get_current_user)):
    if body.goal not in GOAL_PATH:
        raise HTTPException(400, "Invalid goal")
    await db.users.update_one({"id": user["id"]}, {"$set": {"goal": body.goal, "current_path": GOAL_PATH[body.goal], "onboarded": True}})
    updated = await db.users.find_one({"id": user["id"]}, PUBLIC_USER_FIELDS)
    return clean(updated)
