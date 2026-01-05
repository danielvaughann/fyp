"use client"
import "./style.css"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isSignup, setIsSignup] = useState(false);
    const [error, setError] = useState("");

    const router = useRouter();


    async function submit() {
        try {
            let res;

            if (isSignup) {
                res = await fetch("http://localhost:8000/auth/signup", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({email, password}),
                });
                alert("User registered successfully");
            } else {
                const body = new URLSearchParams();
                body.set("username", email);
                body.set("password", password);

                res = await fetch("http://localhost:8000/token", {
                    method: "POST",
                    headers: {"Content-Type": "application/x-www-form-urlencoded"},
                    body,
                });
            }
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
              let message = "Authentication failed";

              if (typeof data.detail === "string") {
                message = data.detail;
              } else if (Array.isArray(data.detail) && data.detail.length > 0) {
                message = data.detail[0]?.msg || message;
              }

              setError(message);
              return;
            }
            localStorage.setItem("token", data.access_token);
            router.push("/dashboard");
        } catch (err) {
            setError("Request failed");
        }
    }

    return (
        <div className="page">
            <div className="form-container">
                <h2>{isSignup ? "SIGN UP" : "LOGIN"}</h2>

                <form
                    className={isSignup ? "signup-form" : "login-form"}
                    onSubmit={(e) => {
                        e.preventDefault();
                        submit();
                    }}
                >
                    <input
                        type="email"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />

                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    {error && <p className="error">{error}</p>}

                    <input
                        type="submit"
                        value={isSignup ? "Sign Up" : "Login"}
                    />
                </form>

                <div className={isSignup ? "login-link" : "signup-link"}>
                    <p>
                        {isSignup ? "Already have an account? " : "Don't have an account? "}
                        <a
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                setIsSignup(!isSignup);
                            }}
                        >
                            {isSignup ? "Log In" : "Sign Up"}
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
