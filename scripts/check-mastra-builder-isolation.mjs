/** Reject a local-only Mastra Editor/EE import in any customer Next.js bundle. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const output = join(process.cwd(), ".next/server");
if (!existsSync(output)) {
  console.error("check:builder:isolation requires a completed `npm run build`");
  process.exit(1);
}
const prohibited = /@mastra\/editor|@mastra\/agent-builder\/ee|createBuilderAgent|MastraEditor/;
let scanned = 0;
const violations = [];
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) scan(full);
    else if (entry.isFile() && entry.name.endsWith(".js")) {
      scanned++;
      if (prohibited.test(readFileSync(full, "utf8"))) {
        violations.push(full.slice(process.cwd().length + 1));
      }
    }
  }
}
scan(output);
if (scanned === 0 || violations.length > 0) {
  console.error(`check:builder:isolation FAILED: ${scanned} files scanned, ${violations.length} violations`, violations);
  process.exit(1);
}
const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const copilotOpenai = lock.packages?.["node_modules/@copilotkit/runtime/node_modules/openai"]?.version;
if (copilotOpenai !== "4.104.0") {
  console.error("check:builder:isolation FAILED: CopilotKit OpenAI SDK resolution drift", copilotOpenai);
  process.exit(1);
}
console.log(`check:builder:isolation OK: ${scanned} server JS bundles free of Mastra Editor/EE; CopilotKit SDK ${copilotOpenai}`);
