/** @type {import('dependency-cruiser').IConfiguration} */
const fs = require("node:fs");
const path = require("node:path");

const allowlistPath = path.join(__dirname, "scripts/copilotkit-v2-allowlist.json");
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8")).files;

/** Escape path segments for dependency-cruiser pathNot regexes. */
function pathToRegexPattern(filePath) {
  return filePath
    .split("/")
    .map((segment) => segment.replace(/[.*+?^$&()|[\]{}\\]/g, "\\$&"))
    .join("[/\\\\]");
}

// dependency-cruiser silently ignores a rule whose from.pathNot is an ARRAY
// when the rule's to matches a resolved node_modules path. It DOES honour the
// single alternation regex it would have built internally, so the exemption
// lists below are joined strings. Proven with a rule matrix during SAN-1401.
const REACT_MIGRATION_EXEMPTIONS = [
  ...allowlist.map(pathToRegexPattern),
  "[/\\\\]__tests__[/\\\\]",
  "\\.test\\.[jt]sx?$",
  "\\.spec\\.[jt]sx?$",
  "-v1\\.tsx$",
].join("|");

// The server runtime has NO production exemptions. Unlike the React migration
// ledger, only tests may name the legacy root package. Never add a -v1.tsx
// exemption: there is no legitimate production rollback twin for the server
// runtime.
const SERVER_RUNTIME_EXEMPTIONS =
  "[/\\\\]__tests__[/\\\\]|\\.test\\.[jt]sx?$|\\.spec\\.[jt]sx?$";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-new-copilotkit-react-ui",
      severity: "error",
      comment:
        "CK-V2-012 (SAN-910): @copilotkit/react-ui is v1-only — use @copilotkit/react-core/v2",
      from: {
        pathNot: REACT_MIGRATION_EXEMPTIONS,
      },
      to: {
        path: "@copilotkit/react-ui",
      },
    },
    {
      name: "no-new-copilotkit-react-core-v1",
      severity: "error",
      comment:
        "CK-V2-012 (SAN-910): import @copilotkit/react-core/v2 instead of v1 react-core",
      from: {
        pathNot: REACT_MIGRATION_EXEMPTIONS,
      },
      // to.path matches the RESOLVED entry file, not the module name, so match
      // the package tree and exclude only its approved /v2 subpath.
      to: {
        path: "node_modules/@copilotkit/react-core/",
        pathNot: "dist/v2/",
      },
    },
    {
      name: "no-new-copilotkit-runtime",
      severity: "error",
      comment:
        "SAN-1401: import @copilotkit/runtime/v2; the root @copilotkit/runtime package is legacy and must not return",
      from: {
        pathNot: SERVER_RUNTIME_EXEMPTIONS,
      },
      to: {
        path: "node_modules/@copilotkit/runtime/",
        pathNot: "dist/v2/",
      },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "typescript"],
    },
  },
};
