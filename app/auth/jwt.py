from jose import JWTError, jwt
import bcrypt
from datetime import datetime, timedelta
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
from fastapi import Request

SECRET_KEY  = os.getenv("JWT_SECRET", "change-this-in-production-use-long-random-string")
ALGORITHM   = "HS256"
TOKEN_HOURS = 24

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
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    try:
        pwd_bytes = plain.encode('utf-8')[:72]
        hashed_bytes = hashed.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False

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