from db import SessionLocal
from models import Question

QUESTIONS = [
    {
        "topic": "Data Structures",
        "difficulty": "Junior",
        "question": "What is a data structure and why do we use them in programs?",
        "reference_answer": (
            "A data structure is a way of organizing and storing data in memory so it can be "
            "accessed and updated efficiently. Different data structures, like arrays or lists, "
            "provide different operations and performance trade-offs for organizing and retrieving data."
        ),
        "keywords": [
            "organize data",
            "store and access",
            "efficient retrieval",
            "operations",
            "time space tradeoff",
        ],
    },
    {
        "topic": "Data Structures",
        "difficulty": "Junior",
        "question": "What is a linked list and when would you use it instead of an array?",
        "reference_answer": (
            "A linked list is a linear data structure where each element, or node, stores a value "
            "and a pointer to the next node instead of using contiguous array slots. "
            "You use a linked list when you want easy insertions and deletions, especially in the middle, "
            "and you do not need fast random indexing like an array provides."
        ),
        "keywords": [
            "node",
            "pointer",
            "non contiguous memory",
            "easy insertion deletion",
            "no random access",
        ],
    },
    {
        "topic": "Stacks & Queues",
        "difficulty": "Junior",
        "question": "What is a queue and explain the first in first out principle.",
        "reference_answer": (
            "A queue is a linear data structure that follows the First In First Out (FIFO) principle. "
            "New elements are inserted at the rear, and elements are removed from the front, "
            "so the first element added to the queue is the first element that gets removed."
        ),
        "keywords": [
            "queue",
            "first in first out",
            "FIFO",
            "enqueue",
            "dequeue",
        ],
    },
    {
        "topic": "Stacks & Queues",
        "difficulty": "Junior",
        "question": "What are the basic operations you can perform on a stack?",
        "reference_answer": (
            "The basic operations on a stack are PUSH, which adds an element to the top of the stack, "
            "POP, which removes the top element, and PEEK, which returns the value at the top without removing it. "
            "Stacks may also provide helpers like isEmpty or isFull to check their state."
        ),
        "keywords": [
            "push",
            "pop",
            "peek",
            "top",
            "isEmpty",
        ],
    },
    {
        "topic": "Algorithms & Complexity",
        "difficulty": "Junior",
        "question": "What is an algorithm and why do we analyze its time complexity?",
        "reference_answer": (
            "An algorithm is a step-by-step procedure for solving a problem or performing a computation. "
            "We analyze time complexity to estimate how the running time grows with input size, so we can "
            "compare different algorithms and choose an efficient one for the data and constraints we have."
        ),
        "keywords": [
            "step by step procedure",
            "time complexity",
            "input size n",
            "efficiency",
            "performance",
        ],
    },
    {
        "topic": "Algorithms & Complexity",
        "difficulty": "Junior",
        "question": "What does Big O notation describe in algorithm analysis?",
        "reference_answer": (
            "Big O notation describes an upper bound on how an algorithm's running time or space usage grows "
            "as the input size increases. It lets us ignore constant factors and focus on the dominant term, "
            "using classes like O(1), O(log n), O(n), or O(n^2) to compare algorithms."
        ),
        "keywords": [
            "Big O",
            "upper bound",
            "growth rate",
            "time complexity classes",
            "ignore constants",
        ],
    },
    {
        "topic": "Sorting & Searching",
        "difficulty": "Junior",
        "question": "What is binary search and what requirement does it have on the input?",
        "reference_answer": (
            "Binary search is an efficient search algorithm that repeatedly halves the search range by comparing "
            "the target value to the middle element of a sorted array. It requires the input array to be sorted "
            "and runs in O(log n) time, which is much faster than linear search for large arrays."
        ),
        "keywords": [
            "binary search",
            "sorted array requirement",
            "middle element",
            "halve search space",
            "O(log n)",
        ],
    },
    {
        "topic": "Operating Systems",
        "difficulty": "Junior",
        "question": "What is a process in an operating system?",
        "reference_answer": (
            "A process is a program in execution together with its state. "
            "It has a process control block that tracks information like the process ID, "
            "program counter, CPU registers, memory pointers, and current state so the OS can "
            "schedule and manage it."
        ),
        "keywords": [
            "process",
            "program in execution",
            "process ID",
            "PCB",
            "state and resources",
        ],
    },
    {
        "topic": "Databases",
        "difficulty": "Junior",
        "question": "What does SQL stand for and what is it used for?",
        "reference_answer": (
            "SQL stands for Structured Query Language. It is used to create, read, update, and delete data "
            "in relational databases and to define and manage database schemas using standardized commands."
        ),
        "keywords": [
            "Structured Query Language",
            "relational databases",
            "CRUD",
            "SELECT",
            "schema",
        ],
    },
    {
        "topic": "Networking & Web",
        "difficulty": "Junior",
        "question": "What does HTTP stand for and what does status code 404 mean?",
        "reference_answer": (
            "HTTP stands for Hypertext Transfer Protocol and it defines how web clients and servers "
            "communicate using requests and responses. A 404 status code means Not Found, indicating "
            "that the requested resource could not be located on the server."
        ),
        "keywords": [
            "HTTP",
            "Hypertext Transfer Protocol",
            "status code",
            "404 not found",
            "request response",
        ],
    },
]



def seed_questions():
    db = SessionLocal()
    try:
        for q in QUESTIONS:
            question = Question(
                topic=q["topic"],
                difficulty=q["difficulty"],
                text=q["question"],
                reference_answer=q["reference_answer"],
                keywords=q["keywords"],
            )
            db.add(question)

        db.commit()
        print(f"Seeded {len(QUESTIONS)} questions successfully.")

    except Exception as e:
        db.rollback()
        print("Error seeding questions:", e)
    finally:
        db.close()


if __name__ == "__main__":
    seed_questions()
