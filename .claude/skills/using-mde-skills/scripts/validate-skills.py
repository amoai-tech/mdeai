#!/usr/bin/env python3
from pathlib import Path
import json,re,sys,yaml
ROOT=Path(__file__).resolve().parents[2]
ROUTER=ROOT/'using-mde-skills'
config=json.loads((ROUTER/'references/core-skills.json').read_text())
core=config['core_skills']; retired=set(config.get('retired',[])); errors=[]; warnings=[]
strict_links={
 'using-mde-skills','tasks','task-verifier','code-review','codebase-design','domain-modeling','research',
 'systematic-debugging','tdd','wireframe','writing-skills','mermaid-diagrams','lean-dev-flow'
}
compact={'using-mde-skills','code-review','codebase-design','domain-modeling','research','systematic-debugging','tdd','writing-skills','lean-dev-flow'}

def frontmatter(path):
    text=path.read_text(errors='replace')
    m=re.match(r'^---\n(.*?)\n---\n',text,re.S)
    if not m: return None,text
    fm=m.group(1); name=re.search(r'^name:\s*["\']?([^"\'\n]+)',fm,re.M)
    dm=re.search(r'^description:\s*>?-?\s*\n((?:  .*(?:\n|$))+)',fm,re.M)
    if dm: desc=' '.join(x.strip() for x in dm.group(1).splitlines()).strip()
    else:
        ds=re.search(r'^description:\s*["\']?(.*?)["\']?$',fm,re.M); desc=ds.group(1).strip() if ds else ''
    return {'name':name.group(1).strip() if name else '', 'description':desc, 'frontmatter':fm},text

for skill in core:
    p=ROOT/skill/'SKILL.md'
    if not p.exists(): errors.append(f'missing core skill: {skill}'); continue
    fm,text=frontmatter(p)
    if not fm: errors.append(f'{skill}: missing YAML frontmatter'); continue
    if fm['name']!=skill: errors.append(f'{skill}: frontmatter name={fm["name"]!r}')
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', fm['name']): errors.append(f'{skill}: name must be lowercase kebab-case')
    if len(fm['name'])>64: errors.append(f'{skill}: name too long ({len(fm["name"])} chars)')
    d=fm['description']
    if len(d)<20: errors.append(f'{skill}: description is too vague/short ({len(d)} chars)')
    if len(d)>500: errors.append(f'{skill}: description too long ({len(d)} chars)')
    if skill in compact and len(text.splitlines())>500: errors.append(f'{skill}: compact SKILL.md exceeds 500 lines')
    elif len(text.splitlines())>500: warnings.append(f'{skill}: large SKILL.md ({len(text.splitlines())} lines); progressive-disclosure cleanup recommended')

link_re=re.compile(r'\[[^\]]*\]\(([^)]+)\)')
def broken_links(base):
    bad=[]
    for p in base.rglob('*.md'):
        for target in link_re.findall(p.read_text(errors='replace')):
            target=target.split('#',1)[0].strip()
            if not target or '://' in target or target.startswith('mailto:') or target.startswith('/') or '{' in target or target.startswith('$'):
                continue
            if target.startswith('<') and target.endswith('>'): target=target[1:-1]
            if not (p.parent/target).exists(): bad.append(f'{p.relative_to(ROOT)}: broken link {target}')
    return bad

for skill in core:
    base=ROOT/skill
    if not base.exists(): continue
    bad=broken_links(base)
    if skill in strict_links: errors.extend(bad)
    else: warnings.extend(bad)

# Progressive disclosure: large references should be navigable; eval absence is visible debt.
for skill in core:
    base=ROOT/skill
    if not base.exists(): continue
    refs=base/'references'
    if refs.exists():
        for rp in refs.rglob('*.md'):
            lines=rp.read_text(errors='replace').splitlines()
            if len(lines)>300:
                head='\n'.join(lines[:80]).lower()
                if 'table of contents' not in head and '\n## contents' not in '\n'+head and '\n# contents' not in '\n'+head:
                    warnings.append(f'{rp.relative_to(ROOT)}: >300 lines without an early contents section')
    if not (base/'evals').exists() and skill in {'using-mde-skills','tasks','writing-skills','code-review','task-verifier','copilotkit','mastra'}:
        warnings.append(f'{skill}: important skill has no dedicated evals/ directory')


# Validate the machine-readable orchestration registry.
routing_path=ROUTER/'routing.yaml'
try:
    routing=yaml.safe_load(routing_path.read_text())
except Exception as exc:
    routing=None; errors.append(f'routing.yaml invalid: {exc}')
