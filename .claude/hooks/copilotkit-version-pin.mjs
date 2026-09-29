#!/usr/bin/env node
// PreToolUse hook for Edit|Write|MultiEdit.
//
// Blocks writes that would break MDE's CopilotKit contract:
//   1. introducing the @copilotkit/react|core|agent|sdk-js FULL-REWRITE package line;
//   2. making @copilotkit/react-core or @copilotkit/runtime a non-exact version
//      (a range, caret, tilde, `latest`, `*`), which makes the certified matrix unreproducible;
//   3. letting @copilotkit/react-core and @copilotkit/runtime drift apart.
//
// This hook deliberately does NOT hard-code a release number. The certified matrix is owned by
// SAN-1301 and recorded in Linear; baking a literal version into a guard means every future
// intentional upgrade is blocked by a stale string, which is the failure this hook previously had.
//
// MDE stays on the v2 API through the `/v2` subpath of the pinned packages
// (@copilotkit/react-core/v2). That is allowed; the full-rewrite package line is not.
//
// Exit 2 = block. Bypass for a deliberate upgrade: MDEAI_ALLOW_COPILOTKIT_VERSION_CHANGE=1.

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

/** Packages MDE must never depend on directly (the v1 full-rewrite line). */
const FULL_REWRITE_PACKAGES = ["react", "core", "agent", "sdk-js"];
/** Packages the certified matrix must keep exact and mutually aligned. */
const ALIGNED_PACKAGES = ["react-core", "runtime"];

/**
 * Resolve the repository-root-relative path without assuming a machine-specific parent
 * directory. The previous version hard-coded `<...>/mdeai/` and only unwrapped
 * `.claude/worktrees/`, so in a `.worktrees/<name>` checkout nothing matched and the hook
 * silently allowed every write. Walking up to the directory that holds both `package.json`
 * and `.claude/` is correct for the main checkout, either worktree layout, and nested paths.
 */
function toRepoRelative(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  if (!isAbsolute(normalized)) return normalized.replace(/^\.\//, "");
  let dir = dirname(normalized);
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, ".claude"))) {
      return relative(dir, normalized).replace(/\\/g, "/");
    }
    dir = dirname(dir);
  }
  return normalized.split("/").pop() ?? normalized;
}

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}

const input = payload?.tool_input || {};
const filePath = String(input.file_path || input.path || "");
const rel = toRepoRelative(filePath);

const isPackageJson = /(^|\/)package\.json$/.test(rel);
const isSrc =
  /^(src|supabase\/functions)\//.test(rel) && /\.(ts|tsx|js|jsx|mjs)$/.test(rel);
if (!isPackageJson && !isSrc) process.exit(0);

// Allow this hook itself, any hook test, and test doubles.
if (/\.claude\/hooks\//.test(rel) || /\.test\.(ts|tsx|mjs|js)$/.test(rel) || /__mocks__\//.test(rel)) {
  process.exit(0);
}

const bypass = process.env.MDEAI_ALLOW_COPILOTKIT_VERSION_CHANGE === "1";
const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const isExactVersion = (value) => typeof value === "string" && EXACT_VERSION.test(value);
const block = (message) => {
  process.stderr.write(`${message}\nTo bypass once: MDEAI_ALLOW_COPILOTKIT_VERSION_CHANGE=1\n`);
  process.exit(bypass ? 0 : 2);
};

const candidates = [];
if (typeof input.content === "string") candidates.push(input.content);
if (typeof input.new_string === "string") candidates.push(input.new_string);
if (Array.isArray(input.edits)) {
  for (const edit of input.edits) {
    if (typeof edit?.new_string === "string") candidates.push(edit.new_string);
  }
}
if (candidates.length === 0) process.exit(0);

