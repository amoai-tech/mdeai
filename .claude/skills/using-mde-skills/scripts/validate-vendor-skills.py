#!/usr/bin/env python3
from pathlib import Path
import hashlib, json, sys, yaml
ROOT = Path(__file__).resolve().parents[2]
VENDORS = ["copilotkit", "mastra", "supabase", "gemini"]
errors=[]

def tree_hash(paths):
    h=hashlib.sha256(); files=[]
    for base in paths:
        for p in base.rglob('*'):
            if p.is_file(): files.append((base,p))
    for base,p in sorted(files,key=lambda x:(x[0].name,x[1].relative_to(x[0]).as_posix())):
        rel=f'{base.name}/{p.relative_to(base).as_posix()}'.encode()
        h.update(rel+b'\0'+p.read_bytes()+b'\0')
    return h.hexdigest()

for name in VENDORS:
    base=ROOT/name; skill=base/'SKILL.md'; manifest=base/'upstream.yaml'; evals=base/'evals/evals.json'
    if not skill.exists(): errors.append(f'{name}: missing SKILL.md'); continue
    if not manifest.exists(): errors.append(f'{name}: missing upstream.yaml'); continue
    try: meta=yaml.safe_load(manifest.read_text()) or {}
    except Exception as exc: errors.append(f'{name}: invalid upstream.yaml: {exc}'); continue
    commit=str(meta.get('reviewed_commit',''))
    if len(commit)!=40 or any(c not in '0123456789abcdef' for c in commit.lower()): errors.append(f'{name}: reviewed_commit must be immutable 40-char SHA')
    policy=meta.get('policy',{})
    if policy.get('active_skill') != name: errors.append(f'{name}: active_skill mismatch')
    if policy.get('upstream_files_are_read_only') is not True: errors.append(f'{name}: upstream copies must be read-only by policy')
    if policy.get('auto_update') is not False: errors.append(f'{name}: auto_update must remain false')
    official=base/'references/official'
    if not official.exists() or not any(official.rglob('SKILL.md')): errors.append(f'{name}: missing pinned official SKILL.md reference')

    if name=='copilotkit':
        for key,src in (meta.get('sources') or {}).items():
            local=base/src.get('local',''); expected=src.get('sha256','')
            if not local.exists(): errors.append(f'{name}: missing official source {key}: {local}')
            elif hashlib.sha256(local.read_bytes()).hexdigest()!=expected: errors.append(f'{name}: hash mismatch for {key}')
    elif name=='mastra':
        paths=[base/meta.get('source',{}).get('local','')]
        expected=meta.get('source',{}).get('tree_sha256','')
        if tree_hash(paths)!=expected: errors.append(f'{name}: official tree hash mismatch')
    elif name=='supabase':
        paths=[base/src.get('local','') for src in (meta.get('sources') or {}).values()]
        if tree_hash(paths)!=meta.get('combined_tree_sha256',''): errors.append(f'{name}: official tree hash mismatch')
    elif name=='gemini':
        paths=[base/src.get('local','') for src in (meta.get('sources') or {}).values()]
        if tree_hash(paths)!=meta.get('combined_tree_sha256',''): errors.append(f'{name}: official tree hash mismatch')

    if not evals.exists(): errors.append(f'{name}: missing evals/evals.json'); continue
    try: data=json.loads(evals.read_text())
    except Exception as exc: errors.append(f'{name}: invalid eval JSON: {exc}'); continue
    cases=data.get('evals',[])
    if len(cases)<3: errors.append(f'{name}: need at least 3 realistic eval definitions')
    for i,case in enumerate(cases,1):
        for key in ('prompt','expected_output','expectations'):
            if not case.get(key): errors.append(f'{name}: eval definition {i} missing {key}')

if errors:
    print('VENDOR SKILL VALIDATION: FAIL')
    for e in errors: print(' -',e)
    sys.exit(1)
print(f'VENDOR SKILL VALIDATION: PASS — {len(VENDORS)} vendor wrappers; local pinned-copy hashes verified; eval definitions validated (not executed)')
