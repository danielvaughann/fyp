import random

INTRO_TEMPLATES = [
    "Welcome to the technical interview. We'll cover {topics}.",
    "Hello — we'll go through a short technical interview on {topics}.",
    "Welcome. Today we'll discuss {topics}.",
    "Hi there. We'll run through a few technical questions on {topics}.",
]

TRANSITION_GENERIC = [
    "Moving on to the next topic.",
    "Now, let's move to the next topic.",
    "Alright, onto the next question.",
    "Okay — next one.",
    "Let’s continue.",
]

TRANSITION_TOPIC = [
    "Moving on to {topic}.",
    "Now, let's move to {topic}.",
    "Alright — next topic: {topic}.",
    "Okay, switching to {topic}.",
]

TRANSITION_FINAL = [
    "Now, let's cover the final question.",
    "Alright, onto our final question.",
    "Final question coming up.",
    "Okay — last question.",
]

CLOSING_TEMPLATES = [
    "That wraps up our questions. Thank you for your time.",
    "That covers our questions. Thank you.",
    "That concludes the interview. Thanks for your time.",
    "That’s everything. Thank you — your feedback will be generated now.",
]

def _format_topics_for_intro(topics_in_order: list[str]) -> str:
    # unique but keep order
    seen = set()
    topics = []
    for t in topics_in_order:
        if t not in seen:
            seen.add(t)
            topics.append(t)

    if not topics:
        return "a few core CS topics"
    if len(topics) == 1:
        return topics[0]
    if len(topics) == 2:
        return f"{topics[0]} and {topics[1]}"
    # 3+
    return f"{topics[0]}, {topics[1]}, and {topics[2]}"

def build_intro(topics_in_order: list[str]) -> str:
    topics_text = _format_topics_for_intro(topics_in_order)
    return random.choice(INTRO_TEMPLATES).format(topics=topics_text)

def build_closing() -> str:
    return random.choice(CLOSING_TEMPLATES)

def build_transitions(topics_in_order: list[str]) -> list[str]:
    """
    Returns a list of length (n-1), used before Q2..Qn.
    Similar style to your agent outputs.
    """
    n = len(topics_in_order)
    if n <= 1:
        return []

    transitions = []
    for i in range(1, n):
        is_last = (i == n - 1)
        prev_topic = topics_in_order[i - 1]
        next_topic = topics_in_order[i]

        if is_last:
            transitions.append(random.choice(TRANSITION_FINAL))
            continue

        if next_topic != prev_topic:
            transitions.append(random.choice(TRANSITION_TOPIC).format(topic=next_topic))
        else:
            transitions.append(random.choice(TRANSITION_GENERIC))

    return transitions
