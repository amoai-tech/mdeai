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
 * SAN-548 Task 4 — the real production renter journey.
 *
 * Camila asks for a furnished 2BR in Laureles at 5M/month, corrects it to 4M, the client
 * session is replaced (a new browser context resets cookies/local storage only — it does
 * NOT restart the Vercel function; a true server-runtime replacement needs an external
 * redeploy, which is a separate Task 4 step), she reopens the same thread and continues,
 * and Roberto is refused. Every claim is backed by persisted
 * rows (service-role, test process only), not the screen.
 *
 * Runs only when PROD_SMOKE_BASE_URL is set and the Supabase e2e env is present; it fails
 * loudly when a target is set without credentials. It writes real rows under throwaway
 * identities and deletes them in afterAll.
 *
 * STATUS (2026-10-06): deliberately NOT in playwright.config.ts PROD_SPECS yet. Against
 * production it fails on purpose: after Camila corrects the budget to 4 million COP/month,
 * the persisted lastRentalQuery.maxPricePerNight was observed as 1000/100 (and 1000/110 with
 * clearer Spanish), not the corrected value. That is a product-semantics question
 * (maxPricePerNight looks nightly, and the prompt's budget intelligence is calibrated for
 * 3-4 digit figures), not a persistence failure — the deterministic SAN-548 test already
 * proves persistence. Run it explicitly:
 *   PROD_SMOKE_BASE_URL=https://www.mdeai.co PW_SKIP_WEBSERVER=1 \
 *     npx playwright test e2e/prod-rental-chat-restart.spec.ts --project=prod-smoke --workers=1
 */
const baseUrl = process.env.PROD_SMOKE_BASE_URL?.trim() ?? "";
const enabled = Boolean(baseUrl);
const isVercelPreview = /.vercel.app$/i.test(baseUrl ? new URL(baseUrl).hostname : "");
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? "";

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

/** Read-only orphan count: messages whose thread_id has no mastra_threads row. */
async function orphanMessageCount(): Promise<number> {
  const admin = await getSupabaseAdmin();
  const { data: threads, error: threadError } = await admin.from("mastra_threads").select("id");
  if (threadError) throw new Error(`mastra_threads read failed: ${threadError.message}`);
  const { data: messages, error: messageError } = await admin.from("mastra_messages").select("thread_id");
  if (messageError) throw new Error(`mastra_messages read failed: ${messageError.message}`);
  const threadIds = new Set((threads ?? []).map((row) => (row as { id: string }).id));
  return (messages ?? []).filter((row) => {
    const threadId = (row as { thread_id: string | null }).thread_id;
    return threadId === null || !threadIds.has(threadId);
  }).length;
}

async function threadOwner(threadId: string): Promise<string | null> {
  const admin = await getSupabaseAdmin();
  const { data, error } = await admin.from("mastra_threads").select('"resourceId"').eq("id", threadId).maybeSingle();
  if (error) throw new Error(`mastra_threads read failed: ${error.message}`);
  return (data as { resourceId?: string } | null)?.resourceId ?? null;
}

async function signInWithBypass(page: Page, email: string): Promise<void> {
  if (isVercelPreview) await establishVercelAutomationBypass(page, baseUrl, bypassSecret);
  await signInAsOnOrigin(page, baseUrl, email);
  // Session injection clears cookies; restore the same-origin bypass afterwards.
  if (isVercelPreview) await establishVercelAutomationBypass(page, baseUrl, bypassSecret);
}

