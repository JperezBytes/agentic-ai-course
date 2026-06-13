"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const LANGUAGES = ["python", "javascript", "typescript", "java", "go", "rust", "c", "cpp", "ruby", "php"];

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

const SEVERITY_BG: Record<string, string> = {
  critical: "#450a0a",
  high: "#431407",
  medium: "#422006",
  low: "#172554",
};

interface Issue {
  severity: string;
  line: number | null;
  category: string;
  description: string;
  suggestion: string;
}

interface Metrics {
  complexity: string;
  readability: string;
  test_coverage_estimate: string;
}

interface AnalyzeResponse {
  summary: string;
  issues: Issue[];
  suggestions: string[];
  metrics: Metrics;
}

const SAMPLE_CODE = `def calculate_discount(price, user):
    if user['role'] == 'admin':
        discount = 0.5
    elif user['role'] == 'member':
        discount = 0.2
    else:
        discount = 0

    final = price - (price * discount)
    query = "SELECT * FROM orders WHERE user_id = " + str(user['id'])
    return final, query`;

export default function Home() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [language, setLanguage] = useState("python");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Error ${res.status}`);
      }

      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={s.main}>
      <div style={s.header}>
        <h1 style={s.title}>🔍 Code Analyzer</h1>
        <p style={s.subtitle}>AI-powered code review using Claude</p>
      </div>

      <div style={s.layout}>
        {/* Input panel */}
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Code Input</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              style={s.select}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            style={s.textarea}
            placeholder="Paste your code here..."
            spellCheck={false}
          />
          <button
            onClick={handleAnalyze}
            disabled={loading || !code.trim()}
            style={{ ...s.button, opacity: loading || !code.trim() ? 0.6 : 1 }}
          >
            {loading ? "⏳ Analyzing..." : "⚡ Analyze Code"}
          </button>
          {error && <div style={s.error}>⚠️ {error}</div>}
        </div>

        {/* Results panel */}
        <div style={s.panel}>
          <div style={s.panelHeader}>
            <span style={s.panelTitle}>Analysis Results</span>
            {result && (
              <span style={s.badge}>{result.issues.length} issues found</span>
            )}
          </div>

          {!result && !loading && (
            <div style={s.empty}>Click "Analyze Code" to see results</div>
          )}

          {loading && (
            <div style={s.empty}>🤖 Claude is reviewing your code...</div>
          )}

          {result && (
            <div style={s.results}>
              {/* Summary */}
              <div style={s.section}>
                <h3 style={s.sectionTitle}>Summary</h3>
                <p style={s.summary}>{result.summary}</p>
              </div>

              {/* Metrics */}
              <div style={s.section}>
                <h3 style={s.sectionTitle}>Metrics</h3>
                <div style={s.metricsRow}>
                  {Object.entries(result.metrics).map(([k, v]) => (
                    <div key={k} style={s.metric}>
                      <span style={s.metricLabel}>{k.replace(/_/g, " ")}</span>
                      <span style={s.metricValue}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Issues */}
              {result.issues.length > 0 && (
                <div style={s.section}>
                  <h3 style={s.sectionTitle}>Issues</h3>
                  {result.issues.map((issue, i) => (
                    <div
                      key={i}
                      style={{
                        ...s.issue,
                        borderLeftColor: SEVERITY_COLORS[issue.severity] ?? "#666",
                        background: SEVERITY_BG[issue.severity] ?? "#1e293b",
                      }}
                    >
                      <div style={s.issueHeader}>
                        <span style={{
                          ...s.severityBadge,
                          background: SEVERITY_COLORS[issue.severity] ?? "#666",
                        }}>
                          {issue.severity.toUpperCase()}
                        </span>
                        <span style={s.category}>{issue.category}</span>
                        {issue.line && <span style={s.line}>Line {issue.line}</span>}
                      </div>
                      <p style={s.issueDesc}>{issue.description}</p>
                      <p style={s.issueSuggestion}>💡 {issue.suggestion}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Suggestions */}
              {result.suggestions.length > 0 && (
                <div style={s.section}>
                  <h3 style={s.sectionTitle}>General Suggestions</h3>
                  <ul style={s.suggestionList}>
                    {result.suggestions.map((sg, i) => (
                      <li key={i} style={s.suggestionItem}>✅ {sg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  main: { padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" },
  header: { marginBottom: "1.5rem" },
  title: { fontSize: "1.8rem", fontWeight: 700 },
  subtitle: { color: "#94a3b8", marginTop: "0.25rem" },
  layout: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" },
  panel: {
    background: "#1e293b",
    borderRadius: "12px",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  panelTitle: { fontWeight: 600, fontSize: "1rem" },
  select: {
    background: "#0f1117",
    color: "#e2e8f0",
    border: "1px solid #334155",
    borderRadius: "6px",
    padding: "0.3rem 0.6rem",
    fontSize: "0.85rem",
  },
  textarea: {
    flex: 1,
    minHeight: "360px",
    background: "#0f1117",
    color: "#e2e8f0",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "0.75rem",
    fontFamily: "'Courier New', monospace",
    fontSize: "0.85rem",
    resize: "vertical",
    lineHeight: 1.5,
  },
  button: {
    padding: "0.7rem",
    background: "#6366f1",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontWeight: 600,
    fontSize: "0.95rem",
    cursor: "pointer",
  },
  error: {
    padding: "0.75rem",
    background: "#450a0a",
    color: "#fca5a5",
    borderRadius: "8px",
    fontSize: "0.9rem",
  },
  empty: { color: "#64748b", textAlign: "center", padding: "3rem 1rem" },
  results: { overflowY: "auto", maxHeight: "600px", display: "flex", flexDirection: "column", gap: "1rem" },
  section: {},
  sectionTitle: { fontSize: "0.8rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" },
  summary: { color: "#cbd5e1", lineHeight: 1.6, fontSize: "0.9rem" },
  metricsRow: { display: "flex", gap: "0.5rem", flexWrap: "wrap" },
  metric: {
    background: "#0f1117",
    borderRadius: "8px",
    padding: "0.5rem 0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  metricLabel: { fontSize: "0.7rem", color: "#64748b", textTransform: "capitalize" },
  metricValue: { fontSize: "0.9rem", fontWeight: 600, color: "#e2e8f0", textTransform: "capitalize" },
  issue: {
    borderLeft: "4px solid",
    borderRadius: "8px",
    padding: "0.75rem",
    marginBottom: "0.5rem",
  },
  issueHeader: { display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem", flexWrap: "wrap" },
  severityBadge: { padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.7rem", fontWeight: 700, color: "#fff" },
  category: { fontSize: "0.75rem", color: "#94a3b8", background: "#1e293b", padding: "0.15rem 0.4rem", borderRadius: "4px" },
  line: { fontSize: "0.75rem", color: "#64748b" },
  issueDesc: { fontSize: "0.875rem", color: "#cbd5e1", marginBottom: "0.3rem" },
  issueSuggestion: { fontSize: "0.8rem", color: "#86efac" },
  badge: { background: "#1e3a5f", color: "#93c5fd", padding: "0.2rem 0.6rem", borderRadius: "99px", fontSize: "0.75rem", fontWeight: 600 },
  suggestionList: { listStyle: "none", display: "flex", flexDirection: "column", gap: "0.4rem" },
  suggestionItem: { fontSize: "0.875rem", color: "#cbd5e1" },
};
