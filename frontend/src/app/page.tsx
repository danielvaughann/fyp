import Link from "next/link";

export default async function Home() {
  let status = "unknown";

  try {
    const res = await fetch("http://localhost:8000/health", {
      cache: "no-store",
    });
    const json = await res.json();
    status = json.status;
  } catch {
    status = "down";
  }

  return (
    <div className="page" style={{ justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: 600 }}>
        <h1 style={{ fontSize: 48, marginBottom: 16, color: "var(--primary)" }}>
          Interview Simulator
        </h1>
        <p style={{ fontSize: 18, marginBottom: 32, color: "var(--text-muted)" }}>
          Practice technical interviews with AI-powered feedback
        </p>
        
        <div style={{ marginBottom: 32 }}>
          <span style={{ fontSize: 14, color: "var(--text-muted)" }}>System Status: </span>
          <span
            style={{
              display: "inline-block",
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 500,
              background: status === "ok" ? "#dcfce7" : "#fee2e2",
              color: status === "ok" ? "#16a34a" : "#dc2626",
            }}
          >
            {status}
          </span>
        </div>

        <Link href="/login">
          <button style={{ fontSize: 16, padding: "12px 32px" }}>
            Get Started
          </button>
        </Link>
      </div>
    </div>
  );
}
