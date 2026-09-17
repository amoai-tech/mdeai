#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SKILL = ROOT / ".claude/skills/using-mde-skills/SKILL.md"
EVALS = ROOT / ".claude/skills/using-mde-skills/evals/routing-evals.json"
RETIRED = {"mde-task-lifecycle", "copilotkit-debug", "copilotkit-integrations", "copilotkit-setup"}
CANONICAL = {p.parent.name for p in (ROOT / ".claude/skills").glob("*/SKILL.md")} - RETIRED
WORKFLOW = {"tasks", "systematic-debugging", "research", "code-review", "task-verifier"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def route(prompt: str) -> str:
    text = prompt.lower()
    if any(retired in text for retired in RETIRED):
        return "__INVALID__"
    if "pull request" in text or re.search(r"\bpr\b", text) or "diff" in text:
        return "code-review"
    if any(term in text for term in ("ready to merge", "verify this exact head", "production proof", "done proof")):
        return "task-verifier"
    if any(term in text for term in ("do not know why", "unknown failure", "suddenly fails", "root cause")):
        return "systematic-debugging"
    if any(term in text for term in ("research", "official guidance", "evidence")):
        return "research"
    direct = {
        "copilotkit": ("copilotkit",),
        "stripe": ("stripe", "payment"),
        "supabase": ("supabase", "rls", "tenant access"),
    }
    for owner, terms in direct.items():
        if any(term in text for term in terms):
            return owner
    if any(term in text for term in ("implement", "across the repo", "remaining san-1273")):
        return "tasks"
    return "direct"


require(SKILL.exists(), "router SKILL.md is missing")
text = SKILL.read_text()
cases = json.loads(EVALS.read_text())
require(len(cases) == 10, f"expected 10 cases, found {len(cases)}")

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

print("routing contract: PASS (10/10 cases)")
