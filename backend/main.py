from fastapi.middleware.cors import CORSMiddleware

from question_selector import selected_mixed_random_questions
from models import Question
from datetime import timedelta

from fastapi import Depends, FastAPI, HTTPException, status, BackgroundTasks
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
from grading import grader
from groq import generate_feedback, generate_overall_feedback
from agents.interview_script_orchestrator import generate_script
import random

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


INTRO_FALLBACKS = [
    "Hi — we’ll do a short technical interview. Take a moment before you answer.",
    "Welcome. I’ll ask a few technical questions. Answer as clearly as you can.",
    "Alright — let’s get started. I’ll ask a few technical questions.",
]

CLOSING_FALLBACKS = [
    "That’s the end of the interview. I’m generating your feedback now.",
    "Thanks — that’s everything. I’ll now produce your feedback.",
    "Great, we’re done. Your results will appear shortly.",
]

TRANSITIONS_SAME_TOPIC = [
    "Alright — next question.",
    "Okay, moving on.",
    "Thanks. Let’s continue.",
    "Got it. Next one.",
]

TRANSITIONS_NEW_TOPIC = [
    "Alright, let’s switch topic to {topic}.",
    "Okay — next we’ll talk about {topic}.",
    "Moving on to {topic}.",
    "Let’s change gears to {topic}.",
]

TRANSITIONS_LAST = [
    "Final question coming up.",
    "Alright — last question.",
    "Okay, final one.",
]

