# Maps live maintenance classification

Detail behind the `## Live maintenance classification` summary in `SKILL.md`. Kept out of
`SKILL.md` deliberately: the review-skill token budget is shared, and SKILL.md stays a routing layer.

## Why this exists

The live external checks talk to Google and GitHub over the network. Before classification, a
transient provider outage and a genuinely moved or deleted reference produced the same
undifferentiated failure, and the workflow wrapped every live step in `continue-on-error: true` —
so a **confirmed** drift still produced a green scheduled run. The weekly drift alarm could not fail.

Classification separates two concerns:

```text
classification — WHAT happened  (OK / DRIFT / BROKEN_REFERENCE / EXTERNAL_UNAVAILABLE)
mode           — WHAT it means  (strict fails on anything non-OK; advisory tolerates only
                                 external unavailability)
```

Confirmed drift is **never** downgraded, in either mode.

## Outcomes

| Classification | Meaning | `strict` | `advisory` |
|---|---|:---:|:---:|
| `OK` | Check passed | pass | pass |
| `DRIFT` | Source reachable, content moved (upstream SHA advanced) | **fail** | **fail** |
| `BROKEN_REFERENCE` | Source reachable and definitively wrong (404/410, or a broken local contract) | **fail** | **fail** |
| `EXTERNAL_UNAVAILABLE` | Could not obtain evidence (timeout, DNS, reset, 429, 5xx) | **fail** | pass |

Unrecognised errors fail **closed** as `BROKEN_REFERENCE`. An unknown throw is far more likely to be a
defect in the script (`TypeError`, `ReferenceError`, a missing local file) than a provider outage, and
treating it as `EXTERNAL_UNAVAILABLE` would let a genuine bug exit `0` in advisory mode.

## Running locally

```bash
MAPS_CHECK_MODE=strict   node .claude/skills/maps/scripts/check-google-maps-upstream.mjs
MAPS_CHECK_MODE=strict   node .claude/skills/maps/scripts/check-maps-reference-links.mjs
MAPS_CHECK_MODE=advisory node .claude/skills/maps/scripts/check-maps-reference-links.mjs
```

Every run prints a machine-readable summary:

```text
MAPS_CHECK_SUMMARY check=<name> mode=<mode> OK=<n> DRIFT=<n> BROKEN_REFERENCE=<n> EXTERNAL_UNAVAILABLE=<n> result=PASS|FAIL
```

## In CI

`.github/workflows/maps-skill-maintenance.yml` runs these **only** on `schedule` and
`workflow_dispatch` — never on `pull_request` — so they can never block a PR. The mode is fixed in
the workflow as `MAPS_CHECK_MODE: strict` rather than taken from a `workflow_dispatch` input, because
operator-supplied inputs are a supply-chain surface (Checkov `CKV_GHA_7`).

The reference-link step uses `if: ${{ !cancelled() }}` so a failing upstream check cannot hide its
classification. The job still fails if either step fails.

Do **not** reintroduce a blanket step-level `continue-on-error`: that is what previously let confirmed
drift pass silently.

## Adding a new live check

Import from `check-classification.mjs`, push exactly one classification per check, and end with
`reportCheckSummary(name, mode, classifications)` so the exit code is derived rather than hand-written.
