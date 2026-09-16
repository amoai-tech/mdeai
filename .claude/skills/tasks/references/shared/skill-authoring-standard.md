# MDE skill-authoring standard

Use this standard when creating or materially changing `.claude/skills/*`.
It adapts Anthropic's official `skill-creator` guidance to MDE.

## 1. Discovery metadata

- `name` is lowercase kebab-case, concise, and stable.
- `description` starts with `Use when` and describes trigger conditions only.
- Include concrete symptoms, technologies, user intents, and synonyms that improve discovery.
- Do not summarize the skill workflow in the description; agents may shortcut the body.
- Keep descriptions concise; MDE target is <=500 characters.

## 2. Progressive disclosure

Use three levels:
1. Metadata: always discoverable.
2. `SKILL.md`: loaded when the skill triggers.
3. `references/`, `scripts/`, and `assets/`: loaded or executed only when needed.

Keep `SKILL.md` under 500 lines; prefer much smaller files for frequently used/router/vendor-wrapper skills.
Move reference material over ~100 lines out of the main skill when it does not need to be loaded every time.
## 3. Skill body

Prefer imperative instructions and explain why important constraints exist.
A canonical skill should usually contain:
- ownership and boundaries;
- source-of-truth priority;
- decision rules;
- MDE invariants;
- execution/verification procedure;
- pointers that say when to read each reference.

Do not duplicate volatile vendor API documentation in the active skill body.
For official vendor skills, preserve reviewed upstream material separately and keep MDE-specific overlays distinct.

## 4. Bundled resources

- `references/`: deep or variant-specific guidance loaded on demand.
- `scripts/`: deterministic, repetitive, or mechanically verifiable operations.
- `assets/`: reusable output resources, not instructions.
- `evals/`: realistic prompts and expected behavior.

References over ~300 lines should have a table of contents or another clear navigation aid.
## 5. Evaluation loop

For routing-sensitive or objectively testable skills:
1. Capture realistic prompts before or alongside the draft.
2. Establish a baseline without the new skill, or with the previous skill version for a material rewrite.
3. Run the same cases with the candidate skill.
4. Grade objective assertions programmatically where possible.
5. Compare correctness first; use time/token data when it helps explain tradeoffs.
6. Inspect qualitative failures and revise the skill.
7. Re-run after changes and expand the test set for important skills.

Keep trigger evals separate from behavior evals:
- trigger eval: should this skill load?
- behavior eval: once loaded, does it lead to the correct decisions and evidence?

Do not require heavyweight benchmarking for trivial wording/reference-only edits.

## 6. Safety and trust

Repository skills are executable agent instructions and part of the trust boundary.
Review upstream changes before vendoring or pinning them; never auto-update trusted skill content.
Prefer deterministic validation for mechanical rules instead of prose reminders.