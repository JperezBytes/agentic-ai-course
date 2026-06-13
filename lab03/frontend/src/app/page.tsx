"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const FRAMEWORKS = ["Flask", "FastAPI", "Django", "Express", "Hono", "NestJS", "React", "Next.js", "Vue", "Angular"];

const SAMPLE_CODE = `from flask import Flask, request, jsonify

app = Flask(__name__)

users = []

@app.route('/users', methods=['GET'])
def get_users():
    return jsonify(users)

@app.route('/users', methods=['POST'])
def create_user():
    data = request.json
    user = {'id': len(users) + 1, 'name': data['name'], 'email': data['email']}
    users.append(user)
    return jsonify(user), 201

if __name__ == '__main__':
    app.run(debug=True)`;

const PHASES = ["analysis", "planning", "execution", "verification"];

interface Step {
  id: string;
  description: string;
  dependencies: string[];
  status: string;
  result: string;
}

interface Result {
  success: boolean;
  migration_id: string;
  phase_results: Record<string, any>;
  migrated_files: Record<string, string>;
  plan: Step[];
  verification: Record<string, any>;
  errors: string[];
}

export default function Home() {
  const [filename, setFilename] = useState("app.py");
  const [code, setCode] = useState(SAMPLE_CODE);
  const [sourceFramework, setSourceFramework] = useState("Flask");
  const [targetFramework, setTargetFramework] = useState("FastAPI");
  const [loading, setLoading] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  async function handleMigrate() {
    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentPhase("analysis");

    // Simulate phase progression while waiting
    const phaseTimer = setInterval(() => {
      setCurrentPhase(p => {
        const idx = PHASES.indexOf(p ?? "analysis");
        return idx < PHASES.length - 1 ? PHASES[idx + 1] : p;
      });
    }, 8000);

    try {
      const res = await fetch(`${API_URL}/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ filename, content: code }],
          source_framework: sourceFramework,
          target_framework: targetFramework,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Error ${res.status}`);
      }

      const data: Result = await res.json();
      setResult(data);
      setCurrentPhase("done");
      if (data.migrated_files) {
        setSelectedFile(Object.keys(data.migrated_files)[0] ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCurrentPhase(null);
    } finally {
      clearInterval(phaseTimer);
      setLoading(false);
    }
  }

  const phaseIcon = (phase: string) => {
    if (!currentPhase || currentPhase === "done") return result ? "✅" : "⬜";
    const current = PHASES.indexOf(currentPhase);
    const idx = PHASES.indexOf(phase);
    if (idx < current) return "✅";
    if (idx === current) return "⏳";
    return "⬜";
  };

  return (
    <main style={s.main}>
      <div style={s.header}>
        <h1 style={s.title}>🔄 Migration Workflow Agent</h1>
        <p style={s.subtitle}>AI-powered code migration with 4-phase workflow</p>
      </div>

      <div style={s.layout}>
        {/* Left: Input */}
        <div style={s.panel}>
          <h2 style={s.panelTitle}>Source Code</h2>

          <div style={s.row}>
            <div style={s.field}>
              <label style={s.label}>Filename</label>
              <input value={filename} onChange={e => setFilename(e.target.value)} style={s.input} />
            </div>
          </div>

          <div style={s.row}>
            <div style={s.field}>
              <label style={s.label}>Source Framework</label>
              <select value={sourceFramework} onChange={e => setSourceFramework(e.target.value)} style={s.select}>
                {FRAMEWORKS.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Target Framework</label>
              <select value={targetFramework} onChange={e => setTargetFramework(e.target.value)} style={s.select}>
                {FRAMEWORKS.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>

          <textarea
            value={code}
            onChange={e => setCode(e.target.value)}
            style={s.textarea}
            spellCheck={false}
            placeholder="Paste your source code here..."
          />

          <button onClick={handleMigrate} disabled={loading || !code.trim()} style={{
            ...s.button, opacity: loading || !code.trim() ? 0.6 : 1
          }}>
            {loading ? "🔄 Migrating..." : "⚡ Start Migration"}
          </button>

          {error && <div style={s.error}>⚠️ {error}</div>}

          {/* Phase progress */}
          {(loading || result) && (
            <div style={s.phases}>
              <h3 style={s.phasesTitle}>Workflow Progress</h3>
              {PHASES.map(phase => (
                <div key={phase} style={s.phaseRow}>
                  <span style={s.phaseIcon}>{phaseIcon(phase)}</span>
                  <span style={{
                    ...s.phaseLabel,
                    color: currentPhase === phase ? "#a78bfa" : result ? "#86efac" : "#64748b"
                  }}>
                    {phase.charAt(0).toUpperCase() + phase.slice(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div style={s.panel}>
          <h2 style={s.panelTitle}>Migration Results</h2>

          {!result && !loading && (
            <div style={s.empty}>Start a migration to see results</div>
          )}

          {loading && (
            <div style={s.empty}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🤖</div>
              <div>Claude is migrating your code...</div>
              <div style={{ color: "#64748b", marginTop: "0.25rem", fontSize: "0.85rem" }}>
                This may take 30-60 seconds
              </div>
            </div>
          )}

          {result && (
            <div style={s.results}>
              {/* Status */}
              <div style={{
                ...s.statusBanner,
                background: result.success ? "#052e16" : "#450a0a",
                borderColor: result.success ? "#16a34a" : "#dc2626",
              }}>
                <span>{result.success ? "✅ Migration successful" : "⚠️ Migration completed with issues"}</span>
                <span style={s.migrationId}>ID: {result.migration_id.slice(0, 8)}</span>
              </div>

              {/* Plan */}
              {result.plan.length > 0 && (
                <div style={s.section}>
                  <h3 style={s.sectionTitle}>Execution Plan ({result.plan.length} steps)</h3>
                  {result.plan.map(step => (
                    <div key={step.id} style={s.step}>
                      <span style={{
                        ...s.stepStatus,
                        background: step.status === "completed" ? "#16a34a" : step.status === "failed" ? "#dc2626" : "#64748b"
                      }}>
                        {step.status === "completed" ? "✓" : step.status === "failed" ? "✗" : "○"}
                      </span>
                      <span style={s.stepDesc}>{step.description}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Migrated files */}
              {Object.keys(result.migrated_files).length > 0 && (
                <div style={s.section}>
                  <h3 style={s.sectionTitle}>Migrated Files</h3>
                  <div style={s.fileTabs}>
                    {Object.keys(result.migrated_files).map(fname => (
                      <button
                        key={fname}
                        onClick={() => setSelectedFile(fname)}
                        style={{
                          ...s.fileTab,
                          background: selectedFile === fname ? "#6366f1" : "#1e293b",
                        }}
                      >
                        {fname}
                      </button>
                    ))}
                  </div>
                  {selectedFile && result.migrated_files[selectedFile] && (
                    <pre style={s.code}>{result.migrated_files[selectedFile]}</pre>
                  )}
                </div>
              )}

              {/* Verification */}
              {result.verification && Object.keys(result.verification).length > 0 && (
                <div style={s.section}>
                  <h3 style={s.sectionTitle}>Verification</h3>
                  <p style={s.verificationSummary}>{result.verification.summary}</p>
                  {result.verification.recommendations?.length > 0 && (
                    <ul style={s.list}>
                      {result.verification.recommendations.map((r: string, i: number) => (
                        <li key={i} style={s.listItem}>💡 {r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Errors */}
              {result.errors.length > 0 && (
                <div style={s.section}>
                  <h3 style={s.sectionTitle}>Errors</h3>
                  {result.errors.map((e, i) => (
                    <div key={i} style={s.errorItem}>{e}</div>
                  ))}
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
  panel: { background: "#1e293b", borderRadius: "12px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" },
  panelTitle: { fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" },
  row: { display: "flex", gap: "0.75rem" },
  field: { flex: 1, display: "flex", flexDirection: "column", gap: "0.25rem" },
  label: { fontSize: "0.75rem", color: "#94a3b8", fontWeight: 600 },
  input: { background: "#0f1117", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "6px", padding: "0.4rem 0.75rem", fontSize: "0.9rem" },
  select: { background: "#0f1117", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "6px", padding: "0.4rem 0.75rem", fontSize: "0.9rem" },
  textarea: { minHeight: "280px", background: "#0f1117", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "8px", padding: "0.75rem", fontFamily: "monospace", fontSize: "0.82rem", resize: "vertical", lineHeight: 1.5 },
  button: { padding: "0.7rem", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "0.95rem", cursor: "pointer" },
  error: { padding: "0.75rem", background: "#450a0a", color: "#fca5a5", borderRadius: "8px", fontSize: "0.9rem" },
  phases: { background: "#0f1117", borderRadius: "8px", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" },
  phasesTitle: { fontSize: "0.75rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.25rem" },
  phaseRow: { display: "flex", alignItems: "center", gap: "0.5rem" },
  phaseIcon: { fontSize: "0.9rem" },
  phaseLabel: { fontSize: "0.875rem", fontWeight: 500, textTransform: "capitalize" },
  empty: { color: "#64748b", textAlign: "center", padding: "3rem 1rem" },
  results: { display: "flex", flexDirection: "column", gap: "1rem", overflowY: "auto", maxHeight: "700px" },
  statusBanner: { padding: "0.75rem 1rem", borderRadius: "8px", border: "1px solid", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem", fontWeight: 600 },
  migrationId: { fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" },
  section: {},
  sectionTitle: { fontSize: "0.75rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" },
  step: { display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.35rem" },
  stepStatus: { width: "18px", height: "18px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", color: "#fff", fontWeight: 700, flexShrink: 0, marginTop: "1px" },
  stepDesc: { fontSize: "0.875rem", color: "#cbd5e1" },
  fileTabs: { display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" },
  fileTab: { padding: "0.3rem 0.75rem", borderRadius: "6px", border: "none", color: "#e2e8f0", fontSize: "0.8rem", cursor: "pointer", fontFamily: "monospace" },
  code: { background: "#0f1117", borderRadius: "8px", padding: "0.75rem", fontSize: "0.78rem", overflowX: "auto", color: "#86efac", lineHeight: 1.5, maxHeight: "300px", overflowY: "auto" },
  verificationSummary: { fontSize: "0.875rem", color: "#cbd5e1", marginBottom: "0.5rem" },
  list: { listStyle: "none", display: "flex", flexDirection: "column", gap: "0.3rem" },
  listItem: { fontSize: "0.85rem", color: "#cbd5e1" },
  errorItem: { padding: "0.5rem", background: "#450a0a", borderRadius: "6px", fontSize: "0.85rem", color: "#fca5a5", marginBottom: "0.3rem" },
};
