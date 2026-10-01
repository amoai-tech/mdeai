import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateCopilotKitAuth } from "@/lib/copilotkit-auth";
import { getCopilotKitClientProps } from "@/lib/copilotkit-client-props";
import {
  COPILOTKIT_BASE_PATH,
  COPILOTKIT_HANDLER_MODE,
  COPILOTKIT_TRANSPORT_AGREES,
  COPILOTKIT_USE_SINGLE_ENDPOINT,
} from "@/lib/copilotkit-transport";

/**
 * SAN-1357 Stage B+C · Step 11 — the combined contract for Steps 9 and 10.
 *
 * Steps 9 (client props) and 10 (runtime route) were only ever verifiable
 * together: the route's handler mode and the client's transport flag are two
 * halves of one agreement, and neither half is meaningful alone.
 *
 * These assertions read the real sources plus the real installed runtime, so a
 * revert of any single requirement fails here rather than in production.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

const ROUTE_REL = "src/app/api/copilotkit/[[...path]]/route.ts";
const CLIENT_PROPS_REL = "src/lib/copilotkit-client-props.ts";
const TRANSPORT_REL = "src/lib/copilotkit-transport.ts";

const V1_BOUNDARIES = [
  "src/components/chat/chat-provider.tsx",
  "src/components/copilot/copilot-kit-provider.tsx",
  "src/components/host/host-event-provider.tsx",
  "src/components/host/host-os-shell.tsx",
];

/**
 * The v1 compatibility provider's opening tag, assembled from parts.
 *
 * Deliberately NOT written as one literal: the consumer-inventory scanner looks
 * for that exact sequence to find compatibility boundaries, so spelling it out
 * here would make this test file look like a boundary it is not.
 */
const V1_PROVIDER_TAG = "<Copilot" + "Kit";
const V1_PROVIDER_OPEN = new RegExp(`${V1_PROVIDER_TAG}[\\s>]`);

/**
 * Import statements only. A commented-out import starts with `//`, so comment
 * prose can never satisfy or defeat these assertions — the failure mode that made
 * a regex-based scan report a false negative on the v1 allowlist guard.
 */
const importLines = (src: string) =>
  src.split("\n").filter((line) => /^\s*import\b/.test(line));

const SRC_REL = "src";
const PROD_EXT = /\.(ts|tsx|js|jsx)$/;

/**
 * Every production source file under `src/`, so the bare-runtime assertion below
 * covers the whole tree rather than one file.
 *
 * A previous revision built its `imports` list from the route source alone while
 * claiming repository-wide coverage — a false-wide assertion, which is worse than
 * a narrow one because it reads as proven.
 */
function walkProductionSources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walkProductionSources(full, acc);
    } else if (PROD_EXT.test(entry.name)) {
      acc.push(full.replace(/\\/g, "/"));
    }
  }
  return acc;
}

