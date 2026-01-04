import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is not set")

engine = create_engine(DATABASE_URL,pool_pre_ping=True) # sqlachemy creates connection engine to database if database is alive
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) # each request gets its own session
Base = declarative_base() # parent class to create database tables using python

def get_db():
    db = SessionLocal() # new database session
    try:
        yield db # session is given to endpoint
    finally:
        db.close()