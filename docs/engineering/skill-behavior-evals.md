# MDE skill behavior evals — first working slice (SAN-1365)

## What is proved

The canonical skills live in .claude/skills and the equivalent agent entry
points are relative symlinks under .agents/skills. The repository's existing
check-skill-layout.py already checks the mirror, including linked references.
Do not duplicate that checker or bulk-copy unfinished local skills into main.

Static JSON validation proves that eval definitions are well-formed. It does
**not** prove that DeepSeek, or any other model, chose and read a skill.

The new runner grades a **real persisted DeepSeek Harness v4 session trace**
and requires evidence of an advertised skill, native skill call, successful
matched tool result, and completed turn. It also checks negative controls.
It never uses an agent's self-reported skill selection or expected_output
text as a pass condition.

## Two independent tiers

- **Tier 1 / CI**: check:skills, conformance tests, and the deterministic
  grader's unit tests. These run without a model or API credentials.
- **Tier 2 / on demand**: a real model conversation, saved v4 session,
  and per-expectation JSON grades. Model calls are NOT part of floor.

The first migrated eval pack is .claude/skills/errors/evals/evals.json.
Its should_trigger flags and structured expectations are MDE-only
extensions to the upstream eval schema. Other packs are still legacy
metadata and must not be reported as behaviorally certified.

## Grade a real saved session

~~~bash
python3 scripts/run-skill-behavior-eval.py \
  --skill errors --eval-id 1 \
  --trace /absolute/path/to/session.v4.jsonl.zstd \
  --output /tmp/mde-errors-skill-eval.json
~~~

The trace must contain the eval prompt as user-authored input. A trace for
another question fails, even if it loaded the same skill. The JSON report
includes pass/fail for each check, trace path, and UTC timestamp. Nonzero
exit means not proven. Keep private trace files **outside Git**.

## Run a new model eval (configured headless profile required)

~~~bash
DSH_HOME="$HOME/.dsh" python3 scripts/run-skill-behavior-eval.py \
  --skill errors --eval-id 1 --run \
  --dsh /path/to/installed/dsh --dsh-home "$HOME/.dsh" \
  --output /tmp/mde-errors-skill-eval-live.json
~~~

This runs the installed DSH headless JSON interface from the current
repository checkout and then grades its saved session. Missing credentials,
timeout, unavailable session, or tool errors **cannot count as success**.
Web login credentials do not necessarily configure headless.

Run live evaluations in a separate worktree. The prompts are read-only,
but asking a model not to write files is not itself a technical safeguard.

## Next migration sequence

1. Run a fresh live negative-control test for errors and review tool
   side effects; only the positive real trace was demonstrated in this PR.
2. Migrate one launch-critical pack at a time:
   supabase, mastra, copilotkit, real-estate, tasks, task-verifier.
3. Add an **independent** model rubric grader for outcomes that a native
   tool trace cannot determine. Never self-grade with the acting model.
4. Require gradeable cases for every pack only after all packs are migrated.

One successful skill load does not certify all routing choices, nor does a
passed skill-selection eval prove that a whole application journey works.
