#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
SKILL = ROOT / ".claude/skills/using-mde-skills/SKILL.md"
EVALS = ROOT / ".claude/skills/using-mde-skills/evals/routing-evals.json"
CANONICAL = {p.parent.name for p in (ROOT / ".claude/skills").glob("*/SKILL.md")}
RETIRED = {"mde-task-lifecycle", "copilotkit-debug", "copilotkit-integrations", "copilotkit-setup"}
WORKFLOW = {"tasks", "systematic-debugging", "research", "code-review", "task-verifier"}

assert SKILL.exists(), "router SKILL.md is missing"
text = SKILL.read_text()
cases = json.loads(EVALS.read_text())
assert len(cases) == 10, f"expected 10 cases, found {len(cases)}"

required_rules = {
    "tasks": "ambiguous substantial",
    "systematic-debugging": "unknown failure",
    "research": "research/evidence",
    "code-review": "existing PR/diff",
    "task-verifier": "Done/merge/production proof",
}
for owner, phrase in required_rules.items():
    assert owner in text and phrase in text, f"missing rule for {owner}: {phrase}"

assert "S4" in text and "independent" in text.lower(), "missing S4 independent verification rule"
assert "self-cert" in text.lower(), "missing no-self-certification rule"
assert "router chooses one owner and stops" in text.lower(), "router-stop invariant missing"

for case in cases:
    owner = case["expected_owner"]
    if owner == "__INVALID__":
        assert "mde-task-lifecycle" in RETIRED, "expected retired alias missing from retired set"
        assert "mde-task-lifecycle" not in text, "router advertises retired owner"
        continue
    if owner in WORKFLOW or owner == "direct":
        continue
    assert owner in CANONICAL, f"unknown canonical owner: {owner}"
    if case["risk"] == "S4":
        assert case["requires_independent_verifier"] is True, f"S4 case {case['name']} lacks verifier"

print("routing contract: PASS (10/10 cases)")
