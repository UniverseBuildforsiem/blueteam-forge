import json
import re
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from core import db, get_current_user, now_iso

router = APIRouter(prefix="/api/kali")
KEY = re.compile(r"^[a-z0-9-]{1,60}$")


class StateIn(BaseModel):
    fs: Dict[str, Any] = Field(default_factory=dict)
    done: List[str] = Field(default_factory=list, max_length=50)
    hints: Dict[str, int] = Field(default_factory=dict)


def check(key):
    if not KEY.match(key):
        raise HTTPException(400, "Bad lab key")


@router.get("/state/{key}")
async def get_state(key: str, user=Depends(get_current_user)):
    check(key)
    doc = await db.kali_state.find_one({"user_id": user["id"], "key": key}, {"_id": 0})
    return doc or {"key": key, "fs": None, "done": [], "hints": {}}


@router.put("/state/{key}")
async def put_state(key: str, body: StateIn, user=Depends(get_current_user)):
    check(key)
    if len(json.dumps(body.fs)) > 1_000_000:
        raise HTTPException(413, "Filesystem too large (1 MB limit). Delete some files.")
    await db.kali_state.update_one({"user_id": user["id"], "key": key}, {"$set": {**body.model_dump(), "updated_at": now_iso()}}, upsert=True)
    return {"ok": True}


@router.delete("/state/{key}")
async def reset_state(key: str, user=Depends(get_current_user)):
    check(key)
    await db.kali_state.delete_one({"user_id": user["id"], "key": key})
    return {"ok": True}