describe("Step 10 · route contract — v2 fetch handler", () => {
  const route = read(ROUTE_REL);
  const imports = importLines(route);

  it("has zero bare @copilotkit/runtime imports anywhere in src", () => {
    const files = walkProductionSources(SRC_REL);

    // Sanity: prove the walk actually traversed the tree, so an empty or broken
    // scan cannot pass this assertion vacuously.
    expect(files.length).toBeGreaterThan(100);

    // Whole-source match, not line-by-line: a multiline import puts its `from`
    // clause on a continuation line that does not itself begin with `import`, so
    // a line filter would miss it. `\s*` spans the newline. The trailing quote is
    // required, so the `/v2` subpath can never match the bare form.
    //
    // The bare specifier is deliberately NOT spelled out in this comment. These
    // scanners match raw source, so writing it here would make this file its own
    // offender — the same self-match that made the v1 compatibility inventory
    // count this suite as a provider boundary.
    const BARE_RUNTIME = /\bfrom\s*["']@copilotkit\/runtime["']|import\s*["']@copilotkit\/runtime["']/;
    const V2_RUNTIME = /\bfrom\s*["']@copilotkit\/runtime\/v2["']|import\s*["']@copilotkit\/runtime\/v2["']/;

    const offenders = files.filter((rel) => BARE_RUNTIME.test(read(rel)));

    expect(offenders).toEqual([]);

    // And prove the same walk finds the v2 import, so "no offenders" cannot be
    // explained by the scanner matching nothing at all.
    const v2Files = files.filter((rel) => V2_RUNTIME.test(read(rel)));
    expect(v2Files.length).toBeGreaterThan(0);
  });

  it("imports the runtime from @copilotkit/runtime/v2", () => {
    const copilotImport = imports.find((line) => line.includes("@copilotkit/runtime"));

    expect(copilotImport).toBeDefined();
    expect(copilotImport).toContain('from "@copilotkit/runtime/v2"');
    expect(copilotImport).toContain("createCopilotRuntimeHandler");
    expect(copilotImport).toContain("CopilotRuntime");
  });

  it("no longer uses the legacy single-route endpoint wrapper or its adapter", () => {
    expect(route).not.toContain("copilotRuntimeNextJSAppRouterEndpoint");
    expect(route).not.toContain("ExperimentalEmptyAdapter");
    expect(route).not.toContain("serviceAdapter");
  });

  it("passes basePath and mode explicitly, sourced from the shared transport module", () => {
    // Both must come from copilotkit-transport so the client and server halves
    // cannot drift: a change to either constant fails typecheck, not production.
    expect(route).toContain("basePath: COPILOTKIT_BASE_PATH");
    expect(route).toContain("mode: COPILOTKIT_HANDLER_MODE");
    expect(route).toContain("@/lib/copilotkit-transport");
    expect(route).toMatch(/createCopilotRuntimeHandler\(\{/);
  });

  it("does not select a custom runner", () => {
    // The default runner honours `runId`. @copilotkit/sqlite-runner ignores it,
    // which would silently widen a run-scoped Stop to the whole thread.
    // Assert on imports and code, never raw text — the route's comment names
    // sqlite-runner precisely to explain why it is not used.
    expect(imports.join("\n")).not.toContain("sqlite");
    expect(route).not.toMatch(/runner\s*:/);
    expect(route).toContain("sqlite-runner` ignores `runId`");
  });

  it("keeps the security gates ordered before the CopilotKit handler", () => {
    // Slice past the import block: `indexOf` over the whole file would find the
    // import lines first and report a false ordering.
    const body = route.slice(route.indexOf("async function handleCopilotKit"));
    expect(body.length).toBeGreaterThan(0);

    const order = [
      "checkCopilotKitDistributedIpHardCeiling",
      "supabase.auth.getUser",
      "resolveRequestedThread",
      "authorizeCopilotKitRequest",
      "checkCopilotKitDistributedRateLimit",
      "MASTRA_RESOURCE_ID_KEY",
      "buildHandler(",
    ];

    const positions = order.map((token) => {
      const index = body.indexOf(token);
      expect(index, `${token} missing from the handler body`).toBeGreaterThan(-1);
      return index;
    });

    // Strictly increasing means the documented order is the executed order.
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i], `${order[i]} must run after ${order[i - 1]}`).toBeGreaterThan(
        positions[i - 1]!,
      );
    }
  });
});

describe("Step 9 + 10 · transport agreement", () => {
  it("pins one matched single-route pair", () => {
    expect(COPILOTKIT_BASE_PATH).toBe("/api/copilotkit");
    expect(COPILOTKIT_HANDLER_MODE).toBe("single-route");
    expect(COPILOTKIT_USE_SINGLE_ENDPOINT).toBe(true);
    // A runtime read of this constant can never fail, so it proves nothing about
    // the type guard. It only keeps the export referenced. The real enforcement
    // is `tsc --noEmit`, proven by the mutation test below.
    expect(COPILOTKIT_TRANSPORT_AGREES).toBe(true);
  });

  it("the compile-time guard rejects a mismatched pair (mutation proof)", async () => {
    // Compile the REAL transport module twice through the TypeScript compiler
    // API: once as written, once with the server half flipped to multi-route.
    // The mutant must produce a diagnostic, or the guard is inert.
    const ts = await import("typescript");
    const source = read(TRANSPORT_REL);
    const MODE_LINE = 'COPILOTKIT_HANDLER_MODE = "single-route" as const';
    expect(source).toContain(MODE_LINE);

    const diagnosticsFor = (text: string) => {
      const fileName = "/virtual/copilotkit-transport.ts";
      const options = { strict: true, noEmit: true, skipLibCheck: true, types: [] };
      const host = ts.createCompilerHost(options);
      const original = host.getSourceFile.bind(host);
      host.getSourceFile = (name, languageVersion, ...rest) =>
        name === fileName
          ? ts.createSourceFile(name, text, languageVersion)
          : original(name, languageVersion, ...rest);
      const program = ts.createProgram([fileName], options, host);
      return ts.getPreEmitDiagnostics(program).filter((d) => d.file?.fileName === fileName);
    };

    expect(diagnosticsFor(source)).toHaveLength(0);
    const mutant = source.replace(MODE_LINE, 'COPILOTKIT_HANDLER_MODE = "multi-route" as const');
    const mutantErrors = diagnosticsFor(mutant);
    expect(mutantErrors.length).toBeGreaterThan(0);
    const errorLines = mutantErrors.map((d) => {
      const { line } = d.file!.getLineAndCharacterOfPosition(d.start ?? 0);
      return mutant.split("\n")[line];
    });
    expect(
      errorLines.some((line) => line?.includes("COPILOTKIT_TRANSPORT_AGREES")),
      "the mismatch must be reported on the agreement constant",
    ).toBe(true);
  });

  it("client props consume the shared constants rather than literals", () => {
    const clientProps = read(CLIENT_PROPS_REL);

    expect(clientProps).toContain("runtimeUrl: COPILOTKIT_BASE_PATH");
    expect(clientProps).toContain("useSingleEndpoint: COPILOTKIT_USE_SINGLE_ENDPOINT");
    expect(clientProps).toContain("@/lib/copilotkit-transport");
    // The transport module is the only place these values are written down.
    const transport = read(TRANSPORT_REL);
    expect(transport).toContain('"/api/copilotkit" as const');
    expect(transport).toContain('"single-route" as const');
  });

  it("the installed v2 handler really runs in single-route mode", async () => {
    // Behavioural proof, not a constant re-read: single-route treats EVERY path as
    // the one envelope endpoint, so a POST to /info is parsed as an envelope and
    // rejected as 400. Multi-route routes /info and answers 405 for a POST.
    process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";
    const { CopilotRuntime, createCopilotRuntimeHandler } = await import(
      "@copilotkit/runtime/v2"
    );
    const runtime = new CopilotRuntime({ agents: {} });

    const post = async (mode: "single-route" | "multi-route", url: string) => {
      const handler = createCopilotRuntimeHandler({
        runtime,
        basePath: COPILOTKIT_BASE_PATH,
        mode,
      });
      return (
        await handler(
          new Request(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          }),
        )
      ).status;
    };

    const singleRoute = await post("single-route", `http://x${COPILOTKIT_BASE_PATH}/info`);

    // If the production handler were left on the default multi-route mode, this
    // would be 405 and the assertion below would fail — the negative control.
    expect(singleRoute).toBe(400);
    expect(singleRoute).not.toBe(await post("multi-route", `http://x${COPILOTKIT_BASE_PATH}/info`));
  });

  it("single-route ignores the path, so path scoping — not the handler — bounds sibling prefixes", () => {
    // Honest statement of where sibling protection actually lives. Single-route
    // does not reject a path; it ignores it, because every request is the one
    // envelope endpoint. What keeps a sibling prefix out is the Next.js route
    // scope: the catch-all lives under this exact directory, so a sibling such as
    // /api/copilotkit-evil does not match it at all.
    expect(ROUTE_REL).toBe("src/app/api/copilotkit/[[...path]]/route.ts");
    expect(ROUTE_REL.startsWith("src/app/api/copilotkit/")).toBe(true);
    // And the only path-shaped decision in the route is the exact-suffix
    // deterministic E2E probe, which cannot match a sibling prefix.
    const route = read(ROUTE_REL);
    expect(route).toContain('pathname.endsWith("/api/copilotkit/info")');
  });
});

