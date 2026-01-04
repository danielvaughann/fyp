from fastapi.middleware.cors import CORSMiddleware
from models import Question
from datetime import timedelta

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from db import get_db
from models import User
from security import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    get_password_hash,
    verify_password,
)
from deps import get_current_user


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health") # uvicorn main:app --reload --port 8000
def health():
    return {"status": "API running"}

@app.get("/questions/count")
def question_count(db: Session = Depends(get_db)):
    return {"count": db.query(Question).count()}

class SignupReq(BaseModel):
    email: EmailStr
    password: str


@app.post("/auth/signup")
def signup(payload: SignupReq, db: Session = Depends(get_db)):

    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already exists")

    user = User(email=payload.email, password_hash=get_password_hash(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    # issue token immediately (same as login)
    expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(sub=str(user.id), expires_delta=expires)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user.id, "email": user.email},
    }


@app.post("/token")
def login_for_access_token(  #login OAuth2PasswordBearer
    form_data: OAuth2PasswordRequestForm = Depends(), # extract login for data
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_access_token(sub=str(user.id), expires_delta=expires)
    return {"access_token": token, "token_type": "bearer"}


# --- Protected endpoint example ---
@app.get("/users/me")
def read_users_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "email": current_user.email}