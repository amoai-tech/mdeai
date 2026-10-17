import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import {
  createThrowawayIdentity,
  deleteThrowawayIdentity,
  getSupabaseAdmin,
  hasE2eEnv,
  signInAsOnOrigin,
  type ThrowawayIdentity,
} from "./helpers/auth";
import {
  countConciergeReplies,
  gotoConcierge,
  sendConciergeMessage,
  waitForConciergeReply,
  waitForCopilotIdle,
} from "./helpers/maps-layout";
import { establishVercelAutomationBypass } from "./fixtures/vercel-bypass";

/**
 * SAN-548 Task 4 — two-phase production rental-chat certification (opt-in).
 *
 * Phase A and Phase B are SEPARATE invocations so an operator can perform a real Vercel
 * redeploy between them. A new browser context is client isolation only — it does not
 * restart the server runtime, so it cannot substitute for the redeploy.
 *
 *   SAN548_PROD_CERT=1 SAN548_PHASE=A PROD_SMOKE_BASE_URL=https://www.mdeai.co PW_SKIP_WEBSERVER=1 \
 *     npx playwright test --project=prod-san548
 *   # verify the deployed SHA, run the real redeploy, verify the new deployment
 *   SAN548_PROD_CERT=1 SAN548_PHASE=B PROD_SMOKE_BASE_URL=https://www.mdeai.co PW_SKIP_WEBSERVER=1 \
 *     npx playwright test --project=prod-san548
 *
 * Phase A writes a versioned handoff to SAN548_STATE_FILE (default tmp/san548-cert.json);
 * Phase B validates it, proves reopen + semantic follow-up + privacy + database invariants,
 * and owns cleanup. Deliberately outside PROD_SPECS.
 */
const baseUrl = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const phase = (process.env.SAN548_PHASE ?? "").toUpperCase();
const enabled = process.env.SAN548_PROD_CERT === "1" && Boolean(baseUrl);
const stateFile = process.env.SAN548_STATE_FILE?.trim() || "tmp/san548-cert.json";
const isVercelPreview = /\.vercel\.app$/i.test(baseUrl ? new URL(baseUrl).hostname : "");
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "";
const STATE_VERSION = 1;
const MAX_STATE_AGE_MS = 24 * 60 * 60 * 1000;

// Fail fast: a typo in SAN548_PHASE must not produce a green run with zero phases
// (Playwright treats test.skip() as an expected skip, not a failure).
if (enabled && phase !== "A" && phase !== "B" && phase !== "RECOVER") {
  throw new Error(`SAN-548: set SAN548_PHASE to exactly A, B, or RECOVER (got: ${phase || "<empty>"})`);
}

type PhaseState = {
  version: number;
  status: "A-in-progress" | "A-complete";
  baseUrl: string;
  createdAt: string;
  threadId?: string;
  camilaEmail: string;
  camilaUserId: string;
};

function writeState(state: PhaseState): void {
  mkdirSync(dirname(stateFile), { recursive: true });
  const temp = `${stateFile}.tmp`;
  writeFileSync(temp, JSON.stringify(state, null, 2));
  renameSync(temp, stateFile); // atomic replace
}

function readStateOrNull(): PhaseState | null {
  if (!existsSync(stateFile)) return null;
  try {
    return JSON.parse(readFileSync(stateFile, "utf8")) as PhaseState;
  } catch {
    throw new Error(`SAN-548: ${stateFile} is corrupt; delete it and re-run Phase A`);
  }
}

function removeState(): void {
  rmSync(stateFile, { force: true });
  rmSync(`${stateFile}.tmp`, { force: true });
}

/** Runtime-validate the Phase B handoff before touching production. */
function requireCompleteState(): PhaseState {
  const state = readStateOrNull();
  if (!state) throw new Error(`SAN-548: no handoff at ${stateFile}; run Phase A first`);
  const problems: string[] = [];
  if (state.version !== STATE_VERSION) problems.push(`version ${state.version} != ${STATE_VERSION}`);
  if (state.status !== "A-complete") problems.push(`status is "${state.status}"`);
  if (state.baseUrl !== baseUrl) problems.push(`baseUrl ${state.baseUrl} != ${baseUrl}`);
  if (!state.threadId) problems.push("threadId missing");
  if (!state.camilaEmail || !state.camilaUserId) problems.push("Camila identity missing");
  const age = Date.now() - Date.parse(state.createdAt);
  if (!Number.isFinite(age) || age < 0 || age > MAX_STATE_AGE_MS) problems.push("handoff is stale");
  if (problems.length > 0) {
    throw new Error(`SAN-548: refusing Phase B — ${problems.join("; ")}. Run Phase A again.`);
  }
  return state;
}