// ---------- package.json: exact, aligned, no full-rewrite line ----------
if (isPackageJson) {
  const declared = new Map();
  for (const text of candidates) {
    const re = /"@copilotkit\/([a-z0-9-]+)"\s*:\s*"([^"]*)"/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      const [, pkg, rawVersion] = match;
      if (FULL_REWRITE_PACKAGES.includes(pkg)) {
        block(
          `BLOCKED: @copilotkit/${pkg} is the v2 FULL-REWRITE package line.\n` +
            `MDE uses the v2 API through the /v2 subpath of the certified packages ` +
            `(@copilotkit/react-core/v2, @copilotkit/runtime/v2) — not @copilotkit/react|core|agent|sdk-js.\n` +
            `Remove @copilotkit/${pkg} from dependencies.`,
        );
      }
      if (!ALIGNED_PACKAGES.includes(pkg)) continue;
      declared.set(pkg, rawVersion);
      if (!isExactVersion(rawVersion)) {
        block(
          `BLOCKED: @copilotkit/${pkg} must be an exact version, got "${rawVersion}".\n` +
            `A range, caret, tilde, "latest" or "*" makes the SAN-1301-certified matrix ` +
            `unreproducible, so the migration cannot be rolled back to a known-good graph.`,
        );
      }
    }
  }
  // A single-package edit carries only one side of the aligned pair, so fall back to the value
  // already committed at the target path. Without this, editing only `runtime` (or only
  // `react-core`) silently introduced exactly the drift this guard exists to prevent. Only exact
  // on-disk values are used, so a pre-existing range cannot manufacture a false alignment error.
  if (isAbsolute(filePath) && existsSync(filePath)) {
    try {
      const onDisk = JSON.parse(readFileSync(filePath, "utf8"));
      const deps = { ...(onDisk.dependencies ?? {}), ...(onDisk.devDependencies ?? {}) };
      for (const pkg of ALIGNED_PACKAGES) {
        const committed = deps[`@copilotkit/${pkg}`];
        if (!declared.has(pkg) && isExactVersion(committed)) declared.set(pkg, committed);
      }
    } catch {
      // Unparseable target: fall back to enforcing only what this edit declares.
    }
  }
  if (declared.has("react-core") && declared.has("runtime")) {
    const core = declared.get("react-core");
    const runtime = declared.get("runtime");
    if (core !== runtime) {
      block(
        `BLOCKED: @copilotkit/react-core ("${core}") and @copilotkit/runtime ("${runtime}") ` +
          `must stay version-aligned.`,
      );
    }
  }
}

// ---------- source: block only the full-rewrite line ----------
// MDE's supported surface (@copilotkit/react-core/v2: useAgent, useFrontendTool,
// useAgentContext, CopilotKitProvider, CopilotChatView) is allowed.
if (isSrc) {
  const fullRewriteMarkers = [
    { name: "bare @copilotkit/react-core (no /v2)", re: /from\s+["']@copilotkit\/react-core["']/ },
    { name: "@copilotkit/react (full-rewrite pkg)", re: /from\s+["']@copilotkit\/react["']/ },
    { name: "@copilotkit/core (full-rewrite pkg)", re: /from\s+["']@copilotkit\/core["']/ },
    { name: "@copilotkit/agent (full-rewrite pkg)", re: /from\s+["']@copilotkit\/agent["']/ },
    { name: "@copilotkit/sdk-js (full-rewrite pkg)", re: /from\s+["']@copilotkit\/sdk-js["']/ },
    { name: "BuiltInAgent (full-rewrite agent API)", re: /\bBuiltInAgent\b/ },
    { name: "createCopilotEndpoint (full-rewrite server)", re: /\bcreateCopilotEndpoint\b/ },
  ];
  for (const text of candidates) {
    for (const { name, re } of fullRewriteMarkers) {
      const match = text.match(re);
      if (match) {
        block(
          `BLOCKED: CopilotKit v2 FULL-REWRITE reference (${name}) in ${rel}.\n` +
            `Match: ${match[0]}\n` +
            `Use the /v2 subpath instead (@copilotkit/react-core/v2). Do NOT introduce the ` +
            `@copilotkit/react|core|agent|sdk-js package line — it breaks the Mastra runtime.`,
        );
      }
    }
  }
}

process.exit(0);
