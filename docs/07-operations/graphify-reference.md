---
title: Graphify Reference — MDE AI
description: Canonical Graphify usage, repository intelligence workflow, and limitations for MDE agents.
status: current
updated: 2026-11-11
source_of_truth: current repository code and tests
---

# Graphify Reference — mdeai

Knowledge graph tool for codebase + docs analysis. Builds a queryable graph of every function, component, file, and document and the connections between them.

**Verified CLI:** `graphifyy[sql]==0.9.106` (November 10, 2026); command `graphify`
**Install:** isolated `uv tool`, normally `~/.local/bin/graphify` (no activation required)
**Output:** `graphify-out/` (gitignored, per checkout/worktree)
**Builder:** `npm run graphify:update` (code-only AST, no LLM or clustering)
**Historical baseline:** [Phase 2 snapshot](../_archive/legacy-active-docs-2026-09-18/task-130/ai-second-brain/GRAPHIFY-BASELINE.md) — not the current code graph.

**Important:** a graph describes the checkout that generated it, **not** automatically current GitHub `main`. Rebuild on the branch/worktree you intend to inspect. Check the timestamp and confirm the exact symbol against current source before trusting dependency conclusions.


## Contents

- [When to use graphify (and when not)](#when-to-use-graphify-and-when-not)
- [Quick Start](#quick-start)
- [Commands](#commands)
- [Rebuild the Graph](#rebuild-the-graph)
- [Corpus](#corpus)
- [Reading the Graph Report](#reading-the-graph-report)
- [Interpreting Results](#interpreting-results)
- [Key Findings (Phase 2, 2026-06-09)](#key-findings-phase-2-2026-06-09)
- [Safeguards — What NOT to Do](#safeguards--what-not-to-do)
- [Graph Stats (verified example, not a shared current index)](#graph-stats-verified-example-not-a-shared-current-index)
- [File Reference](#file-reference)

---

## When to use graphify (and when not)

> **Graphify is keyword/label graph traversal, not semantic search.** It matches the
> exact identifiers extracted from the AST (function, component, file, and doc names) and
> walks the edges between them. It does not understand intent or paraphrase.

**Use graphify first when you know the exact shared symbol you're about to touch:**

```bash
# Good — anchor on an exact symbol name
npm run graphify:explain -- "conciergeAgent"          # locate + immediate neighbors
npm run graphify:explain -- "HostOpsCopilotBridge"
npm run graphify:explain -- "HostDashboardState"
npm run graphify:path -- "useConciergeCoAgent" "concierge.ts" --undirected # how A connects to B
```

**Do not use graphify for vague natural-language discovery** — it keyword-matches and
returns noisy hits (e.g. doc nodes that merely contain the word "agent"):

```bash
# Bad — vague NL, returns noise
npm run graphify:query -- "where is the agent defined"
npm run graphify:query -- "what handles onboarding"
```

For fuzzy or conceptual discovery, use `grep` + `Read` instead. Reach for graphify once
you have an exact identifier to anchor on.

**Verified 2026-06-18:** `npm run graphify:explain -- "conciergeAgent"` resolves cleanly to
`src/mastra/agents/concierge.ts`; the vague NL query above returned unrelated doc nodes
(keyword-matched on "agent"). Exact symbol in → useful subgraph; vague sentence in → noise.

---

## Quick Start

```bash
# Official PyPI package is graphifyy (double y). Pin the verified version + SQL support.
uv tool install --reinstall --force 'graphifyy[sql]==0.9.106'
GRAPHIFY_NO_AUTO_REFRESH=1 graphify --version    # expect 0.9.106; no skill modifications
uv tool list

# Run from the checkout containing the code you are editing.
cd "$(git rev-parse --show-toplevel)"
npm run graphify:update                    # regenerate code index for this checkout
npm run graphify:explain -- conciergeAgent
```

If Graphify reports `ModuleNotFoundError`, reinstall with the `uv tool` command above. The wrapper resolves an explicit `GRAPHIFY_BIN` first, then the isolated `uv` tool environment, `~/.local/bin/graphify`, and finally the legacy venv. It never executes arbitrary Graphify binaries from `PATH`; it verifies version 0.9.106 and checks SQL support when updating. In nonstandard installations, set `GRAPHIFY_BIN` explicitly. Direct CLI commands must use `GRAPHIFY_NO_AUTO_REFRESH=1` or the wrapper to avoid refreshing unrelated agent configurations.

### Upstream source receipt (v0.9.106)

| Field | Verified source / decision |
| --- | --- |
| URL and exact source | [v0.9.106 README — Install](https://github.com/Graphify-Labs/graphify/blob/v0.9.106/README.md#install); [v0.9.106 pyproject.toml — `project.optional-dependencies.sql` and `project.scripts`](https://github.com/Graphify-Labs/graphify/blob/v0.9.106/pyproject.toml); [v0.9.106 `graphify/__main__.py` — automatic skill refresh opt-out](https://github.com/Graphify-Labs/graphify/blob/v0.9.106/graphify/__main__.py) |
| Decision | Use the official `graphifyy` CLI and optional SQL grammar, pin the tested version, keep skill auto-refresh disabled during ordinary repository queries, and index the active checkout |
| Disposition | **ADAPT** official package/CLI configuration; do not copy upstream agent settings |
| Destination | `scripts/graphify-run.sh`; `scripts/__tests__/graphify-run.test.mjs`; this guide; `.claude/skills/tasks/SKILL.md`; `.claude/skills/tasks/references/domain-routing.md` |
| Implementation | Prefer the isolated `uv` executable over arbitrary PATH; verify version and SQL support, preserve argument and working-directory behavior, and route agent commands through the wrapper |
| Verification | `GRAPHIFY_NO_AUTO_REFRESH=1 graphify --version`; `npm run graphify:update`; `npm run graphify:explain -- conciergeAgent`; `node --test scripts/__tests__/graphify-run.test.mjs` |
| Version / commit | Graphify **v0.9.106**, released November 10, 2026 |

---

## Commands

### path — shortest path between two things

```bash
npm run graphify:path -- "useConciergeCoAgent" "concierge.ts" --undirected
npm run graphify:path -- "createClient" "venue_booking_requests"
npm run graphify:path -- "CafeBrowseFilters" "buildFilterUrl"
```

Paths are directed by default. For imports between the client and server subgraphs, an **undirected** path may exist even when a directed path does not. The verified `useConciergeCoAgent` to `concierge.ts` lookup needs `--undirected`; a missing directed path is not a broken installation.

Use actual function/file names from the graph, not conceptual names. If unsure of the exact name, search first:

```bash
# Find the real node name
python3 -c "
import json
with open('graphify-out/graph.json') as f:
    g = json.load(f)
hits = [n['label'] for n in g['nodes'] if 'copilot' in n['label'].lower()]
print(hits[:20])
"
```

### explain — plain-language description of a node

```bash
npm run graphify:explain -- "useRentalUi"
npm run graphify:explain -- "search-grounded-places.ts"
```

### query — BFS traversal for a question

Keyword-anchored BFS, not semantic. Works when the question contains an exact identifier
that exists in the graph; degrades to noise for paraphrased / conceptual questions (see
"When to use graphify" above).

```bash
npm run graphify:query -- "what calls createClient" --budget 3000
npm run graphify:query -- "Mastra tool registration" --dfs
```

Graphify 0.9.106 ranks source nodes ahead of test/document/config nodes (without excluding them). The committed `.graphifyrc` sets the default query budget to 4000 tokens; explicit `--budget 2000` overrides it. For noisy or truncated results, **narrow by an exact symbol** and use `graphify:explain` or `affected` rather than repeatedly increasing the budget. To prove the real pinned CLI reads this setting after `graphify:update`, run `MDE_GRAPHIFY_REAL_SMOKE=1 node --test scripts/__tests__/graphify-run.test.mjs` with the 0.9.106 binary installed.

### Blast radius — what depends on X

Graphify **v0.9.106 includes `affected`**, which performs bounded reverse dependency traversal:

```bash
bash scripts/graphify-run.sh affected "conciergeAgent" --depth 1
npm run graphify:explain -- "conciergeAgent"          # immediate neighbors
npm run graphify:path -- "useConciergeCoAgent" "concierge.ts" --undirected
```

`affected` is a static dependency aid, **not** a guaranteed complete set of callers. Check results with source search and tests: runtime routing, dynamic imports, strings and external service calls may not appear as edges.

---

## Rebuild the Graph

The canonical npm script builds a **code-only AST graph** for the current checkout:

```bash
npm run graphify:update
stat -c '%y %s %n' graphify-out/graph.json
npm run graphify:explain -- conciergeAgent
```

This extracts code (including SQL when installed with `[sql]`), without an LLM or clustering. It writes the current checkout's `graphify-out/graph.json`. It does **not** refresh a historical semantic document graph, communities, or old `GRAPH_REPORT.md`. Generate a tree visualization separately with `npm run graphify:tree`; use the official `/graphify --update` assistant workflow only if semantic documents are needed.

**Known parser-coverage warning (fresh 0.9.106 extraction, November 11, 2026):** Graphify reports partial TSX extraction for `src/components/copilot/__tests__/cafe-result-card.test.tsx` (near line 68, no symbols) and `src/components/modals/booking-checkout-modal.tsx` (near line 142, five symbols). TypeScript's own TSX parser reports **zero diagnostics** for both files. Do not alter valid application JSX or silently ignore the files just to make the graph warning disappear; inspect their real source and relevant tests until upstream extraction improves. An incremental Graphify update may not repeat the warning if the files were cached.

**One-time migration:** If the old combined graph is much larger, Graphify refuses to overwrite it. Preserve `graph.json`, `GRAPH_REPORT.md` and `manifest.json` first. Only when deliberately replacing the default graph with a code-only graph, set `GRAPHIFY_FORCE=1 npm run graphify:update`. Never force an unexplained decrease in nodes.

**Freshness:** Graphify indexes the **local checkout**, including its branch-specific state, not GitHub `main`. Check `git rev-parse --short HEAD`, the graph timestamp and a known symbol against local source. Rebuild after significant changes or branch switches. A historical backup is for reference, not current dependency proof.

---

## Corpus

### Phase 1 — Code only
| Source | Files | Notes |
|---|---|---|
| `src/` | 591 TS/TSX | AST extraction, zero LLM calls |

### Phase 2 — Code + Docs (historical; not refreshed by `graphify:update`)
| Source | Files | Notes |
|---|---|---|
| `src/` | 591 TS/TSX | Reused from Phase 1 |
| `docs/` | 509 `.md` | PRDs, ARCHITECTURE, LESSONS, linear.md |
| `tasks/maps/` | 34 `.md` | MAP-001–012 specs |
| `tasks/mastra/` | 37 `.md` | Mastra task specs |
| `tasks/intelligence/` | 45 `.md` | Intelligence layer tasks |
| `tasks/real-estate/` | 31 `.md` | Rental/RE tasks |
| `tasks/events/` | 242 `.md` | Event tasks |
| `tasks/evidence/` | 121 `.md` | F-series evidence files |
| `tasks/partners/` | 45 `.md` | Partner tasks |

To change what is indexed, edit `.graphifyignore` (the include/exclude contract) — not a
script constant. Corpus counts above are historical Phase-1/2 figures; see
[`GRAPHIFY-BASELINE.md`](../_archive/legacy-active-docs-2026-09-18/task-130/ai-second-brain/GRAPHIFY-BASELINE.md) for historical corpus measurements, not the active checkout.

---

## Reading the Graph Report

`graphify-out/GRAPH_REPORT.md` is generated by the full semantic/clustering workflow, **not** by `npm run graphify:update` (the code-only `--no-cluster` refresh). If a report remains after a code-only update, it is **historical** and its findings must not be treated as current without regenerating the report and checking the indexed checkout.

**God nodes** — the most-connected symbols. Highest degree = everything depends on this.
- A code god node (e.g. `cn()`, `createClient()`) is a shared utility — expected.
- A doc god node (e.g. a PRD file with 100 edges) means many tasks reference it — expected.
- A god node in an unexpected place (e.g. `search-tool-renders.tsx` at 70 edges) signals hidden coupling worth investigating.

**Surprising connections** — edges the graph inferred across files that aren't explicit imports. Worth checking: sometimes they reveal real hidden coupling, sometimes they're AST noise.

**Import cycles** — circular dependencies. Zero is good. Any hit here needs immediate investigation.

**Communities** — groups of tightly connected nodes. Each community is a functional cluster. The top 40 are labeled by the LLM. The rest are "Community N" placeholders — not useless, just unnamed.

**Community cohesion score** — how tightly coupled the community is internally. Low (0.03) = loosely related files grouped together. High (0.8+) = everything imports everything else.

---

## Interpreting Results

### "No node matching X found"
The graph uses AST-extracted names, not conceptual names. Search for the actual identifier:
```bash
python3 -c "
import json
with open('graphify-out/graph.json') as f:
    g = json.load(f)
# Change 'copilot' to whatever you're looking for
hits = [(n['label'], n.get('source_file','')) for n in g['nodes']
        if 'copilot' in n['label'].lower()]
for lbl, sf in hits[:15]:
    print(f'{lbl}  ({sf})')
"
```

### Graph shows a file as isolated (dead code candidate)
Cross-check before acting. The graph only captures static imports. Dynamic imports, `require()`, string-based lookups, and Next.js page routing are not captured. A file with degree 0 might still be a live route.

### Community is just "Community N" with no label
The LLM only labeled the top 40 communities. To label more:
```bash
python3 -c "
import json
from graphify.llm import label_communities
import networkx as nx
from networkx.readwrite import node_link_graph

with open('graphify-out/graph.json') as f:
    data = json.load(f)
G = node_link_graph(data)
communities = {}
for n, d in G.nodes(data=True):
    c = d.get('community', 0)
    communities.setdefault(c, []).append(n)

labels = label_communities(G, communities, backend='claude-cli', max_communities=100)
print(labels)
"
```

---

## Key Findings (Phase 2, 2026-06-09)

These are the audited findings. See the full report at `docs/graphify-audit-2026-06-09.md`.

| Finding | Status | Action |
|---|---|---|
| OpenClaw: 172 docs, zero code | **Done 2026-06-09** — archived to `/home/sk/mdeai/docs/_archive/openclaw/`; build script now skips `_archive/` dirs |
| Browse duplication: 4 functions in 5 files | Confirmed | Extract to `src/lib/browse/filter-utils.ts` |
| Commerce (`src/app/shop/`) | Live Phase 2 code | Keep — do not delete |
| `use-venue-booking-status.ts` queries `venue_booking_requests` with no user filter | **Cleared 2026-06-09** — RLS policy `venue_booking_select_own` enforces `user_id = auth.uid()` at DB level; no code change needed |
| `use-session.ts` calls Supabase directly | Safe | Auth-only calls, no data tables |
| `CONCIERGE_MODEL` etc. in `models.ts` | **Done 2026-06-09** — deleted 4 dead exports; `FLASH_MODEL` kept (9 importers) |
| `getSupabaseClient()` helpers | Historical Graphify snapshot only. Current `main` keeps per-tool Supabase helpers in Mastra search tools; verify current code before relying on this row. |

---

## Safeguards — What NOT to Do

These are hard rules learned during Phase 1/2 setup:

- **Do NOT run `graphify claude install`** — modifies CLAUDE.md automatically
- **Do NOT run `graphify hook install`** — modifies `.claude/settings.json` automatically
- **Do NOT run `graphify uninstall --purge`** — deletes `graphify-out/`
- **Do not include `tasks/design/`** in the corpus — it's 11 GB of images
- **Do not include `tasks/archive/` or `tasks/backup/`** — adds noise without value
- **`graphify update <path>`** and `npm run graphify:update` rebuild code AST without full semantic docs; the assistant `/graphify --update` workflow is separate.
- **`_archive/` dirs are excluded** from doc extraction (build script filters `"_archive" not in f.parts`) — move obsolete docs there to clean the corpus without deleting them
- **Commerce `src/app/api/commerce/` routes ARE live** — the graph showed low connectivity for `src/lib/commerce/` but the routes exist and the shop page imports the client

---

## Graph Stats (verified example, not a shared current index)

Clean `origin/main` at `84a2f719` was indexed on 2026-11-03 with Graphify 0.9.101 and the SQL extra:

```
Nodes:             18,124
Relationships:     36,682
SQL-related nodes: 1,319
Clustering:        not run (--no-cluster)
LLM calls:         0
```

The active feature checkout had 20,282 nodes / 36,670 edges. Counts vary with branch, uncommitted files and exclusions; do not treat these as a permanent baseline. The archived June/September semantic graph is not interchangeable with the current AST-only index.

---

## File Reference

```
./
  graphify-out/               ← gitignored, all derived outputs
    graph.json                ← current checkout's code graph after `npm run graphify:update`
    archive/                  ← optional operator-preserved historical semantic graph
    GRAPH_REPORT.md           ← may belong to an earlier clustering/semantic snapshot
    cache/                    ← local extractor cache
    manifest.json             ← local extraction manifest
  scripts/
    graphify-run.sh           ← canonical builder (run this to rebuild)
```
