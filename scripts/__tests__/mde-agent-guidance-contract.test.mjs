import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const refs = resolve(root, ".claude/skills/tasks/references");
const text = (filename) => readFileSync(resolve(refs, filename), "utf8");
const scripts = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).scripts;

test("documented npm commands are defined in the current package", () => {
  const guide = text("pre-merge-tests.md");
  const bash = [...guide.matchAll(/```bash\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n");
  const commands = [...bash.matchAll(/^\s*npm run ([\w:.-]+)/gm)].map((m) => m[1]);
  assert.ok(commands.length >= 4, "expected runnable examples");
  for (const command of commands) assert.ok(scripts[command], "undefined npm script: " + command);
  assert.ok(scripts.lint && scripts["test:e2e"]);
  assert.ok(!scripts.e2e && !scripts["e2e:production"]);
});

test("canonical journeys describe MDE, not another product", () => {
  const guide = text("user-journey-testing.md");
  for (const term of ["Renter", "Event organizer", "Ticket buyer", "AI Concierge", "lead and showing", "Phase A"]) {
    assert.ok(guide.includes(term), "missing MDE journey: " + term);
  }
  for (const foreign of ["Brand Intelligence", "Production Planner", "Brand → Shoot", "Planner chat continuity"]) {
    assert.ok(!guide.includes(foreign), "foreign canonical workflow: " + foreign);
  }
  assert.match(guide, /private\/test.fixture exclusion/);
});

test("task guides preserve S4 review without a Phase A business gate", () => {
  const precommit = text("pre-commit.md");
  const journey = text("user-journey-testing.md");
  assert.ok(!precommit.includes("No stale Lumina"));
  assert.match(precommit, /independent S4 engineering review/);
  assert.match(precommit, /Never impose Phase A/);
  assert.match(journey, /independent S4/i);
  assert.match(journey, /authentication/);
});

test("relative Markdown links in changed guides resolve", () => {
  for (const name of ["pre-commit.md", "pre-merge-tests.md", "github-pr.md", "user-journey-testing.md"]) {
    const body = text(name);
    for (const match of body.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (!target || /^https?:\/\//.test(target)) continue;
      assert.ok(existsSync(resolve(refs, target)), name + ": missing link " + target);
    }
  }
});