describe("Step 9 · agent identity carrier coupling", () => {
  const v1Consumers = V1_BOUNDARIES.filter((rel) => {
    const src = read(rel);
    return V1_PROVIDER_OPEN.test(src);
  });

  it("every boundary that renders the v1 compatibility provider must receive the v1 agent carrier", () => {
    expect(v1Consumers.length).toBeGreaterThan(0);

    const props = getCopilotKitClientProps("conciergeAgent") as {
      agentId?: string;
      agent?: string;
    };

    // Both names, same value. The v1 compatibility provider reads only `agent` and defaults to
    // "default", so dropping it would break every one of these boundaries while
    // still typechecking — see the client-props coupling note.
    expect(props.agent).toBe("conciergeAgent");
    expect(props.agentId).toBe("conciergeAgent");
  });

  it("the v1 helper the boundaries rely on is the one the bridge actually reads", () => {
    for (const rel of v1Consumers) {
      expect(read(rel)).toContain("getCopilotKitClientProps(");
    }
  });
});

describe("Step 11 · authorization rejects before the runtime (real evaluator)", () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request("http://x/api/copilotkit", { method: "POST", headers }) as never;

  const threadId = "11111111-1111-4111-8111-111111111111";

  it("rejects a foreign thread with 403", () => {
    const result = evaluateCopilotKitAuth(request(), {
      userId: "user-a",
      thread: { kind: "existing", threadId, resourceId: "user-b" },
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(403);
  });

  it("rejects an unauthenticated request that names a foreign thread with 401", () => {
    const result = evaluateCopilotKitAuth(request(), {
      userId: null,
      thread: { kind: "existing", threadId, resourceId: "user-b" },
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(401);
  });

  it("rejects a thread with no owning resource with 401", () => {
    const result = evaluateCopilotKitAuth(request(), {
      userId: "user-a",
      thread: { kind: "existing", threadId, resourceId: null },
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(401);
  });

  it("allows the owning user and derives the resource server-side", () => {
    const result = evaluateCopilotKitAuth(request(), {
      userId: "user-a",
      thread: { kind: "existing", threadId, resourceId: "user-a" },
    });

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.resourceId).toBe("user-a");
  });

  it("never lets a client-supplied resourceId override the server-derived one", () => {
    const result = evaluateCopilotKitAuth(
      request({ "x-copilotkit-resource-id": "user-victim", "x-resource-id": "user-victim" }),
      { userId: "user-a", thread: { kind: "existing", threadId, resourceId: "user-a" } },
    );

    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.resourceId).toBe("user-a");
  });
});
