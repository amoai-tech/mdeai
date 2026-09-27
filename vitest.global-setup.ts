import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const guardScript = fileURLToPath(new URL("./scripts/warn-remote-database-url.mjs", import.meta.url));

/** Run the local DATABASE_URL warning once before Vitest creates test workers. */
export default async function setup() {
  const guardEnv: NodeJS.ProcessEnv = { ...process.env };

  // Vitest storage sees ambient process.env. Do not inspect Next-only dotenv files here or the
  // guard could warn about a DATABASE_URL the test process never uses.
  await new Promise<void>((resolve) => {
    const child = spawn(process.execPath, [guardScript, "--no-env-files"], {
      cwd: process.cwd(),
      env: guardEnv,
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.once("error", () => resolve());
    child.once("close", () => resolve());
  });
}
