import os
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext
from dotenv import load_dotenv
load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    raise ValueError("JWT_SECRET environment variable is not set")

ALGORITHM = "HS256" #signing algorithm, attatches signature to token
ACCESS_TOKEN_EXPIRE_MINUTES = 60

encrypt_password = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return encrypt_password.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return encrypt_password.hash(password)

def create_access_token(sub: str, expires_delta: timedelta | None = None) -> str:
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta if expires_delta else timedelta(minutes=15))

    to_encode = {
        "sub": sub,  # user id as a string
        "iat": int(now.timestamp()), # issued at
        "exp": int(expire.timestamp()), # expires at
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        raise ValueError("Invalid or expired token") from e