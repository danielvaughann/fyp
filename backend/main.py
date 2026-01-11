from fastapi.middleware.cors import CORSMiddleware

from question_selector import selected_mixed_random_questions
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
from models import Session as InterviewSession
import random
from models import Answer
from datetime import datetime, timezone
from fastapi.staticfiles import StaticFiles # allow browser to request mp3 files
from tts import generate_tts_audio, generate_OPENAI_tts_audio
from stt import router as stt_router
from grading import roberta_cosine_grading
from groq import generate_feedback, generate_overall_feedback

app = FastAPI()
app.include_router(stt_router)
app.add_middleware( # cross origin resource sharing
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # allow frontend to make request to backend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# make files in static folder available at /static url
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/health") # uvicorn main:app --reload --port 8000
def health(): # check if api is running
    return {"status": "API running"}

@app.get("/questions/count") #return number of questions in database
def question_count(db: Session = Depends(get_db)):
    return {"count": db.query(Question).count()}

class SignupRequirements(BaseModel):
    email: EmailStr
    password: str


@app.post("/auth/signup")
def signup(payload: SignupRequirements, db: Session = Depends(get_db)):

    if db.query(User).filter(User.email == payload.email).first(): #check if user already exists
        raise HTTPException(status_code=400, detail="Email already exists")

    # create user
    user = User(email=payload.email, password_hash=get_password_hash(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user) # refresh object with database generated values (id)
    # issue jwt token
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
    #find user by email
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


# gets jwt token from authorisation header and validates
@app.get("/users/me") #protected endpoint needs token
def read_users_me(current_user: User = Depends(get_current_user)):
    return {"id": current_user.id, "email": current_user.email}

class startInterviewRequirements(BaseModel):
    topic: str
    difficulty: str
    question_count: int

@app.post("/interview/start")
def start_interview(
    payload: startInterviewRequirements,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.topic == "Mixed":
        selected_questions = selected_mixed_random_questions(db, payload.difficulty, payload.question_count)
        question_ids = [question.id for question in selected_questions]
    else:

        questions_filtered = (
            db.query(Question)
            .filter(Question.topic == payload.topic)
            .filter(Question.difficulty == payload.difficulty)
            .all()
        )
        if len(questions_filtered) < payload.question_count:
            raise HTTPException(
                status_code=400,
                detail="Not enough questions available for the selected topic and difficulty",
            )
        selected_questions = random.sample(questions_filtered, payload.question_count)
        question_ids = [question.id for question in selected_questions]
    # create new interview session in database

    interview_session = InterviewSession(
        user_id=user.id,
        topic=payload.topic,
        difficulty=payload.difficulty,
        question_count=payload.question_count,
        question_ids=question_ids,
        current_index=0,
        status="in_progress",

    )
    db.add(interview_session)
    db.commit()
    db.refresh(interview_session)
    return {"session_id": str(interview_session.id)} #return session id to frontend


class submitAnswerRequirements(BaseModel):
    transcript: str

@app.post("/interview/{session_id}/answer")
def submit_answer(
    session_id: str, # path from url
    payload: submitAnswerRequirements,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    interview_session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id)
        .filter(InterviewSession.user_id == user.id)
        .first()
    )
    if not interview_session:
        raise HTTPException(status_code=404, detail="Interview session not found")

    if interview_session.status != "in_progress":
        raise HTTPException(status_code=400, detail="Interview session is not active")

    if interview_session.current_index >= interview_session.question_count:
        raise HTTPException(status_code=400, detail="All questions have been answered")

    question_id = interview_session.question_ids[interview_session.current_index]
    question = db.query(Question).filter(Question.id == question_id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    sim = roberta_cosine_grading(payload.transcript, question.reference_answer)
    #TODO uncomment abouve

    score = int(round(sim * 100))

    print("LLM starting single question feedback generation")

    feedback = generate_feedback(question_text=question.text, reference_answer=question.reference_answer, transcript=payload.transcript,score=score,)
    print("LLM stopping single question feedback generation")

    answer = Answer(
        session_id=interview_session.id,
        question_id=question_id,
        transcript=payload.transcript,
        score=score,
        feedback=feedback,
    )
    db.add(answer)

    interview_session.current_index += 1
    if interview_session.current_index >= interview_session.question_count:
        interview_session.status = "completed"
        interview_session.end_time = datetime.now(timezone.utc)

        #build overall summary and add to database here so its ready for results page
        answers = (
            db.query(Answer)
            .filter(Answer.session_id == interview_session.id)
            .all()
        )

        summary = []
        for answer in answers:
            question = db.query(Question).filter(Question.id == answer.question_id).first()
            summary.append(
                {
                    "question_id": question.id,
                    "topic": question.topic,
                    "question_text": question.text,
                    "reference_answer": question.reference_answer,
                    "transcript": answer.transcript,
                    "score": answer.score,
                    "feedback": answer.feedback,
                }
            )
        summary_object = {
            "session": {
                "id": str(interview_session.id),
                "topic": interview_session.topic,
                "difficulty": interview_session.difficulty,
                "status": interview_session.status,
            },
            "answers": summary,
        }
        print("LLM starting OVERALL question feedback generation")
        interview_session.overall_feedback = generate_overall_feedback(summary_object)
        #interview_session.overall_feedback = "TODO: change this to overall feedback variable"

        print("LLM starting OVERALL question feedback generation")

    db.commit()
    return{"ok":True, "completed": interview_session.status == "completed"}

@app.get("/interview/{session_id}/summary")
def get_interview_summary(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    interview_session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id)
        .filter(InterviewSession.user_id == user.id)
        .first()
    )
    if not interview_session:
        raise HTTPException(status_code=404, detail="Interview session not found")

    if interview_session.status != "completed":
        raise HTTPException(status_code=400, detail="Interview session is not completed")

    answers = (
        db.query(Answer)
        .filter(Answer.session_id == interview_session.id)
        .all()
    )

    summary = []
    for answer in answers:
        question = db.query(Question).filter(Question.id == answer.question_id).first()
        summary.append(
            {
                "question_id": question.id,
                "topic": question.topic,
                "question_text": question.text,
                "reference_answer": question.reference_answer,
                "transcript": answer.transcript,
                "score": answer.score,
                "feedback": answer.feedback,
            }
        )

    return {
        "session": {
            "id": str(interview_session.id),
            "topic": interview_session.topic,
            "difficulty": interview_session.difficulty,
            "status": interview_session.status,
            "overall_feedback": interview_session.overall_feedback,
        },
        "answers": summary,
    }

@app.get("/interview/{session_id}/current")
def get_current_question(
    session_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    interview_session = (
        db.query(InterviewSession)
        .filter(InterviewSession.id == session_id)
        .filter(InterviewSession.user_id == user.id)
        .first()
    )
    if not interview_session:
        raise HTTPException(status_code=404, detail="Interview session not found")

    if interview_session.status != "in_progress":
        raise HTTPException(status_code=400, detail="Interview session is not active")

    if interview_session.current_index >= interview_session.question_count:
        raise HTTPException(status_code=400, detail="All questions have been answered")

    # get current question from json array
    question_id = interview_session.question_ids[interview_session.current_index]
    question = db.query(Question).filter(Question.id == question_id).first()

    if not question:
        raise HTTPException(status_code=500, detail="Question not found")

    #create mp3 file for question
    #audio_url = generate_tts_audio(question.text)
    audio_url = generate_OPENAI_tts_audio(question.text)

    return {
        "done": False,
        "index": interview_session.current_index,
        "total": interview_session.question_count,
        "question": {
            "id": question.id,
            "topic": question.topic,
            "difficulty": question.difficulty,
            "text": question.text,
            "audio_url": audio_url,
        },
    }