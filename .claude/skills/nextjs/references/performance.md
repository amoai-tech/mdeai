# MDE React and Next.js performance proof

Use after `react-best-practices.md` identifies the implementation pattern. This reference owns measurement, comparison, and acceptance evidence; it intentionally does not repeat React optimization rules.

## Measurement workflow

1. **Name the signal** — choose the metric that represents the reported problem: request timing, route JavaScript, render count/duration, streaming timing, or a Core Web Vital.
2. **Capture a baseline** — record the signal before changing implementation, using the same route, data shape, build mode, device/profile, and measurement method planned for the comparison.
3. **Make the narrow change** — apply the relevant rule from `react-best-practices.md` without changing unrelated behavior.
4. **Measure again** — collect the same signal under the same conditions.
5. **Record before and after** — keep the command/tool, relevant configuration, baseline, result, and regression checks together so the claim is reproducible.

## Evidence by problem

- **Waterfall:** show the relevant request/task timeline or start/end timing before and after.
- **Bundle:** compare the same production build/analyzer output and route/client JavaScript; do not infer bundle improvement from import syntax alone.
- **Rerender:** use React profiling or an equivalent deterministic counter and compare the affected interaction.
- **RSC/streaming:** measure the blocking boundary or streamed delivery being changed; preserve Server/Client Component correctness.
- **Core Web Vitals:** compare the same metric (for example LCP, INP, or CLS) under equivalent conditions and report measurement variance when it is material.

## Acceptance

A performance change is complete only when:
- the relevant signal improves or the targeted regression is removed;
- the same measurement method was used before and after;
- correctness, authorization, accessibility, and established UX remain intact;
- targeted regression tests pass;
- the result is reported as measured evidence, not as an assumption from code shape.

If the evidence is noisy or inconclusive, report that honestly and keep the change out of the performance-success category until it can be reproduced.
