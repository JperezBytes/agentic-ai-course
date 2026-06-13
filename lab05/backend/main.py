import os
import re
import json
from contextlib import asynccontextmanager

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
# Claude helper
# ---------------------------------------------------------------------------

def call_claude(system: str, messages: list[dict], max_tokens: int = 1024) -> str:
    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    response = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=system,
        messages=messages,
    )
    return response.content[0].text.strip()

# ---------------------------------------------------------------------------
# Agent definitions
# ---------------------------------------------------------------------------

SUPERVISOR_SYSTEM = """You are a Supervisor Agent coordinating a research team.
Your job is to break down tasks and delegate to specialized workers, then synthesize results.

Workers available:
- RESEARCHER: Finds, analyzes and summarizes information on any topic
- WRITER: Transforms research into polished, well-structured content
- REVIEWER: Reviews content for accuracy, clarity and improvements

Response format - choose ONE per turn:

To delegate to a worker:
DELEGATE: <WORKER_NAME>
TASK: <specific task description>

To provide the final synthesized answer (when you have enough information):
FINAL: <your complete synthesized response>

Rules:
- Always start by delegating to RESEARCHER first
- After research, delegate to WRITER to polish the output
- Use REVIEWER only if quality check is needed
- After collecting worker results, output FINAL with a synthesized answer
- Be decisive and efficient"""

RESEARCHER_SYSTEM = """You are a Research Agent specializing in finding and analyzing information.
Given a research task, provide:
- Key facts and concepts
- Relevant context and background
- Important nuances or considerations
- Structured bullet points for clarity

Be thorough but concise. Focus on accuracy and relevance."""

WRITER_SYSTEM = """You are a Writer Agent specializing in clear, engaging communication.
Given research material, produce:
- A well-structured, polished response
- Clear headings and organization where appropriate
- Engaging prose that's easy to understand
- A professional yet accessible tone

Transform raw research into compelling, readable content."""

REVIEWER_SYSTEM = """You are a Reviewer Agent specializing in quality assurance.
Given content to review, check for:
- Factual accuracy and consistency
- Clarity and readability
- Completeness — are key points covered?
- Suggested improvements

Provide a brief quality assessment and any critical corrections."""

WORKER_SYSTEMS = {
    "RESEARCHER": RESEARCHER_SYSTEM,
    "WRITER": WRITER_SYSTEM,
    "REVIEWER": REVIEWER_SYSTEM,
}

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RunRequest(BaseModel):
    task: str
    max_iterations: int = 5


class AgentAction(BaseModel):
    agent: str
    action: str       # "delegate" | "work" | "final"
    content: str


class RunResponse(BaseModel):
    success: bool
    task: str
    iterations: int
    actions: list[AgentAction]
    final_output: str

# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def run_worker(worker_name: str, task: str, context: str) -> str:
    system = WORKER_SYSTEMS.get(worker_name, RESEARCHER_SYSTEM)
    prompt = task
    if context:
        prompt = f"Context from previous work:\n{context}\n\nYour task: {task}"
    return call_claude(system, [{"role": "user", "content": prompt}], max_tokens=1500)


def orchestrate(task: str, max_iterations: int) -> RunResponse:
    actions: list[AgentAction] = []
    worker_results: dict[str, str] = {}
    supervisor_messages: list[dict] = []

    # Initial message to supervisor
    supervisor_messages.append({
        "role": "user",
        "content": f"Task: {task}\n\nBegin by delegating to the appropriate worker agents, then synthesize a final answer."
    })

    final_output = ""

    for i in range(max_iterations):
        # Supervisor decides
        supervisor_response = call_claude(SUPERVISOR_SYSTEM, supervisor_messages)

        # Parse supervisor response
        if supervisor_response.startswith("FINAL:"):
            final_output = supervisor_response[len("FINAL:"):].strip()
            actions.append(AgentAction(
                agent="SUPERVISOR",
                action="final",
                content=final_output,
            ))
            break

        elif "DELEGATE:" in supervisor_response and "TASK:" in supervisor_response:
            # Extract worker and task
            delegate_match = re.search(r"DELEGATE:\s*(\w+)", supervisor_response)
            task_match = re.search(r"TASK:\s*(.+?)(?:\n|$)", supervisor_response, re.DOTALL)

            if not delegate_match or not task_match:
                # Malformed response — ask supervisor to clarify
                supervisor_messages.append({"role": "assistant", "content": supervisor_response})
                supervisor_messages.append({"role": "user", "content": "Please use the correct format: DELEGATE: <WORKER> then TASK: <description>, or FINAL: <answer>"})
                continue

            worker_name = delegate_match.group(1).upper()
            worker_task = task_match.group(1).strip()

            if worker_name not in WORKER_SYSTEMS:
                worker_name = "RESEARCHER"

            actions.append(AgentAction(
                agent="SUPERVISOR",
                action="delegate",
                content=f"→ {worker_name}: {worker_task}",
            ))

            # Get context from previous workers
            context = "\n\n".join(
                f"[{name} result]:\n{result}"
                for name, result in worker_results.items()
            )

            # Run the worker
            worker_result = run_worker(worker_name, worker_task, context)
            worker_results[worker_name] = worker_result

            actions.append(AgentAction(
                agent=worker_name,
                action="work",
                content=worker_result,
            ))

            # Feed result back to supervisor
            supervisor_messages.append({"role": "assistant", "content": supervisor_response})
            supervisor_messages.append({
                "role": "user",
                "content": f"{worker_name} completed their task.\n\nResult:\n{worker_result}\n\nContinue: delegate to another worker if needed, or output FINAL: <synthesized answer>."
            })

        else:
            # Supervisor gave unexpected format — nudge it
            supervisor_messages.append({"role": "assistant", "content": supervisor_response})
            supervisor_messages.append({
                "role": "user",
                "content": "Use DELEGATE: <WORKER> / TASK: <description> to delegate, or FINAL: <answer> to finish."
            })

    # Force final if max iterations reached
    if not final_output:
        # Synthesize from collected results
        if worker_results:
            synthesis_prompt = f"Original task: {task}\n\nWorker results:\n" + "\n\n".join(
                f"{name}:\n{result}" for name, result in worker_results.items()
            )
            final_output = call_claude(
                "You are a synthesis agent. Combine the worker results into a single coherent final answer.",
                [{"role": "user", "content": synthesis_prompt}],
                max_tokens=1500,
            )
        else:
            final_output = "Could not complete task within iteration limit."

        actions.append(AgentAction(
            agent="SUPERVISOR",
            action="final",
            content=final_output,
        ))

    return RunResponse(
        success=True,
        task=task,
        iterations=len([a for a in actions if a.action == "delegate"]),
        actions=actions,
        final_output=final_output,
    )

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not ANTHROPIC_API_KEY:
        print("WARNING: ANTHROPIC_API_KEY not set")
    yield


app = FastAPI(title="Multi-Agent Orchestration System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "agents": list(WORKER_SYSTEMS.keys())}


@app.post("/run", response_model=RunResponse)
def run(body: RunRequest):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")
    if not body.task.strip():
        raise HTTPException(status_code=400, detail="Task cannot be empty")
    if body.max_iterations < 1 or body.max_iterations > 10:
        raise HTTPException(status_code=400, detail="max_iterations must be between 1 and 10")

    return orchestrate(body.task, body.max_iterations)
