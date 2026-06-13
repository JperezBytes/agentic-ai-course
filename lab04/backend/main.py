import os
import re
import json
import math
from contextlib import asynccontextmanager
from typing import Optional

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
COLLECTION_NAME = "codebase"
TOP_K = 5

# ---------------------------------------------------------------------------
# ChromaDB setup
# ---------------------------------------------------------------------------

chroma_client = chromadb.Client()  # in-memory for Railway compatibility
embed_fn = embedding_functions.DefaultEmbeddingFunction()
collection = chroma_client.get_or_create_collection(
    name=COLLECTION_NAME,
    embedding_function=embed_fn,
)

# ---------------------------------------------------------------------------
# Code chunking
# ---------------------------------------------------------------------------

def chunk_python(content: str, filename: str) -> list[dict]:
    """Split Python code by function/class definitions."""
    chunks = []
    lines = content.split("\n")
    current_chunk: list[str] = []
    current_start = 0

    for i, line in enumerate(lines):
        if re.match(r"^(def |class )", line) and current_chunk:
            chunks.append({
                "text": "\n".join(current_chunk),
                "filename": filename,
                "start_line": current_start + 1,
                "end_line": i,
            })
            current_chunk = [line]
            current_start = i
        else:
            current_chunk.append(line)

    if current_chunk:
        chunks.append({
            "text": "\n".join(current_chunk),
            "filename": filename,
            "start_line": current_start + 1,
            "end_line": len(lines),
        })

    # If no chunks were created, treat whole file as one chunk
    if not chunks:
        chunks = [{"text": content, "filename": filename, "start_line": 1, "end_line": len(lines)}]

    return [c for c in chunks if c["text"].strip()]


def chunk_generic(content: str, filename: str, chunk_size: int = 40) -> list[dict]:
    """Split any file by fixed line windows."""
    lines = content.split("\n")
    chunks = []
    for i in range(0, len(lines), chunk_size):
        window = lines[i:i + chunk_size]
        chunks.append({
            "text": "\n".join(window),
            "filename": filename,
            "start_line": i + 1,
            "end_line": i + len(window),
        })
    return [c for c in chunks if c["text"].strip()]


def chunk_file(filename: str, content: str) -> list[dict]:
    if filename.endswith(".py"):
        return chunk_python(content, filename)
    return chunk_generic(content, filename)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class CodeFile(BaseModel):
    filename: str
    content: str


class IndexRequest(BaseModel):
    files: list[CodeFile]


class QueryRequest(BaseModel):
    question: str
    top_k: int = TOP_K


class EvalExample(BaseModel):
    question: str
    relevant_files: list[str]  # ground truth


class EvaluateRequest(BaseModel):
    examples: list[EvalExample]
    top_k: int = TOP_K


# ---------------------------------------------------------------------------
# RAG helpers
# ---------------------------------------------------------------------------

def call_claude(system: str, user: str) -> str:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    msg = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text.strip()


def retrieve(question: str, top_k: int) -> list[dict]:
    results = collection.query(query_texts=[question], n_results=min(top_k, collection.count()))
    chunks = []
    if results["documents"]:
        for doc, meta, dist in zip(
            results["documents"][0],
            results["metadatas"][0],
            results["distances"][0],
        ):
            chunks.append({"text": doc, "metadata": meta, "score": 1 - dist})
    return chunks


def generate_answer(question: str, chunks: list[dict]) -> str:
    context = "\n\n---\n\n".join(
        f"File: {c['metadata']['filename']} (lines {c['metadata']['start_line']}-{c['metadata']['end_line']})\n{c['text']}"
        for c in chunks
    )
    system = "You are a helpful code assistant. Answer questions about the codebase using only the provided context. Be concise and specific."
    user = f"Context:\n{context}\n\nQuestion: {question}"
    return call_claude(system, user)


# ---------------------------------------------------------------------------
# Evaluation metrics
# ---------------------------------------------------------------------------

def precision_at_k(retrieved_files: list[str], relevant_files: list[str], k: int) -> float:
    top_k = retrieved_files[:k]
    hits = sum(1 for f in top_k if f in relevant_files)
    return hits / k if k > 0 else 0.0


def recall_at_k(retrieved_files: list[str], relevant_files: list[str], k: int) -> float:
    top_k = retrieved_files[:k]
    hits = sum(1 for f in top_k if f in relevant_files)
    return hits / len(relevant_files) if relevant_files else 0.0


