import os
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from core import db, get_current_user, send_email, email_template, now_iso

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


@router.get("/me/book/sample/{n}.jpg")
async def sample_page(n: int, user=Depends(get_current_user)):
    if not 1 <= n <= 10:
        raise HTTPException(404, "Sample has 10 pages")
    return FileResponse(Path(__file__).parent / "assets" / "book" / "sample" / f"{n}.jpg", media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})


async def send_book_receipt(user_id, payment):
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1, "email": 1})
    if not u:
        return
    base = os.environ["FRONTEND_URL"]
    lines = ["Thanks for buying the SOC Interview Preparation ebook. Here is your receipt.",
             f"Item: {BOOK['name']}", f"Amount paid: ₹{payment['amount']:,}", f"Order ID: {payment['id']}",
             f"Payment method: {payment['provider'].title()}", f"Date: {now_iso()[:10]}",
             "You can read it online or download the PDF any time, and the 30-question AI mock interview is now unlocked."]
    await send_email(to=u["email"], subject="Your SOC Interview ebook receipt", html=email_template(u["name"], lines, f"{base}/book", "Read your ebook"))


@router.get("/me/book/file")
async def book_file(download: bool = False, user=Depends(get_current_user)):
    if not await owns_book(user):
        raise HTTPException(402, "Buy the ebook to read it")
    name = "SOC-Interview-Preparation-Ebook-Gopi-Pakanati.pdf"
    disp = "attachment" if download else "inline"
    return FileResponse(PDF, media_type="application/pdf", headers={"Content-Disposition": f'{disp}; filename="{name}"', "Cache-Control": "private, no-store"})
