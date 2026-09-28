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

# OS and editor leftovers are excluded so a stray .DS_Store in a vendored tree cannot
# change its hash and fail the gate for everyone. Everything else is hashed, including
# legitimate dotfiles such as a vendored .gitignore.
IGNORED_NAMES = {'.DS_Store', 'Thumbs.db', 'desktop.ini'}
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
            (
                (p.relative_to(target).as_posix(), p)
                for p in target.rglob('*')
                if p.is_file() and p.name not in IGNORED_NAMES
            ),
            key=lambda pair: pair[0],
        )
    digest = hashlib.sha256()
    for relative, path in entries:
        digest.update(relative.encode('utf-8'))
        digest.update(b'\0')
        digest.update(path.read_bytes())
        digest.update(b'\0')
    return digest.hexdigest()


def strip_comment(line: str) -> str:
    """Remove a trailing YAML comment, ignoring a '#' inside a quoted scalar."""
    kept: list[str] = []
    quote: str | None = None
    for index, char in enumerate(line):
        if quote:
            kept.append(char)
            if char == quote:
                quote = None
            continue
        if char in ('"', "'"):
            quote = char
            kept.append(char)
            continue
        if char == '#' and (index == 0 or line[index - 1] in ' \t'):
            break
        kept.append(char)
    return ''.join(kept).rstrip()


def parse_upstream(path: Path) -> tuple[str | None, list[str], dict[str, str], list[str]]:
    """Extract the reviewed commit, vendored paths, recorded hashes, and problems.

    A focused reader rather than a full YAML parser, because the script must run with
    nothing but `python3` on a CI runner. The trade is that it must fail closed: a
    manifest it cannot read has to be an error, never a silent pass. Anything it meets
    inside `local_integrity.trees` that is not `path: <sha256>` is reported instead of
    skipped, because a hash that quietly goes unread is a hash that stops protecting
    anything.

    Indentation is not assumed, and comments are stripped quote-aware, so re-reviewing
    a manifest by hand cannot silently invalidate the recorded baseline.
    """
    text = path.read_text(encoding='utf-8')
    reviewed: str | None = None
    locals_: list[str] = []
    recorded: dict[str, str] = {}
    problems: list[str] = []

    trees_indent: int | None = None
    saw_integrity = False

    for lineno, raw in enumerate(text.splitlines(), 1):
        line = strip_comment(raw)
        stripped = line.strip()
        if not stripped:
            continue
        indent = len(line) - len(line.lstrip())

        if stripped == 'local_integrity:':
            saw_integrity = True
            trees_indent = None
            continue
        if stripped == f'{TREES_KEY}:':
            trees_indent = indent
            continue

        if trees_indent is not None:
            if indent > trees_indent:
                entry = re.fullmatch(
                    r'([^:\s][^:]*):\s*["\']?([0-9a-f]{64})["\']?', stripped
                )
                if entry:
                    recorded[entry.group(1).strip()] = entry.group(2)
                else:
                    problems.append(
                        f'{path}:{lineno}: not a `path: <sha256>` entry under '
                        f'{TREES_KEY}: {stripped!r}'
                    )
                continue
            trees_indent = None  # dedented out of the block

        commit = REVIEWED_COMMIT_RE.match(stripped)
        if commit:
            reviewed = commit.group(1)
            continue

        local = re.fullmatch(
            r'(?:[A-Za-z_][\w-]*\.)?local:\s*["\']?([^"\']+?)["\']?', stripped
        )
        if local:
            locals_.append(local.group(1))

    if saw_integrity and not recorded:
        problems.append(
            f'{path}: local_integrity is declared but no {TREES_KEY} mapping could be read'
        )

    return reviewed, list(dict.fromkeys(locals_)), recorded, problems


def check(root: Path) -> tuple[list[str], int]:
    skills = root / '.claude' / 'skills'
    errors: list[str] = []
    checked = 0

    manifests = sorted(skills.glob('*/upstream.yaml'))
    for manifest in manifests:
        skill = manifest.parent.name
        reviewed, locals_, recorded, problems = parse_upstream(manifest)

        errors.extend(problems)
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
