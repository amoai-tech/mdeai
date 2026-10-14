/**
 * Mastra Workspace — read-only filesystem + mdeai governance skills.
 *
 * `basePath` is anchored to the package root (`MDEAPP_WORKSPACE` optional).
 * No `LocalSandbox` — shell/process workspace tools are never registered.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Workspace, LocalFilesystem, WORKSPACE_TOOLS } from "@mastra/core/workspace";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const workspaceBasePath =
  process.env.MDEAPP_WORKSPACE ?? join(packageRoot, "workspace");

export const workspaceToolsConfig = {
  [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: { enabled: false },
  [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: { enabled: false },
  [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: { enabled: false },
  [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: { enabled: false },
  [WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: { enabled: false },
} as const;

export const workspace = new Workspace({
  filesystem: new LocalFilesystem({
    basePath: workspaceBasePath,
    // Defense in depth: workspace tools must never mutate local source or skills.
    readOnly: true,
  }),
  skills: ["skills"],
  tools: workspaceToolsConfig,
});


/**
 * Vercel bundles an immutable deployment filesystem. The local-only skills
 * directory is not shipped with this repo, so attempting to initialize its
 * inherited workspace inside a Function fails with ENOENT (mkdir /vercel).
 * Keep the development workspace but do not attach it to hosted agents.
 * NODE_ENV is a fail-closed fallback when platform system variables are
 * disabled; no production mode should depend on an optional local skills dir.
 * Remote/packaged production skills need an explicitly reviewed backend.
 */
export function getRuntimeWorkspace() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1"
    ? undefined
    : workspace;
}
