#!/usr/bin/env python3
from pathlib import Path
import json, yaml

base = Path(__file__).resolve().parents[1]
routing = yaml.safe_load((base / 'routing.yaml').read_text())
cases = {c['id']: c for c in json.loads((base/'evals/routing-evals.json').read_text())['cases']}

assert 'application-code behavior change' in routing['complexity']['S0']['rule']
assert 'S4 trigger' in routing['complexity']['S3']['rule']
assert routing['complexity']['S4']['precedence'].startswith('S4 wins whenever')
triggers = routing['complexity']['S4']['triggers']
assert any('payments' in x for x in triggers)
assert any('auth' in x and 'RLS' in x for x in triggers)
assert routing['route_precedence'][:3] == ['certify_done', 'bug_or_failure', 'review_existing_diff']
assert routing['routes']['evidence_only']['primary'] == 'research'
assert routing['ownership']['router'] == 'using-mde-skills'
assert cases['task-implement']['complexity'] == 'S4'
assert 'stripe' in cases['task-implement']['supporting']
assert 'task-verifier' in cases['task-implement']['supporting']
assert cases['complexity-s3']['complexity'] == 'S3'
assert cases['complexity-s1']['primary'] == 'tdd'
assert cases['complexity-s2']['primary'] == 'tasks'
assert cases['complexity-s3']['primary'] == 'tasks'
assert cases['complexity-s4']['primary'] == 'tasks'
assert cases['complexity-s0']['primary'] is None
assert cases['complexity-s4']['complexity'] == 'S4'
assert routing['complexity']['S3']['examples'][0].startswith('new workflow across')
assert routing['complexity']['S4']['examples'][0].startswith('payment webhook')
assert 'Domain skills support' in routing['ownership']['domain_rule']
assert routing['ownership']['evidence_rule'].startswith('Pure evidence')
print('ROUTING CONTRACT TEST: PASS')