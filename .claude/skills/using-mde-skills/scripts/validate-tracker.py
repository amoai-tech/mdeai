#!/usr/bin/env python3
"""Validate a Linear-style Markdown progress tracker deterministically."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

CHECK_RE = re.compile(r"^\s*- \[([ xX])\]\s+(.+)$")
PROGRESS_RE = re.compile(
    r"\*\*Verified completion:\*\*\s+\*\*(\d+)%\*\*\s+—\s+(\d+) of (\d+)"
)
HEAD_RE = re.compile(r"\*\*Local MDE HEAD:\*\*.*?`([0-9a-f]{7,40})`")


def read_markdown(path: str | None) -> str:
    if path:
        return Path(path).read_text(encoding="utf-8")
    return sys.stdin.read()


def checklist_section(text: str) -> str:
    marker = "## Execution checklist"
    if marker not in text:
        raise ValueError("missing '## Execution checklist' section")
    section = text.split(marker, 1)[1]
    for terminator in ("\n### Tracker rules", "\n## Outcome"):
        if terminator in section:
            section = section.split(terminator, 1)[0]
            break
    return section


def parse_checklist(section: str) -> tuple[int, int, list[str]]:
    checked = 0
    total = 0
    missing_evidence: list[str] = []
    for line in section.splitlines():
        match = CHECK_RE.match(line)
        if not match:
            continue
        total += 1
        done = match.group(1).lower() == "x"
        body = match.group(2)
        if done:
            checked += 1
            if "Evidence" not in body and "`" not in body:
                missing_evidence.append(body)
    return checked, total, missing_evidence


def live_head(repo: str) -> str:
    result = subprocess.run(
        ["git", "-C", repo, "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("markdown", nargs="?", help="task Markdown; omit to read stdin")
    parser.add_argument("--repo", help="verify recorded HEAD against this Git repo")
    args = parser.parse_args()

    text = read_markdown(args.markdown)
    errors: list[str] = []

    try:
        section = checklist_section(text)
    except ValueError as exc:
        print(f"TRACKER VALIDATION: FAIL — {exc}")
        return 1

    checked, total, missing_evidence = parse_checklist(section)
    if total == 0:
        errors.append("execution checklist has no leaf items")
    expected_pct = round((checked / total) * 100) if total else 0

    progress = PROGRESS_RE.search(text)
    if not progress:
        errors.append("missing or malformed Verified completion line")
    else:
        shown_pct, shown_checked, shown_total = map(int, progress.groups())
        if (shown_checked, shown_total) != (checked, total):
            errors.append(
                f"displayed count {shown_checked}/{shown_total} != derived {checked}/{total}"
            )
        if shown_pct != expected_pct:
            errors.append(
                f"displayed percentage {shown_pct}% != derived {expected_pct}%"
            )

    for body in missing_evidence:
        errors.append(f"checked leaf missing evidence reference: {body}")

    if args.repo:
        recorded = HEAD_RE.search(text)
        if not recorded:
            errors.append("missing recorded Local MDE HEAD SHA")
        else:
            actual = live_head(args.repo)
            recorded_sha = recorded.group(1)
            if not actual.startswith(recorded_sha):
                errors.append(
                    f"recorded HEAD {recorded_sha} != live HEAD {actual}"
                )

    if errors:
        print("TRACKER VALIDATION: FAIL")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        f"TRACKER VALIDATION: PASS — {checked}/{total} leaves, {expected_pct}% complete"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
