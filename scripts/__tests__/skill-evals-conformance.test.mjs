import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import errorsBehavior from "../../.claude/skills/errors/evals/evals.json" with { type: "json" };
import errorsTriggers from "../../.claude/skills/errors/evals/trigger-evals.json" with { type: "json" };
import prauditBehavior from "../../.claude/skills/praudit/evals/evals.json" with { type: "json" };
import prauditTriggers from "../../.claude/skills/praudit/evals/trigger-evals.json" with { type: "json" };
import linearTaskBehavior from "../../.claude/skills/linear-task/evals/evals.json" with { type: "json" };
import linearTaskTriggers from "../../.claude/skills/linear-task/evals/trigger-evals.json" with { type: "json" };
import implementBehavior from "../../.claude/skills/implement/evals/evals.json" with { type: "json" };
import implementTriggers from "../../.claude/skills/implement/evals/trigger-evals.json" with { type: "json" };
import prodBehavior from "../../.claude/skills/prod/evals/evals.json" with { type: "json" };
import prodTriggers from "../../.claude/skills/prod/evals/trigger-evals.json" with { type: "json" };

import routerTriggers from "../../.claude/skills/using-mde-skills/evals/trigger-evals.json" with { type: "json" };
import reviewTriggers from "../../.claude/skills/review/evals/trigger-evals.json" with { type: "json" };
import e2eTriggers from "../../.claude/skills/e2e/evals/trigger-evals.json" with { type: "json" };
import testsTriggers from "../../.claude/skills/tests/evals/trigger-evals.json" with { type: "json" };
import mergeTriggers from "../../.claude/skills/merge/evals/trigger-evals.json" with { type: "json" };
import rentalTriggers from "../../.claude/skills/real-estate/evals/trigger-evals.json" with { type: "json" };
import eventsTriggers from "../../.claude/skills/events/evals/trigger-evals.json" with { type: "json" };
import supabaseTriggers from "../../.claude/skills/supabase/evals/trigger-evals.json" with { type: "json" };
import mastraTriggers from "../../.claude/skills/mastra/evals/trigger-evals.json" with { type: "json" };

const SKILLS = path.resolve(".claude/skills");

/**
 * Schema: anthropics/claude-plugins-official skill-creator references/schemas.md
 * `skill_name` (matching the skill's frontmatter) and `evals[].id` are required.
 * Three skills previously drifted to a shape without either, and nothing caught it.
 *
 * `version` is an MDE addition and `files`/`expectations` are upstream-optional, but
 * the key set is closed: two shapes for the same file type is what let this drift in
 * the first place, so an unknown key is reported rather than silently accepted.
 */
const TOP_LEVEL_KEYS = ["skill_name", "version", "evals"];
const EVAL_KEYS = ["id", "prompt", "expected_output", "files", "expectations", "should_trigger"];
function evalFiles() {
  return fs
    .readdirSync(SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(SKILLS, entry.name, "evals", "evals.json"))
    .filter((file) => fs.existsSync(file));
}

