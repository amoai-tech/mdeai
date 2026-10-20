// SAN-1552 · Turn one PR-Agent finding into grounded, readable parts.
//
// Pure functions only: no network, no model call, no GitHub client. They answer two questions the
// formatter must never guess at:
//   1. where does this finding actually point, and is that location in the real PR diff?
//   2. which labelled sections did the model actually write?
//
// A unified diff is the only authority for a line. A model-written path or line that is not in the
// diff is unverified, never "close enough".

const MAX_RANGE_SPAN = 400;
const MAX_CONTEXT_LINES = 14;
const MAX_CONTEXT_CHARS = 2_000;
export const MAX_TITLE_CHARS = 160;

/** Labels the formatter reads out of a finding body. Anything else is treated as prose. */
const KNOWN_LABELS = new Set([
  "severity",
  "problem",
  "technical",
  "plain english",
  "real-world example",
  "impact",
  "user impact",
  "root cause",
  "evidence",
  "failure scenario",
  "failure mode",
  "reproduction",
  "fix",
  "suggested fix",
  "proposed change",
  "recommended fix",
  "test",
  "verify",
  "verification",
  "verification state",
  "expected result",
  "status",
  "merge status",
  "summary",
]);

/**
 * Map a unified-diff `patch` to new-side line numbers.
 *
 * Only the RIGHT side of the diff can ground a finding: a deleted line does not exist at the new
 * head. `added` holds lines prefixed `+`; `newSide` also holds the context lines, which are the
 * only bytes allowed into `<code_context>`.
 */
export function parsePatchLines(patch) {
  const added = new Map();
  const newSide = new Map();
  let newLine = null;
  for (const raw of String(patch ?? "").split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (newLine === null) continue;
    if (raw === "") {
      // Trailing newline or a malformed hunk: stop trusting the counters rather than misnumber.
      newLine = null;
      continue;
    }
    if (raw.startsWith("+")) {
      added.set(newLine, raw.slice(1));
      newSide.set(newLine, raw.slice(1));
      newLine += 1;
      continue;
    }
    if (raw.startsWith("-") || raw.startsWith("\\")) continue;
    if (raw.startsWith(" ")) {
      newSide.set(newLine, raw.slice(1));
      newLine += 1;
      continue;
    }
    newLine = null;
  }
  return { added, newSide };
}

function locate(path, reason, extra = {}) {
  return { grounded: false, reason, path: path ?? null, startLine: null, endLine: null, context: "", ...extra };
}

/**
 * Ground one finding in the current PR diff. A finding is grounded only when its path is a changed
 * file AND its right-side range touches a line that this PR actually added. Everything else is
 * demoted to "Investigate" with the reason, never silently promoted.
 */
export function locateFinding(finding, changedFiles) {
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  const path = String(finding?.path ?? "");
  if (!path) return locate(null, "NO_PATH");

  const file = files.find((entry) => entry?.filename === path);
  if (!file) {
    const renamed = files.find((entry) => entry?.previous_filename === path);
    return renamed
      ? locate(path, "RENAMED", { renamedTo: renamed.filename })
      : locate(path, "NOT_CHANGED");
  }
  if (typeof file.patch !== "string" || file.patch.length === 0) {
    return locate(path, "PATCH_OMITTED");
  }

  const { added, newSide } = parsePatchLines(file.patch);
  const start = finding?.lineStart;
  if (!Number.isInteger(start) || start < 1) return locate(path, "NO_LINE");
  const rawEnd = Number.isInteger(finding?.lineEnd) ? finding.lineEnd : start;
  const low = Math.min(start, rawEnd);
  const high = Math.min(Math.max(start, rawEnd), low + MAX_RANGE_SPAN);

  let touchesAdded = false;
  for (let line = low; line <= high; line += 1) {
    if (added.has(line)) {
      touchesAdded = true;
      break;
    }
  }
  if (!touchesAdded) {
    return { grounded: false, reason: "LINE_NOT_CHANGED", path, startLine: low, endLine: high, context: "" };
  }

  const lines = [];
  for (let line = Math.max(1, low - 3); line <= high + 3 && lines.length < MAX_CONTEXT_LINES; line += 1) {
    if (newSide.has(line)) lines.push(newSide.get(line));
  }
  return {
    grounded: true,
    reason: "GROUNDED",
    path,
    startLine: low,
    endLine: high,
    context: lines.join("\n").slice(0, MAX_CONTEXT_CHARS),
    addedContext: [...added.entries()]
      .filter(([line]) => line >= low && line <= high)
      .map(([, text]) => text)
      .join("\n")
      .slice(0, MAX_CONTEXT_CHARS),
  };
}

/**
 * Read explicit labelled fields from one finding body.
 *
 * The model emits two shapes: line-leading `Label:` sections (MDE's contract) and flattened
 * `**Label:** value` runs (PR-Agent v0.45). Both are normalised to one line-leading form first, so
 * a value is never guessed from bare prose.
 */
export function labelMap(rawBody) {
  const normalized = String(rawBody ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\*\*[ \t]*([A-Za-z][A-Za-z0-9 /_-]{1,40})[ \t]*:?[ \t]*\*\*[ \t]*:?/g, "\n$1: ");
  const hits = [...normalized.matchAll(/(?:^|\n)[ \t>*#-]*([A-Za-z][A-Za-z0-9 /_-]{1,40})[ \t]*[:=][ \t]*/g)];
  const known = hits
    .map((hit) => ({ hit, key: hit[1].trim().toLowerCase() }))
    .filter((entry) => KNOWN_LABELS.has(entry.key));

  const map = new Map();
  for (let index = 0; index < known.length; index += 1) {
    const { hit, key } = known[index];
    const start = hit.index + hit[0].length;
    const next = known.slice(index + 1).find((entry) => entry.hit.index >= start);
    const value = normalized.slice(start, next ? next.hit.index : normalized.length).trim();
    if (value.length > 0 && !map.has(key)) map.set(key, value);
  }
  return map;
}

export function field(map, ...names) {
  for (const name of names) {
    const value = map.get(name);
    if (value) return value;
  }
  return "";
}

/** A readable title even when the model flattened the whole finding onto one line. */
export function findingTitle(finding) {
  const bold = /^\s*\*\*([^*\n]{3,160})\*\*/.exec(String(finding?.body ?? ""))?.[1]?.trim();
  if (bold && !KNOWN_LABELS.has(bold.toLowerCase().replace(/:$/, ""))) return bold;
  const first = String(finding?.body ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return (first ?? "Untitled finding").replace(/\*\*/g, "").replace(/^#+\s*/, "").slice(0, MAX_TITLE_CHARS);
}
