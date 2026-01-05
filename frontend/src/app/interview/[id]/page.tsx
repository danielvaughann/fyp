"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";

// define structure of api response
type CurrentResponse = {
    done: boolean;
    index?: number;
    total?: number;
    question: null | {
        id: number;
        text: string;
        difficulty: string;
        topic: string;
        audio_url?: string;
    };
};
// main component exported from this file
export default function InterviewPage() {
    const router = useRouter();
    // extract url parameters [id]
    const params = useParams<{ id: string }>();
    const sessionId = params.id;

    const [current, setCurrent] = useState<CurrentResponse | null>(null);
    const [answer, setAnswer] = useState("");
    const [error, setError] = useState("");
    // reference to audio element between renders
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [autoPlayBlocked, setAutoPlayBlocked] = useState(false);

    // get current question from api
    async function loadCurrentQuestion() {
        setError("");
        const token = localStorage.getItem("token");
        if (!token) {
            router.push("/login");
            return;
        }
        const res = await fetch(`http://localhost:8000/interview/${sessionId}/current`, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            let message = "Failed to load current question";

            if (typeof data.detail === "string") {
                message = data.detail;
            } else if (Array.isArray(data.detail) && data.detail.length > 0) {
                message = data.detail[0]?.msg || message;
            }

            setError(message);
            return;
        }
        // if interview is done
        if (data.done) {
            router.push(`/results/${sessionId}`);
            return;
        }
        setCurrent(data);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
    useEffect(() => {
        loadCurrentQuestion();
    }, [sessionId]); // runs again when session id changes

    async function submitAnswer() {
        setError("");
        const token = localStorage.getItem("token");
        if (!token) {
            router.push("/login");
            return;
        }
        if (!answer.trim()) {
            setError("Answer cannot be empty");
            return;
        }
        const res = await fetch(`http://localhost:8000/interview/${sessionId}/answer`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ transcript: answer }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            let message = "Failed to submit answer";

            if (typeof data.detail === "string") {
                message = data.detail;
            } else if (Array.isArray(data.detail) && data.detail.length > 0) {
                message = data.detail[0]?.msg || message;
            }

            setError(message);
            return;
        }
        setAnswer("");
        if (data.completed) {
            router.push(`/results/${sessionId}`);
            return;
        }
        loadCurrentQuestion();
    }
        useEffect(() => {
          const audioUrl = current?.question?.audio_url;
          if (!audioUrl) return;
          setAutoPlayBlocked(false)

          if (audioRef.current) {
            audioRef.current.pause();
          }

          const audio = new Audio(`http://localhost:8000${audioUrl}`);
          audioRef.current = audio;

          audio.play().catch(() => {

            setAutoPlayBlocked(true);
          });

          return () => {
            audio.pause();
          };
        }, [current?.question?.audio_url]);



    return (
        <div className="page">
            <h2>Interview</h2>
            {error && <p className="error">{error}</p>}
            {!current && <p>Loading...</p>}
            {current && current.question && (
                <div>
                    <p>
                    Question {(current.index ?? 0) + 1} / {current.total ?? "?"}
                    </p>
                    <p>{current.question.text}</p>
                    <textarea
                        value={answer}
                        onChange={(e) => setAnswer((e.target as HTMLTextAreaElement).value)}
                        rows={6}
                        cols={60}
                    />
                    <br />
                    <button onClick={submitAnswer}>Submit Answer</button>
                    <button
                      onClick={() => {
                        const audio_file = audioRef.current;
                        if (!audio_file) return;

                        audio_file.currentTime = 0;
                        audio_file.play().catch(() => {
                          // autoplay blocked — show message
                          setAutoPlayBlocked(true);
                        });
                      }}
                    >
                      Play question audio
                    </button>
                    {autoPlayBlocked && (
                      <p style={{ marginTop: 6 }}>Your browser blocked autoplay</p>
                    )}
                </div>
            )}
        </div>
    );
}