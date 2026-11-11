---
name: research
description: >-
  Use when a technical, product, architecture, API, library, vendor, or implementation question needs current primary-source evidence before MDE makes a decision or changes code.
---

# Research

## Purpose

Answer the decision, not merely collect links. Prefer primary sources and connect each important claim to the exact MDE consequence it supports.

## Workflow

1. State the decision/question and what would change depending on the answer.
2. Verify the current MDE implementation and installed version first when the question concerns existing code.
3. Search primary sources: official docs, source repositories, specifications, release notes, first-party APIs, and connected live systems.
4. Version-pin mutable technical claims. Prefer installed source/types and immutable commit/tag links when practical.
5. Separate **verified fact**, **inference**, **recommendation**, and **unknown**.
6. Compare alternatives on the dimensions that matter to the task: correctness, fit, complexity, cost, latency, security, maintenance, and migration risk.
7. Recommend the smallest reliable option; do not hide behind an unranked list when evidence supports a choice.
8. Save durable findings only when they will be reused. Put platform/vendor research under `docs/platform/tech-stack/<technology>/` or domain-specific research under the owning docs folder; put one-off findings in the Linear task/PR evidence instead.

## Evidence rules

- Do not use memory as proof for version-sensitive APIs.
- Do not cite a search-result snippet when the underlying primary source is available.
- Do not treat a README example as proof that a feature is production-safe for MDE.
- When sources conflict, record the disagreement and prefer current installed/runtime evidence for MDE behavior.
- Include full URLs in implementation steps when the task depends on an external contract.

## Output

Keep the report decision-oriented:

```text
Question
Current MDE state
Primary-source findings
Options / tradeoffs
Recommendation
Implementation implications
Risks / unknowns
Sources
```
