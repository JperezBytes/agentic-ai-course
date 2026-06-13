import os
import re
import json
from contextlib import asynccontextmanager
from typing import Optional
from datetime import datetime

import anthropic
import chromadb
from chromadb.utils import embedding_functions
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODEL = "claude-haiku-4-5-20251001"

# ---------------------------------------------------------------------------
# ChromaDB
# ---------------------------------------------------------------------------

chroma_client = chromadb.Client()
embed_fn = embedding_functions.DefaultEmbeddingFunction()
collection = chroma_client.get_or_create_collection(
    name="codebase",
    embedding_function=embed_fn,
)

# ---------------------------------------------------------------------------
# Tech debt categories
# ---------------------------------------------------------------------------

DEBT_CATEGORIES = {
    "code_smell": {"label": "Code Smell", "color": "#f59e0b", "weight": 1.0},
    "complexity": {"label": "High Complexity", "color": "#ef4444", "weight": 1.5},
    "security": {"label": "Security Risk", "color": "#dc2626", "weight": 2.0},
    "duplication": {"label": "Duplication", "color": "#8b5cf6", "weight": 1.0},
    "no_tests": {"label": "Missing Tests", "color": "#06b6d4", "weight": 1.2},
    "poor_docs": {"label": "Poor Documentation", "color": "#64748b", "weight": 0.8},
    "outdated_deps": {"label": "Outdated Patterns", "color": "#f97316", "weight": 1.0},
    "error_handling": {"label": "Error Handling", "color": "#ec4899", "weight": 1.3},
}

SEVERITY_SCORES = {"critical": 10, "high": 7, "medium": 4, "low": 1}

# ---------------------------------------------------------------------------
# Code chunking
# ---------------------------------------------------------------------------

def chunk_python(content: str, filename: str) -> list[dict]:
    chunks, lines = [], content.split("\n")
    current_chunk, current_start = [], 0
    for i, line in enumerate(lines):
        if re.match(r"^(def |class |async def )", line) and current_chunk:
            chunks.append({"text": "\n".join(current_chunk), "filename": filename, "start_line": current_start + 1, "end_line": i})
            current_chunk, current_start = [line], i
        else:
            current_chunk.append(line)
    if current_chunk:
        chunks.append({"text": "\n".join(current_chunk), "filename": filename, "start_line": current_start + 1, "end_line": len(lines)})
    if not chunks:
        chunks = [{"text": content, "filename": filename, "start_line": 1, "end_line": len(lines)}]
    return [c for c in chunks if c["text"].strip()]


def chunk_generic(content: str, filename: str, size: int = 50) -> list[dict]:
    lines = content.split("\n")
    return [
        {"text": "\n".join(lines[i:i+size]), "filename": filename, "start_line": i+1, "end_line": i+len(lines[i:i+size])}
        for i in range(0, len(lines), size)
        if "\n".join(lines[i:i+size]).strip()
    ]


def chunk_file(filename: str, content: str) -> list[dict]:
    if filename.endswith(".py"):
        return chunk_python(content, filename)
    return chunk_generic(content, filename)

# ---------------------------------------------------------------------------
# Claude helpers
# ---------------------------------------------------------------------------

def call_claude(system: str, user: str, max_tokens: int = 2048) -> str:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    msg = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text.strip()


def strip_json(text: str) -> str:
    text = re.sub(r"^```(?:json)?\s*", "", text)
    return re.sub(r"\s*```$", "", text).strip()

# ---------------------------------------------------------------------------
# Tech debt analysis
# ---------------------------------------------------------------------------

ANALYZE_SYSTEM = """You are a senior software engineer performing a technical debt audit.
Analyze the provided code chunk and identify technical debt issues.

Return a JSON array of issues. Each issue must have:
{
  "category": one of [code_smell, complexity, security, duplication, no_tests, poor_docs, outdated_deps, error_handling],
  "severity": one of [critical, high, medium, low],
  "line_start": integer (approximate line number),
  "title": short title (max 60 chars),
  "description": what the problem is (1-2 sentences),
  "suggestion": how to fix it (1-2 sentences),
  "effort": one of [trivial, small, medium, large]
}

Return ONLY a JSON array. If no issues found, return [].
Be specific and actionable. Focus on real problems, not style preferences."""

SUMMARY_SYSTEM = """You are a senior engineering manager summarizing a technical debt report.
Given a list of technical debt issues across a codebase, provide:
{
  "executive_summary": "2-3 sentence overview for non-technical stakeholders",
  "top_risks": ["risk1", "risk2", "risk3"],
  "quick_wins": ["easy fix 1", "easy fix 2"],
  "recommended_priority": "which category/area to tackle first and why",
  "estimated_remediation": "rough estimate of effort (e.g. 2-3 sprints)"
}
Return ONLY JSON."""


def analyze_chunk(chunk: dict) -> list[dict]:
    prompt = f"File: {chunk['filename']} (lines {chunk['start_line']}-{chunk['end_line']})\n\n{chunk['text']}"
    result = call_claude(ANALYZE_SYSTEM, prompt, max_tokens=1500)
    try:
        issues = json.loads(strip_json(result))
        if not isinstance(issues, list):
            return []
        # Enrich with chunk metadata
        for issue in issues:
            issue["filename"] = chunk["filename"]
            issue["chunk_start"] = chunk["start_line"]
            issue["chunk_end"] = chunk["end_line"]
        return issues
    except Exception:
        return []


