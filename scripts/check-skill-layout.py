import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
canonical = root / '.claude' / 'skills'
exposure = root / '.agents' / 'skills'
retired = {
    '_template', 'archive', 'copilotkit-review', 'mastra-review',
    'stripe-review', 'supabase-review',
    # Retired before this PR; keep them forbidden as regression guards.
    'maps-review', 'nextjs-review',
}


def path_present(path: Path) -> bool:
    """Treat broken symlinks as present discovery entries."""
    return path.exists() or path.is_symlink()


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
        match = re.fullmatch(r'\s*name:\s*["\']?([a-z0-9-]+)["\']?\s*', line)
        if match:
            return match.group(1)
    return None

errors = []
active = []
for path in sorted(canonical.iterdir()):
    if path.name == 'INDEX.md':
        continue
    if path.is_dir():
        active.append(path.name)

for name in sorted(retired):
    if path_present(canonical / name) or path_present(exposure / name):
        errors.append(f'retired skill/discovery entry exists: {name}')

for name in active:
    source = canonical / name / 'SKILL.md'
    exposure_dir = exposure / name
    link = exposure_dir / 'SKILL.md'
    if not source.is_file():
        errors.append(f'canonical skill missing SKILL.md: {name}')
        continue
    declared_name = frontmatter_name(source)
    if declared_name != name:
        errors.append(
            f'frontmatter name mismatch: {source} declares {declared_name!r}, expected {name!r}'
        )
    if not exposure_dir.is_dir() or exposure_dir.is_symlink():
        errors.append(f'Codex exposure directory is not a real directory: {exposure_dir}')
        continue
    if not link.is_symlink():
        errors.append(f'Codex exposure is not symlink: {link}')
        continue
    target = (link.parent / link.readlink()).resolve()
    if target != source.resolve():
        errors.append(f'wrong symlink target: {link} -> {target}, expected {source.resolve()}')
    for entry in sorted(exposure_dir.iterdir()):
        if entry.name != 'SKILL.md':
            errors.append(f'unexpected Codex exposure entry: {entry}')

if exposure.exists():
    for entry in sorted(exposure.iterdir()):
        if entry.name not in active:
            errors.append(f'noncanonical .agents skill entry: {entry.name}')

if errors:
    print('SKILL_LAYOUT_FAIL')
    for error in errors:
        print('-', error)
    sys.exit(1)

print(f'SKILL_LAYOUT_PASS active={len(active)}')
