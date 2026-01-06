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