# Agentic AI Intensive Training Program

5 labs + final project built and deployed in one day using FastAPI, Next.js, Claude (Haiku), ChromaDB, and Railway/Vercel.

---

## Labs

### Lab 01 — URL Shortener
FastAPI backend with SQLite storage. Shortens URLs, tracks clicks, handles duplicates.

- **Frontend**: https://agentic-ai-course-9chwe5lo0-jhonnyperez.vercel.app/
- Stack: FastAPI · SQLite · Next.js

---

### Lab 02 — AI Code Analyzer
Submits code to Claude and returns a structured review: bugs, security issues, performance problems, and style suggestions — all severity-tagged.

- **Frontend**: https://agentic-ai-course-mmoz.vercel.app/
- Stack: FastAPI · Anthropic Claude · Next.js

---

### Lab 03 — Migration Workflow Agent
4-phase agentic pipeline that migrates code between frameworks (e.g. Flask → FastAPI). Phases: analysis → planning → execution → verification.

- **Frontend**: https://agentic-ai-course-gwvh.vercel.app/
- Stack: FastAPI · Claude · Next.js

---

### Lab 04 — Codebase RAG System
Upload source files, ask questions about the code, and evaluate retrieval quality. Uses ChromaDB for vector storage and sentence-transformers for embeddings. Evaluation metrics: Precision@K, Recall@K, MRR, and LLM-as-judge.

- **Frontend**: https://agentic-ai-course-dz4m.vercel.app/
- Stack: FastAPI · ChromaDB · sentence-transformers · Claude · Next.js

---

### Lab 05 — Multi-Agent Orchestration
Supervisor pattern coordinating three specialized agents: Researcher, Writer, and Reviewer. The Supervisor delegates tasks, collects results, and synthesizes a final answer.

- **Frontend**: https://agentic-ai-course-p3bo.vercel.app/
- Stack: FastAPI · Claude · Next.js

---

## Final Project — Tech Debt Analyzer

RAG-enhanced technical debt detection across a codebase. Upload source files and get back a prioritized list of issues across 8 categories (code smells, security risks, complexity, duplication, missing tests, poor docs, outdated patterns, error handling), a debt score with letter grade, and an AI-generated executive report.

- **Frontend**: https://agentic-ai-course-a4gm.vercel.app/
- Stack: FastAPI · ChromaDB · sentence-transformers · Claude · Next.js

---

## Repo Structure

```
agentic-ai-course/
├── lab01/
│   ├── backend/    # FastAPI URL shortener
│   └── frontend/   # Next.js UI
├── lab02/
│   ├── backend/    # FastAPI + Claude code analyzer
│   └── frontend/
├── lab03/
│   ├── backend/    # Migration workflow agent
│   └── frontend/
├── lab04/
│   ├── backend/    # RAG system with ChromaDB
│   └── frontend/
├── lab05/
│   ├── backend/    # Multi-agent orchestration
│   └── frontend/
└── final-project/
    ├── backend/    # Tech Debt Analyzer API
    └── frontend/   # Dashboard UI
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python · FastAPI · Pydantic |
| LLM | Anthropic Claude Haiku |
| Vector DB | ChromaDB · sentence-transformers |
| Frontend | Next.js 14 · TypeScript |
| Backend Deploy | Railway |
| Frontend Deploy | Vercel |
