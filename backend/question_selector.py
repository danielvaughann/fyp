import random

from sqlalchemy.orm import Session
from models import Question

def selected_mixed_random_questions(db:Session, difficulty: str, total_questions: int):


    all_questions = db.query(Question).filter(Question.difficulty == difficulty).all()
    if len(all_questions) < total_questions:
        raise ValueError("Not enough questions in the database for the selected difficulty.")

    #mutable copy of all questions
    pool = all_questions[:]
    selected_questions = []

    last_topic = None
    for i in range(total_questions):
        attempts = 0
        question = random.sample(pool, 1)
        while question[0].topic == last_topic and attempts < 5:
            question = random.sample(pool, 1)
            attempts += 1

        selected_questions.append(question[0])
        pool.remove(question[0])
        last_topic = question[0].topic

    return selected_questions