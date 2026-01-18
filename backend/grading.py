"""
from sentence_transformers import SentenceTransformer, util
print("Loading model...")

#embedder = SentenceTransformer("stsb-roberta-large")
embedder = SentenceTransformer("all-MiniLM-L6-v2")
print("Model loaded.")


def roberta_cosine_grading(answer: str, reference: str) -> float:
    emb = embedder.encode(
        [answer, reference],
        convert_to_tensor=True,
        normalize_embeddings=True
    )
    sim = util.cos_sim(emb[0], emb[1]).item()
    sim = float(max(0.0, min(1.0, sim)))
    return sim

def test_scoring():
    answer = "The capital of France is Paris."
    reference = "Paris is the capital city of France."
    score = roberta_cosine_grading(answer, reference)
    print(score)
if __name__ == "__main__":
    test_scoring()
"""
import os
from typing import List, Tuple
import requests
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer, util


load_dotenv()


class GradingSystem:
    def __init__(self):
        self.api_key = os.getenv("GROQ_API")
        if not self.api_key:
            raise RuntimeError("Missing GROQ_API in environment")
        self.base_url = "https://api.x.ai/v1/chat/completions"
        self.model = os.getenv("XAI_MODEL", "grok-3-mini")
        self.sbert = SentenceTransformer("all-MiniLM-L6-v2")

    def grade(self, answer: str, reference: str, question: str, keywords: List[str])  -> Tuple[float, List[str]]:
        sbert_score = self._sbert_score(answer, reference)
        keyword_score, hits  = self._keyword_score(answer, keywords)
        llm_score = self._llm_score(question, reference, answer, keywords)

        print(f"SBERT: {sbert_score:.1f}/100, Keywords: {keyword_score:.1f}/100, LLM: {llm_score:.1f}/100")

        baseline = sbert_score * 0.40 + keyword_score * 0.30
        final = baseline + llm_score * 0.30
        final_float_score = max(0.0, min(100.0, final)) / 100.0
        return final_float_score, hits

    def _sbert_score(self, answer: str, reference: str) -> float:
        if not answer or not reference:
            return 0.0
        emb = self.sbert.encode([answer, reference], convert_to_tensor=True)
        sim = util.pytorch_cos_sim(emb[0], emb[1]).item()
        return sim * 100.0

    def _keyword_score(self, answer: str, keywords: List[str]) -> Tuple[float, List[str]]:
        answer_clean = answer.lower()
        for c in ".,!?/()[]<>":
            answer_clean = answer_clean.replace(c, " ")
        words = set(answer_clean.split())

        hits: list[str] = []
        matched = 0
        for kw in keywords:
            k = kw.lower()
            if k in answer_clean:
                matched += 1
                hits.append(kw)
                continue
            kw_words = set(k.replace("-", " ").split())
            if kw_words & words:
                matched += 1
        threshold = 3
        if matched >= threshold:
            return 100.0, hits
        return (matched / threshold) * 100.0, hits

    def _llm_score(self, question: str, reference: str, answer: str, keywords: List[str]) -> float:
        prompt = f"""Give a harsh verdict.

        QUESTION: {question}
        KEYWORDS: {', '.join(keywords)}
        REFERENCE: {reference}
        ANSWER: {answer}

        RULES:
        - CORRECT: Clear understanding of core concept
        - MOSTLY_CORRECT: Some key ideas right but missing details
        - INCORRECT: Fundamentally wrong

        Format:
        VERDICT: [CORRECT | MOSTLY_CORRECT | INCORRECT]"""
        try:
            r = requests.post(
                self.base_url,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system",
                         "content": "You are a harsh Computer Science interview grader. Respond in exact format."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.2,
                    "max_tokens": 50,
                },
                timeout=30,
            )
            if not r.ok:
                return 0.0
            content = r.json()["choices"][0]["message"]["content"]
            if "CORRECT" in content and "MOSTLY" not in content:
                return 100.0
            if "MOSTLY" in content:
                return 50.0
            return 0.0
        except Exception:
            return 0.0

grader = GradingSystem()
if __name__ == "__main__":
    grader = GradingSystem()
    answer = "A stack is a LIFO structure where you push and pop items from the top. Used in recursion and undo/redo."
    reference = "A stack is a LIFO data structure where insertion and removal happen at the same end (the top). It is used for recursion, undo/redo and parsing."
    question = "What is a stack data structure and when would you use it?"
    keywords = ["stack", "LIFO", "push", "pop", "insertion", "removal"]
    score = grader.grade(answer, reference, question, keywords)
    print(score)