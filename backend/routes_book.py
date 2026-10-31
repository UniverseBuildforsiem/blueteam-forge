from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from core import db, get_current_user

router = APIRouter(prefix="/api")

BOOK_ID = "soc-interview-ebook"
BOOK = {"id": BOOK_ID, "name": "SOC Interview Preparation - Ebook", "amount": 973, "mrp": 2999, "pages": 168,
        "author": "Gopi Pakanati", "udemy_url": "https://www.udemy.com/course/soc-interview-preparation-100questions-from-top-interviews/?referralCode=EB7475E7369B8DD58A38"}
PDF = Path(__file__).parent / "assets" / "book" / "soc-interview-book.pdf"
SAMPLE = Path(__file__).parent / "assets" / "book" / "sample.pdf"


async def owns_book(user):
    if user.get("role") in ("admin", "instructor"):
        return True
    return bool(await db.purchases.find_one({"user_id": user["id"], "product_id": BOOK_ID}))


@router.get("/public/book")
async def book_info():
    return {**BOOK, "off": int((1 - BOOK["amount"] / BOOK["mrp"]) * 100)}


@router.get("/me/book")
async def my_book(user=Depends(get_current_user)):
    return {"owned": await owns_book(user)}


@router.get("/me/book/sample")
async def book_sample(user=Depends(get_current_user)):
    return FileResponse(SAMPLE, media_type="application/pdf", headers={"Content-Disposition": 'inline; filename="SOC-Interview-Ebook-Free-Sample.pdf"', "Cache-Control": "private, no-store"})


@router.get("/me/book/file")
async def book_file(download: bool = False, user=Depends(get_current_user)):
    if not await owns_book(user):
        raise HTTPException(402, "Buy the ebook to read it")
    name = "SOC-Interview-Preparation-Ebook-Gopi-Pakanati.pdf"
    disp = "attachment" if download else "inline"
    return FileResponse(PDF, media_type="application/pdf", headers={"Content-Disposition": f'{disp}; filename="{name}"', "Cache-Control": "private, no-store"})
