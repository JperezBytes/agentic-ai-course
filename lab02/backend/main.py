import os
import json
import re
from contextlib import asynccontextmanager
from typing import Literal

import anthropic
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODEL = "claude-haiku-4-5-20251001"

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class AnalyzeRequest(BaseModel):
    code: str
    language: str = "python"

class Issue(BaseModel):
    severity: Literal["low", "medium", "high", "critical"]
    line: int | None = None
    category: Literal["bug", "security", "performance", "style", "maintainability"]
    description: str
    suggestion: str

class Metrics(BaseModel):
    complexity: Literal["low", "medium", "high"]
    readability: Literal["low", "medium", "high"]
    test_coverage_estimate: Literal["none", "low", "medium", "high"]

class AnalyzeResponse(BaseModel):
    summary: str
    issues: list[Issue]
    suggestions: list[str]
    metrics: Metrics

# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are an expert code reviewer with deep knowledge in software engineering best practices, security, and performance optimization.

When analyzing code, you must respond with a JSON object following this exact schema:
{
  "summary": "2-3 sentence overview of the code",
  "issues": [
    {
      "severity": "low|medium|high|critical",
      "line": <line number or null>,
      "category": "bug|security|performance|style|maintainability",
      "description": "clear description of the issue",
      "suggestion": "specific actionable fix"
    }
  ],
  "suggestions": ["general improvement suggestion 1", "general improvement suggestion 2"],
  "metrics": {
    "complexity": "low|medium|high",
    "readability": "low|medium|high",
    "test_coverage_estimate": "none|low|medium|high"
  }
}

Rules:
- Respond ONLY with valid JSON, no markdown code blocks, no explanation outside JSON
- Be specific and actionable in suggestions
- Line numbers should be accurate when identifiable
- Always include at least one suggestion
- Focus on real issues, not nitpicks
"""

# ---------------------------------------------------------------------------
# LLM client
# ---------------------------------------------------------------------------

def analyze_code(code: str, language: str) -> AnalyzeResponse:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    user_message = f"""Analyze this {language} code:

```{language}
{code}
```

Respond with JSON only."""

    message = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    raw = message.content[0].text.strip()

    # Strip markdown code blocks if model wraps response
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"Failed to parse LLM response: {e}")

    return AnalyzeResponse(**data)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not ANTHROPIC_API_KEY:
        print("WARNING: ANTHROPIC_API_KEY not set")
    yield

app = FastAPI(title="Code Analyzer API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(body: AnalyzeRequest):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")
    if not body.code.strip():
        raise HTTPException(status_code=400, detail="Code cannot be empty")
    return analyze_code(body.code, body.language)
