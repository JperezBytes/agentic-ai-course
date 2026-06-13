"use client";

import { useState, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Source {
  filename: string;
  start_line: number;
  end_line: number;
  snippet: string;
  score: number;
}

interface QueryResponse {
  answer: string;
  sources: Source[];
}

interface EvalResult {
  question: string;
  retrieved_files: string[];
  relevant_files: string[];
  precision_at_k: number;
  recall_at_k: number;
  reciprocal_rank: number;
  llm_judge: {
    relevance: number;
    accuracy: number;
    completeness: number;
    overall: number;
    feedback: string;
  };
}

interface EvalResponse {
  metrics: {
    mean_precision_at_k: number;
    mean_recall_at_k: number;
    mrr: number;
    mean_llm_judge_score: number;
    k: number;
    num_examples: number;
  };
  results: EvalResult[];
}

const SAMPLE_EVAL = JSON.stringify(
  {
    examples: [
      {
        question: "How does the health endpoint work?",
        relevant_files: ["main.py"],
      },
    ],
  },
  null,
  2
);

export default function Home() {
  const [files, setFiles] = useState<{ filename: string; content: string }[]>([]);
  const [indexing, setIndexing] = useState(false);
  const [indexResult, setIndexResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [question, setQuestion] = useState("");
  const [querying, setQuerying] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryResponse | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const [evalJson, setEvalJson] = useState(SAMPLE_EVAL);
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<EvalResponse | null>(null);
  const [evalError, setEvalError] = useState<string | null>(null);

  const [tab, setTab] = useState<"index" | "query" | "eval">("index");

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const uploaded = e.target.files;
    if (!uploaded) return;
    const newFiles: { filename: string; content: string }[] = [];
    for (const file of Array.from(uploaded)) {
      const content = await file.text();
      newFiles.push({ filename: file.name, content });
    }
    setFiles(prev => [...prev, ...newFiles]);
  }

  async function handleIndex() {
    if (!files.length) return;
    setIndexing(true);
    setIndexResult(null);
    try {
      const res = await fetch(`${API_URL}/index/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `Error ${res.status}`);
      }
      setIndexResult(await res.json());
    } catch (err) {
      setIndexResult({ error: err instanceof Error ? err.message : "Failed" });
    } finally {
      setIndexing(false);
    }
  }

  async function handleQuery() {
    if (!question.trim()) return;
    setQuerying(true);
    setQueryError(null);
    setQueryResult(null);
    try {
      const res = await fetch(`${API_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, top_k: 5 }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `Error ${res.status}`);
      }
      setQueryResult(await res.json());
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : "Failed");
    } finally {
      setQuerying(false);
    }
  }

  async function handleEval() {
    setEvaluating(true);
    setEvalError(null);
    setEvalResult(null);
    try {
      const body = JSON.parse(evalJson);
      const res = await fetch(`${API_URL}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `Error ${res.status}`);
      }
      setEvalResult(await res.json());
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "Failed");
    } finally {
      setEvaluating(false);
    }
  }

  const scoreColor = (v: number) =>
    v >= 4 ? "#86efac" : v >= 3 ? "#fde68a" : "#fca5a5";

  return (
    <main style={s.main}>
      <div style={s.header}>
        <h1 style={s.title}>🔍 Codebase RAG System</h1>
        <p style={s.subtitle}>Index your code, ask questions, evaluate retrieval quality</p>
      </div>

      <div style={s.tabs}>
        {(["index", "query", "eval"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ ...s.tabBtn, background: tab === t ? "#6366f1" : "#1e293b" }}
          >
            {t === "index" ? "📁 Index Files" : t === "query" ? "💬 Query" : "📊 Evaluate"}
          </button>
        ))}
      </div>

      {tab === "index" && (
        <div style={s.panel}>
          <h2 style={s.panelTitle}>Index Source Files</h2>
          <p style={s.hint}>Upload one or more source files to chunk and embed into the vector store.</p>

          <div style={s.uploadRow}>
            <button onClick={() => fileInputRef.current?.click()} style={s.uploadBtn}>
              + Add Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={handleFileUpload}
              accept=".py,.ts,.tsx,.js,.jsx,.txt,.md,.json,.yaml,.yml"
            />
            {files.length > 0 && (
              <span style={s.fileCount}>{files.length} file{files.length > 1 ? "s" : ""} ready</span>
            )}
          </div>

          {files.length > 0 && (
            <div style={s.fileList}>
              {files.map((f, i) => (
                <div key={i} style={s.fileItem}>
                  <span style={s.fileName}>📄 {f.filename}</span>
                  <span style={s.fileSize}>{f.content.split("\n").length} lines</span>
                  <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={s.removeBtn}>✕</button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleIndex}
            disabled={indexing || !files.length}
            style={{ ...s.primaryBtn, opacity: indexing || !files.length ? 0.6 : 1 }}
          >
            {indexing ? "⏳ Indexing..." : "⚡ Index Files"}
          </button>

          {indexResult && !indexResult.error && (
            <div style={s.successBox}>
              <div style={s.successTitle}>✅ Indexed successfully</div>
              <div style={s.metaRow}>
                <span>Total chunks: <strong>{indexResult.total_chunks}</strong></span>
                <span>Collection size: <strong>{indexResult.collection_size}</strong></span>
              </div>
              <div style={s.fileResultList}>
                {indexResult.files?.map((f: any, i: number) => (
                  <div key={i} style={s.fileResultItem}>{f.filename} → {f.chunks} chunk{f.chunks !== 1 ? "s" : ""}</div>
                ))}
              </div>
            </div>
          )}
          {indexResult?.error && <div style={s.errorBox}>⚠️ {indexResult.error}</div>}
        </div>
      )}

      {tab === "query" && (
        <div style={s.panel}>
          <h2 style={s.panelTitle}>Ask About Your Codebase</h2>
          <p style={s.hint}>Index files first, then ask questions about how the code works.</p>

          <div style={s.inputRow}>
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleQuery()}
              placeholder="e.g. How does the authentication work?"
              style={s.questionInput}
            />
            <button
              onClick={handleQuery}
              disabled={querying || !question.trim()}
              style={{ ...s.primaryBtn, opacity: querying || !question.trim() ? 0.6 : 1 }}
            >
              {querying ? "⏳" : "Ask"}
            </button>
          </div>

          {queryError && <div style={s.errorBox}>⚠️ {queryError}</div>}

          {queryResult && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={s.answerBox}>
                <div style={s.answerLabel}>Answer</div>
                <div style={s.answerText}>{queryResult.answer}</div>
              </div>
              {queryResult.sources.length > 0 && (
                <div>
                  <div style={s.sourcesLabel}>Sources ({queryResult.sources.length})</div>
                  {queryResult.sources.map((src, i) => (
                    <div key={i} style={s.sourceCard}>
                      <div style={s.sourceHeader}>
                        <span style={s.sourceFile}>{src.filename}</span>
                        <span style={s.sourceLines}>lines {src.start_line}–{src.end_line}</span>
                        <span style={s.sourceScore}>score: {src.score}</span>
                      </div>
                      <pre style={s.snippet}>{src.snippet}{src.snippet.length === 300 ? "..." : ""}</pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "eval" && (
        <div style={s.panel}>
          <h2 style={s.panelTitle}>Evaluate Retrieval Quality</h2>
          <p style={s.hint}>Provide questions with ground-truth relevant files. Metrics: Precision@K, Recall@K, MRR, LLM-as-judge.</p>

          <textarea value={evalJson} onChange={e => setEvalJson(e.target.value)} style={s.evalTextarea} spellCheck={false} />

          <button onClick={handleEval} disabled={evaluating} style={{ ...s.primaryBtn, opacity: evaluating ? 0.6 : 1 }}>
            {evaluating ? "⏳ Evaluating..." : "📊 Run Evaluation"}
          </button>

          {evalError && <div style={s.errorBox}>⚠️ {evalError}</div>}

          {evalResult && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={s.metricsGrid}>
                {[
                  { label: `Precision@${evalResult.metrics.k}`, value: evalResult.metrics.mean_precision_at_k },
                  { label: `Recall@${evalResult.metrics.k}`, value: evalResult.metrics.mean_recall_at_k },
                  { label: "MRR", value: evalResult.metrics.mrr },
                  { label: "LLM Judge", value: evalResult.metrics.mean_llm_judge_score / 5 },
                ].map(m => (
                  <div key={m.label} style={s.metricCard}>
                    <div style={s.metricLabel}>{m.label}</div>
                    <div style={{ ...s.metricValue, color: scoreColor(m.value * 5) }}>{(m.value * 100).toFixed(0)}%</div>
                  </div>
                ))}
              </div>
              {evalResult.results.map((r, i) => (
                <div key={i} style={s.evalResultCard}>
                  <div style={s.evalQuestion}>Q: {r.question}</div>
                  <div style={s.evalMiniMetrics}>
                    <span>P@K: {r.precision_at_k}</span>
                    <span>R@K: {r.recall_at_k}</span>
                    <span>RR: {r.reciprocal_rank}</span>
                    <span style={{ color: scoreColor(r.llm_judge.overall) }}>Judge: {r.llm_judge.overall}/5</span>
                  </div>
                  <div style={s.evalFiles}>
                    <span style={{ color: "#94a3b8" }}>Retrieved: </span>
                    {r.retrieved_files.map((f, j) => (
                      <span key={j} style={{
                        ...s.fileTag,
                        background: r.relevant_files.includes(f) ? "#052e16" : "#1e293b",
                        color: r.relevant_files.includes(f) ? "#86efac" : "#94a3b8",
                        border: `1px solid ${r.relevant_files.includes(f) ? "#16a34a" : "#334155"}`,
                      }}>{f}</span>
                    ))}
                  </div>
                  {r.llm_judge.feedback && <div style={s.judgeFeedback}>💬 {r.llm_judge.feedback}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  main: { padding: "1.5rem", maxWidth: "900px", margin: "0 auto" },
  header: { marginBottom: "1.25rem" },
  title: { fontSize: "1.8rem", fontWeight: 700 },
  subtitle: { color: "#94a3b8", marginTop: "0.25rem" },
  tabs: { display: "flex", gap: "0.5rem", marginBottom: "1rem" },
  tabBtn: { padding: "0.5rem 1.25rem", border: "none", borderRadius: "8px", color: "#e2e8f0", fontWeight: 600, fontSize: "0.9rem", cursor: "pointer" },
  panel: { background: "#1e293b", borderRadius: "12px", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" },
  panelTitle: { fontSize: "1.1rem", fontWeight: 700 },
  hint: { color: "#64748b", fontSize: "0.875rem" },
  uploadRow: { display: "flex", alignItems: "center", gap: "0.75rem" },
  uploadBtn: { padding: "0.5rem 1rem", background: "#334155", color: "#e2e8f0", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600 },
  fileCount: { color: "#94a3b8", fontSize: "0.875rem" },
  fileList: { display: "flex", flexDirection: "column", gap: "0.35rem" },
  fileItem: { display: "flex", alignItems: "center", gap: "0.5rem", background: "#0f1117", borderRadius: "6px", padding: "0.4rem 0.75rem" },
  fileName: { flex: 1, fontSize: "0.875rem", fontFamily: "monospace" },
  fileSize: { color: "#64748b", fontSize: "0.8rem" },
  removeBtn: { background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.8rem", padding: "0 0.25rem" },
  primaryBtn: { padding: "0.7rem 1.5rem", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "0.95rem", cursor: "pointer", alignSelf: "flex-start" },
  successBox: { background: "#052e16", border: "1px solid #16a34a", borderRadius: "8px", padding: "0.75rem 1rem" },
  successTitle: { color: "#86efac", fontWeight: 600, marginBottom: "0.5rem" },
  metaRow: { display: "flex", gap: "1.5rem", color: "#cbd5e1", fontSize: "0.875rem" },
  fileResultList: { marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.2rem" },
  fileResultItem: { fontSize: "0.8rem", color: "#94a3b8", fontFamily: "monospace" },
  errorBox: { background: "#450a0a", border: "1px solid #dc2626", borderRadius: "8px", padding: "0.75rem 1rem", color: "#fca5a5", fontSize: "0.9rem" },
  inputRow: { display: "flex", gap: "0.5rem" },
  questionInput: { flex: 1, background: "#0f1117", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "8px", padding: "0.65rem 0.75rem", fontSize: "0.9rem" },
  answerBox: { background: "#0f1117", borderRadius: "8px", padding: "1rem" },
  answerLabel: { fontSize: "0.75rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.5rem" },
  answerText: { color: "#e2e8f0", fontSize: "0.9rem", lineHeight: 1.6, whiteSpace: "pre-wrap" },
  sourcesLabel: { fontSize: "0.75rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.5rem" },
  sourceCard: { background: "#0f1117", borderRadius: "8px", padding: "0.75rem", marginBottom: "0.5rem" },
  sourceHeader: { display: "flex", gap: "0.75rem", alignItems: "center", marginBottom: "0.5rem" },
  sourceFile: { fontFamily: "monospace", fontSize: "0.875rem", color: "#a78bfa", fontWeight: 600 },
  sourceLines: { fontSize: "0.78rem", color: "#64748b" },
  sourceScore: { fontSize: "0.78rem", color: "#64748b", marginLeft: "auto" },
  snippet: { fontSize: "0.78rem", color: "#86efac", overflowX: "auto", lineHeight: 1.5, maxHeight: "150px", overflowY: "auto" },
  evalTextarea: { minHeight: "160px", background: "#0f1117", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "8px", padding: "0.75rem", fontFamily: "monospace", fontSize: "0.82rem", resize: "vertical" },
  metricsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" },
  metricCard: { background: "#0f1117", borderRadius: "8px", padding: "0.75rem", textAlign: "center" },
  metricLabel: { fontSize: "0.75rem", color: "#94a3b8", fontWeight: 600, marginBottom: "0.35rem" },
  metricValue: { fontSize: "1.5rem", fontWeight: 700 },
  evalResultCard: { background: "#0f1117", borderRadius: "8px", padding: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" },
  evalQuestion: { fontSize: "0.875rem", color: "#e2e8f0", fontWeight: 600 },
  evalMiniMetrics: { display: "flex", gap: "1rem", fontSize: "0.8rem", color: "#94a3b8" },
  evalFiles: { display: "flex", flexWrap: "wrap", gap: "0.35rem", alignItems: "center", fontSize: "0.8rem" },
  fileTag: { padding: "0.15rem 0.4rem", borderRadius: "4px", fontFamily: "monospace", fontSize: "0.75rem" },
  judgeFeedback: { fontSize: "0.8rem", color: "#94a3b8", fontStyle: "italic" },
};