/** Thread ids of every `agent/run` envelope the browser sends, in order. */
function recordRunThreadIds(page: Page): string[] {
  const ids: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || !new URL(request.url()).pathname.startsWith("/api/copilotkit")) {
      return;
    }
    try {
      const envelope = request.postDataJSON() as { method?: string; body?: { threadId?: string } } | null;
      if (envelope?.method === "agent/run" && envelope.body?.threadId) ids.push(envelope.body.threadId);
    } catch {
      // Not a JSON envelope; not a run.
    }
  });
  return ids;
}

async function persistedContaining(threadId: string, text: string): Promise<number> {
  const admin = await getSupabaseAdmin();
  const { count, error } = await admin
    .from("mastra_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .ilike("content", `%${text}%`);
  if (error) throw new Error(`mastra_messages read failed: ${error.message}`);
  return count ?? 0;
}

/** Thread-scoped working memory, stored on the thread row's metadata. */
async function threadWorkingMemory(threadId: string): Promise<Record<string, unknown> | null> {
  const admin = await getSupabaseAdmin();
  const { data, error } = await admin.from("mastra_threads").select("metadata").eq("id", threadId).maybeSingle();
  if (error) throw new Error(`mastra_threads read failed: ${error.message}`);
  const metadata = (data as { metadata?: unknown } | null)?.metadata;
  const wm = metadata && typeof metadata === "object" ? (metadata as { workingMemory?: unknown }).workingMemory : undefined;
  if (typeof wm === "string") return JSON.parse(wm) as Record<string, unknown>;
  if (wm && typeof wm === "object") return wm as Record<string, unknown>;
  return null;
}

async function threadOwner(threadId: string): Promise<string | null> {
  const admin = await getSupabaseAdmin();
  const { data, error } = await admin.from("mastra_threads").select('"resourceId"').eq("id", threadId).maybeSingle();
  if (error) throw new Error(`mastra_threads read failed: ${error.message}`);
  return (data as { resourceId?: string } | null)?.resourceId ?? null;
}

/**
 * Paginated column read. Supabase caps a single `.select()` at 1000 rows, and a
 * `.range()` page is only stable when ordered — so order by the unique `id` key.
 */
async function selectAllValues(
  table: "mastra_threads" | "mastra_messages",
  column: string,
): Promise<Array<string | null>> {
  const admin = await getSupabaseAdmin();
  const pageSize = 1000;
  const values: Array<string | null> = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from(table)
      .select(column)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<Record<string, string | null>>;
    for (const row of rows) values.push(row[column] ?? null);
    if (rows.length < pageSize) break;
  }
  return values;
}

/** Read-only orphan count: messages whose thread_id has no mastra_threads row. */
async function orphanMessageCount(): Promise<number> {
  const threadIds = new Set(
    (await selectAllValues("mastra_threads", "id")).filter((id): id is string => id !== null),
  );
  const messageThreadIds = await selectAllValues("mastra_messages", "thread_id");
  return messageThreadIds.filter((id) => id === null || !threadIds.has(id)).length;
}

async function signInWithBypass(page: Page, email: string): Promise<void> {
  if (isVercelPreview) await establishVercelAutomationBypass(page, baseUrl, bypassSecret);
  await signInAsOnOrigin(page, baseUrl, email);
  if (isVercelPreview) await establishVercelAutomationBypass(page, baseUrl, bypassSecret);
}

