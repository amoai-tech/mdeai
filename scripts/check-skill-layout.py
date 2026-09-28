#!/usr/bin/env python3
"""Guard the canonical skill library and its agent exposure mirror.

`.claude/skills/` is the single source of truth for project skills.
`.agents/skills/<name>/` is a *real* directory whose entries are relative
symlinks back into the canonical skill, so an agent that discovers
`.agents/skills/<name>/SKILL.md` can still follow the skill's own
`references/...` and `scripts/...` links.

Checks:
  1. every canonical skill has a `SKILL.md` whose frontmatter `name` matches its directory
  2. retired skills stay retired
  3. every canonical entry is mirrored by a relative symlink in the exposure directory
  4. the exposure directory contains no copies, extras, or absolute/foreign symlinks
  5. every relative markdown link in `SKILL.md` resolves from both roots

Check 5 is the regression guard for the defect this script previously missed:
`SKILL.md` shipped into the exposure directory while its `references/` subtree did
not, so every relative link inside it resolved from `.claude/` and 404'd from
`.agents/`. Markdown links inside fenced code blocks and inline code spans are
ignored, because those are example output rather than navigable links.

Usage:
    python3 scripts/check-skill-layout.py [--root PATH]
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

RETIRED = {
    '_template', 'archive', 'copilotkit-review', 'mastra-review',
    'stripe-review', 'supabase-review',
    # Retired before this PR; keep them forbidden as regression guards.
    'maps-review', 'nextjs-review',
}

LINK_RE = re.compile(r'\]\(([^)\s]+)\)')
FENCE_RE = re.compile(r'^ {0,3}(`{3,}|~{3,})')
INLINE_CODE_RE = re.compile(r'`[^`\n]*`')


def path_present(path: Path) -> bool:
    """Treat broken symlinks as present discovery entries."""
    return path.exists() or path.is_symlink()


def strip_code(text: str) -> str:
    """Drop fenced code blocks and inline code spans so examples are not read as links.

    A closing fence must use the same character as its opener and be at least as
    long, so a ```` block containing a ``` line stays open instead of ending early.
    """
    kept: list[str] = []
    fence_char: str | None = None
    fence_len = 0
    for line in text.splitlines():
        match = FENCE_RE.match(line)
        if fence_char is None:
            if match:
                fence_char = match.group(1)[0]
                fence_len = len(match.group(1))
                continue
            kept.append(INLINE_CODE_RE.sub(' ', line))
        elif match and match.group(1)[0] == fence_char and len(match.group(1)) >= fence_len:
            fence_char = None
            fence_len = 0
    return '\n'.join(kept)


def markdown_links(text: str) -> list[str]:
    """Return relative link targets that should resolve on disk."""
    targets: list[str] = []
    for raw in LINK_RE.findall(strip_code(text)):
        target = raw.strip().strip('<>')
        if not target or target.startswith(('http://', 'https://', 'mailto:', '#', '/')):
            continue
        target = target.split('#', 1)[0]
        if target:
            targets.append(target)
    return targets


def frontmatter_name(path: Path) -> str | None:
    try:
        lines = path.read_text(encoding='utf-8').splitlines()
    except OSError:
        return None
    if not lines or lines[0].strip() != '---':
        return None
    for line in lines[1:]:
        if line.strip() == '---':
            break
        if line.lstrip().startswith('name:'):
            raw = line.split(':', 1)[1].strip()
            # Accept a bare scalar or a properly matched quote pair; an unbalanced
            # quote is left intact so it fails the kebab-case check instead of
            # silently matching a truncated name.
            if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in ('"', "'"):
                raw = raw[1:-1]
            return raw if re.fullmatch(r'[a-z0-9-]+', raw) else None
    return None


def retired_errors(canonical: Path, exposure: Path) -> list[str]:
    return [
        f'retired skill/discovery entry exists: {name}'
        for name in sorted(RETIRED)
        if path_present(canonical / name) or path_present(exposure / name)
    ]


def mirror_errors(skill_dir: Path, exposure_dir: Path) -> list[str]:
    """Every canonical entry must appear as a relative symlink, and nothing else."""
    errors: list[str] = []
    expected = sorted(p.name for p in skill_dir.iterdir())
    for entry in expected:
        link = exposure_dir / entry
        if not path_present(link):
            errors.append(
                f'Codex exposure is missing entry: {link}\n'
                f'    fix: ln -s {os.path.relpath(skill_dir / entry, exposure_dir)} {link}'
            )
            continue
        if not link.is_symlink():
            errors.append(f'Codex exposure entry is not a symlink: {link}')
            continue
        raw_target = os.readlink(link)
        if os.path.isabs(raw_target):
            errors.append(
                f'Codex exposure symlink is absolute, expected relative: {link} -> {raw_target}'
            )
            continue
        resolved = (link.parent / raw_target).resolve()
        if resolved != (skill_dir / entry).resolve():
            errors.append(
                f'wrong symlink target: {link} -> {resolved}, '
                f'expected {(skill_dir / entry).resolve()}'
            )
    for entry in sorted(p.name for p in exposure_dir.iterdir()):
        if entry not in expected:
            errors.append(f'unexpected Codex exposure entry: {exposure_dir / entry}')
    return errors


def link_errors(skill_dir: Path, exposure_dir: Path, source: Path) -> list[str]:
    """Every relative SKILL.md link must resolve from the canonical and exposed roots."""
    errors: list[str] = []
    for target in dict.fromkeys(markdown_links(source.read_text(encoding='utf-8'))):
        if not (skill_dir / target).exists():
            errors.append(f'broken relative link in {source}: {target}')
        if not (exposure_dir / target).exists():
            errors.append(
                f'link does not resolve from Codex exposure: '
                f'{exposure_dir / "SKILL.md"} -> {target}'
            )
    return errors


def skill_errors(canonical: Path, exposure: Path, name: str) -> list[str]:
    skill_dir = canonical / name
    source = skill_dir / 'SKILL.md'
    exposure_dir = exposure / name

    if not source.is_file():
        return [f'canonical skill missing SKILL.md: {name}']

    errors: list[str] = []
    declared = frontmatter_name(source)
    if declared != name:
        errors.append(
            f'frontmatter name mismatch: {source} declares {declared!r}, expected {name!r}'
        )

    if not exposure_dir.is_dir() or exposure_dir.is_symlink():
        errors.append(f'Codex exposure directory is not a real directory: {exposure_dir}')
        return errors

    errors.extend(mirror_errors(skill_dir, exposure_dir))
    errors.extend(link_errors(skill_dir, exposure_dir, source))
    return errors


def stray_exposure_errors(exposure: Path, active: list[str]) -> list[str]:
    if not exposure.exists():
        return []
    return [
        f'noncanonical .agents skill entry: {entry.name}'
        for entry in sorted(exposure.iterdir())
        if entry.name not in active
    ]


def check(root: Path) -> tuple[list[str], int]:
    canonical = root / '.claude' / 'skills'
    exposure = root / '.agents' / 'skills'

    active = sorted(p.name for p in canonical.iterdir() if p.is_dir())
    errors = retired_errors(canonical, exposure)
    for name in active:
        errors.extend(skill_errors(canonical, exposure, name))
    errors.extend(stray_exposure_errors(exposure, active))

    return errors, len(active)


def main() -> int:
    parser = argparse.ArgumentParser(description='validate skill layout and exposure mirror')
    parser.add_argument('--root', default=None, help='repository root (default: script parent)')
    args = parser.parse_args()
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parents[1]

    errors, active = check(root)
    if errors:
        print('SKILL_LAYOUT_FAIL')
        for error in errors:
            print('-', error)
        return 1

    print(f'SKILL_LAYOUT_PASS active={active}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
