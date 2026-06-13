import os
import json
import uuid
from contextlib import asynccontextmanager
from typing import Literal
from dataclasses import dataclass, field, asdict

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
# Data models
# ---------------------------------------------------------------------------

StepStatus = Literal["pending", "in_progress", "completed", "failed"]
PhaseStatus = Literal["pending", "in_progress", "completed", "failed"]


@dataclass
class MigrationStep:
    id: str
    description: str
    dependencies: list[str]
    status: StepStatus = "pending"
    result: str = ""


@dataclass
class MigrationState:
    id: str
    source_framework: str
    target_framework: str
    phase: str = "analysis"
    analysis: dict = field(default_factory=dict)
    plan: list[MigrationStep] = field(default_factory=list)
    migrated_files: dict[str, str] = field(default_factory=dict)
    verification: dict = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    success: bool = False


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class SourceFile(BaseModel):
    filename: str
    content: str


class MigrateRequest(BaseModel):
    files: list[SourceFile]
    source_framework: str
    target_framework: str


class MigrateResponse(BaseModel):
    success: bool
    migration_id: str
    phase_results: dict
    migrated_files: dict[str, str]
    plan: list[dict]
    verification: dict
    errors: list[str]


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


def parse_json(text: str) -> dict:
    import re
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


# ---------------------------------------------------------------------------
# Phase 1: Analysis
# ---------------------------------------------------------------------------

def phase_analysis(state: MigrationState, files: list[SourceFile]) -> None:
    state.phase = "analysis"
    files_text = "\n\n".join(f"### {f.filename}\n```\n{f.content}\n```" for f in files)

    system = """You are an expert software architect. Analyze source code and return a JSON object:
{
  "patterns": ["pattern1", "pattern2"],
  "dependencies": ["dep1", "dep2"],
  "complexity": "low|medium|high",
  "potential_issues": ["issue1"],
  "summary": "brief analysis"
}
Respond with JSON only."""

    result = call_claude(system, f"Analyze this {state.source_framework} code for migration to {state.target_framework}:\n\n{files_text}")
    state.analysis = parse_json(result)


# ---------------------------------------------------------------------------
# Phase 2: Planning
# ---------------------------------------------------------------------------

def phase_planning(state: MigrationState, files: list[SourceFile]) -> None:
    state.phase = "planning"
    files_list = ", ".join(f.filename for f in files)

    system = """You are a migration planning expert. Create a migration plan as JSON:
{
  "steps": [
    {
      "id": "step_1",
      "description": "what this step does",
      "dependencies": [],
      "filename": "which file this step migrates"
    }
  ]
}
Each file should have at least one step. Steps can depend on other steps by id.
Respond with JSON only."""

    user = f"""Create a migration plan from {state.source_framework} to {state.target_framework}.
Files: {files_list}
Analysis: {json.dumps(state.analysis)}"""

    result = call_claude(system, user)
    data = parse_json(result)

    state.plan = [
        MigrationStep(
            id=s["id"],
            description=s["description"],
            dependencies=s.get("dependencies", []),
        )
        for s in data["steps"]
    ]


# ---------------------------------------------------------------------------
# Phase 3: Execution
# ---------------------------------------------------------------------------

def phase_execution(state: MigrationState, files: list[SourceFile]) -> None:
    state.phase = "execution"
    files_map = {f.filename: f.content for f in files}

    system = f"""You are an expert developer migrating code from {state.source_framework} to {state.target_framework}.
Given source code, produce the fully migrated equivalent code.
Return ONLY the migrated code, no explanations, no markdown fences."""

    for step in state.plan:
        step.status = "in_progress"
        try:
            # Find the file this step refers to
            target_file = None
            for fname, content in files_map.items():
                if fname.lower() in step.description.lower() or len(files_map) == 1:
                    target_file = (fname, content)
                    break
            if not target_file:
                target_file = list(files_map.items())[0]

            fname, content = target_file
            migrated = call_claude(
                system,
                f"Migrate this {state.source_framework} file ({fname}) to {state.target_framework}:\n\n{content}",
                max_tokens=4096,
            )

            # Determine output filename
            ext_map = {
                "react": ".jsx", "next.js": ".tsx", "vue": ".vue",
                "fastapi": ".py", "flask": ".py", "django": ".py",
                "express": ".js", "hono": ".ts", "nestjs": ".ts",
            }
            new_ext = ext_map.get(state.target_framework.lower(), "")
            base = fname.rsplit(".", 1)[0]
            new_fname = f"{base}_migrated{new_ext}" if new_ext else f"{base}_migrated{fname[fname.rfind('.'):]}"

            state.migrated_files[new_fname] = migrated
            step.status = "completed"
            step.result = f"Migrated to {new_fname}"
        except Exception as e:
            step.status = "failed"
            step.result = str(e)
            state.errors.append(f"Step {step.id} failed: {e}")


# ---------------------------------------------------------------------------
# Phase 4: Verification
# ---------------------------------------------------------------------------

def phase_verification(state: MigrationState) -> None:
    state.phase = "verification"

    system = """You are a code reviewer. Verify migrated code quality and return JSON:
{
  "passed": true|false,
  "issues": ["issue1"],
  "recommendations": ["rec1"],
  "migration_completeness": "complete|partial|failed",
  "summary": "brief verification summary"
}
Respond with JSON only."""

    migrated_text = "\n\n".join(
        f"### {fname}\n```\n{content}\n```"
        for fname, content in state.migrated_files.items()
    )

    user = f"""Verify this migration from {state.source_framework} to {state.target_framework}.

Original plan steps completed: {sum(1 for s in state.plan if s.status == 'completed')}/{len(state.plan)}

Migrated code:
{migrated_text}"""

    result = call_claude(system, user)
    state.verification = parse_json(result)
    state.success = state.verification.get("passed", False)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not ANTHROPIC_API_KEY:
        print("WARNING: ANTHROPIC_API_KEY not set")
    yield


app = FastAPI(title="Migration Workflow Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/migrate", response_model=MigrateResponse)
def migrate(body: MigrateRequest):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")
    if not body.files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    state = MigrationState(
        id=str(uuid.uuid4()),
        source_framework=body.source_framework,
        target_framework=body.target_framework,
    )

    try:
        phase_analysis(state, body.files)
        phase_planning(state, body.files)
        phase_execution(state, body.files)
        phase_verification(state)
    except Exception as e:
        state.errors.append(str(e))

    return MigrateResponse(
        success=state.success,
        migration_id=state.id,
        phase_results={
            "analysis": state.analysis,
            "planning": {"steps": len(state.plan)},
            "execution": {"completed": sum(1 for s in state.plan if s.status == "completed")},
            "verification": state.verification,
        },
        migrated_files=state.migrated_files,
        plan=[asdict(s) for s in state.plan],
        verification=state.verification,
        errors=state.errors,
    )
