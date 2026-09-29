import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { stripComments } from "../lib/strip-comments.mjs";

/**
 * SAN-1357 Step 8 · The CopilotKit consumer inventory must stay true to the tree.
 *
 * The inventory exists so that "verify-only" is falsifiable rather than assumed. A JSON list that
 * nobody checks rots the same way the v1 allowlist did, so these cases make it mechanical:
 * every consumer detected in the tree must be classified, no classified file may vanish, and the
 * compatibility `<CopilotKit>` boundary must be exactly the four that Steps 12 to 15 migrate. A
 * fifth boundary appearing anywhere fails here instead of surfacing during a migration.
 */

const INVENTORY_REL = "scripts/copilotkit-consumer-inventory.json";
const INVENTORY = JSON.parse(fs.readFileSync(path.resolve(INVENTORY_REL), "utf8"));

const VALID_CLASSIFICATIONS = new Set(INVENTORY.classifications);

/**
 * Scan roots must cover every root the no-new-v1 write-time guard covers, or the
 * inventory can silently miss a consumer the guard would block. The guard's own
 * contract is `.claude/hooks/copilotkit-version-pin.mjs:67`:
 *   /^(src|supabase\/functions)\//
 * `e2e` and `scripts` are additional here because test and tooling code consumes
 * CopilotKit too, and neither is a guard root.
 */
const SCAN_ROOTS = ["src", "supabase/functions", "e2e", "scripts"];
const SCAN_EXT = /\.(ts|tsx|js|jsx|mjs)$/;

/** The four compatibility boundaries, each owned by a migration step. */
const COMPAT_BOUNDARIES = [
  "src/components/chat/chat-provider.tsx",
  "src/components/copilot/copilot-kit-provider.tsx",
  "src/components/host/host-event-provider.tsx",
  "src/components/host/host-os-shell.tsx",
];

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      walk(p, acc);
    } else if (SCAN_EXT.test(ent.name)) {
      acc.push(p.replace(/\\/g, "/"));
    }
  }
  return acc;
}

/** Same comment-stripping rule the no-new-v1 guard uses, so the two cannot drift. */
const strip = (rel) => stripComments(fs.readFileSync(rel, "utf8"));

/** This file necessarily names the symbols it checks, so it is not its own subject. */
const SELF = "scripts/__tests__/copilotkit-consumer-inventory.test.mjs";

const ALL_FILES = SCAN_ROOTS
  .flatMap((root) => (fs.existsSync(root) ? walk(root) : []))
  .filter((rel) => rel !== SELF)
  .sort();

/**
 * A consumer references the package scope, or renders any CopilotKit provider.
 *
 * The character class accepts an escaped slash so a guard that names the packages inside a regex
 * literal is still recognised — `scripts/check-mastra.mjs` matches `@copilotkit\/react-core`, and a
 * plain `/@copilotkit\//` test silently dropped it from the inventory.
 */
function isConsumer(rel) {
  const code = strip(rel);
  return (
    /@copilotkit[/\\]/.test(code) ||
    /<CopilotKit(Provider|ChatConfigurationProvider)?(?![A-Za-z])/.test(code)
  );
}

/**
 * Files that own or exercise the CopilotKit contract without importing it. Each declares
 * `implicitContract: true` and carries a reason. Widening this set is a deliberate two-file change,
 * exactly like the compatibility-boundary set below.
 */
const IMPLICIT_CONTRACT = [
  "e2e/chat-virtualization.spec.ts",
  "src/lib/__tests__/copilotkit-client-props.test.ts",
  "src/lib/copilotkit-client-props.ts",
];

const classified = new Map(INVENTORY.consumers.map((c) => [c.file, c.classification]));

test("the inventory declares the agreed classification vocabulary", () => {
  assert.deepEqual(
    [...VALID_CLASSIFICATIONS].sort(),
    ["compatibility-required", "keep", "migrate", "remove", "test-only"],
  );
});

test("every CopilotKit consumer in the tree is classified", () => {
  const unclassified = ALL_FILES.filter((f) => isConsumer(f) && !classified.has(f));
  assert.deepEqual(
    unclassified,
    [],
    `these files consume CopilotKit but are absent from ${INVENTORY_REL}:\n${unclassified.join("\n")}`,
  );
});

