"use client";

import { useState, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#dc2626",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#6366f1",
};

const CATEGORY_COLORS: Record<string, string> = {
  code_smell: "#f59e0b",
  complexity: "#ef4444",
  security: "#dc2626",
  duplication: "#8b5cf6",
  no_tests: "#06b6d4",
  poor_docs: "#64748b",
  outdated_deps: "#f97316",
  error_handling: "#ec4899",
};

const CATEGORY_LABELS: Record<string, string> = {
  code_smell: "Code Smell",
  complexity: "High Complexity",
  security: "Security Risk",
  duplication: "Duplication",
  no_tests: "Missing Tests",
  poor_docs: "Poor Documentation",
  outdated_deps: "Outdated Patterns",
  error_handling: "Error Handling",
};

const EFFORT_LABELS: Record<string, string> = {
  trivial: "⚡ Trivial",
  small: "🔧 Small",
  medium: "🔨 Medium",
  large: "🏗️ Large",
};

const GRADE_COLORS: Record<string, string> = {
  A: "#10b981", B: "#6366f1", C: "#f59e0b", D: "#f97316", F: "#dc2626",
};

interface Issue {
  category: string;
  severity: string;
  line_start: number;
  title: string;
  description: string;
  suggestion: string;
  effort: string;
  filename: string;
  chunk_start: number;
  chunk_end: number;
}

interface Score {
  total: number;
  grade: string;
  by_category: Record<string, number>;
  by_severity: Record<string, number>;
}

interface Summary {
  executive_summary: string;
  top_risks: string[];
  quick_wins: string[];
  recommended_priority: string;
  estimated_remediation: string;
}

interface ReportResponse {
  generated_at: string;
  files_analyzed: number;
  files: { filename: string; lines: number; chunks_analyzed: number; issues_found: number }[];
  total_issues: number;
  score: Score;
  summary: Summary;
  issues: Issue[];
  by_category: Record<string, { label: string; color: string; count: number; issues: Issue[] }>;
}

