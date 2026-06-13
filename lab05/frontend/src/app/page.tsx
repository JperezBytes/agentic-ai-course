"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const AGENT_COLORS: Record<string, string> = {
  SUPERVISOR: "#6366f1",
  RESEARCHER: "#0ea5e9",
  WRITER: "#10b981",
  REVIEWER: "#f59e0b",
};

const AGENT_ICONS: Record<string, string> = {
  SUPERVISOR: "🧠",
  RESEARCHER: "🔍",
  WRITER: "✍️",
  REVIEWER: "🔎",
};

const ACTION_LABELS: Record<string, string> = {
  delegate: "Delegating",
  work: "Completed",
  final: "Final Answer",
};

interface AgentAction {
  agent: string;
  action: string;
  content: string;
}

interface RunResult {
  success: boolean;
  task: string;
  iterations: number;
  actions: AgentAction[];
  final_output: string;
}

interface HistoryItem {
  task: string;
  result: RunResult;
  timestamp: string;
}

const SAMPLE_TASKS = [
  "What are the key differences between RAG and fine-tuning for LLMs?",
  "Explain the supervisor pattern in multi-agent AI systems",
  "What are the best practices for building production FastAPI applications?",
];

export default function Home() {
  const [task, setTask] = useState("");
  const [maxIterations, setMaxIterations] = useState(5);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);

  async function handleRun() {
    if (!task.trim()) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setSelectedHistory(null);

    try {
      const res = await fetch(`${API_URL}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, max_iterations: maxIterations }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `Error ${res.status}`);
      }

      const data: RunResult = await res.json();
      setResult(data);
      setHistory(prev => [
        { task, result: data, timestamp: new Date().toLocaleTimeString() },
        ...prev.slice(0, 9),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRunning(false);
    }
  }

  const displayed = selectedHistory?.result ?? result;
  const displayedTask = selectedHistory?.task ?? task;

  return (
    <main style={s.main}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>🤖 Multi-Agent Orchestration</h1>
        <p style={s.subtitle}>Supervisor + Researcher + Writer + Reviewer agents working together</p>
      </div>

      <div style={s.layout}>
        {/* LEFT: input + history */}
        <div style={s.sidebar}>
          {/* Task input */}
          <div style={s.card}>
            <h2 style={s.cardTitle}>Research Task</h2>

            <div style={s.sampleRow}>
              {SAMPLE_TASKS.map((t, i) => (
                <button key={i} onClick={() => setTask(t)} style={s.sampleBtn}>
                  {t.slice(0, 40)}…
                </button>
              ))}
            </div>

            <textarea
              value={task}
              onChange={e => setTask(e.target.value)}
              placeholder="Enter a research task or question..."
              style={s.textarea}
              rows={4}
            />

            <div style={s.controlRow}>
              <label style={s.label}>Max iterations</label>
              <select
                value={maxIterations}
                onChange={e => setMaxIterations(Number(e.target.value))}
                style={s.select}
              >
                {[3, 4, 5, 6, 7].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleRun}
              disabled={running || !task.trim()}
              style={{ ...s.runBtn, opacity: running || !task.trim() ? 0.6 : 1 }}
            >
              {running ? "⏳ Agents working..." : "⚡ Run Agents"}
            </button>

            {error && <div style={s.errorBox}>⚠️ {error}</div>}
          </div>

          {/* History */}
          {history.length > 0 && (
            <div style={s.card}>
              <h2 style={s.cardTitle}>History</h2>
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => { setSelectedHistory(h); setResult(null); }}
                  style={{
                    ...s.historyItem,
                    background: selectedHistory === h ? "#1e3a5f" : "#0f1117",
                    borderColor: selectedHistory === h ? "#6366f1" : "#1e293b",
                  }}
                >
                  <span style={s.historyTime}>{h.timestamp}</span>
                  <span style={s.historyTask}>{h.task.slice(0, 60)}{h.task.length > 60 ? "…" : ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: results */}
        <div style={s.main2}>
          {!displayed && !running && (
            <div style={s.empty}>
              <div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>🤖</div>
              <div style={{ color: "#64748b" }}>Submit a task to see agents in action</div>
            </div>
          )}

          {running && (
            <div style={s.empty}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>⚙️</div>
              <div style={{ color: "#a78bfa", fontWeight: 600 }}>Agents are working...</div>
              <div style={{ color: "#64748b", marginTop: "0.35rem", fontSize: "0.85rem" }}>
                This typically takes 15-30 seconds
              </div>
            </div>
          )}

          {displayed && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Task banner */}
              <div style={s.taskBanner}>
                <span style={s.taskLabel}>Task</span>
                <span style={s.taskText}>{displayedTask}</span>
                <span style={s.iterBadge}>{displayed.iterations} delegation{displayed.iterations !== 1 ? "s" : ""}</span>
              </div>

              {/* Agent activity feed */}
              <div style={s.card}>
                <h2 style={s.cardTitle}>Agent Activity Feed</h2>
                <div style={s.feed}>
                  {displayed.actions.map((action, i) => {
                    const color = AGENT_COLORS[action.agent] ?? "#6366f1";
                    const icon = AGENT_ICONS[action.agent] ?? "🤖";
                    return (
                      <div key={i} style={s.feedItem}>
                        {/* Timeline connector */}
                        <div style={s.timelineLeft}>
                          <div style={{ ...s.agentDot, background: color }}>{icon}</div>
                          {i < displayed.actions.length - 1 && <div style={s.timelineLine} />}
                        </div>

                        <div style={s.feedContent}>
                          <div style={s.feedHeader}>
                            <span style={{ ...s.agentBadge, background: color + "22", color }}>
                              {action.agent}
                            </span>
                            <span style={s.actionLabel}>{ACTION_LABELS[action.action] ?? action.action}</span>
                          </div>
                          <div style={{
                            ...s.feedBody,
                            background: action.action === "final" ? "#052e16" : "#0f1117",
                            border: `1px solid ${action.action === "final" ? "#16a34a" : "#1e293b"}`,
                          }}>
                            {action.content}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Final output */}
              <div style={s.card}>
                <h2 style={{ ...s.cardTitle, color: "#86efac" }}>✅ Final Output</h2>
                <div style={s.finalOutput}>{displayed.final_output}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  main: { padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" },
  header: { marginBottom: "1.25rem" },
  title: { fontSize: "1.8rem", fontWeight: 700 },
  subtitle: { color: "#94a3b8", marginTop: "0.25rem" },
  layout: { display: "grid", gridTemplateColumns: "340px 1fr", gap: "1.25rem", alignItems: "start" },
  sidebar: { display: "flex", flexDirection: "column", gap: "1rem" },
  main2: { minHeight: "400px" },
  card: { background: "#1e293b", borderRadius: "12px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" },
  cardTitle: { fontSize: "0.85rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" },
  sampleRow: { display: "flex", flexDirection: "column", gap: "0.35rem" },
  sampleBtn: { background: "#0f1117", border: "1px solid #1e293b", borderRadius: "6px", color: "#64748b", fontSize: "0.78rem", padding: "0.4rem 0.6rem", cursor: "pointer", textAlign: "left" },
  textarea: { background: "#0f1117", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "8px", padding: "0.75rem", fontSize: "0.875rem", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 },
  controlRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: "0.8rem", color: "#94a3b8", fontWeight: 600 },
  select: { background: "#0f1117", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "6px", padding: "0.3rem 0.6rem", fontSize: "0.85rem" },
  runBtn: { padding: "0.7rem", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "0.95rem", cursor: "pointer" },
  errorBox: { background: "#450a0a", border: "1px solid #dc2626", borderRadius: "8px", padding: "0.75rem", color: "#fca5a5", fontSize: "0.875rem" },
  historyItem: { background: "#0f1117", border: "1px solid #1e293b", borderRadius: "8px", padding: "0.6rem 0.75rem", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", gap: "0.2rem" },
  historyTime: { fontSize: "0.7rem", color: "#64748b" },
  historyTask: { fontSize: "0.8rem", color: "#cbd5e1" },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "300px", textAlign: "center" },
  taskBanner: { background: "#1e293b", borderRadius: "10px", padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" },
  taskLabel: { fontSize: "0.7rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" },
  taskText: { flex: 1, fontSize: "0.9rem", color: "#e2e8f0" },
  iterBadge: { background: "#6366f133", color: "#a78bfa", borderRadius: "20px", padding: "0.2rem 0.65rem", fontSize: "0.78rem", fontWeight: 600, whiteSpace: "nowrap" },
  feed: { display: "flex", flexDirection: "column", gap: "0" },
  feedItem: { display: "flex", gap: "0.75rem" },
  timelineLeft: { display: "flex", flexDirection: "column", alignItems: "center", width: "32px", flexShrink: 0 },
  agentDot: { width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0 },
  timelineLine: { width: "2px", flex: 1, background: "#1e293b", minHeight: "12px", marginTop: "2px" },
  feedContent: { flex: 1, paddingBottom: "0.75rem" },
  feedHeader: { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" },
  agentBadge: { padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 700 },
  actionLabel: { fontSize: "0.75rem", color: "#64748b" },
  feedBody: { borderRadius: "8px", padding: "0.6rem 0.75rem", fontSize: "0.85rem", color: "#cbd5e1", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  finalOutput: { background: "#052e16", border: "1px solid #16a34a", borderRadius: "8px", padding: "1rem", fontSize: "0.9rem", color: "#d1fae5", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" },
};
