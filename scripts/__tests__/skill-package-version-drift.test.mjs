import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const getPin = (name) => pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
const readSkill = (name) =>
  readFileSync(join(root, ".claude", "skills", name, "SKILL.md"), "utf8");
const tick = String.fromCharCode(96);

test("CopilotKit skill snapshot matches both aligned SDK pins", () => {
  const skill = readSkill("copilotkit");
  const react = getPin("@copilotkit/react-core");
  const runtime = getPin("@copilotkit/runtime");
  assert.match(react, /^\d+\.\d+\.\d+$/);
  assert.equal(react, runtime, "CopilotKit React and Runtime pins must align");
  assert.ok(
    skill.includes(tick + "@copilotkit/react-core" + tick +
      " and " + tick + "@copilotkit/runtime" + tick + " to **" + react + "**"),
    "refresh CopilotKit current-package snapshot after updating SDK pins",
  );
  assert.ok(
    skill.includes(tick + "@mastra/core" + tick + " to **" + getPin("@mastra/core") + "**"),
    "refresh the CopilotKit bridge snapshot after a Mastra core upgrade",
  );
  const agClient = getPin("@ag-ui/client");
  assert.equal(agClient, getPin("@ag-ui/core"), "AG-UI client/core pins must align");
  assert.ok(
    skill.includes(tick + "@ag-ui/client" + tick + " and " +
      tick + "@ag-ui/core" + tick + " to **" + agClient + "**"),
    "refresh the AG-UI transport snapshot after updating SDK pins",
  );
  assert.ok(
    skill.includes(tick + "@ag-ui/mastra" + tick + " to **" + getPin("@ag-ui/mastra") + "**"),
    "refresh the Mastra transport snapshot after updating SDK pins",
  );
  assert.ok(
    skill.includes("MDE pins React + Runtime at **" + react + "**"),
    "refresh vendor-reference compatibility note after updating SDK pins",
  );
  assert.ok(
    skill.includes("v" + react + "/packages/react-core/src/v2/generative-ui/index.ts"),
    "refresh matching versioned SDK source link",
  );
});

test("Mastra skill snapshot matches the exact package-family pins", () => {
  const skill = readSkill("mastra");
  for (const name of [
    "@mastra/core",
    "@mastra/pg",
    "@mastra/client-js",
    "@mastra/memory",
    "@mastra/libsql",
    "mastra",
    "@ag-ui/mastra",
  ]) {
    const pin = getPin(name);
    assert.match(pin, /^\d+\.\d+\.\d+$/, name + " must be exactly pinned");
    assert.ok(
      skill.includes("| " + tick + name + tick + " | " + pin + " | stable |"),
      "refresh Mastra compatibility snapshot for " + name + ": expected " + pin,
    );
  }
  assert.ok(
    skill.includes('verified-package: "@mastra/core ' + getPin("@mastra/core") + '"'),
    "refresh Mastra skill metadata after a package upgrade",
  );
});


test("active Mastra setup guide excludes unsupported CLI flag and retains template guidance", () => {
  const active = readFileSync(
    join(root, ".claude", "skills", "mastra", "references", "create-mastra.md"),
    "utf8",
  );
  const official = readFileSync(
    join(root, ".claude", "skills", "mastra", "references", "official", "mastra", "references", "create-mastra.md"),
    "utf8",
  );
  assert.doesNotMatch(active, /--no-example\b/, "remove unsupported CLI flags from the active skill");
  assert.match(active, /npm create mastra@latest --template <template-name>/);
  assert.match(official, /npm create mastra@latest my-project --empty/);
});
