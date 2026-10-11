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
    "tdd",
    "ci-review",
    "nextjs-review",
    "copilotkit-review",
    "maps-review",
    "mastra-review",
    "stripe-review",
    "supabase-review",
    "mde-vercel",
}
CANONICAL = {p.parent.name for p in (ROOT / ".claude/skills").glob("*/SKILL.md")} - RETIRED
WORKFLOW = {"tasks", "systematic-debugging", "testing", "research", "code-review", "task-verifier"}
SHORT_SKILLS = (
    "linear-task", "linear-audit", "praudit", "errors", "efficient", "tests",
    "plan", "architect", "implement", "progress", "prod", "merge", "e2e",
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def route(prompt: str) -> str:
    text = prompt.lower()
    if any(retired in text for retired in RETIRED):
        return "__INVALID__"
    # Explicit local invocation is the narrowest intent. S4 still requires the
    # independent verifier; this classifier chooses only the workflow owner.
    for skill in SHORT_SKILLS:
        if re.search(r"(?<![a-z0-9])[@$]" + re.escape(skill) + r"(?![a-z0-9-])", text):
            return skill

    # A worktree or full shipping lifecycle is broader than one short workflow.
    if any(term in text for term in (
        "start a worktree", "create a worktree", "open a pr",
        "ship this change", "fast dev loop", "clean up merged worktrees",
    )):
        return "tasks"
    if any(term in text for term in (
        "failing regression test first", "red green refactor",
        "red → green → refactor", "which test seam", "which tests should i run",
        "run the tests", "interpret the test failure",
    )):
        return "testing"
    if any(term in text for term in (
        "verify this exact head", "ready to merge", "production proof",
        "production ready", "production-ready", "done proof",
    )):
        return "task-verifier"
    if any(term in text for term in (
        "audit github pr", "audit pr #", "audit this pr", "pr audit",
        "audit the pull request", "merge readiness", "merge-readiness",
    )):
        return "praudit"
    if any(term in text for term in ("verify after merge", "post-merge verification", "verify merged pr", "post-merge", "merged pr #")):
        return "merge"
    if "pull request" in text or re.search(r"\bpr\b", text) or "diff" in text:
        return "code-review"
    if any(term in text for term in (
        "audit san-", "audit linear", "audit an existing linear",
        "check whether san-", "existing acceptance criteria and dependencies",
    )):
        return "linear-audit"
    if any(term in text for term in (
        "rewrite san-", "create a linear task", "rewrite linear",
        "create a linear issue", "improve a linear task",
        "rewrite the linear", "clean up the linear task",
    )):
        return "linear-task"
    if any(term in text for term in (
        "do not know why", "do not know which subsystem", "unknown failure",
        "suddenly fails", "root cause", "diagnose", "crashes", "crashing",
    )):
        return "errors"
    if any(term in text for term in (
        "design a regression test plan", "design a minimal regression test plan",
        "design tests", "test plan", "test cases", "regression coverage",
    )):
        return "tests"
    if any(term in text for term in (
        "faster and simpler", "faster alternative", "simpler alternative",
        "reuse existing", "simplify this implementation",
    )):
        return "efficient"
    if any(term in text for term in (
        "implementation plan", "plan implementation", "plan how to",
        "plan the work",
    )):
        return "plan"
    if any(term in text for term in (
        "architecture fit", "architectural fit", "architecture review",
        "architecture decision",
    )):
        return "architect"
    if any(term in text for term in (
        "status report", "progress report", "project progress",
        "what is blocked",
    )):
        return "progress"
    if any(term in text for term in (
        "certify the deployed", "production certification", "certify production",
    )):
        return "prod"
    if any(term in text for term in (
        "browser e2e", "playwright journey", "test the browser journey",
    )):
        return "e2e"
    if any(term in text for term in ("research", "official guidance", "evidence")):
        return "research"
    direct = {
        "real-estate": ("rental listing", "rental eligibility", "broker viewing"),
        "events": ("event ticket", "event checkout"),
        "copilotkit": ("copilotkit",),
        "mastra": ("mastra",),
        "supabase": ("supabase", "rls", "tenant access"),
        "gemini": ("gemini",),
        "stripe": ("stripe", "payment"),
        "nextjs": ("next.js", "nextjs", "vercel", "app router",
                   "server component", "rsc", "revalidation", "core web vitals"),
    }
    for owner, terms in direct.items():
        if any(term in text for term in terms):
            return owner
    # Route explicit, scoped coding instructions; explanatory questions about
    # how something could be implemented are not instructions to change code.
    if (re.match(r"^(?:(?:please|can you|could you|i need you to)\s+)?implement\b", text)
            and not any(term in text for term in ("across the repo", "remaining san"))):
        return "implement"
    if any(term in text for term in (
        "across the repo", "remaining san work", "outstanding linear task",
    )):
        return "tasks"
    return "direct"


require(SKILL.exists(), "router SKILL.md is missing")
for skill in SHORT_SKILLS:
    require(skill in CANONICAL, f"routing refers to missing short skill: {skill}")
    require((ROOT / ".agents/skills" / skill / "SKILL.md").is_file(),
            f"short skill not exposed to agents: {skill}")
for retired in RETIRED:
    require(not (ROOT / ".claude/skills" / retired).exists(), f"retired skill still exists: {retired}")
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
    "errors": "unknown failure",
    "linear-task": "linear-task",
    "praudit": "praudit",
    "tests": "test",
    "testing": "test strategy/TDD",
    "research": "research/evidence",
    "code-review": "existing PR/diff",
    "task-verifier": "independently prove Done/merge/production safety",
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
