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
    <main style={{ padding: 24 }}>
      <h1>Interview Simulator</h1>
      <p>Backend status: <b>{status}</b></p>
    </main>
  );
}
