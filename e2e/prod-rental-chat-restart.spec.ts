import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
 * Phase A writes the fixture to SAN548_STATE_FILE (default tmp/san548-cert.json). Phase B
 * reads it, proves reopen + semantic follow-up + privacy + database invariants, and owns
 * cleanup (resilient: it attempts every identity). Deliberately outside PROD_SPECS.
 */
const baseUrl = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const phase = (process.env.SAN548_PHASE ?? "").toUpperCase();
const enabled = process.env.SAN548_PROD_CERT === "1" && Boolean(baseUrl);
const stateFile = process.env.SAN548_STATE_FILE?.trim() || "tmp/san548-cert.json";
const isVercelPreview = /\.vercel\.app$/i.test(baseUrl ? new URL(baseUrl).hostname : "");
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "";

type PhaseState = { threadId: string; camilaEmail: string; camilaUserId: string };

function writeState(state: PhaseState): void {
  mkdirSync(dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

function readState(): PhaseState {
  return JSON.parse(readFileSync(stateFile, "utf8")) as PhaseState;
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

/** Paginated column read: Supabase caps a single `.select()` at 1000 rows. */
async function selectAllValues(
  table: "mastra_threads" | "mastra_messages",
  column: string,
): Promise<Array<string | null>> {
  const admin = await getSupabaseAdmin();
  const pageSize = 1000;
  const values: Array<string | null> = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin.from(table).select(column).range(from, from + pageSize - 1);
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
  // Session injection clears cookies; restore the same-origin bypass afterwards.
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
    const camila = await createThrowawayIdentity("qa-san548-camila");
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
    // maxPricePerNight is a derived USD/night search value (search-rentals.ts
    // NIGHTLY_BUDGET_CURRENCY; rental-query-parser.ts normalizes monthly -> nightly), so the
    // canonical amount+currency+period contract is a product decision (SAN-548).
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

    writeState({ threadId: threadA!, camilaEmail: camila.email, camilaUserId: camila.userId });
    // Phase A intentionally does NOT clean up: Phase B needs Camila after the redeploy.
  });

  test("Phase B — after the redeploy: reopen, semantic follow-up, Roberto refused, invariants", async ({ browser }) => {
    test.skip(phase !== "B", "set SAN548_PHASE=B for this phase");
    test.setTimeout(900_000);
    const state = readState();
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
        expect(answer, "answer names the corrected amount").toMatch(/4\s*(millones|M\b|\.000\.000)/i);
        expect(answer, "answer names the currency").toMatch(/COP|pesos/i);
        expect(answer, "answer names the period").toMatch(/mensual|mes|month|monthly/i);
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

      expect(await threadOwner(state.threadId), "owner is still Camila").toBe(camila.userId);
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
      if (failures.length > 0) throw new Error(`SAN-548 Phase B cleanup failed — ${failures.join("; ")}`);
    }
  });
});
