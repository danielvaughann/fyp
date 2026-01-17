"use client";
import "./style.css"

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
export default function DashboardPage() {
    // user can be an object or none
    //test
    const [user, setUser] = useState<{ id: number; email: string } | null>(null);
    const [error, setError] = useState("");

    //default interview settings
    const [topic, setTopic] = useState("Mixed");
    const [difficulty, setDifficulty] = useState("Junior");
    const [questionCount, setQuestionCount] = useState(3);
    const router = useRouter();
    // runs when page loads
    useEffect(() => {
        const token = localStorage.getItem("token")
        if (!token) {
            router.push("/login");
            alert("no token availble");
            return;
        }

        async function loadUser() {
            try {
                const res = await fetch("http://localhost:8000/users/me", {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });
                // safe json parsing. returns correct json or empty object prevents throwing error
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  let message = "Token expired, login again";
                    // handle different error formats from fastAPI
                  if (typeof data.detail === "string") {
                    message = data.detail;
                  } else if (Array.isArray(data.detail) && data.detail.length > 0) {
                    message = data.detail[0]?.msg || message;
                  }

                  localStorage.removeItem("token");
                  setError(message);
                  router.push("/login");
                  return;
                }
                // if user loads, store user data in the state
                setUser(data)
            } catch {
                setError("Failed to load dashboard");
            }
        }

        loadUser();
    }, [router]); // only load user again if router changes

    function logout() {
        localStorage.removeItem("token");
        router.push("/login");
        alert("logged out");
    }
    async function startInterview() {
        setError("")
        const token = localStorage.getItem("token")
        if (!token) {
            router.push("/login");
            alert("no token availble");
            return;
        }

        try {
            const res = await fetch("http://localhost:8000/interview/start", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    topic,
                    difficulty,
                    question_count: questionCount,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                let message = "Failed to start interview";

                if (typeof data.detail === "string") {
                    message = data.detail;
                } else if (Array.isArray(data.detail) && data.detail.length > 0) {
                    message = data.detail[0]?.msg || message;
                }
                setError(message);
                return;
            }
            router.push(`/interview/${data.session_id}`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setError(msg || "Failed to start interview");
        }
    }
    return (
        <div className="page">
            <div className="form-container">
                <h2>DASHBOARD</h2>

                {error && <p className="error">{error}</p>}

                {!error && !user && <p className="muted">Loading...</p>}

                {user && (
                    <>
                        <div className="dash">
                            <p className="muted">Welcome</p>
                            <p className="big">{user.email}</p>

                            <div className="dashRow">
                                <span className="label">User Id</span>
                                <span className="value">{user.id}</span>
                            </div>

                            <button className="logoutBtn" onClick={logout}>
                                Logout
                            </button>
                        </div>
                        <h2>Start Interview</h2>
                        <div>
                            <label>Topic:</label>
                            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
                                <option value="Mixed">Mixed</option>
                                <option value="OOP">OOP</option>
                                <option value="Data Structures">Data Structures</option>
                                <option value="Algorithms">Algorithms</option>
                                <option value="General Programming">General Programming</option>
                            </select>
                        </div>

                        <div>
                            <label>Difficulty:</label>
                            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                                <option value="Junior">Junior</option>
                                <option value="Mid">Mid</option>
                                <option value="Senior">Senior</option>
                            </select>
                        </div>

                        <div>
                            <label>Number of Questions:</label>
                            <input
                                type="number"
                                value={questionCount}
                                onChange={(e) => setQuestionCount(parseInt(e.target.value))}
                                min={1}
                                max={10}
                            />
                        </div>

                        <button className="startBtn" onClick={startInterview}>
                            Start Interview
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
