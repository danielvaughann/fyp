import json
from .interview_script_agents import writer, reviewer, executor, _safe_json

def generate_script(question_topics: list[str], question_count: int, candidate_name: str | None = None) -> dict:
    prompt = {
        "candidate_name": candidate_name,
        "question_count": question_count,
        "question_topics": question_topics,
        "output_format": {
            "intro": "string",
            "transitions": ["string"],
            "closing": "string",
        },
    }
    #d

    # 1) draft
    draft_res = executor.initiate_chat(
        recipient=writer,
        message=json.dumps(prompt),
        max_turns=2,
    )
    draft = _safe_json(draft_res.chat_history[-1]["content"])

    # 2) review
    review_res = executor.initiate_chat(
        recipient=reviewer,
        message=json.dumps(draft),
        max_turns=1,
    )
    review_text = (review_res.chat_history[-1].get("content") or "").strip()

    if review_text == "APPROVED":
        return draft

    issues = _safe_json(review_text).get("issues", [])
    # 3) revise once
    revise_prompt = {
        "draft": draft,
        "issues": issues,
        "instruction": "Fix the issues and return ONLY corrected JSON in the required format."
    }
    final_res = executor.initiate_chat(
        recipient=writer,
        message=json.dumps(revise_prompt),
        max_turns=2,
    )
    final = _safe_json(final_res.chat_history[-1]["content"])

    return final
