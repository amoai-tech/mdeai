# Anthropic skill-authoring best practices — MDE digest

Source reviewed: https://github.com/anthropics/claude-plugins-official/blob/main/plugins/skill-creator/skills/skill-creator/SKILL.md

Use this as a concise checklist, not a substitute for checking the current upstream source when skill behavior materially changes.

## 1. Capture intent before writing

Clarify:
- what the skill should enable;
- when it should trigger;
- expected output/behavior;
- required tools or dependencies;
- important edge cases;
- how success will be evaluated.

Reuse answers already present in the conversation or repository before asking again.

## 2. Keep discovery metadata strong

`SKILL.md` needs YAML frontmatter with `name` and `description`.

- Use a stable lowercase hyphenated name.
- Make the description concrete enough that the agent knows when the skill is relevant.
- Include important trigger contexts and synonyms without turning the description into the full procedure.
- Avoid vague descriptions that under-trigger.

## 3. Use progressive disclosure

Organize skill content so frequently needed guidance is cheap to load:

```text
skill-name/
├── SKILL.md
├── references/
├── scripts/
├── assets/
└── evals/        # MDE convention for test prompts
```

Keep the main `SKILL.md` focused on workflow, decisions, and pointers. Put large API/reference material in `references/`. Put deterministic repetitive helpers in `scripts/`. Put reusable output templates/assets in `assets/`.

Prefer the main skill body under about 500 lines. Large references should have clear headings or a table of contents when needed.

## 4. Write for execution

- Prefer imperative instructions.
- Explain why important constraints exist instead of relying only on repeated MUST language.
- Use examples when they remove ambiguity.
- Specify exact output formats when downstream tools or humans depend on them.
- Do not hide critical behavior only in examples.
- Avoid project-specific trivia in a generic skill; place it in the owning project/domain skill instead.

## 5. Avoid surprising behavior

A skill should do what its name/description reasonably implies. It must not silently broaden permissions, expose secrets, perform destructive actions, or introduce behavior the user would not expect from the stated purpose.

## 6. Evaluate realistic prompts

For behavior that can be checked objectively:

1. Create 2–3 realistic user prompts.
2. Record expected outcomes.
3. Compare the skill against a baseline or previous version when practical.
4. Grade with concrete assertions where objective measurement makes sense.
5. Review qualitative behavior for judgment-heavy skills.
6. Iterate on failures, then expand the test set when the skill stabilizes.

Store MDE prompts in `evals/evals.json` so future changes can re-use the same pressure cases.

## 7. Improve triggering separately from body quality

A good body can still fail if the skill never triggers. Review name/description after the workflow is stable and test whether realistic user phrasing would discover the skill.

## 8. MDE-specific quality gate

Before adopting a copied skill:
- remove source-project assumptions;
- resolve every relative link;
- ensure neighboring MDE skill ownership is explicit;
- keep Linear/task lifecycle ownership in `tasks`;
- keep independent Done/production proof in `task-verifier`;
- prefer current repo/runtime truth over imported examples;
- add MDE-relevant eval prompts;
- run `git diff --check` and a stale-term scan.
