import os
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv()

client = OpenAI(
    api_key= os.getenv("GROQ_API"),
    base_url="https://api.x.ai/v1"
)
def generate_feedback(question_text: str, reference_answer: str, transcript: str, score: int) -> str:
    messages = [
        {
            #set rules and behaviour
            "role": "system",
            "content": (
                "You are an expert interview coach. "
                "Provide constructive feedback on the user's answer to the interview question. "
                "Highlight strengths and areas for improvement in a concise manner."
            ),
        },
        {
            #request content
            "role": "user",
            "content": (
                f"Question:\n{question_text}\n\n"
                f"Reference Answer:\n{reference_answer}\n\n"
                f"User's Answer:\n{transcript}\n\n"
                f"Score (0-100): {score}\n\n"
                "Write 2-4 sentences of feedback based on the users answer."
                "Mention what they did good and what could be improved."
                "Be concise and specific"
            ),
        },
    ]
    chat_completion = client.chat.completions.create(
        model = "grok-3-mini",
        messages = messages,
        max_tokens = 140,
    )
    return chat_completion.choices[0].message.content.strip()

def generate_overall_feedback(overall_feedback: list) -> str:
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert interview coach. "
                "Provide overall constructive feedback based on multiple pieces of feedback. "
                "Highlight common strengths and areas for improvement in a concise manner."
            ),
        },
        {
            "role": "user",
            "content": (
                "Here is the whole interiew as JSON. For each question it contains, reference answer, user answer, and score (0-100):\n\n"
                f"{overall_feedback}\n\n"
                "Write:\n"
                "1: A short overall summary"
                "2: Common strengths across the answers"
                "3: Common areas for improvement across the answers"
                "Common trends noticed"
                "Next steps to improve or what to practice on"
                "Mention if answers were too short or too long"
            ),
        },
    ]
    chat_completion_overall = client.chat.completions.create(
        model = "grok-3-mini",
        messages = messages,
        max_tokens = 400,
    )
    return chat_completion_overall.choices[0].message.content.strip()

def test_feedback():
    question = "What is the capital of France?"
    reference = "The capital of France is Paris."
    answer = "I think the capital of France is Berlin."
    score = 40
    feedback = generate_feedback(question, reference, answer, score)
    print("Feedback:", feedback)

if __name__ == "__main__":
    test_feedback()