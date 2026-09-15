#!/usr/bin/env python3
from pathlib import Path
import json
base=Path(__file__).resolve().parents[1]
data=json.loads((base/'evals/routing-evals.json').read_text())
seen={}; complexity={f'S{i}':0 for i in range(5)}
for c in data['cases']:
    seen.setdefault(c['primary'],[]).append(c['id'])
    complexity[c['complexity']]=complexity.get(c['complexity'],0)+1
print('Routing coverage:')
for skill,ids in sorted(seen.items()): print(f'  {skill:24} {len(ids):2}  {", ".join(ids)}')
print('Complexity coverage:', ', '.join(f'{k}={v}' for k,v in complexity.items()))
print(f'Total routing eval definitions: {len(data["cases"])}')
obs_path=base/'metrics/routing-observations.json'
obs=json.loads(obs_path.read_text()).get('observations',[]) if obs_path.exists() else []
print(f'Observed real routing decisions: {len(obs)}')
if obs:
    corrected=sum(bool(o.get('routing_correction')) for o in obs)
    matched=sum(o.get('predicted_primary')==o.get('actual_primary') for o in obs)
    print(f'Primary match: {matched}/{len(obs)} ({matched/len(obs)*100:.1f}%)')
    print(f'Routing corrections: {corrected}/{len(obs)} ({corrected/len(obs)*100:.1f}%)')
else:
    print('Adaptive memory: disabled until real routing observations are recorded and reviewed.')
