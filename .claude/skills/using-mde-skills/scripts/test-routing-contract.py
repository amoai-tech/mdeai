#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SKILL = ROOT / ".claude/skills/using-mde-skills/SKILL.md"
EVALS = ROOT / ".claude/skills/using-mde-skills/evals/routing-evals.json"
TASKS = ROOT / ".claude/skills/tasks/SKILL.md"
VERIFIER = ROOT / ".claude/skills/task-verifier/SKILL.md"
RETIRED = {
    "mde-task-lifecycle",
    "lean-dev-flow",
    "mde-worktree-pr-flow",
    "copilotkit-debug",
    "copilotkit-integrations",
    "copilotkit-setup",
}
CANONICAL = {p.parent.name for p in (ROOT / ".claude/skills").glob("*/SKILL.md")} - RETIRED
WORKFLOW = {"tasks", "systematic-debugging", "research", "code-review", "task-verifier"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def route(prompt: str) -> str:
    text = prompt.lower()
    if any(retired in text for retired in RETIRED):
        return "__INVALID__"
    # Workflow intent outranks domain words when a prompt contains both.
    # Example: "create a worktree for CopilotKit" is lifecycle execution → tasks.
    lifecycle_terms = (
        "start a worktree",
        "create a worktree",
        "open a pr",
        "ship this change",
        "fast dev loop",
        "which tests should i run",
        "clean up merged worktrees",
    )
    if any(term in text for term in lifecycle_terms):
        return "tasks"
    if any(term in text for term in ("ready to merge", "verify this exact head", "production proof", "done proof")):
        return "task-verifier"
    if "pull request" in text or re.search(r"\bpr\b", text) or "diff" in text:
        return "code-review"
    if any(term in text for term in ("do not know why", "do not know which subsystem", "unknown failure", "suddenly fails", "root cause")):
        return "systematic-debugging"
    if any(term in text for term in ("research", "official guidance", "evidence")):
        return "research"
    direct = {
        "copilotkit": ("copilotkit",),
        "mastra": ("mastra",),
        "supabase": ("supabase", "rls", "tenant access"),
        "gemini": ("gemini",),
        "stripe": ("stripe", "payment"),
    }
    for owner, terms in direct.items():
        if any(term in text for term in terms):
            return owner
    if any(term in text for term in (
        "implement",
        "across the repo",
        "remaining san-1273",
    )):
        return "tasks"
    return "direct"


require(SKILL.exists(), "router SKILL.md is missing")
for retired in ("lean-dev-flow", "mde-worktree-pr-flow", "mde-task-lifecycle"):
    require(not (ROOT / ".claude/skills" / retired).exists(), f"retired lifecycle skill still exists: {retired}")
text = SKILL.read_text()
tasks_text = TASKS.read_text()
verifier_text = VERIFIER.read_text()
cases = json.loads(EVALS.read_text())
require(len(cases) >= 20, f"expected at least 20 cases, found {len(cases)}")
require("only canonical task lifecycle/execution owner" in tasks_text, "tasks does not claim consolidated lifecycle ownership")
require("independently challenge claims and prove merge safety / Done" in verifier_text, "task-verifier independence contract missing")
require("Do not recreate its implementation process" in verifier_text, "task-verifier may duplicate execution lifecycle")

required_rules = {
    "tasks": "ambiguous substantial",
    "systematic-debugging": "unknown failure",
    "research": "research/evidence",
    "code-review": "existing PR/diff",
    "task-verifier": "Done/merge/production proof",
}
for owner, phrase in required_rules.items():
    require(owner in text and phrase in text, f"missing rule for {owner}: {phrase}")

require("S4" in text and "independent" in text.lower(), "missing S4 independent verification rule")
require("self-cert" in text.lower(), "missing no-self-certification rule")
require("router chooses one owner and stops" in text.lower(), "router-stop invariant missing")
for retired in RETIRED:
    require(retired not in text, f"router advertises retired owner: {retired}")

for case in cases:
    owner = case["expected_owner"]
    observed = route(case["input"])
    require(observed == owner, f"{case['name']}: expected {owner}, observed {observed}")
    if owner not in {"__INVALID__", "direct"}:
        require(owner in CANONICAL, f"unknown or retired owner: {owner}")
    if case["risk"] == "S4":
        require(case["requires_independent_verifier"] is True, f"S4 case {case['name']} lacks verifier")

print(f"routing contract: PASS ({len(cases)}/{len(cases)} cases)")