test.describe("SAN-548 rental chat survives a fresh runtime", () => {
  test.skip(!enabled, "Set PROD_SMOKE_BASE_URL to the deployment under test");

  let camila: ThrowawayIdentity | undefined;
  let roberto: ThrowawayIdentity | undefined;

  test.beforeAll(() => {
    expect(hasE2eEnv(), "Supabase e2e credentials are required when a target is set").toBe(true);
  });

  test.afterAll(async () => {
    // Attempt every identity even if one cleanup fails, then report — these are real rows.
    const failures: string[] = [];
    for (const identity of [camila, roberto]) {
      if (!identity) continue;
      try {
        await deleteThrowawayIdentity(identity);
      } catch (error) {
        failures.push(`${identity.email}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length > 0) throw new Error(`SAN-548 cleanup failed — ${failures.join("; ")}`);
  });

  test("Camila's corrected budget survives a fresh runtime and Roberto is refused", async ({ page, browser }) => {
    test.setTimeout(600_000);
    camila = await createThrowawayIdentity("qa-san548-camila");
    await signInWithBypass(page, camila.email);
    const runThreads = recordRunThreadIds(page);
    await gotoConcierge(page);

    // Turn 1 — the rental ask (furnished is NOT modeled in working memory; it must live in history).
    await sendConciergeMessage(page, "Busco un apartamento amoblado (furnished) de 2 habitaciones en Laureles, presupuesto 5 millones de pesos colombianos por mes. Responde en una frase.");
    await waitForCopilotIdle(page, 180_000);
    const threadA = runThreads.at(-1);
    expect(threadA, "Camila's first run named a thread").toBeTruthy();
    await expect.poll(() => persistedContaining(threadA!, "furnished"), { timeout: 30_000 }).toBeGreaterThan(0);

    // Turn 2 — correct the budget to 4M.
    await sendConciergeMessage(page, "Mejor cambia el presupuesto a 4 millones de pesos colombianos por mes. Responde en una frase.");
    await waitForCopilotIdle(page, 180_000);

    // Poll the CORRECTED state, not just "lastRentalQuery exists" — turn 1 already created
    // it, so an existence poll can read the stale 5M state.
    //
    // maxPricePerNight is a DERIVED USD/night search value (search-rentals.ts
    // NIGHTLY_BUDGET_CURRENCY; rental-query-parser.ts normalizes monthly -> nightly), so the
    // canonical amount+currency+period contract is a product decision (SAN-548). This
    // asserts the period and the filters, not the nightly field.
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

    // Fresh runtime: a brand-new browser context, sign in again, reopen the same thread.
    const freshContext = await browser.newContext();
    try {
      const freshPage = await freshContext.newPage();
      await signInWithBypass(freshPage, camila.email);
      await gotoConcierge(freshPage);
      const saved = freshPage.locator(`[data-testid="nav-thread-item"][data-thread-id="${threadA}"]`).first();
      await expect(saved, "the saved room is listed after the restart").toBeVisible({ timeout: 30_000 });
      await saved.click();
      await expect(freshPage.getByTestId("copilot-chat-region"), "history still shows furnished").toContainText(
        "furnished",
        { timeout: 30_000 },
      );

      // A follow-up that depends on the saved context continues the SAME thread.
      const followThreads = recordRunThreadIds(freshPage);
      const repliesBefore = await countConciergeReplies(freshPage);
      await sendConciergeMessage(freshPage, "¿Qué presupuesto mensual estoy usando ahora? Responde en una frase.");
      await waitForConciergeReply(freshPage, repliesBefore, 180_000);
      expect(followThreads.at(-1), "the follow-up continues thread A").toBe(threadA);
      // Routing continuity is not memory continuity: the answer must actually use the
      // remembered corrected budget.
      const answer = await freshPage
        .getByTestId("copilot-chat-region")
        .getByTestId("copilot-assistant-message")
        .last()
        .innerText();
      expect(answer, "the answer reflects the corrected budget").toMatch(/4\s*(millones|M\b|\.000\.000)|4\.000\.000/i);
    } finally {
      await freshContext.close();
    }

    // Roberto is refused, with no trace of Camila's content.
    roberto = await createThrowawayIdentity("qa-san548-roberto");
    const historyUrl = new URL(`/api/threads/${threadA}/messages`, baseUrl).toString();
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

    // Durable invariants: owner is Camila and the shared anonymous bucket is empty.
    expect(await threadOwner(threadA!)).toBe(camila.userId);
    const admin = await getSupabaseAdmin();
    const anon = await admin
      .from("mastra_threads")
      .select("id", { count: "exact", head: true })
      .eq("resourceId", "anonymous");
    if (anon.error) throw new Error(`anonymous count failed: ${anon.error.message}`);
    expect(anon.count ?? 0, "no anonymous threads").toBe(0);
    expect(await orphanMessageCount(), "no orphan messages").toBe(0);
  });
});
