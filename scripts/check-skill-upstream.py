#!/usr/bin/env python3
"""Verify that vendored upstream skill files still match their recorded hashes.

Each vendored skill (`copilotkit`, `gemini`, `mastra`, `supabase`) declares its
upstream repository, the commit it was reviewed at, and
`policy.upstream_files_are_read_only: true`. That policy was unenforced: nothing
read the declaration, so a hand-edit to a read-only mirror, or an accidental
regeneration, was invisible until someone happened to notice.

This script recomputes the hash of every directory listed under
`local_integrity.trees` and fails when one has changed.

Hash algorithm (recorded per file as `local_integrity.algorithm`):

    sha256 over, for each regular file sorted by its POSIX relative path:
        utf8(relative_path) + NUL + file_bytes + NUL

This is deliberately spelled out byte for byte. The legacy `sha256` /
`tree_sha256` / `combined_tree_sha256` fields predate this script and are kept
as provenance; their declared `hash_algorithm` string does not reproduce their
own recorded values, so they cannot be re-verified and are not used here.

A missing `local_integrity.trees` entry is a failure that prints the value to
record, so adopting the check on a new skill is one copy-paste.

Usage:
    python3 scripts/check-skill-upstream.py [--root PATH]
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

ALGORITHM = "sha256(per file sorted by relative path: utf8(path) + NUL + bytes + NUL)"
TREES_KEY = 'trees'
REVIEWED_COMMIT_RE = re.compile(r'^reviewed_commit:\s*["\']?([0-9a-f]{7,40})["\']?\s*$')


def tree_hash(target: Path) -> str:
    """Hash a vendored file or directory, sorted by POSIX relative path.

    A single file is treated as a one-entry tree keyed by its basename, so the
    algorithm is identical whether a manifest vendors a file or a directory.
    """
    if target.is_file():
        entries = [(target.name, target)]
    else:
        entries = sorted(
            ((p.relative_to(target).as_posix(), p) for p in target.rglob('*') if p.is_file()),
            key=lambda pair: pair[0],
        )
    digest = hashlib.sha256()
    for relative, path in entries:
        digest.update(relative.encode('utf-8'))
        digest.update(b'\0')
        digest.update(path.read_bytes())
        digest.update(b'\0')
    return digest.hexdigest()


def parse_upstream(path: Path) -> tuple[str | None, list[str], dict[str, str]]:
    """Extract the reviewed commit, vendored directories, and recorded hashes.

    A focused reader rather than a YAML parser: these files are machine-generated
    and only three shapes matter — the `reviewed_commit` scalar, `local: <path>`
    entries, and the `local_integrity.trees` map.
    """
    text = path.read_text(encoding='utf-8')
    reviewed: str | None = None
    locals_: list[str] = []
    recorded: dict[str, str] = {}

    in_trees = False
    for raw in text.splitlines():
        line = raw.split('#', 1)[0].rstrip()
        if not line.strip():
            continue

        commit = REVIEWED_COMMIT_RE.match(line.strip())
        if commit:
            reviewed = commit.group(1)
            continue

        stripped = line.strip()
        if stripped == f'{TREES_KEY}:':
            in_trees = True
            continue

        indent = len(line) - len(line.lstrip())

        if in_trees and indent == 4:
            entry = re.fullmatch(r'([^:]+):\s*["\']?([0-9a-f]{64})["\']?', stripped)
            if entry:
                recorded[entry.group(1).strip()] = entry.group(2)
            continue
        if in_trees and indent <= 2 and stripped != f'{TREES_KEY}:':
            in_trees = False

        local = re.fullmatch(
            r'(?:[A-Za-z_][\w-]*\.)?local:\s*["\']?([^"\']+?)["\']?\s*', stripped
        )
        if local:
            locals_.append(local.group(1))

    return reviewed, list(dict.fromkeys(locals_)), recorded


def check(root: Path) -> tuple[list[str], int]:
    skills = root / '.claude' / 'skills'
    errors: list[str] = []
    checked = 0

    manifests = sorted(skills.glob('*/upstream.yaml'))
    for manifest in manifests:
        skill = manifest.parent.name
        reviewed, locals_, recorded = parse_upstream(manifest)

        if not reviewed:
            errors.append(f'{manifest}: missing reviewed_commit')
        if not locals_:
            errors.append(f'{manifest}: no vendored local directory declared')
            continue

        for rel in locals_:
            target = manifest.parent / rel
            if not (target.is_dir() or target.is_file()):
                errors.append(f'{manifest}: vendored path does not exist: {rel}')
                continue
            checked += 1
            actual = tree_hash(target)
            expected = recorded.get(rel)
            if expected is None:
                errors.append(
                    f'{manifest}: no recorded hash for {rel}\n'
                    f'    add under local_integrity.trees:\n'
                    f'      {rel}: {actual}'
                )
            elif expected != actual:
                errors.append(
                    f'{skill}: vendored files changed since they were reviewed: {rel}\n'
                    f'    recorded {expected}\n'
                    f'    actual   {actual}\n'
                    f'    upstream_files_are_read_only is true — revert the edit, or re-review\n'
                    f'    upstream and update reviewed_commit plus the recorded hash.'
                )

    return errors, checked


def main() -> int:
    parser = argparse.ArgumentParser(description='verify vendored skill integrity')
    parser.add_argument('--root', default=None, help='repository root (default: script parent)')
    args = parser.parse_args()
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parents[1]

    errors, checked = check(root)
    if errors:
        print('SKILL_UPSTREAM_FAIL')
        for error in errors:
            print('-', error)
        return 1

    print(f'SKILL_UPSTREAM_PASS trees={checked} algorithm="{ALGORITHM}"')
    return 0


if __name__ == '__main__':
    sys.exit(main())
