---
name: mde-real-estate
description: >-
  Use when MDE work changes real-estate or rental discovery, listings, leads, broker or host flows, neighborhood intelligence, viewing, or property-domain behavior.
paths:
  - "src/**/*apartment*"
  - "src/**/*listing*"
  - "src/**/*property*"
  - "supabase/migrations/**apartment*"
  - "supabase/migrations/**listing*"
---

# mde-real-estate — real estate superskill

Pick the topic that matches the work, then load it.

| Intent | Read |
|--------|------|
| V1 mdeai.co real-estate marketplace product (current canonical) | [marketplace-v1.md](marketplace-v1.md) |
| V2+ MLS / IDX / RETS technical playbook (future) | [mls-v2.md](mls-v2.md) |
| Industry vocabulary, broker workflows, regulatory context | [industry-context.md](industry-context.md) |
| Generate a property description from listing data | [sub-agents/property-description.md](sub-agents/property-description.md) |
| Generate a neighborhood guide for a listing or area | [sub-agents/neighborhood-guide.md](sub-agents/neighborhood-guide.md) |
| Qualify an inbound lead (BANT-style, real-estate flavored) | [sub-agents/lead-qualifier.md](sub-agents/lead-qualifier.md) |

## Decision rule (V1 vs V2)

- Default to `marketplace-v1.md` for any current mdeai.co work.
- Read `mls-v2.md` only when the task explicitly mentions MLS, RETS, IDX, RESO, or post-V1 architecture.
- `industry-context.md` is reference material — load it when terminology or workflow context is needed.

## Sub-agents

The three files under `sub-agents/` are content-generation specialists. They take structured input (listing, area, lead) and emit text. Cross-link from V1 marketplace flows that need any of these outputs.
