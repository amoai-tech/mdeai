import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docs = path.join(root, "docs");
const deprecatedTopLevel = [
  "strategy", "partners", "design", "ecommerce", "linear", "prd",
  "real-estate", "restaurant", "research", "wireframes",
  "copilotkit-mastra", "ai-second-brain",
];

const errors = [];
const allowedTopLevel = new Set([
  "README.md", "index-docs.md", "01-product", "02-architecture",
  "03-platform", "04-domains", "05-design", "06-testing",
  "07-operations", "08-strategy", "tasks", "_archive", ".obsidian",
]);

for (const entry of fs.readdirSync(docs, { withFileTypes: true })) {
  if (!allowedTopLevel.has(entry.name)) {
    errors.push(`noncanonical top-level docs entry: docs/${entry.name}${entry.isDirectory() ? "/" : ""}`);
  }
}

for (const name of deprecatedTopLevel) {
  if (fs.existsSync(path.join(docs, name))) {
    errors.push(`deprecated active docs tree recreated: docs/${name}/`);
  }
}

const activeRoots = [
  "01-product", "02-architecture", "03-platform", "04-domains",
  "05-design", "06-testing", "07-operations", "08-strategy", "tasks",
].map((name) => path.join(docs, name));
const activeFiles = [path.join(docs, "README.md"), path.join(docs, "index-docs.md")];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const rootDir of activeRoots) {
  activeFiles.push(...walk(rootDir).filter((file) => file.endsWith(".md")));
}

const linkPattern = /\[[^\]]*\]\(\s*<?([^\s)>]+)>?(?:\s+(?:"[^"]*"|\'[^\']*\'|\([^)]*\)))?\s*\)/g;
for (const file of activeFiles) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(linkPattern)) {
    const raw = match[1].trim();
    const target = raw.split("#")[0];
    if (!target || target.includes("://") || target.startsWith("mailto:")) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(target);
    } catch {
      errors.push(`${path.relative(root, file)} -> invalid URL encoding ${target}`);
      continue;
    }
    const resolved = path.resolve(path.dirname(file), decoded);
    const relativeToRoot = path.relative(root, resolved);
    if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
      errors.push(`${path.relative(root, file)} -> link escapes repository ${target}`);
      continue;
    }
    if (!fs.existsSync(resolved)) {
      errors.push(`${path.relative(root, file)} -> missing ${target}`);
    }
  }
}

if (errors.length) {
  console.error(`docs check: FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`docs check: PASS (${activeFiles.length} active Markdown files; deprecated trees absent; relative links valid)`);
