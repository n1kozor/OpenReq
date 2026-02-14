from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    if expires_delta is not None:
        expire = datetime.now(timezone.utc) + expires_delta
        to_encode = {"sub": subject, "exp": expire}
    else:
        minutes = settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES
        if minutes and minutes > 0:
            expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
            to_encode = {"sub": subject, "exp": expire}
        else:
            # No expiration
            to_encode = {"sub": subject}
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None
