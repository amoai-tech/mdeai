import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

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
const EVAL_KEYS = ["id", "prompt", "expected_output", "files", "expectations"];
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
