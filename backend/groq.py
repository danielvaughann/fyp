import os
import json
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
                "Write app-ready feedback in plain text. "
                "No JSON, no markdown, no headings. "
                "Keep it concise and professional."

            ),
        },
        {
            #request content
            "role": "user",
            "content": (
                "Write feedback in plain text for an app.\n"
                "Output format MUST be exactly:\n"
                "What went well:\n"
                "- <bullet>\n"
                "Needs work:\n"
                "- <bullet>\n"
                "- <bullet>\n"
                "Next step: <1 sentence>\n\n"
                "Rules:\n"
                "- Bullets short (max 12 words).\n"
                "- Be specific to the user's answer.\n"
                "- No extra sections.\n\n"
                f"Question: {question_text}\n"
                f"Reference answer: {reference_answer}\n"
                f"User answer: {transcript}\n"
                f"Score: {score}/100\n"
            )

        },
    ]
    chat_completion = client.chat.completions.create(
        model = "grok-3-mini",
        messages = messages,
        max_tokens = 140,
        temperature = 0.3
    )
    return chat_completion.choices[0].message.content.strip()

def generate_overall_feedback(overall_feedback: list) -> str:
    messages = [
        {

                # set rules and behaviour
                "role": "system",
                "content": (
                    "You are an expert interview coach. "
                    "Write app-ready overall feedback in plain text. "
                    "No JSON, no markdown, no headings. "
                    "Use short paragraphs and simple sentences."
                ),
        },
        {
            "role": "user",
            "content": (
                "Write overall feedback in plain text for an app.\n"
                "Output format MUST be exactly:\n"
                "Summary: <2-3 sentences>\n"
                "Strengths:\n"
                "- <bullet>\n"
                "- <bullet>\n"
                "Improvements:\n"
                "- <bullet>\n"
                "- <bullet>\n"
                "Next step: <1 sentence>\n\n"
                "Rules:\n"
                "- Keep bullets short (max 12 words).\n"
                "- No extra sections.\n\n"
                f"Session JSON:\n{json.dumps(overall_feedback, ensure_ascii=True)}"
            )

        },
    ]
    chat_completion_overall = client.chat.completions.create(
        model = "grok-3-mini",
        messages = messages,
        max_tokens = 250,
        temperature = 0.3
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