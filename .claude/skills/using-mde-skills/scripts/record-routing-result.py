#!/usr/bin/env python3
from pathlib import Path
from datetime import datetime, timezone
import argparse, json
base=Path(__file__).resolve().parents[1]
p=base/'metrics/routing-observations.json'
parser=argparse.ArgumentParser(description='Record an observed MDE routing decision. Does not change routing automatically.')
parser.add_argument('--request', required=True)
parser.add_argument('--predicted-primary', required=True)
parser.add_argument('--actual-primary', required=True)
parser.add_argument('--complexity', choices=['S0','S1','S2','S3','S4'], required=True)
parser.add_argument('--supporting-predicted', default='')
parser.add_argument('--supporting-used', default='')
parser.add_argument('--routing-correction', default='')
parser.add_argument('--outcome', choices=['success','partial','failed'], required=True)
parser.add_argument('--notes', default='')
a=parser.parse_args()
data=json.loads(p.read_text()) if p.exists() else {'version':1,'adaptive_memory_enabled':False,'observations':[]}
data['observations'].append({
 'timestamp': datetime.now(timezone.utc).isoformat(),
 'request_summary': a.request,
 'predicted_primary': a.predicted_primary,
 'actual_primary': a.actual_primary,
 'complexity': a.complexity,
 'supporting_predicted': [x for x in a.supporting_predicted.split(',') if x],
 'supporting_used': [x for x in a.supporting_used.split(',') if x],
 'routing_correction': a.routing_correction,
 'outcome': a.outcome,
 'notes': a.notes,
})
p.write_text(json.dumps(data,indent=2)+'\n')
print(f'Recorded observation #{len(data["observations"])}; adaptive memory remains disabled.')