def generate_summary(issues: list[dict], filenames: list[str]) -> dict:
    if not issues:
        return {
            "executive_summary": "No technical debt issues were detected in the analyzed codebase.",
            "top_risks": [],
            "quick_wins": [],
            "recommended_priority": "N/A",
            "estimated_remediation": "N/A",
        }
    prompt = f"Files analyzed: {', '.join(filenames)}\n\nIssues found ({len(issues)} total):\n" + json.dumps(issues[:30], indent=2)
    result = call_claude(SUMMARY_SYSTEM, prompt)
    try:
        return json.loads(strip_json(result))
    except Exception:
        return {"executive_summary": result, "top_risks": [], "quick_wins": [], "recommended_priority": "", "estimated_remediation": ""}


def compute_debt_score(issues: list[dict]) -> dict:
    if not issues:
        return {"total": 0, "grade": "A", "by_category": {}, "by_severity": {}}

    total = 0
    by_category: dict[str, int] = {}
    by_severity: dict[str, int] = {}

    for issue in issues:
        sev = issue.get("severity", "low")
        cat = issue.get("category", "code_smell")
        base = SEVERITY_SCORES.get(sev, 1)
        weight = DEBT_CATEGORIES.get(cat, {}).get("weight", 1.0)
        pts = base * weight
        total += pts
        by_category[cat] = by_category.get(cat, 0) + 1
        by_severity[sev] = by_severity.get(sev, 0) + 1

    # Grade: A=0-20, B=21-50, C=51-100, D=101-200, F=200+
    if total <= 20:
        grade = "A"
    elif total <= 50:
        grade = "B"
    elif total <= 100:
        grade = "C"
    elif total <= 200:
        grade = "D"
    else:
        grade = "F"

    return {
        "total": round(total, 1),
        "grade": grade,
        "by_category": by_category,
        "by_severity": by_severity,
    }

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class CodeFile(BaseModel):
    filename: str
    content: str


class IndexRequest(BaseModel):
    files: list[CodeFile]


class AnalyzeRequest(BaseModel):
    files: list[CodeFile]


class ReportRequest(BaseModel):
    files: list[CodeFile]

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not ANTHROPIC_API_KEY:
        print("WARNING: ANTHROPIC_API_KEY not set")
    yield


app = FastAPI(title="Tech Debt Analyzer", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "indexed_chunks": collection.count()}


@app.post("/index")
def index_files(body: IndexRequest):
    """Index files into vector store for semantic search."""
    if not body.files:
        raise HTTPException(400, "No files provided")

    total_chunks, indexed = 0, []
    for file in body.files:
        try:
            existing = collection.get(where={"filename": file.filename})
            if existing["ids"]:
                collection.delete(ids=existing["ids"])
        except Exception:
            pass

        chunks = chunk_file(file.filename, file.content)
        if not chunks:
            continue

        ids = [f"{file.filename}::chunk_{i}" for i in range(len(chunks))]
        collection.add(
            ids=ids,
            documents=[c["text"] for c in chunks],
            metadatas=[{"filename": c["filename"], "start_line": c["start_line"], "end_line": c["end_line"]} for c in chunks],
        )
        total_chunks += len(chunks)
        indexed.append({"filename": file.filename, "chunks": len(chunks)})

    return {"success": True, "total_chunks": total_chunks, "files": indexed}


@app.post("/analyze")
def analyze(body: AnalyzeRequest):
    """Analyze files for technical debt issues."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured")
    if not body.files:
        raise HTTPException(400, "No files provided")

    all_issues: list[dict] = []
    files_processed = []

    for file in body.files:
        chunks = chunk_file(file.filename, file.content)
        file_issues: list[dict] = []
        for chunk in chunks:
            file_issues.extend(analyze_chunk(chunk))
        all_issues.extend(file_issues)
        files_processed.append({
            "filename": file.filename,
            "chunks_analyzed": len(chunks),
            "issues_found": len(file_issues),
        })

    # Sort by severity
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    all_issues.sort(key=lambda x: severity_order.get(x.get("severity", "low"), 3))

    score = compute_debt_score(all_issues)

    return {
        "files_analyzed": len(body.files),
        "files": files_processed,
        "total_issues": len(all_issues),
        "score": score,
        "issues": all_issues,
    }


@app.post("/report")
def report(body: ReportRequest):
    """Full analysis + AI-generated executive report."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY not configured")
    if not body.files:
        raise HTTPException(400, "No files provided")

    all_issues: list[dict] = []
    files_processed = []

    for file in body.files:
        chunks = chunk_file(file.filename, file.content)
        file_issues: list[dict] = []
        for chunk in chunks:
            file_issues.extend(analyze_chunk(chunk))
        all_issues.extend(file_issues)
        files_processed.append({
            "filename": file.filename,
            "lines": len(file.content.split("\n")),
            "chunks_analyzed": len(chunks),
            "issues_found": len(file_issues),
        })

    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    all_issues.sort(key=lambda x: severity_order.get(x.get("severity", "low"), 3))

    score = compute_debt_score(all_issues)
    summary = generate_summary(all_issues, [f["filename"] for f in files_processed])

    # Group issues by category for report
    by_category: dict[str, list] = {}
    for issue in all_issues:
        cat = issue.get("category", "code_smell")
        by_category.setdefault(cat, []).append(issue)

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "files_analyzed": len(body.files),
        "files": files_processed,
        "total_issues": len(all_issues),
        "score": score,
        "summary": summary,
        "issues": all_issues,
        "by_category": {
            cat: {
                "label": DEBT_CATEGORIES.get(cat, {}).get("label", cat),
                "color": DEBT_CATEGORIES.get(cat, {}).get("color", "#64748b"),
                "count": len(items),
                "issues": items,
            }
            for cat, items in by_category.items()
        },
        "categories_meta": DEBT_CATEGORIES,
    }