def build_transitions(topics_in_order: list[str]) -> list[str]:
    """
    Returns a list length (n-1): transition before Q2..Qn
    Uses topic-aware templates, deterministic-fast (no LLM).
    """
    n = len(topics_in_order)
    if n <= 1:
        return []

    transitions: list[str] = []
    for i in range(1, n):  # before question i+1
        is_last_question = (i == n - 1)
        prev_topic = topics_in_order[i - 1]
        next_topic = topics_in_order[i]

        if is_last_question:
            transitions.append(random.choice(TRANSITIONS_LAST))
            continue

        if next_topic != prev_topic:
            t = random.choice(TRANSITIONS_NEW_TOPIC).format(topic=next_topic)
            transitions.append(t)
        else:
            transitions.append(random.choice(TRANSITIONS_SAME_TOPIC))

    return transitions
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

    if len(payload.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

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
    if payload.question_count < 1 or payload.question_count > 10:
        raise HTTPException(status_code=400, detail="Question count must be between 1 and 10")
    introduction_text = None
    transition_text = []
    closing_text = None
    
    if payload.topic == "Mixed":
        selected_questions = selected_mixed_random_questions(db, payload.difficulty, payload.question_count)
        question_ids = [question.id for question in selected_questions]
        questions_in_order = db.query(Question).filter(Question.id.in_(question_ids)).all()
        question_id_to_question = {question.id: question for question in questions_in_order}
        topics_in_order = [question_id_to_question[qid].topic for qid in question_ids]

        script = generate_script(
            question_topics=topics_in_order,
            question_count=payload.question_count,
            candidate_name=None
            )
        introduction_text = script.get("intro")
        transition_text = script.get("transitions") or []
        closing_text = script.get("closing")
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
    # generate script for non-Mixed too
        topics_in_order = [q.topic for q in selected_questions]
        script = generate_script(
            question_topics=topics_in_order,
            question_count=payload.question_count,
            candidate_name=None,
        )
        introduction_text = script.get("intro")
        transition_text = script.get("transitions") or []
        closing_text = script.get("closing")

    interview_session = InterviewSession(
        user_id=user.id,
        topic=payload.topic,
        difficulty=payload.difficulty,
        question_count=payload.question_count,
        question_ids=question_ids,
        current_index=0,
        status="in_progress",
        introduction_text=introduction_text,
        transition_text=transition_text,
        closing_text=closing_text,

    )
    db.add(interview_session)
    db.commit()
    db.refresh(interview_session)
    return {"session_id": str(interview_session.id)} #return session id to frontend


class submitAnswerRequirements(BaseModel):
    transcript: str

def process_answer_async(session_id: str, answer_id: int, question_id: int, transcript: str):
    from db import SessionLocal
    db = SessionLocal()
    try:
        print(f"[GRADING] Starting grading for answer {answer_id}")
        question = db.query(Question).filter(Question.id == question_id).first()
        if not question:
            print(f"Question {question_id} not found for answer {answer_id}")
            return
        
        keywords = question.keywords or []
        sim, keywords_hit = grader.grade(
            answer=transcript,
            reference=question.reference_answer,
            question=question.text,
            keywords=keywords,
        )
        score = int(round(sim * 100))
        
        print(f"[GRADING] Generating feedback for answer {answer_id}")
        feedback = generate_feedback(
            question_text=question.text,
            reference_answer=question.reference_answer,
            transcript=transcript,
            score=score
        )
        
        answer = db.query(Answer).filter(Answer.id == answer_id).first()
        if answer:
            answer.score = score
            answer.feedback = feedback
            answer.keywords_hit = keywords_hit
            db.commit()
            print(f"[GRADING] Completed answer {answer_id} with score {score}%")
    except Exception as e:
        print(f"[GRADING] Failed to process answer: {e}")
        db.rollback()
    finally:
        db.close()

def process_overall_feedback_async(session_id: str):
    from db import SessionLocal
    db = SessionLocal()
    try:
        print(f"[OVERALL] Starting overall feedback for session {session_id}")
        interview_session = db.query(InterviewSession).filter(InterviewSession.id == session_id).first()
        if not interview_session:
            print(f"Session {session_id} not found for overall feedback")
            return
        answers = db.query(Answer).filter(Answer.session_id == session_id).all()
        summary = []
        for answer in answers:
            question = db.query(Question).filter(Question.id == answer.question_id).first()
            summary.append({
                "question_id": question.id,
                "topic": question.topic,
                "question_text": question.text,
                "reference_answer": question.reference_answer,
                "transcript": answer.transcript,
                "score": answer.score,
                "feedback": answer.feedback,
                "keywords_hit": answer.keywords_hit,
            })
        interview_session.overall_feedback = generate_overall_feedback(summary)
        db.commit()
        print(f"[OVERALL] Completed overall feedback for session {session_id}")
    except Exception as e:
        print(f"[OVERALL] Failed to generate overall feedback: {e}")
        db.rollback()
    finally:
        db.close()

@app.post("/interview/{session_id}/answer")
def submit_answer(
    session_id: str,
    payload: submitAnswerRequirements,
    background_tasks: BackgroundTasks,
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

    if not payload.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript cannot be empty")

    answer = Answer(
        session_id=interview_session.id,
        question_id=question_id,
        transcript=payload.transcript,
        score=0,
        feedback="",
        keywords_hit=[],
    )
    db.add(answer)
    db.flush()

    background_tasks.add_task(process_answer_async, session_id, answer.id, question_id, payload.transcript)

    interview_session.current_index += 1
    if interview_session.current_index >= interview_session.question_count:
        interview_session.status = "completed"
        interview_session.end_time = datetime.now(timezone.utc)
        background_tasks.add_task(process_overall_feedback_async, session_id)

    db.commit()
    return{"ok":True, "completed": interview_session.status == "completed","closing_text": interview_session.closing_text if interview_session.status == "completed" else None}

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
                "keywords_hit": answer.keywords_hit,
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

    base_text = question.text
    pre_question_text = ""

    if interview_session.current_index == 0 and interview_session.introduction_text:
        pre_question_text = interview_session.introduction_text.strip()

    elif interview_session.current_index > 0:
        i = interview_session.current_index - 1
        transitions = interview_session.transition_text or []
        if i < len(transitions):
            pre_question_text = str(transitions[i]).strip()

    full_text = f"{pre_question_text} {base_text}" if pre_question_text else base_text

    audio_url = generate_OPENAI_tts_audio(full_text)

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