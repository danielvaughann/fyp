"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type SummaryResponse = {
    session: {
        id: string;
        topic: string;
        difficulty: string;
        status: string;
        overall_feedback: string;
    };
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

    function logout() {
        localStorage.removeItem("token");
        router.push("/login");
    }
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

    const averageScore = summary?.answers.length
        ? Math.round(summary.answers.reduce((sum, a) => sum + a.score, 0) / summary.answers.length)
        : 0;

  return (
    <div className="page">
      <div className="header">
        <h1>Interview Simulator</h1>
        <button onClick={logout}>Logout</button>
      </div>

      <div className="form-container" style={{ marginTop: 24, maxWidth: 800 }}>
        <h2>Results</h2>
        {error && <p className="error">{error}</p>}
        {!error && !summary && <p>Loading...</p>}

        {summary && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <p><b>Topic:</b> {summary.session.topic}</p>
              <p><b>Difficulty:</b> {summary.session.difficulty}</p>
              <p><b>Status:</b> {summary.session.status}</p>
              <p><b>Average Score:</b> {averageScore}%</p>
            </div>

            <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />
              {summary.session.overall_feedback && (
                <div style={{ marginTop: 12, marginBottom: 12 }}>
                  <h3>Overall feedback</h3>
                  <p>{summary.session.overall_feedback}</p>
                  <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />
                 </div>
              )}

            {summary.answers.map((answer_map, idx) => (
              <div key={idx} style={{ marginBottom: 20 }}>
                <p><b>Q:</b> {answer_map.question_text}</p>
                <p><b>Your answer:</b> {answer_map.transcript}</p>
                <p><b>Feedback:</b> {answer_map.feedback}</p>
                <p>
                  <b>Score:</b>{" "}
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: 14,
                      fontWeight: 500,
                      background: "#dbeafe",
                      color: "var(--primary)",
                    }}
                  >
                    {answer_map.score}%
                  </span>
                </p>
                <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}