if routing:
    if routing.get('mode')!='router-only': errors.append('routing.yaml: mode must be router-only')
    levels=set(routing.get('complexity',{}))
    if levels != {'S0','S1','S2','S3','S4'}: errors.append(f'routing.yaml: complexity levels must be S0-S4, got {sorted(levels)}')
    hierarchy=routing.get('hierarchy',{})
    required_groups={'router','orchestrators','reasoning','implementation_quality','domain','critics','shipping'}
    missing_groups=required_groups-set(hierarchy)
    if missing_groups: errors.append(f'routing.yaml: missing hierarchy groups {sorted(missing_groups)}')
    orchestrators=hierarchy.get('orchestrators',{})
    for expected in ['tasks','systematic-debugging','writing-skills']:
        if expected not in orchestrators.values(): errors.append(f'routing.yaml: missing orchestrator {expected}')
    critics=set(hierarchy.get('critics',[]))
    if critics != {'code-review','task-verifier'}: errors.append(f'routing.yaml: critics must be code-review + task-verifier, got {sorted(critics)}')
    contract=set(routing.get('step_contract',{}).get('required',[]))
    required_contract={'step_id','skill','action','inputs','outputs','depends_on','can_parallel','on_failure'}
    if not required_contract.issubset(contract): errors.append(f'routing.yaml: step contract missing {sorted(required_contract-contract)}')
    policy=routing.get('failure_policy',{})
    for key in ['test_failure','schema_or_runtime_contract_mismatch','security_auth_rls_failure','destructive_uncertainty']:
        if key not in policy: errors.append(f'routing.yaml: missing failure policy {key}')
    handoff=set(routing.get('linear_handoff',{}).get('required_fields',[]))
    for key in ['complexity','current_phase','completed_checkpoints','next_action','exact_head_sha','evidence','residual_risk']:
        if key not in handoff: errors.append(f'routing.yaml: Linear handoff missing {key}')
    adaptive=routing.get('adaptive_memory',{})
    if adaptive.get('enabled') is not False: errors.append('routing.yaml: adaptive memory must remain disabled until observations are reviewed')
    # Every named local skill in hierarchy must exist unless it is an extension outside the managed core.
    named=[]
    for group,val in hierarchy.items():
        if isinstance(val,list): named.extend(val)
        elif isinstance(val,dict): named.extend(val.values())
    for skill in named:
        if skill in core and not (ROOT/skill/'SKILL.md').exists(): errors.append(f'routing.yaml: hierarchy references missing core skill {skill}')

data=json.loads((ROUTER/'evals/routing-evals.json').read_text()); cases=data.get('cases',[]); covered=set()
for c in cases:
    pri=c.get('primary'); covered.add(pri)
    if c.get('complexity') not in {'S0','S1','S2','S3','S4'}: errors.append(f'eval {c.get("id")}: invalid/missing complexity {c.get("complexity")}')
    if pri is not None and pri not in core: errors.append(f'eval {c.get("id")}: unknown primary {pri}')
    if not c.get('prompt'): errors.append(f'eval {c.get("id")}: empty prompt')
    active_names={x.name for x in ROOT.iterdir() if x.is_dir() and (x/'SKILL.md').exists()}
    for field in ['supporting','avoid']:
        for s in c.get(field,[]):
            if field=='supporting' and s in retired:
                errors.append(f'eval {c.get("id")}: retired supporting skill {s}')
            elif s not in active_names and s not in retired:
                errors.append(f'eval {c.get("id")}: unknown {field} skill {s}')
    if pri in c.get('avoid',[]): errors.append(f'eval {c.get("id")}: primary also in avoid')
for s in core:
    if s not in covered: errors.append(f'no routing eval with primary={s}')
for s in retired:
    if (ROOT/s/'SKILL.md').exists(): errors.append(f'retired skill still active: {s}')

# Validate routing observation store; measurement is allowed, automatic adaptation is not.
# Validate shared prompting/outcome contracts.
for ref in ['skill-authoring-standard.md','prompting-standard.md','outcome-rubric-standard.md','subagent-standard.md']:
    if not (ROUTER/'references'/ref).exists(): errors.append(f'missing shared standard: {ref}')
for owner in ['tasks','writing-skills']:
    text=(ROOT/owner/'SKILL.md').read_text(errors='replace')
    for ref in ['skill-authoring-standard.md','prompting-standard.md','outcome-rubric-standard.md','subagent-standard.md']:
        if ref not in text: errors.append(f'{owner}: must reference shared {ref}')
try:
    po=json.loads((ROUTER/'evals/prompt-outcome-evals.json').read_text())
    po_ids={c.get('id') for c in po.get('cases',[])}
    for expected in ['goal-surfaced-evidence','subagent-fresh-context','repo-skill-trust-boundary']:
        if expected not in po_ids: errors.append(f'prompt/outcome evals: missing {expected}')
    kinds={c.get('kind') for c in po.get('cases',[])}
    for k in ['prompt-quality','outcome-quality','goal-boundary']:
        if k not in kinds: errors.append(f'prompt/outcome evals: missing kind {k}')
    if len(po.get('cases',[])) < 4: errors.append('prompt/outcome evals: need at least 4 cases')
except Exception as exc:
    errors.append(f'prompt/outcome evals invalid: {exc}')

metrics_path=ROUTER/'metrics/routing-observations.json'
try:
    metrics=json.loads(metrics_path.read_text())
    if metrics.get('adaptive_memory_enabled') is not False:
        errors.append('routing observations: adaptive_memory_enabled must remain false')
    for i,o in enumerate(metrics.get('observations',[]),1):
        for key in routing.get('measurement',{}).get('required_observation_fields',[]):
            if key not in o: errors.append(f'routing observation {i}: missing {key}')
except Exception as exc:
    errors.append(f'routing observations invalid: {exc}')

if warnings:
    print(f'SKILL VALIDATION WARNINGS: {len(warnings)}')
    for w in warnings[:20]: print(' ~',w)
    if len(warnings)>20: print(f' ~ ... {len(warnings)-20} more legacy/reference warnings')
if errors:
    print('SKILL VALIDATION: FAIL')
    for e in errors: print(' -',e)
    sys.exit(1)
print(f'SKILL VALIDATION: PASS — {len(core)} core skills, {len(cases)} routing eval definitions validated (not executed)')