test("every classified entry is still a consumer, or declares why it is not", () => {
  // The mirror of the completeness check above. Without it the inventory rots the same way the v1
  // allowlist did: once a file stops consuming CopilotKit its entry stays, the suite stays green,
  // and the list becomes a ledger of things that used to be true.
  const undeclared = INVENTORY.consumers
    .filter((c) => !isConsumer(c.file) && c.implicitContract !== true)
    .map((c) => c.file);
  const unexplained = INVENTORY.consumers
    .filter((c) => c.implicitContract === true && !c.note)
    .map((c) => c.file);
  assert.deepEqual(
    [...undeclared, ...unexplained],
    [],
    "these entries no longer consume CopilotKit and do not say why. Remove the entry, or set " +
      `implicitContract: true and explain it:\n${[...undeclared, ...unexplained].join("\n")}`,
  );

  const declared = INVENTORY.consumers
    .filter((c) => c.implicitContract === true)
    .map((c) => c.file)
    .sort();
  assert.deepEqual(
    declared,
    IMPLICIT_CONTRACT,
    "the implicit-contract exception set changed; say why in the PR before widening it",
  );
});

test("every classified file still exists", () => {
  const missing = INVENTORY.consumers
    .filter((c) => !fs.existsSync(c.file))
    .map((c) => `${c.file} (${c.classification})`);
  assert.deepEqual(
    missing,
    [],
    `the inventory names files that no longer exist:\n${missing.join("\n")}`,
  );
});

test("every entry uses a valid classification", () => {
  const invalid = INVENTORY.consumers
    .filter((c) => !VALID_CLASSIFICATIONS.has(c.classification))
    .map((c) => `${c.file}: ${c.classification}`);
  assert.deepEqual(invalid, [], `invalid classifications:\n${invalid.join("\n")}`);
});

test("every migrate entry names the step that owns it", () => {
  const unowned = INVENTORY.consumers
    .filter((c) => c.classification === "migrate" && typeof c.step !== "number")
    .map((c) => c.file);
  assert.deepEqual(unowned, [], `migrate entries without a step:\n${unowned.join("\n")}`);
});

test("no classification is left unused except the empty ones", () => {
  // compatibility-required and remove are deliberately empty today: nothing must keep a legacy
  // boundary, and nothing is dead. An entry appearing under either is a decision, not a default.
  const used = new Set(INVENTORY.consumers.map((c) => c.classification));
  assert.deepEqual(
    [...used].sort(),
    ["keep", "migrate", "test-only"],
    "an entry appeared under `compatibility-required` or `remove`; say why in the PR before " +
      "widening this assertion",
  );
});

test("the compatibility <CopilotKit> boundaries are exactly the four migrated ones", () => {
  const renderSites = ALL_FILES.filter((f) => /<CopilotKit(?![A-Za-z])/.test(strip(f)));
  assert.deepEqual(
    renderSites.sort(),
    [...COMPAT_BOUNDARIES].sort(),
    "a compatibility <CopilotKit> boundary was added or removed; update the inventory and the " +
      "step that owns it",
  );

  for (const rel of COMPAT_BOUNDARIES) {
    assert.equal(
      classified.get(rel),
      "migrate",
      `${rel} renders the compatibility boundary and must be classified migrate`,
    );
  }
});

test("no production file constructs CopilotKit provider props by hand", () => {
  // Step 9 moves the shared props shape into getCopilotKitClientProps, so production code should
  // reach it through the helper. Tests are exempt for the same reason the no-new-v1 guard exempts
  // them: they legitimately build prop fixtures, and the dev probe registers a local agent.
  const isTestFile = (rel) =>
    rel.includes("/__tests__/") || /\.(test|spec)\.[jt]sx?$/.test(rel) || /-v1\.tsx$/.test(rel);
  const allowed = new Set([
    // The helper itself: the one place the shape is declared, and where Step 9 moves `agent`.
    "src/lib/copilotkit-client-props.ts",
    // The dev probe registers a local agent, so it needs no runtimeUrl at all.
    "src/app/dev/chat-virtualization/page.tsx",
  ]);

  const builders = ALL_FILES.filter((rel) => {
    if (allowed.has(rel) || isTestFile(rel)) return false;
    const code = strip(rel);
    return /\bruntimeUrl\s*[:=]/.test(code) || /\buseSingleEndpoint\b/.test(code);
  });
  assert.deepEqual(
    builders,
    [],
    `these production files build provider props outside the shared helper:\n${builders.join("\n")}`,
  );
});
