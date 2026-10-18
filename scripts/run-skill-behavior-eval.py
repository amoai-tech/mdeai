#!/usr/bin/env python3
"""Grade one MDE skill eval using a real DSH session trace, optionally running DSH.

Tier 2 (model-driven) is deliberately opt-in; CI runs deterministic grader tests
only. A model's final answer is never used as evidence that a skill was loaded.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHECKS = {"catalog_contains", "skill_called", "skill_not_called", "skill_result_ok", "turn_completed"}


def load_case(skill: str, eval_id: int) -> dict:
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", skill):
        raise ValueError("invalid skill name")
    path = ROOT / ".claude" / "skills" / skill / "evals" / "evals.json"
    spec = json.loads(path.read_text(encoding="utf-8"))
    if spec["skill_name"] != skill:
        raise ValueError("skill name does not match eval pack")
    matches = [case for case in spec["evals"] if case["id"] == eval_id]
    if len(matches) != 1:
        raise ValueError(f"eval {skill}/{eval_id} not found or duplicated")
    case = matches[0]
    if not isinstance(case.get("should_trigger"), bool):
        raise TypeError("case must declare should_trigger (MDE extension)")
    expectations = case.get("expectations")
    if not isinstance(expectations, list) or not expectations:
        raise TypeError("case must have gradeable expectations")
    if len({x.get("id") for x in expectations if isinstance(x, dict)}) != len(expectations):
        raise ValueError("expectation identifiers must be unique")
    for item in expectations:
        if not isinstance(item, dict) or item.get("kind") != "deterministic":
            raise ValueError("this first runner accepts only deterministic checks; rubric needs an independent grader")
        if item.get("check") not in CHECKS or not isinstance(item.get("id"), str) or not item["id"]:
            raise ValueError("expectation needs a unique id and supported named check")
        if item["check"] != "turn_completed" and not isinstance(item.get("value"), str):
            raise ValueError("non-completion checks require a named skill value")
    return case


def read_trace(path: Path) -> list[dict]:
    if not path.is_file():
        raise ValueError(f"trace does not exist: {path}")
    if path.name.endswith(".zstd"):
        try:
            raw = subprocess.run([shutil.which("zstd") or "/usr/bin/zstd", "-dc", "--", str(path.resolve())], capture_output=True, timeout=30, check=True).stdout
        except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
            raise ValueError("could not decompress session trace with zstd") from exc
        lines = raw.splitlines()
    elif path.name.endswith(".jsonl"):
        lines = path.read_bytes().splitlines()
    else:
        raise ValueError("trace must be .jsonl or .jsonl.zstd (DSH v4 session events)")
    if not lines:
        raise ValueError("empty trace")
    events = []
    for index, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValueError(f"invalid JSONL event at line {index}") from exc
        if not isinstance(event, dict) or not isinstance(event.get("type"), str):
            raise TypeError(f"invalid DSH event at line {index}")
        events.append(event)
    return events


def text_parts(event: dict) -> str:
    data = event.get("data") or {}
    if not isinstance(data, dict):
        return ""
    return "\n".join(x.get("text", "") for x in data.get("content", [])
                     if isinstance(x, dict) and x.get("type") == "text")


def check_evidence(name: str, value: str | None, catalogs: list[str],
                   calls: dict, results: dict, finished: bool) -> bool:
    if name == "catalog_contains":
        return any(f"- \x60{value}\x60:" in cat for cat in catalogs)
    if name == "skill_called":
        return value in calls.values()
    if name == "skill_not_called":
        return value not in calls.values()
    if name == "skill_result_ok":
        return any(skill == value and results.get(call_id) is True for call_id, skill in calls.items())
    return finished


def eval_turn(case: dict, events: list[dict]) -> list[dict]:
    """Find exactly one user eval prompt and isolate its own completed turn."""
    matches = [i for i, event in enumerate(events)
               if event["type"] == "user/message"
               and (event.get("data") or {}).get("source", {}).get("kind") == "user"
               and case["prompt"] in text_parts(event)]
    if not matches:
        raise ValueError("trace has no matching user-authored eval prompt")
    if len(matches) != 1:
        raise ValueError("trace has multiple matching eval prompts; use a fresh single-run session")
    start = matches[0]
    # Events in earlier/later turns cannot satisfy the selected eval.
    for index in range(start + 1, len(events)):
        event = events[index]
        if event["type"] == "turn/end":
            return events[start:index + 1]
        if event["type"] == "user/message" and (
                (event.get("data") or {}).get("source", {}).get("kind") == "user"):
            raise ValueError("another user turn began before the eval turn ended")
    return events[start:]


def grade(case: dict, events: list[dict]) -> list[dict]:
    events = eval_turn(case, events)
    catalogs = [text_parts(e) for e in events if e["type"] == "user/message"
                and (e.get("data") or {}).get("source", {}).get("kind") == "skill-catalog"
                and "<available_skills>" in text_parts(e)]
    calls = {}
    for e in events:
        if e["type"] != "tool/call":
            continue
        data = e.get("data") or {}
        if data.get("name") != "skill":
            continue
        args = data.get("arguments", {})
        try:
            args = json.loads(args) if isinstance(args, str) else args
        except json.JSONDecodeError:
            continue
        if isinstance(args, dict) and isinstance(args.get("name"), str):
            calls[data.get("callId")] = args["name"]
    results = {}
    for e in events:
        if e["type"] == "tool/result":
            message = (e.get("data") or {}).get("message") or {}
            call_id = message.get("toolCallId")
            if call_id in calls:
                results[call_id] = (message.get("isError") is False
                                    and bool(message.get("content")))
    finished = any(e["type"] == "turn/end"
                   and (e.get("data") or {}).get("reason", {}).get("kind") == "completed"
                   for e in events)
    rows = []
    for item in case["expectations"]:
        ok = check_evidence(item["check"], item.get("value"), catalogs, calls, results, finished)
        rows.append({"id": item["id"], "check": item["check"], "pass": ok,
                     "notes": "verified in session events" if ok else "not proven by session events"})
    return rows


def find_session(home: Path, session_id: str) -> Path:
    if not re.fullmatch(r"session-[a-zA-Z0-9-]+", session_id):
        raise ValueError("headless run returned an invalid session id")
    candidates = list((home / "sessions").glob(f"*/{session_id}/session.v4.jsonl.zstd"))
    if len(candidates) != 1:
        raise ValueError("could not resolve unique persisted DSH v4 session trace")
    return candidates[0]


def run_model(case: dict, dsh: str, home: Path, timeout: int) -> Path:
    env = {**os.environ, "DSH_HOME": str(home)}
    executable = shutil.which(dsh)
    if executable is None or not Path(executable).is_file():
        raise ValueError("DSH executable was not found; supply an installed DSH CLI path")
    try:
        run = subprocess.run([str(Path(executable).resolve()), "--profile", "headless", "--json", case["prompt"]],
                             cwd=ROOT, env=env, capture_output=True, text=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ValueError(f"headless model run failed to start or timed out: {type(exc).__name__}") from exc
    outputs = []
    for line in run.stdout.splitlines():
        try:
            outputs.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    errors = [e.get("reason", {}).get("error", {}).get("code", "model_error") for e in outputs
              if e.get("type") == "status" and e.get("phase") == "turn_end"
              and e.get("reason", {}).get("kind") == "error"]
    if errors or run.returncode:
        raise ValueError(f"headless model run failed (exit={run.returncode}, codes={errors}); check model credentials and logs")
    sessions = [e["sessionId"] for e in outputs if e.get("type") == "session" and "sessionId" in e]
    if len(sessions) != 1:
        raise ValueError("headless model run returned no unique session id")
    return find_session(home, sessions[0])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skill", required=True, help="canonical MDE skill name")
    parser.add_argument("--eval-id", required=True, type=int, help="1-based eval id")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--trace", type=Path, help="real persisted DSH session.v4.jsonl.zstd or JSONL trace")
    mode.add_argument("--run", action="store_true", help="actually run this eval via DSH headless; requires credentials")
    parser.add_argument("--dsh", default="dsh", help="installed DSH CLI (for --run)")
    parser.add_argument("--dsh-home", type=Path, default=Path.home() / ".dsh", help="DSH_HOME (for --run)")
    parser.add_argument("--timeout", type=int, default=120)
    parser.add_argument("--output", type=Path, help="write machine-readable result to this file")
    args = parser.parse_args()
    report = {"skill": args.skill, "eval_id": args.eval_id, "timestamp": datetime.now(timezone.utc).isoformat(),
              "pass": False, "status": "failed", "checks": [], "trace_path": None, "error": None}
    try:
        case = load_case(args.skill, args.eval_id)
        trace = run_model(case, args.dsh, args.dsh_home, args.timeout) if args.run else args.trace
        report["trace_path"] = str(trace.resolve())
        events = read_trace(trace)
        report["checks"] = grade(case, events)
        report["pass"] = bool(report["checks"]) and all(c["pass"] for c in report["checks"])
        report["status"] = "passed" if report["pass"] else "failed"
    except (ValueError, KeyError, OSError, TypeError) as exc:
        report["error"] = str(exc)
    raw = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(raw, encoding="utf-8")
    print(raw, end="")
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