export default function Home() {
  const [uploadedFiles, setUploadedFiles] = useState<{ filename: string; content: string }[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "issues" | "report">("overview");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const newFiles: { filename: string; content: string }[] = [];
    for (const file of Array.from(files)) {
      newFiles.push({ filename: file.name, content: await file.text() });
    }
    setUploadedFiles(prev => [...prev, ...newFiles]);
  }

  async function handleAnalyze() {
    if (!uploadedFiles.length) return;
    setAnalyzing(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`${API_URL}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: uploadedFiles }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `Error ${res.status}`);
      }
      const data = await res.json();
      setReport(data);
      setActiveTab("overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  const filteredIssues = report?.issues.filter(issue => {
    if (filterSeverity !== "all" && issue.severity !== filterSeverity) return false;
    if (filterCategory !== "all" && issue.category !== filterCategory) return false;
    return true;
  }) ?? [];

  return (
    <main style={s.main}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={s.title}>🏗️ Tech Debt Analyzer</h1>
          <p style={s.subtitle}>RAG-enhanced technical debt detection, scoring & prioritization</p>
        </div>
        {report && (
          <div style={s.gradeBadge}>
            <span style={s.gradeLabel}>Debt Grade</span>
            <span style={{ ...s.gradeValue, color: GRADE_COLORS[report.score.grade] ?? "#e2e8f0" }}>
              {report.score.grade}
            </span>
            <span style={s.gradeScore}>{report.score.total} pts</span>
          </div>
        )}
      </div>

      <div style={s.layout}>
        {/* Sidebar */}
        <div style={s.sidebar}>
          <div style={s.card}>
            <h2 style={s.cardTitle}>Upload Codebase</h2>
            <p style={s.hint}>Upload source files to analyze for technical debt.</p>

            <button onClick={() => fileInputRef.current?.click()} style={s.uploadBtn}>
              + Add Files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={handleFileUpload}
              accept=".py,.ts,.tsx,.js,.jsx,.go,.java,.rb,.php,.cs,.cpp,.c,.h"
            />

            {uploadedFiles.length > 0 && (
              <div style={s.fileList}>
                {uploadedFiles.map((f, i) => (
                  <div key={i} style={s.fileItem}>
                    <span style={s.fileIcon}>📄</span>
                    <span style={s.fileName}>{f.filename}</span>
                    <span style={s.fileLines}>{f.content.split("\n").length}L</span>
                    <button onClick={() => setUploadedFiles(p => p.filter((_, j) => j !== i))} style={s.removeBtn}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleAnalyze}
              disabled={analyzing || !uploadedFiles.length}
              style={{ ...s.analyzeBtn, opacity: analyzing || !uploadedFiles.length ? 0.6 : 1 }}
            >
              {analyzing ? "⏳ Analyzing..." : "🔍 Analyze Tech Debt"}
            </button>
            {analyzing && <div style={s.analyzingHint}>This may take 30-60 seconds depending on file size</div>}
            {error && <div style={s.errorBox}>⚠️ {error}</div>}
          </div>

          {report && (
            <div style={s.card}>
              <h2 style={s.cardTitle}>Summary</h2>
              <div style={s.statGrid}>
                <div style={s.stat}>
                  <span style={s.statValue}>{report.total_issues}</span>
                  <span style={s.statLabel}>Issues</span>
                </div>
                <div style={s.stat}>
                  <span style={s.statValue}>{report.files_analyzed}</span>
                  <span style={s.statLabel}>Files</span>
                </div>
                <div style={{ ...s.stat, color: SEVERITY_COLORS.critical }}>
                  <span style={s.statValue}>{report.score.by_severity?.critical ?? 0}</span>
                  <span style={s.statLabel}>Critical</span>
                </div>
                <div style={{ ...s.stat, color: SEVERITY_COLORS.high }}>
                  <span style={s.statValue}>{report.score.by_severity?.high ?? 0}</span>
                  <span style={s.statLabel}>High</span>
                </div>
              </div>

              {/* Category breakdown */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.5rem" }}>
                {Object.entries(report.by_category)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([cat, data]) => (
                    <div key={cat} style={s.categoryBar}>
                      <span style={{ ...s.catDot, background: data.color }} />
                      <span style={s.catLabel}>{data.label}</span>
                      <span style={s.catCount}>{data.count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Main content */}
        <div style={s.content}>
          {!report && !analyzing && (
            <div style={s.empty}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🏗️</div>
              <div style={{ color: "#94a3b8", fontSize: "1.1rem", fontWeight: 600 }}>Upload files to start analysis</div>
              <div style={{ color: "#475569", marginTop: "0.5rem", fontSize: "0.875rem" }}>
                Supports Python, TypeScript, JavaScript, Go, Java and more
              </div>
            </div>
          )}

          {analyzing && (
            <div style={s.empty}>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>🔍</div>
              <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: "1.1rem" }}>Analyzing codebase...</div>
              <div style={{ color: "#64748b", marginTop: "0.5rem", fontSize: "0.875rem" }}>
                Chunking code → Embedding → Claude analysis → Scoring
              </div>
            </div>
          )}

          {report && (
            <>
              {/* Tabs */}
              <div style={s.tabs}>
                {(["overview", "issues", "report"] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setActiveTab(t)}
                    style={{ ...s.tabBtn, background: activeTab === t ? "#6366f1" : "#1e293b" }}
                  >
                    {t === "overview" ? "📊 Overview" : t === "issues" ? `🐛 Issues (${report.total_issues})` : "📋 Report"}
                  </button>
                ))}
              </div>

              {/* OVERVIEW TAB */}
              {activeTab === "overview" && (
                <div style={s.tabContent}>
                  {/* Score card */}
                  <div style={s.scoreCard}>
                    <div style={s.scoreLeft}>
                      <span style={{ ...s.bigGrade, color: GRADE_COLORS[report.score.grade] }}>
                        {report.score.grade}
                      </span>
                      <div>
                        <div style={s.scoreTitle}>Technical Debt Score</div>
                        <div style={s.scorePoints}>{report.score.total} points</div>
                      </div>
                    </div>
                    <div style={s.severityGrid}>
                      {["critical", "high", "medium", "low"].map(sev => (
                        <div key={sev} style={s.severityCard}>
                          <span style={{ ...s.sevCount, color: SEVERITY_COLORS[sev] }}>
                            {report.score.by_severity?.[sev] ?? 0}
                          </span>
                          <span style={s.sevLabel}>{sev.charAt(0).toUpperCase() + sev.slice(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Category cards */}
                  <div style={s.categoryGrid}>
                    {Object.entries(report.by_category).map(([cat, data]) => (
                      <div key={cat} style={{ ...s.catCard, borderColor: data.color + "44" }}>
                        <div style={{ ...s.catCardHeader, color: data.color }}>{data.label}</div>
                        <div style={s.catCardCount}>{data.count}</div>
                        <div style={s.catCardSub}>issues found</div>
                      </div>
                    ))}
                  </div>

                  {/* Files analyzed */}
                  <div style={s.section}>
                    <h3 style={s.sectionTitle}>Files Analyzed</h3>
                    {report.files.map((f, i) => (
                      <div key={i} style={s.fileRow}>
                        <span style={s.fileRowName}>📄 {f.filename}</span>
                        <span style={s.fileRowMeta}>{f.lines} lines</span>
                        <span style={s.fileRowMeta}>{f.chunks_analyzed} chunks</span>
                        <span style={{
                          ...s.fileRowIssues,
                          color: f.issues_found > 5 ? "#ef4444" : f.issues_found > 2 ? "#f59e0b" : "#10b981"
                        }}>
                          {f.issues_found} issues
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ISSUES TAB */}
              {activeTab === "issues" && (
                <div style={s.tabContent}>
                  {/* Filters */}
                  <div style={s.filters}>
                    <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={s.filterSelect}>
                      <option value="all">All Severities</option>
                      {["critical", "high", "medium", "low"].map(s => (
                        <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                      ))}
                    </select>
                    <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={s.filterSelect}>
                      <option value="all">All Categories</option>
                      {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <span style={s.filterCount}>{filteredIssues.length} issues</span>
                  </div>

                  {filteredIssues.map((issue, i) => (
                    <div
                      key={i}
                      style={{ ...s.issueCard, borderLeftColor: SEVERITY_COLORS[issue.severity] ?? "#64748b" }}
                      onClick={() => setExpandedIssue(expandedIssue === i ? null : i)}
                    >
                      <div style={s.issueHeader}>
                        <span style={{ ...s.sevBadge, background: SEVERITY_COLORS[issue.severity] + "22", color: SEVERITY_COLORS[issue.severity] }}>
                          {issue.severity}
                        </span>
                        <span style={{ ...s.catBadge, background: (CATEGORY_COLORS[issue.category] ?? "#64748b") + "22", color: CATEGORY_COLORS[issue.category] ?? "#64748b" }}>
                          {CATEGORY_LABELS[issue.category] ?? issue.category}
                        </span>
                        <span style={s.issueTitle}>{issue.title}</span>
                        <span style={s.effortBadge}>{EFFORT_LABELS[issue.effort] ?? issue.effort}</span>
                      </div>
                      <div style={s.issueMeta}>
                        <span style={s.issueFile}>📄 {issue.filename}</span>
                        {issue.line_start > 0 && <span style={s.issueLine}>~line {issue.line_start}</span>}
                      </div>

                      {expandedIssue === i && (
                        <div style={s.issueExpanded}>
                          <div style={s.issueDesc}>{issue.description}</div>
                          <div style={s.issueSuggestion}>
                            <span style={s.suggestionLabel}>💡 Suggestion: </span>
                            {issue.suggestion}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* REPORT TAB */}
              {activeTab === "report" && (
                <div style={s.tabContent}>
                  <div style={s.reportCard}>
                    <h3 style={s.reportSection}>Executive Summary</h3>
                    <p style={s.reportText}>{report.summary.executive_summary}</p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <div style={s.reportCard}>
                      <h3 style={s.reportSection}>🚨 Top Risks</h3>
                      {report.summary.top_risks?.map((r, i) => (
                        <div key={i} style={s.reportItem}>• {r}</div>
                      ))}
                    </div>
                    <div style={s.reportCard}>
                      <h3 style={s.reportSection}>⚡ Quick Wins</h3>
                      {report.summary.quick_wins?.map((q, i) => (
                        <div key={i} style={s.reportItem}>• {q}</div>
                      ))}
                    </div>
                  </div>

                  <div style={s.reportCard}>
                    <h3 style={s.reportSection}>🎯 Recommended Priority</h3>
                    <p style={s.reportText}>{report.summary.recommended_priority}</p>
                  </div>

                  <div style={s.reportCard}>
                    <h3 style={s.reportSection}>⏱️ Estimated Remediation</h3>
                    <p style={{ ...s.reportText, color: "#a78bfa", fontWeight: 600 }}>{report.summary.estimated_remediation}</p>
                  </div>

                  <div style={s.reportMeta}>
                    Generated at {new Date(report.generated_at).toLocaleString()} · {report.files_analyzed} files · {report.total_issues} issues
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

const s: Record<string, React.CSSProperties> = {
  main: { padding: "1.5rem", maxWidth: "1400px", margin: "0 auto" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" },
  headerLeft: {},
  title: { fontSize: "1.8rem", fontWeight: 700 },
  subtitle: { color: "#94a3b8", marginTop: "0.25rem", fontSize: "0.9rem" },
  gradeBadge: { background: "#1e293b", borderRadius: "12px", padding: "0.75rem 1.25rem", textAlign: "center", minWidth: "100px" },
  gradeLabel: { display: "block", fontSize: "0.7rem", color: "#64748b", fontWeight: 700, textTransform: "uppercase" },
  gradeValue: { display: "block", fontSize: "2.5rem", fontWeight: 900, lineHeight: 1 },
  gradeScore: { display: "block", fontSize: "0.75rem", color: "#64748b", marginTop: "0.2rem" },
  layout: { display: "grid", gridTemplateColumns: "300px 1fr", gap: "1.25rem", alignItems: "start" },
  sidebar: { display: "flex", flexDirection: "column", gap: "1rem" },
  content: { minHeight: "400px" },
  card: { background: "#1e293b", borderRadius: "12px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "0.75rem" },
  cardTitle: { fontSize: "0.8rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" },
  hint: { color: "#64748b", fontSize: "0.8rem" },
  uploadBtn: { padding: "0.5rem 1rem", background: "#334155", color: "#e2e8f0", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600, fontSize: "0.875rem", alignSelf: "flex-start" },
  fileList: { display: "flex", flexDirection: "column", gap: "0.3rem" },
  fileItem: { display: "flex", alignItems: "center", gap: "0.4rem", background: "#0f1117", borderRadius: "6px", padding: "0.35rem 0.6rem" },
  fileIcon: { fontSize: "0.85rem" },
  fileName: { flex: 1, fontSize: "0.78rem", fontFamily: "monospace", color: "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  fileLines: { fontSize: "0.7rem", color: "#64748b" },
  removeBtn: { background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "0.75rem" },
  analyzeBtn: { padding: "0.7rem", background: "#6366f1", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "0.9rem", cursor: "pointer" },
  analyzingHint: { fontSize: "0.75rem", color: "#64748b", textAlign: "center" },
  errorBox: { background: "#450a0a", border: "1px solid #dc2626", borderRadius: "8px", padding: "0.6rem 0.75rem", color: "#fca5a5", fontSize: "0.85rem" },
  statGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" },
  stat: { background: "#0f1117", borderRadius: "8px", padding: "0.6rem", textAlign: "center" },
  statValue: { display: "block", fontSize: "1.4rem", fontWeight: 700, color: "#e2e8f0" },
  statLabel: { display: "block", fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase" },
  categoryBar: { display: "flex", alignItems: "center", gap: "0.5rem" },
  catDot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0 },
  catLabel: { flex: 1, fontSize: "0.78rem", color: "#94a3b8" },
  catCount: { fontSize: "0.78rem", fontWeight: 700, color: "#e2e8f0" },
  empty: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "350px", textAlign: "center" },
  tabs: { display: "flex", gap: "0.5rem", marginBottom: "1rem" },
  tabBtn: { padding: "0.5rem 1rem", border: "none", borderRadius: "8px", color: "#e2e8f0", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer" },
  tabContent: { display: "flex", flexDirection: "column", gap: "0.75rem" },
  scoreCard: { background: "#1e293b", borderRadius: "12px", padding: "1.25rem", display: "flex", alignItems: "center", gap: "2rem" },
  scoreLeft: { display: "flex", alignItems: "center", gap: "1rem" },
  bigGrade: { fontSize: "4rem", fontWeight: 900, lineHeight: 1 },
  scoreTitle: { fontSize: "1rem", fontWeight: 700, color: "#e2e8f0" },
  scorePoints: { fontSize: "0.85rem", color: "#94a3b8", marginTop: "0.2rem" },
  severityGrid: { display: "flex", gap: "1rem", marginLeft: "auto" },
  severityCard: { textAlign: "center" },
  sevCount: { display: "block", fontSize: "1.5rem", fontWeight: 700 },
  sevLabel: { display: "block", fontSize: "0.7rem", color: "#64748b", textTransform: "uppercase" },
  categoryGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem" },
  catCard: { background: "#1e293b", borderRadius: "10px", padding: "0.75rem", border: "1px solid transparent", textAlign: "center" },
  catCardHeader: { fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", marginBottom: "0.5rem" },
  catCardCount: { fontSize: "1.8rem", fontWeight: 900, color: "#e2e8f0" },
  catCardSub: { fontSize: "0.7rem", color: "#64748b" },
  section: { background: "#1e293b", borderRadius: "10px", padding: "1rem" },
  sectionTitle: { fontSize: "0.8rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: "0.75rem" },
  fileRow: { display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem 0", borderBottom: "1px solid #1e293b" },
  fileRowName: { flex: 1, fontFamily: "monospace", fontSize: "0.85rem" },
  fileRowMeta: { fontSize: "0.78rem", color: "#64748b" },
  fileRowIssues: { fontSize: "0.85rem", fontWeight: 700 },
  filters: { display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" },
  filterSelect: { background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", borderRadius: "6px", padding: "0.4rem 0.6rem", fontSize: "0.85rem" },
  filterCount: { fontSize: "0.8rem", color: "#64748b", marginLeft: "auto" },
  issueCard: { background: "#1e293b", borderRadius: "10px", padding: "0.85rem 1rem", borderLeft: "3px solid", cursor: "pointer" },
  issueHeader: { display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" },
  sevBadge: { padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase" },
  catBadge: { padding: "0.15rem 0.5rem", borderRadius: "4px", fontSize: "0.72rem", fontWeight: 600 },
  issueTitle: { flex: 1, fontSize: "0.875rem", color: "#e2e8f0", fontWeight: 600 },
  effortBadge: { fontSize: "0.72rem", color: "#64748b" },
  issueMeta: { display: "flex", gap: "0.75rem", marginTop: "0.35rem" },
  issueFile: { fontSize: "0.75rem", color: "#64748b", fontFamily: "monospace" },
  issueLine: { fontSize: "0.75rem", color: "#64748b" },
  issueExpanded: { marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #334155", display: "flex", flexDirection: "column", gap: "0.5rem" },
  issueDesc: { fontSize: "0.875rem", color: "#cbd5e1", lineHeight: 1.5 },
  issueSuggestion: { fontSize: "0.875rem", color: "#86efac", lineHeight: 1.5 },
  suggestionLabel: { fontWeight: 700 },
  reportCard: { background: "#1e293b", borderRadius: "10px", padding: "1rem 1.25rem" },
  reportSection: { fontSize: "0.8rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: "0.6rem" },
  reportText: { fontSize: "0.9rem", color: "#cbd5e1", lineHeight: 1.6 },
  reportItem: { fontSize: "0.875rem", color: "#cbd5e1", padding: "0.25rem 0", lineHeight: 1.5 },
  reportMeta: { fontSize: "0.75rem", color: "#475569", textAlign: "center", paddingTop: "0.5rem" },
};
