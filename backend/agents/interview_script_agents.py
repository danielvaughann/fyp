import json
from autogen import ConversableAgent, LLMConfig

llm_config = LLMConfig.from_json(path="OAI_CONFIG_LIST")

writer = ConversableAgent(
    name="script_writer",
    system_message=(
        "You write a short interview script for a technical interview.\n"
        "Return ONLY JSON with keys: intro, transitions, closing.\n"
        "Rules:\n"
        "- transitions length must equal (question_count - 1)\n"
        "- Keep each line short (<= 18 words)\n"
        "- Neutral tone: do NOT praise or judge answers (no 'good answer')\n"
        "- Sound like a real interviewer\n"
    ),
    llm_config=llm_config,
)

reviewer = ConversableAgent(
    name="script_reviewer",
    system_message=(
        "You validate the script JSON and enforce rules strictly.\n"
        "If valid, reply exactly: APPROVED\n"
        "If invalid, reply exactly in JSON: {\"issues\":[...]} and list concrete issues.\n"
        "Do NOT rewrite the script yourself."
    ),
    llm_config=llm_config,
)

executor = ConversableAgent(
    name="executor",
    human_input_mode="NEVER",
    llm_config=llm_config,
)

def _safe_json(s: str) -> dict:
    try:
        return json.loads(s)
    except Exception:
        return {}
