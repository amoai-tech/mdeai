#!/usr/bin/env node
/**
 * The gate between the dry-run manifest and a real `supabase db push`.
 *
 * WHY THIS EXISTS
 * The preflight checks Git — it cannot see the database. The dry-run list is therefore the only
 * place an unreviewed migration becomes visible, which makes reading it the one step in the
 * release runbook that a convenient one-command wrapper must not silently skip.
 *
 * So `npm run push:migration` runs: preflight -> dry-run -> THIS -> push. This exits non-zero
 * unless the operator has seen the manifest and acknowledged it, which keeps the push from
 * happening as a side effect of running one command.
 *
 * Usage:
 *   MDEAI_CONFIRM_PUSH=1 npm run push:migration
 */

const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error(
    "SUPABASE_DB_URL is not set. Export the production connection string before releasing — never commit it.",
  );
  process.exit(1);
}

if (process.env.MDEAI_CONFIRM_PUSH !== "1") {
  console.error(
    [
      "",
      "Refusing to push: the dry-run manifest above has not been acknowledged.",
      "",
      "Read every line of it. If it lists anything outside the task you are releasing, STOP.",
      "Only once you have read it, re-run with the acknowledgement:",
      "",
      "  MDEAI_CONFIRM_PUSH=1 npm run push:migration",
      "",
    ].join("\n"),
  );
  process.exit(1);
}