function frontmatterName(skillDir) {
  const text = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
  return text.match(/^name:\s*["']?([a-z0-9-]+)["']?\s*$/m)?.[1];
}

test("every skill eval file follows the official schema", () => {
  const files = evalFiles();
  assert.ok(files.length > 0, "no evals.json files found — the check would be vacuous");

  const problems = [];
  for (const file of files) {
    const skillDir = path.dirname(path.dirname(file));
    const skill = path.basename(skillDir);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      problems.push(`${skill}: not valid JSON (${error.message})`);
      continue;
    }

    if (data.skill_name !== frontmatterName(skillDir)) {
      problems.push(
        `${skill}: skill_name ${JSON.stringify(data.skill_name)} does not match frontmatter ${JSON.stringify(frontmatterName(skillDir))}`,
      );
    }
    if (!Array.isArray(data.evals) || data.evals.length === 0) {
      problems.push(`${skill}: evals must be a non-empty array`);
      continue;
    }
    const extraTopLevel = Object.keys(data).filter((key) => !TOP_LEVEL_KEYS.includes(key));
    if (extraTopLevel.length > 0) {
      problems.push(
        `${skill}: unexpected top-level key(s) ${extraTopLevel.join(", ")}; canonical shape is ${TOP_LEVEL_KEYS.join(", ")}`,
      );
    }
    // `version` is an MDE addition, not part of the upstream schema. Requiring it
    // everywhere keeps one shape, so tooling never handles both present and absent.
    if (!("version" in data)) {
      problems.push(`${skill}: version is required`);
    } else if (typeof data.version !== "string") {
      problems.push(`${skill}: version must be a string, got ${JSON.stringify(data.version)}`);
    }

    const ids = data.evals.map((item) => item.id);
    const expected = data.evals.map((_, index) => index + 1);
    if (JSON.stringify(ids) !== JSON.stringify(expected)) {
      problems.push(`${skill}: evals[].id must be 1..n without gaps or duplicates, got ${JSON.stringify(ids)}`);
    }
    // SAN-1365: migrate one real pack at a time. The runner grades only
    // explicitly named deterministic checks; legacy strings are unproven.
    // should_trigger is an MDE extension to the upstream eval format.
    if (skill === "errors") {
      const positives = data.evals.filter((x) => x.should_trigger === true);
      const negatives = data.evals.filter((x) => x.should_trigger === false);
      if (positives.length < 1 || negatives.length < 1) {
        problems.push("errors: first behavioral pack requires both a positive and a negative control");
      }
      for (const item of data.evals) {
        const checks = Array.isArray(item.expectations) ? item.expectations : [];
        const ids = checks.map((e) => e?.id);
        if (new Set(ids).size !== checks.length || checks.length < 2) {
          problems.push("errors: expectation ids must be unique and checks non-empty");
        }
        for (const e of checks) {
          if (!e || e.kind !== "deterministic" ||
              !["catalog_contains", "skill_called", "skill_not_called", "skill_result_ok", "turn_completed"].includes(e.check) ||
              typeof e.id !== "string" || !e.id ||
              (e.check !== "turn_completed" && e.value !== "errors")) {
            problems.push("errors: every expectation must have a named, gradeable check (rubrics deferred)");
          }
        }
        const names = new Set(checks.map((e) => e.check));
        if (!names.has("catalog_contains") || !names.has("turn_completed") ||
            (item.should_trigger && (!names.has("skill_called") || !names.has("skill_result_ok"))) ||
            (item.should_trigger === false && !names.has("skill_not_called"))) {
          problems.push("errors: missing essential positive/negative trace checks");
        }
      }
    }
    data.evals.forEach((item, index) => {
      const extraKeys = Object.keys(item).filter((key) => !EVAL_KEYS.includes(key));
      if (extraKeys.length > 0) {
        problems.push(
          `${skill}: evals[${index}] has unexpected key(s) ${extraKeys.join(", ")}; canonical shape is ${EVAL_KEYS.join(", ")}`,
        );
      }
      if (!item.prompt?.trim()) problems.push(`${skill}: evals[${index}] has no prompt`);
      if (!item.expected_output?.trim()) problems.push(`${skill}: evals[${index}] has no expected_output`);
      if ("files" in item && !Array.isArray(item.files)) {
        problems.push(`${skill}: evals[${index}].files must be an array`);
      }
      if ("expectations" in item && !Array.isArray(item.expectations)) {
        problems.push(`${skill}: evals[${index}].expectations must be an array`);
      }
    });
  }

  assert.deepEqual(problems, [], `eval schema problems:\n${problems.join("\n")}`);
});

test("the two most consequential workflow skills keep evals", () => {
  // tasks and task-verifier had none; a regression here would be silent.
  for (const skill of ["tasks", "task-verifier"]) {
    assert.equal(
      fs.existsSync(path.join(SKILLS, skill, "evals", "evals.json")),
      true,
      `${skill} has no evals/evals.json`,
    );
  }
});

/**
 * Metadata-only contract. These fixtures do NOT execute an agent or prove routing.
 * Agent benchmarks must independently exercise each case before claiming accuracy.
 */
function assertTriggerCases(skill, triggers) {
  assert.ok(triggers.length >= 6, `${skill}: missing routing cases`);
  assert.ok(triggers.filter((c) => c.should_trigger === true).length >= 3);
  assert.ok(triggers.filter((c) => c.should_trigger === false).length >= 3);
  assert.equal(new Set(triggers.map((c) => c.id)).size, triggers.length);
  assert.equal(new Set(triggers.map((c) => c.prompt)).size, triggers.length);
  for (const c of triggers) {
    assert.equal(typeof c.id, "string", `${skill}: id missing`);
    assert.ok(c.id.startsWith(`${skill}-`), `${skill}: id must identify owner`);
    assert.equal(typeof c.prompt, "string", `${skill}: prompt missing`);
    assert.ok(c.prompt.length >= 20, `${skill}: unrealistically brief probe`);
    assert.equal(typeof c.should_trigger, "boolean");
    assert.equal(typeof c.expected_owner, "string");
    assert.equal(c.expected_owner === skill, c.should_trigger, `${skill}: conflicting owner`);
  }
}

test("short execution skills cover routing positives, negatives, and behavior", () => {
  // Static imports are part of the test bundle: no user-derived path can reach file I/O.
  const fixtures = {
    errors: [errorsBehavior, errorsTriggers],
    praudit: [prauditBehavior, prauditTriggers],
    "linear-task": [linearTaskBehavior, linearTaskTriggers],
    implement: [implementBehavior, implementTriggers],
    prod: [prodBehavior, prodTriggers],
  };
  for (const [skill, [behavior, triggers]] of Object.entries(fixtures)) {
    assert.ok(behavior.evals.length >= 3, `${skill}: missing behavior cases`);
    assertTriggerCases(skill, triggers);
  }
});


test("critical routing workflows and production domains have positive and near-miss probes", () => {
  const fixtures = {
    "using-mde-skills": routerTriggers,
    review: reviewTriggers,
    e2e: e2eTriggers,
    tests: testsTriggers,
    merge: mergeTriggers,
    "real-estate": rentalTriggers,
    events: eventsTriggers,
    supabase: supabaseTriggers,
    mastra: mastraTriggers,
  };
  for (const [skill, triggers] of Object.entries(fixtures)) {
    assertTriggerCases(skill, triggers);
  }
});
