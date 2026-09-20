import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const checker = path.resolve("scripts/check-docs.mjs");
const roots = [
  "01-product", "02-architecture", "03-platform", "04-domains",
  "05-design", "06-testing", "07-operations", "08-strategy", "tasks",
];

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mde-check-docs-"));
  for (const dir of roots) fs.mkdirSync(path.join(root, "docs", dir), { recursive: true });
  fs.mkdirSync(path.join(root, "docs", "_archive"), { recursive: true });
  const base = {
    "docs/README.md": "# Docs\n",
    "docs/tasks/INDEX.md": "# Tasks\n",
    "docs/tasks/CONVENTIONS.md": "# Conventions\n",
    ...files,
  };
  for (const [rel, content] of Object.entries(base)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8" });
}

test("fails when an active document is missing from the canonical catalog", () => {
  const root = fixture({
    "docs/01-product/README.md": "---\ntitle: Product\nstatus: current\nupdated: 2026-09-20\nsource_of_truth: test\n---\n# Product\n",
    "docs/index-docs.md": "---\ntitle: Index\nstatus: canonical\nupdated: 2026-09-20\nsource_of_truth: test\n---\n# Index\n\n## Complete active documentation catalog\n\n| Area | Document | Type | Status |\n|---|---|---|---|\n| Root | [`README.md`](README.md) | Markdown | Current |\n| Root | [`index-docs.md`](index-docs.md) | Markdown | Canonical index |\n| Task conventions | [`tasks/INDEX.md`](tasks/INDEX.md) | Markdown | Current |\n| Task conventions | [`tasks/CONVENTIONS.md`](tasks/CONVENTIONS.md) | Markdown | Current |\n\n### Historical archive\n",
  });
  const result = run(root);
  assert.notEqual(result.status, 0, "catalog drift must fail check:docs");
  assert.match(result.stderr, /missing from index/i);
});

test("fails normalized docs that lose required frontmatter", () => {
  const root = fixture({
    "docs/04-domains/events/README.md": "# Events\n\n## Contents\n",
    "docs/index-docs.md": "---\ntitle: Index\nstatus: canonical\nupdated: 2026-09-20\nsource_of_truth: test\n---\n# Index\n\n## Complete active documentation catalog\n\n| Area | Document | Type | Status |\n|---|---|---|---|\n| Domains | [`04-domains/events/README.md`](04-domains/events/README.md) | Markdown | Current |\n| Root | [`README.md`](README.md) | Markdown | Current |\n| Root | [`index-docs.md`](index-docs.md) | Markdown | Canonical index |\n| Task conventions | [`tasks/INDEX.md`](tasks/INDEX.md) | Markdown | Current |\n| Task conventions | [`tasks/CONVENTIONS.md`](tasks/CONVENTIONS.md) | Markdown | Current |\n\n### Historical archive\n",
  });
  const result = run(root);
  assert.notEqual(result.status, 0, "normalized docs without frontmatter must fail");
  assert.match(result.stderr, /frontmatter/i);
});

test("fails stale instructional mdeapp-root references", () => {
  const root = fixture({
    "docs/06-testing/localhost-qa-runbook.md": "---\ntitle: QA\nstatus: current\nupdated: 2026-09-20\nsource_of_truth: test\n---\n# QA\n\nRun `cd /home/sk/mdeai/mdeapp`.\n",
    "docs/index-docs.md": "---\ntitle: Index\nstatus: canonical\nupdated: 2026-09-20\nsource_of_truth: test\n---\n# Index\n\n## Complete active documentation catalog\n\n| Area | Document | Type | Status |\n|---|---|---|---|\n| Testing | [`06-testing/localhost-qa-runbook.md`](06-testing/localhost-qa-runbook.md) | Markdown | Current |\n| Root | [`README.md`](README.md) | Markdown | Current |\n| Root | [`index-docs.md`](index-docs.md) | Markdown | Canonical index |\n| Task conventions | [`tasks/INDEX.md`](tasks/INDEX.md) | Markdown | Current |\n| Task conventions | [`tasks/CONVENTIONS.md`](tasks/CONVENTIONS.md) | Markdown | Current |\n\n### Historical archive\n",
  });
  const result = run(root);
  assert.notEqual(result.status, 0, "stale repo-root instructions must fail");
  assert.match(result.stderr, /stale repository root/i);
});
