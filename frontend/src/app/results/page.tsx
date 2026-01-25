"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

type HistorySession = {
  id: string;
  topic: string;
  difficulty: string;
  status: string;
  start_time: string | null;
  end_time: string | null;
  question_count: number;
  answered_count: number;
  avg_score: number;
  has_overall_feedback: boolean;
};

type HistoryResponse = {
  sessions: HistorySession[];
};

type TopicBreakdownItem = {
  topic: string;
  answers_count: number;
  avg_score: number;
};

type TopicBreakdownResponse = {
  topics: TopicBreakdownItem[];
};

type TimeseriesPoint = {
  id: string;
  ts: string | null; // ISO timestamp
  avg_score: number;
  answered_count: number;
  topic: string;
  difficulty: string;
};

type TimeseriesResponse = {
  points: TimeseriesPoint[];
};


export default function ResultsHistoryPage() {
  const router = useRouter();

  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [topics, setTopics] = useState<TopicBreakdownItem[]>([]);
  const [series, setSeries] = useState<TimeseriesPoint[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [topicFilter, setTopicFilter] = useState<string>("All");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("All");

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

    async function loadAll() {
      try {
        setLoading(true);
        setError("");

        const [historyRes, topicRes, seriesRes] = await Promise.all([
          fetch("http://localhost:8000/interviews/history", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("http://localhost:8000/analytics/topic-breakdown", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch("http://localhost:8000/analytics/sessions-timeseries", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const historyJson: HistoryResponse = await historyRes.json();
        const topicJson: TopicBreakdownResponse = await topicRes.json();
        const seriesJson: TimeseriesResponse = await seriesRes.json();

        if (!historyRes.ok) throw new Error((historyJson as any)?.detail || "Failed to load history");
        if (!topicRes.ok) throw new Error((topicJson as any)?.detail || "Failed to load topic breakdown");
        if (!seriesRes.ok) throw new Error((seriesJson as any)?.detail || "Failed to load timeseries");

        setSessions(historyJson.sessions || []);
        setTopics(topicJson.topics || []);
        setSeries(seriesJson.points || []);
      } catch (e: any) {
        setError(e?.message || "Failed to load results history");
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, [router]);

  const uniqueTopics = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => set.add(s.topic));
    return ["All", ...Array.from(set)];
  }, [sessions]);

  const uniqueDifficulties = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => set.add(s.difficulty));
    return ["All", ...Array.from(set)];
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const okTopic = topicFilter === "All" ? true : s.topic === topicFilter;
      const okDiff = difficultyFilter === "All" ? true : s.difficulty === difficultyFilter;
      return okTopic && okDiff;
    });
  }, [sessions, topicFilter, difficultyFilter]);

const chartSeries = useMemo(() => {
  return (series || []).filter((p) => p.ts);
}, [series]);



  return (
    <div className="page">
      <div className="header">
        <h1>Interview Simulator</h1>
        <div className="header-actions">
          <button onClick={() => router.push("/dashboard")}>Dashboard</button>
          <button onClick={logout}>Logout</button>
        </div>
      </div>

      <div className="form-container" style={{ marginTop: 24, maxWidth: 1100 }}>
        <h2>Your Progress</h2>

        {error && <p className="error">{error}</p>}
        {loading && !error && <p>Loading...</p>}

        {!loading && !error && (
          <>
            {/* Filters */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Topic</label>
                <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}>
                  {uniqueTopics.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12, opacity: 0.8 }}>Difficulty</label>
                <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}>
                  {uniqueDifficulties.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

<div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12 }}>
  <h3 style={{ marginBottom: 8 }}>Score Over Time (Each Interview)</h3>
  <div style={{ width: "100%", height: 260 }}>
    <ResponsiveContainer>
      <LineChart data={chartSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />

        {/* X = interview timestamp, formatted nicely */}
        <XAxis
          dataKey="ts"
          tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
          axisLine={{ stroke: "var(--chart-grid)" }}
          tickLine={{ stroke: "var(--chart-grid)" }}
          interval="preserveStartEnd"
          tickFormatter={(v) => {
            if (!v) return "";
            const d = new Date(v);
            return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit" }).format(d);
          }}
        />

        <YAxis
          domain={[0, 100]}
          tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
          axisLine={{ stroke: "var(--chart-grid)" }}
          tickLine={{ stroke: "var(--chart-grid)" }}
        />

        <Tooltip
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-tooltip-border)",
            borderRadius: 10,
            boxShadow: "0 10px 20px rgba(0,0,0,0.06)",
          }}
          labelFormatter={(label) => {
            const d = new Date(label);
            return `Interview: ${d.toLocaleString()}`;
          }}
          formatter={(value: any, name: any, props: any) => {
            if (name === "avg_score") return [`${value}%`, "Average score"];
            return [value, name];
          }}
        />

        <Line
          type="monotone"
          dataKey="avg_score"
          stroke="var(--chart-1)"
          strokeWidth={3}
          dot={true}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
</div>



<div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12 }}>
  <h3 style={{ marginBottom: 8 }}>Topic Breakdown</h3>
  <div style={{ width: "100%", height: 260 }}>
    <ResponsiveContainer>
      <BarChart data={topics} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
        <XAxis
          dataKey="topic"
          tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
          axisLine={{ stroke: "var(--chart-grid)" }}
          tickLine={{ stroke: "var(--chart-grid)" }}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "var(--chart-axis)", fontSize: 12 }}
          axisLine={{ stroke: "var(--chart-grid)" }}
          tickLine={{ stroke: "var(--chart-grid)" }}
        />
        <Tooltip
          contentStyle={{
            background: "var(--chart-tooltip-bg)",
            border: "1px solid var(--chart-tooltip-border)",
            borderRadius: 10,
            boxShadow: "0 10px 20px rgba(0,0,0,0.06)",
          }}
          labelStyle={{ color: "var(--text)", fontWeight: 600 }}
          itemStyle={{ color: "var(--text-muted)" }}
          formatter={(value: any, name: any) => {
            if (name === "avg_score") return [`${value}%`, "Average score"];
            if (name === "answers_count") return [value, "Answers"];
            return [value, name];
          }}
        />
        <Bar dataKey="avg_score" fill="var(--chart-2)" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  </div>
  <p style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
    This is calculated from all answers across all sessions.
  </p>
</div>

            {/* Sessions list */}
            <div style={{ marginTop: 20 }}>
              <h3>All Sessions Average Score</h3>

              {filteredSessions.length === 0 ? (
                <p style={{ opacity: 0.8 }}>No sessions found for these filters.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {filteredSessions.map((s) => (
                    <div
                      key={s.id}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 12,
                        padding: 14,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        cursor: "pointer",
                      }}
                      onClick={() => router.push(`/results/${s.id}`)}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>
                          {s.topic} · {s.difficulty}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.8 }}>
                          {s.start_time ? s.start_time.slice(0, 10) : "Unknown date"} · {s.status} · {s.answered_count}/{s.question_count} answered
                          {!s.has_overall_feedback && s.status === "completed" ? " · overall feedback pending" : ""}
                        </div>
                      </div>

                      <div
                        style={{
                          minWidth: 70,
                          textAlign: "center",
                          padding: "6px 10px",
                          borderRadius: 10,
                          background: "#dbeafe",
                          color: "var(--primary)",
                          fontWeight: 700,
                        }}
                      >
                        {s.avg_score}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
