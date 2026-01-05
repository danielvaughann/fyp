"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type SummaryResponse = {
    session: {
        id: string;
        topic: string;
        difficulty: string;
        status: string;}
    answers: Array<{
        question_id: number;
        question_text: string;
        transcript: string;
        score: number;
        feedback: string;
    }>;
};

export default function ResultsPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const sessionId = params.id;

    const [summary, setSummary] = useState<SummaryResponse | null>(null);
    const [error, setError] = useState("");
    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            router.push("/login");
            return;
        }

        async function loadSummary() {
            try {
                const res = await fetch(`http://localhost:8000/interview/${sessionId}/summary`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                const json = await res.json().catch(() => ({}));
                if (!res.ok) {
                    let message = "Failed to load interview summary";

                    if (typeof json.detail === "string") {
                        message = json.detail;
                    } else if (Array.isArray(json.detail) && json.detail.length > 0) {
                        message = json.detail[0]?.msg || message;
                    }

                    setError(message);
                    return;
                }
                setSummary(json);
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : String(e);
                setError(msg || "Failed to load interview summary");
            }
        }

        loadSummary();
    }, [router, sessionId]);
  return (
    <div>
      <h1>Results</h1>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {!error && !summary && <p>Loading...</p>}

      {summary && (
        <div>
          <p><b>Topic:</b> {summary.session.topic}</p>
          <p><b>Difficulty:</b> {summary.session.difficulty}</p>
          <p><b>Status:</b> {summary.session.status}</p>

          <hr />

          {summary.answers.map((answer_map, idx) => (
            <div key={idx} style={{ marginBottom: 20 }}>
              <p><b>Q:</b> {answer_map.question_text}</p>
              <p><b>Your answer:</b> {answer_map.transcript}</p>
              <p><b>Feedback:</b> {answer_map.feedback}</p>
              <pre>{JSON.stringify(answer_map.score, null, 2)}</pre>
              <hr />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}