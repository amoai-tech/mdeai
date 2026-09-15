#!/usr/bin/env python3
from pathlib import Path
import re
ROOT=Path(__file__).resolve().parents[2]
link_re=re.compile(r'\[[^\]]*\]\(([^)]+)\)'); bad=[]
for p in ROOT.rglob('*.md'):
    if '/archive/' in str(p): continue
    for target in link_re.findall(p.read_text(errors='replace')):
        target=target.split('#',1)[0].strip()
        if not target or '://' in target or target.startswith('/') or target.startswith('mailto:') or '{' in target or target.startswith('$'):
            continue
        if target.startswith('<') and target.endswith('>'): target=target[1:-1]
        if not (p.parent/target).exists(): bad.append((p.relative_to(ROOT),target))
print(f'Broken active-skill relative links: {len(bad)}')
for p,t in bad: print(f'  {p}: {t}')