def reciprocal_rank(retrieved_files: list[str], relevant_files: list[str]) -> float:
    for i, f in enumerate(retrieved_files):
        if f in relevant_files:
            return 1.0 / (i + 1)
    return 0.0


def llm_judge(question: str, answer: str, context: str) -> dict:
    system = """You are an evaluation judge. Rate the answer quality and return JSON:
{
  "relevance": 1-5,
  "accuracy": 1-5,
  "completeness": 1-5,
  "overall": 1-5,
  "feedback": "brief feedback"
}
Respond with JSON only."""
    result = call_claude(system, f"Question: {question}\n\nContext: {context[:500]}\n\nAnswer: {answer}")
    try:
        result = re.sub(r"^```(?:json)?\s*", "", result)
        result = re.sub(r"\s*```$", "", result)
        return json.loads(result)
    except Exception:
        return {"relevance": 3, "accuracy": 3, "completeness": 3, "overall": 3, "feedback": "Could not parse judge response"}


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not ANTHROPIC_API_KEY:
        print("WARNING: ANTHROPIC_API_KEY not set")
    yield


app = FastAPI(title="Codebase RAG System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "indexed_chunks": collection.count()}


@app.post("/index/files")
def index_files(body: IndexRequest):
    if not body.files:
        raise HTTPException(status_code=400, detail="No files provided")

    total_chunks = 0
    indexed_files = []

    for file in body.files:
        # Remove existing chunks for this file
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
        documents = [c["text"] for c in chunks]
        metadatas = [
            {"filename": c["filename"], "start_line": c["start_line"], "end_line": c["end_line"]}
            for c in chunks
        ]

        collection.add(ids=ids, documents=documents, metadatas=metadatas)
        total_chunks += len(chunks)
        indexed_files.append({"filename": file.filename, "chunks": len(chunks)})

    return {
        "success": True,
        "total_chunks": total_chunks,
        "files": indexed_files,
        "collection_size": collection.count(),
    }


@app.post("/query")
def query(body: QueryRequest):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")
    if collection.count() == 0:
        raise HTTPException(status_code=400, detail="No files indexed yet. Index files first.")

    chunks = retrieve(body.question, body.top_k)
    if not chunks:
        return {"answer": "No relevant code found.", "sources": []}

    answer = generate_answer(body.question, chunks)

    return {
        "answer": answer,
        "sources": [
            {
                "filename": c["metadata"]["filename"],
                "start_line": c["metadata"]["start_line"],
                "end_line": c["metadata"]["end_line"],
                "snippet": c["text"][:300],
                "score": round(c["score"], 3),
            }
            for c in chunks
        ],
    }


@app.post("/evaluate")
def evaluate(body: EvaluateRequest):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")
    if collection.count() == 0:
        raise HTTPException(status_code=400, detail="No files indexed yet.")
    if not body.examples:
        raise HTTPException(status_code=400, detail="No evaluation examples provided.")

    k = body.top_k
    precisions, recalls, rrs, judge_scores = [], [], [], []
    results = []

    for ex in body.examples:
        chunks = retrieve(ex.question, k)
        retrieved_files = [c["metadata"]["filename"] for c in chunks]

        p = precision_at_k(retrieved_files, ex.relevant_files, k)
        r = recall_at_k(retrieved_files, ex.relevant_files, k)
        rr = reciprocal_rank(retrieved_files, ex.relevant_files)

        precisions.append(p)
        recalls.append(r)
        rrs.append(rr)

        # LLM judge
        answer = generate_answer(ex.question, chunks) if chunks else "No context found."
        context = chunks[0]["text"] if chunks else ""
        judge = llm_judge(ex.question, answer, context)
        judge_scores.append(judge.get("overall", 3))

        results.append({
            "question": ex.question,
            "retrieved_files": retrieved_files[:k],
            "relevant_files": ex.relevant_files,
            "precision_at_k": round(p, 3),
            "recall_at_k": round(r, 3),
            "reciprocal_rank": round(rr, 3),
            "llm_judge": judge,
        })

    return {
        "metrics": {
            "mean_precision_at_k": round(sum(precisions) / len(precisions), 3),
            "mean_recall_at_k": round(sum(recalls) / len(recalls), 3),
            "mrr": round(sum(rrs) / len(rrs), 3),
            "mean_llm_judge_score": round(sum(judge_scores) / len(judge_scores), 2),
            "k": k,
            "num_examples": len(body.examples),
        },
        "results": results,
    }
