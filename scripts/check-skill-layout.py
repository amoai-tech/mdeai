from pathlib import Path
import sys

root = Path.cwd()
canonical = root / '.claude' / 'skills'
exposure = root / '.agents' / 'skills'
retired = {
    '_template','archive','copilotkit-review','maps-review','mastra-review',
    'nextjs-review','stripe-review','supabase-review',
}
errors=[]
active=[]
for p in sorted(canonical.iterdir()):
    if p.name == 'INDEX.md':
        continue
    if p.is_dir():
        active.append(p.name)
for name in sorted(retired):
    if (canonical/name).exists() or (exposure/name).exists():
        errors.append(f'retired skill/discovery entry exists: {name}')
for name in active:
    source = canonical/name/'SKILL.md'
    link = exposure/name/'SKILL.md'
    if not source.is_file():
        errors.append(f'canonical skill missing SKILL.md: {name}')
        continue
    if not link.is_symlink():
        errors.append(f'Codex exposure is not symlink: {link}')
        continue
    target=(link.parent / link.readlink()).resolve()
    if target != source.resolve():
        errors.append(f'wrong symlink target: {link} -> {target}, expected {source.resolve()}')
extra=[]
if exposure.exists():
    extra=sorted(p.name for p in exposure.iterdir() if p.is_dir() and p.name not in active)
for name in extra:
    errors.append(f'noncanonical .agents skill entry: {name}')
if errors:
    print('SKILL_LAYOUT_FAIL')
    for e in errors: print('-',e)
    sys.exit(1)
print(f'SKILL_LAYOUT_PASS active={len(active)}')
