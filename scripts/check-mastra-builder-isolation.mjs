/** Reject Mastra Editor/EE code in both customer server and browser bundles. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const outputs = [join(root, ".next/server"), join(root, ".next/static")];
const prohibited = /@mastra\/editor|@mastra\/agent-builder\/ee|createBuilderAgent|MastraEditor/;
const violations = [];
const counts = [];

function scan(dir) {
  let scanned = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) scanned += scan(full);
    else if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
      scanned++;
      if (prohibited.test(readFileSync(full, "utf8"))) {
        violations.push(relative(root, full));
      }
    }
  }
  return scanned;
}

for (const output of outputs) {
  if (!existsSync(output)) {
    console.error("check:builder:isolation FAILED: both .next/server and .next/static are required after build");
    process.exit(1);
  }
  const count = scan(output);
  if (count === 0) {
    console.error("check:builder:isolation FAILED: expected JavaScript assets in both server and browser outputs");
    process.exit(1);
  }
  counts.push(count);
}

if (violations.length > 0) {
  console.error("check:builder:isolation FAILED: prohibited Mastra Editor/EE code in Next.js output");
  process.stderr.write(JSON.stringify({ serverFiles: counts[0], browserFiles: counts[1], violations }) + "\n");
  process.exit(1);
}

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const copilotOpenai = lock.packages?.["node_modules/@copilotkit/runtime/node_modules/openai"]?.version;
if (copilotOpenai !== "4.104.0") {
  console.error("check:builder:isolation FAILED: CopilotKit OpenAI SDK resolution drift");
  process.exit(1);
}
console.log("check:builder:isolation OK: server and browser JS free of Mastra Editor/EE; CopilotKit SDK 4.104.0");
process.stdout.write(JSON.stringify({ serverFiles: counts[0], browserFiles: counts[1] }) + "\n");
