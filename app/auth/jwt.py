from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
from fastapi import Request

SECRET_KEY  = os.getenv("JWT_SECRET", "change-this-in-production-use-long-random-string")
ALGORITHM   = "HS256"
TOKEN_HOURS = 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer      = HTTPBearer()

async def get_current_user_from_token(token: str) -> dict:
    return decode_token(token)

async def get_current_user_optional(request: Request):
    try:
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return None
        token = auth.replace("Bearer ", "")
        return await get_current_user_from_token(token)
    except:
        return None
    

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_token(user_id: str, email: str) -> str:
    payload = {
        "sub":    user_id,
        "email": email,
        "exp":   datetime.utcnow() + timedelta(hours=TOKEN_HOURS)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer)
) -> dict:
    """FastAPI dependency — inject into any protected route."""
    return decode_token(credentials.credentials)