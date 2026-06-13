"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface ShortenResponse {
  short_code: string;
  short_url: string;
  original_url: string;
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ShortenResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);

    try {
      const res = await fetch(`${API_URL}/shorten`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Error ${res.status}`);
      }

      const data: ShortenResponse = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.short_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={styles.title}>🔗 URL Shortener</h1>
        <p style={styles.subtitle}>Paste a long URL and get a short one instantly</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="url"
            placeholder="https://example.com/very/long/url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            style={styles.input}
            disabled={loading}
          />
          <button type="submit" disabled={loading || !url} style={styles.button}>
            {loading ? "Shortening…" : "Shorten"}
          </button>
        </form>

        {error && (
          <div style={styles.error}>
            ⚠️ {error}
          </div>
        )}

        {result && (
          <div style={styles.result}>
            <p style={styles.resultLabel}>Your short URL:</p>
            <div style={styles.resultRow}>
              <a
                href={result.short_url}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.shortUrl}
              >
                {result.short_url}
              </a>
              <button onClick={handleCopy} style={styles.copyButton}>
                {copied ? "✅ Copied!" : "Copy"}
              </button>
            </div>
            <p style={styles.originalUrl}>
              Original: <span style={styles.originalUrlText}>{result.original_url}</span>
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Inline styles (no external dependencies needed)
// ---------------------------------------------------------------------------
const styles: Record<string, React.CSSProperties> = {
  main: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    padding: "1rem",
  },
  card: {
    background: "#fff",
    borderRadius: "12px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    padding: "2.5rem",
    width: "100%",
    maxWidth: "560px",
  },
  title: {
    fontSize: "1.8rem",
    fontWeight: 700,
    marginBottom: "0.25rem",
  },
  subtitle: {
    color: "#666",
    marginBottom: "1.5rem",
    fontSize: "0.95rem",
  },
  form: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  input: {
    flex: 1,
    minWidth: "200px",
    padding: "0.65rem 1rem",
    borderRadius: "8px",
    border: "1.5px solid #d1d5db",
    fontSize: "0.95rem",
    outline: "none",
  },
  button: {
    padding: "0.65rem 1.4rem",
    borderRadius: "8px",
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: 600,
    fontSize: "0.95rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  error: {
    marginTop: "1rem",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    background: "#fef2f2",
    color: "#b91c1c",
    fontSize: "0.9rem",
  },
  result: {
    marginTop: "1.25rem",
    padding: "1rem",
    borderRadius: "8px",
    background: "#f0fdf4",
    border: "1.5px solid #86efac",
  },
  resultLabel: {
    fontSize: "0.8rem",
    color: "#15803d",
    fontWeight: 600,
    marginBottom: "0.4rem",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  resultRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.5rem",
    flexWrap: "wrap",
  },
  shortUrl: {
    fontWeight: 700,
    fontSize: "1.05rem",
    color: "#1d4ed8",
    wordBreak: "break-all",
  },
  copyButton: {
    padding: "0.3rem 0.8rem",
    borderRadius: "6px",
    border: "1px solid #86efac",
    background: "#fff",
    color: "#15803d",
    fontWeight: 600,
    fontSize: "0.85rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  originalUrl: {
    fontSize: "0.8rem",
    color: "#6b7280",
  },
  originalUrlText: {
    wordBreak: "break-all",
  },
};