test.describe("SAN-548 two-phase production rental chat certification", () => {
  test.skip(!enabled, "opt-in: SAN548_PROD_CERT=1 + PROD_SMOKE_BASE_URL");

  test.beforeAll(() => {
    expect(hasE2eEnv(), "Supabase e2e credentials are required when a target is set").toBe(true);
  });

  test("Phase A — Camila records a rental chat and corrects the budget (5M -> 4M)", async ({ page }) => {
    test.skip(phase !== "A", "set SAN548_PHASE=A for this phase");
    test.setTimeout(600_000);

    // Refuse to clobber a live handoff: a pending one means Phase B has not run.
    const existing = readStateOrNull();
    if (existing) {
      throw new Error(`SAN-548: ${stateFile} already exists (status "${existing.status}"). Run Phase B or delete it first.`);
    }

    const camila = await createThrowawayIdentity("qa-san548-camila");
    try {
      // Recovery record FIRST: if the process dies mid-Phase-A, this names the identity.
      // Inside the try so a write failure also triggers identity cleanup.
      writeState({
        version: STATE_VERSION,
        status: "A-in-progress",
        baseUrl,
        createdAt: new Date().toISOString(),
        camilaEmail: camila.email,
        camilaUserId: camila.userId,
      });
      await signInWithBypass(page, camila.email);
      const runThreads = recordRunThreadIds(page);
      await gotoConcierge(page);

      // Turn 1 — the rental ask ("furnished" is not modeled in working memory; it lives in history).
      await sendConciergeMessage(page, "Busco un apartamento amoblado (furnished) de 2 habitaciones en Laureles, presupuesto 5 millones de pesos colombianos por mes. Responde en una frase.");
      await waitForCopilotIdle(page, 180_000);
      const threadA = runThreads.at(-1);
      expect(threadA, "Camila's first run named a thread").toBeTruthy();
      await expect.poll(() => persistedContaining(threadA!, "furnished"), { timeout: 30_000 }).toBeGreaterThan(0);

      // Turn 2 — correct the budget to 4M.
      await sendConciergeMessage(page, "Mejor cambia el presupuesto a 4 millones de pesos colombianos por mes. Responde en una frase.");
      await waitForCopilotIdle(page, 180_000);

      // Poll the CORRECTED state, not "lastRentalQuery exists" — turn 1 already created it.
      // maxPricePerNight is a derived USD/night search value; the canonical
      // amount+currency+period contract is a product decision (SAN-548).
      await expect
        .poll(async () => {
          const wm = await threadWorkingMemory(threadA!);
          const query = (wm?.lastRentalQuery ?? {}) as {
            neighborhood?: string;
            minBedrooms?: number;
            budgetType?: string;
          };
          return `${query.neighborhood}|${query.minBedrooms}|${query.budgetType}`;
        }, { timeout: 90_000 })
        .toBe("Laureles|2|monthly");

      // Handoff committed only once the thread is ready.
      writeState({
        version: STATE_VERSION,
        status: "A-complete",
        baseUrl,
        createdAt: new Date().toISOString(),
        threadId: threadA!,
        camilaEmail: camila.email,
        camilaUserId: camila.userId,
      });
    } catch (error) {
      // Cleanup succeeded -> no leak, drop the handoff. Cleanup failed -> KEEP a recovery
      // record so the production identity is not lost with the error.
      const cleaned = await deleteThrowawayIdentity(camila).then(
        () => true,
        () => false,
      );
      if (cleaned) {
        removeState();
      } else {
        try {
          writeState({
            version: STATE_VERSION,
            status: "A-in-progress",
            baseUrl,
            createdAt: new Date().toISOString(),
            camilaEmail: camila.email,
            camilaUserId: camila.userId,
          });
        } catch {
          // Best effort; the identity is still named in the log below.
        }
        console.error(
          `SAN-548: Phase A cleanup failed; retained ${stateFile}. Recover with: ` +
            `SAN548_PROD_CERT=1 SAN548_PHASE=RECOVER ... (identity ${camila.email} / ${camila.userId})`,
        );
      }
      throw error;
    }
  });

  test("Recovery — remove an abandoned Phase A identity and its rows", async () => {
    test.skip(phase !== "RECOVER", "set SAN548_PHASE=RECOVER for recovery");
    test.setTimeout(120_000);
    const state = readStateOrNull();
    if (!state) {
      console.info(`SAN-548: nothing to recover (no ${stateFile}).`);
      return;
    }
    await deleteThrowawayIdentity({ email: state.camilaEmail, userId: state.camilaUserId });
    const admin = await getSupabaseAdmin();
    const remaining = await admin
      .from("mastra_threads")
      .select("id", { count: "exact", head: true })
      .eq("resourceId", state.camilaUserId);
    if (remaining.error) throw new Error(`verify cleanup failed: ${remaining.error.message}`);
    expect(remaining.count ?? 0, "Camila's threads are gone").toBe(0);
    removeState();
    console.info(`SAN-548: recovered ${state.camilaEmail} and removed the handoff.`);
  });

  test("Phase B — after the redeploy: reopen, semantic follow-up, Roberto refused, invariants", async ({ browser }) => {
    test.skip(phase !== "B", "set SAN548_PHASE=B for this phase");
    test.setTimeout(900_000);
    const state = requireCompleteState();
    const camila: ThrowawayIdentity = { email: state.camilaEmail, userId: state.camilaUserId };
    let roberto: ThrowawayIdentity | undefined;
    const failures: string[] = [];
    try {
      const freshContext = await browser.newContext();
      try {
        const freshPage = await freshContext.newPage();
        await signInWithBypass(freshPage, camila.email);
        await gotoConcierge(freshPage);
        const saved = freshPage.locator(`[data-testid="nav-thread-item"][data-thread-id="${state.threadId}"]`).first();
        await expect(saved, "the saved chat is listed after the redeploy").toBeVisible({ timeout: 30_000 });
        await saved.click();
        await expect(freshPage.getByTestId("copilot-chat-region"), "history still shows furnished").toContainText(
          "furnished",
          { timeout: 30_000 },
        );

        const followThreads = recordRunThreadIds(freshPage);
        const repliesBefore = await countConciergeReplies(freshPage);
        await sendConciergeMessage(freshPage, "¿Qué presupuesto mensual estoy usando ahora? Responde en una frase.");
        await waitForConciergeReply(freshPage, repliesBefore, 180_000);
        expect(followThreads.at(-1), "the follow-up continues the same thread").toBe(state.threadId);
        // Routing continuity is not memory continuity: the answer must use the remembered
        // corrected budget, with its currency and period.
        const answer = await freshPage
          .getByTestId("copilot-chat-region")
          .getByTestId("copilot-assistant-message")
          .last()
          .innerText();
        expect(answer, "answer names the corrected amount").toMatch(/(?<!\d)4(?:\s*(?:millones?|M)\b|(?:[.,]000){2})(?!\d)/i);
        expect(answer, "answer names the currency").toMatch(/\b(?:COP|pesos(?:\s+colombianos)?)\b/i);
        expect(answer, "answer names the period").toMatch(/\b(?:mensual|mensuales|mes|month|monthly)\b/i);
      } finally {
        await freshContext.close();
      }

      roberto = await createThrowawayIdentity("qa-san548-roberto");
      const historyUrl = new URL(`/api/threads/${state.threadId}/messages`, baseUrl).toString();
      const otherContext = await browser.newContext();
      try {
        const otherPage = await otherContext.newPage();
        await signInWithBypass(otherPage, roberto.email);
        const refused = await otherPage.request.get(historyUrl);
        expect(refused.status(), "another signed-in user is refused").toBe(403);
        expect(await refused.text(), "no content leaks").not.toContain("furnished");
      } finally {
        await otherContext.close();
      }

      expect(await threadOwner(state.threadId!), "owner is still Camila").toBe(camila.userId);
      const admin = await getSupabaseAdmin();
      const anon = await admin
        .from("mastra_threads")
        .select("id", { count: "exact", head: true })
        .eq("resourceId", "anonymous");
      if (anon.error) throw new Error(`anonymous count failed: ${anon.error.message}`);
      expect(anon.count ?? 0, "no anonymous threads").toBe(0);
      expect(await orphanMessageCount(), "no orphan messages").toBe(0);
    } finally {
      for (const identity of [camila, roberto]) {
        if (!identity) continue;
        try {
          await deleteThrowawayIdentity(identity);
        } catch (error) {
          failures.push(`${identity.email}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (failures.length === 0) {
        removeState(); // certification complete: the handoff is spent
      } else {
        console.error(
          `SAN-548: cleanup failed; retaining ${stateFile} for recovery. ` +
            `Camila identity: ${camila.email} / ${camila.userId}`,
        );
        throw new Error(`SAN-548 Phase B cleanup failed — ${failures.join("; ")}`);
      }
    }
  });
});
