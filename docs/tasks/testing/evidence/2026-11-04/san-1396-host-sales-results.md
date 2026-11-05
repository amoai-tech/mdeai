# SAN-1396 — Host AI sales assertions: review fixes and results

Date: 2026-11-04 · Author: agent · Scope: `e2e/**` only (no `src/**` runtime change)

## Why

Two Host Ops assertions failed on production for reasons that were **not** product
defects: the test asserted historical figures and accepted partial matches. This
records the four review findings, each verified against the code before changing it.

## Findings and dispositions

| # | Finding | Verified? | Fix |
|---|---|---|---|
| 1 | `"2 tickets sold, 8 tickets unsold"` — "unsold" treated as a sales count | **Yes** — the inventory filter listed remaining/left/available/capacity/total but not `unsold`, so a truthful reply was rejected | Added `unsold` (and `not`/`un` prefixes) to the inventory filter |
| 2 | Comma-formatted amounts captured as partial counts (`"Tickets sold: 1,800"` → `1`) | **Yes** — the capture was `(\d{1,6})\b`, and a comma is a word boundary | Added `(?!\d\|[.,]\d)` after every capture: a comma/dot **followed by a digit** means a larger number, so no partial count can be read |
| 3 | Follow-up asserted on a partial stream | **Yes** — `expect.poll` returned true as soon as the identifier appeared mid-stream | The identifier must now hold and the answer text must be identical across two reads (settled) |
| 4 | Follow-up matched a name prefix, not the full fixture name | **Yes** — it rebuilt `SAN-1396 QA draft ${run}` while the fixture name is `SAN-1396 QA draft ${run} (not a real event)` | Compares against normalized `fixture.name` and `fixture.eventId` |

Note on #2: the guard is `(?!\d|[.,]\d)`, **not** `(?![\d,.])`. A bare class would also
reject a sentence-ending period (`"Tickets sold: 2. Paid orders: 1."`), which broke
three existing tests until corrected.

## Verification

```
npx vitest run e2e/host-sales-wording.test.ts   → 16 passed
npm test                                        → 4846 passed / 51 skipped / 0 failed (600 files, 587 passed)
npx eslint <3 changed files> --max-warnings 0   → 0
npx tsc --noEmit --incremental false            → 0 errors
```

New regression cases: `"2 tickets sold, 8 tickets unsold"` accepted; `Tickets sold: 1,800`
/ `Tickets: 1,800` / `You sold 1,800 tickets` / `Sold: 1,800` / `1,800 tickets sold` all
rejected for a partial expectation; unformatted counts still accepted in every supported
shape.

## Not run

- `npm run floor` in full: `scripts/__tests__/pr-agent-pinned-loader.test.mjs` fails in this
  shell because `pr-agent-pinned-loader.py` is mode `0600` while the container runs as uid
  65534 (pre-existing, identical on pristine `main`). The individual steps above were run
  instead; CI `floor` is the authoritative gate.
- The Host Ops production spec itself needs a signed-in host fixture and was exercised in CI,
  not from this shell.

## Honest limitation

These are test-correctness fixes. They make a truthful answer pass and keep a wrong answer
failing; they do not change MDE's AI, ticket data or any production behaviour.
