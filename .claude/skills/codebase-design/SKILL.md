---
name: codebase-design
description: >-
  Use when module boundaries, interfaces, seams, coupling, abstraction depth, or testability need design or restructuring.
---

# Codebase Design

## Purpose

Design deep modules: substantial useful behavior behind a small, explicit interface placed at a clean seam. Optimize for locality, testability, and low cognitive load rather than number of abstractions.

## Vocabulary

- **Module:** code with an interface and implementation; scale-agnostic.
- **Interface:** everything callers must know: types, invariants, ordering, errors, configuration, performance.
- **Implementation:** behavior hidden behind the interface.
- **Seam:** a boundary where implementations can vary without callers changing.
- **Adapter:** implementation of a seam for an external system or alternate runtime.
- **Depth:** useful behavior per unit of interface complexity.

## Design test

Before adding an abstraction, answer:
1. What repeated knowledge/complexity does this hide?
2. Who are the callers?
3. What must callers know after this change?
4. Can tests exercise behavior through the public seam?
5. Does this remove coupling, or only move code into another file?
6. Is the abstraction justified by current requirements rather than imagined future ones?

Prefer a direct implementation when a new interface adds as much complexity as it hides.

## MDE boundaries

Useful seams often exist at domain/provider boundaries such as:

`UI/CopilotKit ↔ application/domain behavior ↔ Mastra tools/workflows ↔ Supabase/Stripe/Maps/Cloudinary`

Do not create generic wrappers that erase important provider semantics such as RLS, transactionality, idempotency, webhook verification, map attribution, or media ownership.

## Deepening opportunities

Look for:
- multiple callers repeating the same invariant;
- transport/provider details leaking into domain code;
- tests requiring internal knowledge;
- call sites coordinating steps that belong together;
- several shallow helpers that can become one coherent module.

Avoid "utility" dumping grounds, pass-through services, one-method interfaces with no alternate seam/value, and premature framework layers.

## References

- [`references/DEEPENING.md`](references/DEEPENING.md) — systematic deepening analysis.
- [`references/DESIGN-IT-TWICE.md`](references/DESIGN-IT-TWICE.md) — compare competing module designs before committing to one.
