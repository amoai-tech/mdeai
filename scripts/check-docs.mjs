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
  "07-operations", "08-strategy", "tasks", "_archive",
]);

for (const entry of fs.readdirSync(docs, { withFileTypes: true })) {
  const name = entry.name;
  if (name.startsWith(".") && !allowedTopLevel.has(name)) continue;
  if (allowedTopLevel.has(name)) continue;

  if (deprecatedTopLevel.includes(name)) {
    errors.push(`deprecated active docs tree recreated: docs/${name}/`);
  } else {
    errors.push(`noncanonical top-level docs entry: docs/${name}${entry.isDirectory() ? "/" : ""}`);
  }
}


const allowedTaskFiles = new Set(["INDEX.md", "CONVENTIONS.md"]);
const tasksDir = path.join(docs, "tasks");
if (fs.existsSync(tasksDir)) {
  for (const entry of fs.readdirSync(tasksDir, { withFileTypes: true })) {
    if (!entry.isFile() || !allowedTaskFiles.has(entry.name)) {
      errors.push(`noncanonical docs/tasks entry: docs/tasks/${entry.name}${entry.isDirectory() ? "/" : ""}`);
    }
  }
}

const activeRootNames = [
  "01-product", "02-architecture", "03-platform", "04-domains",
  "05-design", "06-testing", "07-operations", "08-strategy",
];
const activeRoots = activeRootNames.map((name) => path.join(docs, name));
const activeFiles = [
  path.join(docs, "README.md"),
  path.join(docs, "index-docs.md"),
  path.join(tasksDir, "INDEX.md"),
  path.join(tasksDir, "CONVENTIONS.md"),
];

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

const normalizedMarkdown = new Set([
  "02-architecture/edge-functions.md",
  "04-domains/cafes-nightlife/README.md",
  "04-domains/ecommerce/api-contract.md",
  "04-domains/events/README.md",
  "04-domains/rentals/README.md",
  "04-domains/restaurants/README.md",
  "04-domains/trips/README.md",
  "04-domains/venues/README.md",
  "05-design/screens/product-wireframes/events/003-event-checkout.md",
  "06-testing/localhost-qa-runbook.md",
  "07-operations/README.md",
  "07-operations/graphify-reference.md",
  "index-docs.md",
]);
const requiredFrontmatterKeys = ["title", "status", "updated", "source_of_truth"];
for (const relative of normalizedMarkdown) {
  const file = path.join(docs, relative);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!frontmatter) {
    errors.push(`${path.relative(root, file)} -> missing required frontmatter`);
    continue;
  }
  const frontmatterLines = frontmatter[1].split("\n");
  for (const key of requiredFrontmatterKeys) {
    const prefix = `${key}:`;
    const keyIndex = frontmatterLines.findIndex((line) => line.startsWith(prefix));
    let hasValue = false;
    if (keyIndex >= 0) {
      const inlineValue = frontmatterLines[keyIndex].slice(prefix.length).trim();
      hasValue = inlineValue.length > 0 && !inlineValue.startsWith("#");
      if (!hasValue) {
        for (let index = keyIndex + 1; index < frontmatterLines.length; index += 1) {
          const line = frontmatterLines[index];
          if (line.length > 0 && !/^\s/.test(line)) break;
          if (/^\s+\S/.test(line) && !/^\s+#/.test(line)) {
            hasValue = true;
            break;
          }
        }
      }
    }
    if (!hasValue) errors.push(`${path.relative(root, file)} -> frontmatter missing ${key}`);
  }
}

const activeCatalogFiles = [
  path.join(docs, "README.md"),
  path.join(docs, "index-docs.md"),
  path.join(tasksDir, "INDEX.md"),
  path.join(tasksDir, "CONVENTIONS.md"),
];
for (const rootDir of activeRoots) {
  activeCatalogFiles.push(
    ...walk(rootDir).filter((file) => /\.(?:md|html|json)$/.test(file)),
  );
}

const docsRoot = path.resolve(docs);
const indexFile = path.resolve(docsRoot, "index-docs.md");
const docsPrefix = `${docsRoot}${path.sep}`;
if (!indexFile.startsWith(docsPrefix)) {
  errors.push("docs/index-docs.md -> resolved outside docs root");
} else if (fs.existsSync(indexFile)) {
  const indexText = fs.readFileSync(indexFile, "utf8");
  const catalogMatch = indexText.match(
    /## Complete active documentation catalog\n[\s\S]*?(?=\n### Historical archive\n)/,
  );
  if (!catalogMatch) {
    errors.push("docs/index-docs.md -> missing Complete active documentation catalog section");
  } else {
    const indexed = new Set();
    for (const line of catalogMatch[0].split("\n")) {
      const row = line.match(
        /^\|\s*[^|]*\|\s*\[[^\]]*\]\(([^)#]+)(?:#[^)]+)?\)\s*\|/,
      );
      if (!row) continue;
      const relative = decodeURIComponent(row[1]);
      if (indexed.has(relative)) {
        errors.push(`docs/index-docs.md -> duplicate active index entry ${relative}`);
      }
      indexed.add(relative);
    }
    const actual = new Set(
      activeCatalogFiles.map((file) => path.relative(docs, file).split(path.sep).join("/")),
    );
    for (const relative of [...actual].sort()) {
      if (!indexed.has(relative)) errors.push(`docs/index-docs.md -> missing from index ${relative}`);
    }
    for (const relative of [...indexed].sort()) {
      if (!actual.has(relative)) errors.push(`docs/index-docs.md -> extra active index entry ${relative}`);
    }
  }
}

const staleRepositoryRootChecks = new Map([
  ["06-testing/localhost-qa-runbook.md", ["/home/sk/mdeai"]],
  ["04-domains/ecommerce/api-contract.md", ["/home/sk/mdeai/mdeapp"]],
  ["07-operations/graphify-reference.md", ["/home/sk/mdeai/mdeapp", "cd /home/sk/mdeai", "mdeapp/graphify-out/", "mdeapp/src/"]],
  ["05-design/screens/mockups/explore.html", ["mdeapp/src/app/globals.css"]],
  ["05-design/screens/mockups/dashboard.html", ["mdeapp/src/app/globals.css"]],
  ["05-design/screens/mockups/cafes.html", ["mdeapp/src/app/globals.css"]],
  ["05-design/screens/mockups/venue.html", ["mdeapp/src/app/globals.css"]],
  ["05-design/images.md", ["mdeapp/src/"]],
  ["05-design/concierge-direction.md", ["mdeapp/src/app/globals.css"]],
  ["05-design/design-system.md", ["mdeapp/src/app/globals.css"]],
  ["05-design/design-process.md", ["mdeapp/src/app/globals.css"]],
  ["05-design/screens/partners/pricing-wireframe.html", ["docs/08-ai-services.md", "revenue/04-commerce-payments.md"]],
  ["04-domains/partners/product.md", ["./revenue/04-commerce-payments.md", "./07-revenue.md", "./08-ai-services.md", "./revenue/05-service-delivery.md", "./revenue/06-assets-and-social.md"]],
]);
for (const [relative, forbidden] of staleRepositoryRootChecks) {
  const file = path.join(docs, relative);
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, "utf8");
  for (const stale of forbidden) {
    if (text.includes(stale)) errors.push(`${path.relative(root, file)} -> stale repository root/reference ${stale}`);
  }
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
console.log(`docs check: PASS (${activeFiles.length} active Markdown files; ${activeCatalogFiles.length} catalog files; canonical tree, metadata, catalog, stale-root guards, and relative links valid)`);
