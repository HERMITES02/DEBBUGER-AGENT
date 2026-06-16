from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.auth.models import User, AsyncSessionLocal
from app.auth.jwt import hash_password, verify_password, create_token, get_current_user  # ← was missing

router = APIRouter(prefix="/auth", tags=["auth"])

class RegisterRequest(BaseModel):
    email:    str
    username: str
    password: str

class LoginRequest(BaseModel):
    email:    str
    password: str

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

@router.post("/register")
async def register(req: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == req.email))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Email already registered")

    user = User(
        email=         req.email,
        username=      req.username,
        password_hash= hash_password(req.password)
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_token(user.id, user.email)
    return {"token": token, "user_id": user.id, "username": user.username}

@router.post("/login")
async def login(req: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email))
    user   = result.scalar_one_or_none()

    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")

    token = create_token(user.id, user.email)
    return {"token": token, "user_id": user.id, "username": user.username}

@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return current_user