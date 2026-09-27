import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const guardScript = fileURLToPath(new URL("./scripts/warn-remote-database-url.mjs", import.meta.url));

/** Run the local DATABASE_URL warning once before Vitest creates test workers. */
export default async function setup() {
  const guardEnv: NodeJS.ProcessEnv = { ...process.env };

  // Vitest sets NODE_ENV=test, which makes Next skip `.env.local`. The safety guard intentionally
  // inspects the development dotenv stack in its isolated child without changing Vitest's env.
  if (guardEnv.NODE_ENV === "test") Reflect.deleteProperty(guardEnv, "NODE_ENV");

  await new Promise<void>((resolve) => {
    const child = spawn(process.execPath, [guardScript], {
      cwd: process.cwd(),
      env: guardEnv,
      stdio: ["ignore", "ignore", "inherit"],
    });
    child.once("error", () => resolve());
    child.once("close", () => resolve());
  });
}
