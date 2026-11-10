# PR #842 — Local-only Mastra Agent Builder: review and verification

**Date:** 2026-11-10. **Context:** MDE Phase A development, existing Next.js/CopilotKit/Mastra application. **Scope:** one dev-only Studio entry, shared existing Mastra registry, persisted local drafts, dependency isolation. Related Linear issue: [SAN-1255 · Keep only Mastra agents with a proven MDE responsibility](https://linear.app/amo100/issue/SAN-1255); not a claim the entire issue is complete.

## Verified review findings and disposition

| Finding | Evidence and disposition |
| --- | --- |
| Editor imported by all customer routes | **Valid, fixed:** previous `src/mastra/index.ts` imported `@mastra/editor` and `/ee` statically. Canonical `index.ts` now imports only `createMastraConfig`; Editor exists only in dedicated `src/mastra-studio/index.ts` loaded by CLI `--dir`. Build scan: 415 Next server JS bundles, **zero** forbidden imports. |
| OpenAI SDK 4 -> 7 runtime drift | **Valid, fixed:** Editor/Composio requires OpenAI 7 but the customer CopilotKit runtime must keep its known v4 path. `package.json` scoped override forces `@copilotkit/runtime` to resolve `openai@4.104.0`, while Studio-only deps retain their own version. Verified lockfile and on-disk resolution. |
| `.mastra/editor.db` deleted on CLI rebuild | **Valid, fixed:** editor storage is `file:<validated PWD/cwd>/.mde-builder.db`, explicitly ignored via `.gitignore`. Copied pre-existing ignored local editor DB, verified SQLite `integrity_check=ok`, 40 tables. No production DB or schema touched. |
| Unset/incorrect `PWD` | **Valid risk, fixed:** fall back to cwd only when it has the actual repo marker; incorrect root throws before persistence. Negative test covers missing PWD plus wrong cwd. Requiring PWD even when valid cwd already points to the repo was **not** necessary. |
| Missing Vercel/dev-phase tests | **Valid coverage gap, fixed:** 7 registry tests include Vercel with both opt-ins, Next production build, Next runtime, absent opt-in, missing PWD + bad cwd, valid Studio without `NEXT_PHASE`. The claim that a normal Mastra dev phase without `NEXT_PHASE` must be disabled was **incorrect**: that is the intended opt-in. |
| `/ee` is a production licensing risk | **Valid if deployed, fixed by isolation:** Mastra EE license allows internal development/testing, not unlicensed production. `@mastra/editor/ee` exists **only** in the separate dev-only entry, fails closed outside local `mastra dev`, and is absent from Next bundles. No EE production license or production feature enabled. |
| Local Builder could use app default remote storage | **Valid, fixed on latest review:** `createMastraConfig(localRuntimeStorage)` injects a dedicated `LibSQLStore` so the Builder never calls canonical `getMastraStorage()` or routes its chat memory to Supabase. Existing product runtime remains unchanged. |
| Builder script skipped remote DB warning and reused 4111 | **Valid, fixed on latest review:** exact existing `predev:agent` warning is reused as `predev:agent:builder`, and Builder defaults to independent port 4112. Warning is informational, not a development business gate. |
| Description template incomplete | **Valid, fixed:** PR body now fills ownership/layer, size budget, reuse, source receipts, test plan, evidence path, and self-review, with no placeholder claims. |

## Verification — actual executions

| Check | Result | Evidence |
| --- | --- | --- |
| Registry/Studio workspaces | **13 passed, 1 skipped** | `npx vitest run src/mastra/__tests__/registry-workspace.test.ts src/mastra/workspaces.test.ts` (`/tmp/mde-pr842-focused-final.log`) |
| Customer CopilotKit v2, auth, thread, info, stop contracts | **60/60 passed** | `npx vitest run src/__tests__/api/copilotkit-v2-contract.test.ts src/__tests__/api/copilotkit-info-authenticated.test.ts src/__tests__/api/copilotkit-stop-body.test.ts src/lib/copilotkit-auth.test.ts src/__tests__/api/copilotkit-thread-routes-authz.test.ts` (`/tmp/mde-pr842-copilot-runtime-tests.log`) |
| Mastra registry/schema gate | **PASS** | `npm run check:mastra`, expected 34 schema tables (`/tmp/mde-pr842-mastra-check.log`) |
| TypeScript | **PASS during Next build** | `npm run build` performs TS check; `npm run typecheck` separately run after code move (`/tmp/mde-pr842-typecheck-final.log`) |
| ESLint zero warnings | **PASS, exit 0** | `npm run lint` (`/tmp/mde-pr842-lint-check-final.log`) |
| Next production build | **PASS, exit 0** | `npm run build`, 54 generated static pages (`/tmp/mde-pr842-build-final.log`, `.exit=0`) |
| Production bundle isolation | **PASS, 415 server JS bundles** | `npm run check:builder:isolation` finds **zero** Editor/EE imports and locked CopilotKit OpenAI 4.104.0. Added at end of repository `floor` gate. |
| Built Next local HTTP | **PASS** | `next start -p 3004 -H 127.0.0.1`: `/rentals` 200, `/events` 200, signed-out `/api/copilotkit/info` 401 as expected; `/api/version` 503 in localhost because required Vercel commit SHA is absent (not a production deployment check) |
| Dedicated Mastra CLI | **PASS** | `npm run dev:agent:builder` (default port 4112): Studio + API on loopback, `GET /api/agents` 200 (9 canonical + 1 local builder), `GET /api/editor/builder/settings` 200 enabled, Studio UI 200. Original 4111 instance untouched. |
| Persistent local DB integrity | **PASS for migration + unchanged root file** | `.mastra/editor.db` copied only when new root file was absent; `.mde-builder.db` ignored; read-only SQLite integrity `ok` and 40 tables. Creating a new draft and reading it after a second restart not performed in this task. |

**CodeRabbit CLI:** Attempted `coderabbit review --agent -t uncommitted`; it failed due to missing local CodeRabbit/Git-provider authentication. Review findings remain untrusted until independently verified; GitHub review CI is the alternative.

**Post-review update:** Separate CLI Builder defaults to 4112 (normal Studio 4111), reuses the canonical remote-DB warning, and runs both runtime and editor databases locally; focused gates must be rerun at the final head.

**Not executed/certified:** Full end-to-end live LLM draft creation/reopen or customer paid Stripe transaction; they are not PR #842 acceptance. The complete `npm run floor` on the **new final pushed HEAD** and GitHub review gates must be checked before marking merge-ready; do not claim their old-head success as final proof. No public deployment, EE production license, merge, or payment was attempted.

## Material source receipts

| URL / source | Decision | Disposition | Implemented in | Verification |
| --- | --- | --- | --- | --- |
| https://mastra.ai/docs/studio/editor — MastraCompositeStore/editor storage | Separate local editor data from MDE memory | ADAPT | `src/mastra-studio/index.ts` | Studio CLI + SQLite integrity |
| https://mastra.ai/docs/agent-builder/overview — createBuilderAgent, dev UI | Builder agent is required for visual Builder | ADAPT for developer entry only | `src/mastra-studio/index.ts` | Studio `/api/agents` and builder settings |
| https://github.com/mastra-ai/mastra/blob/main/ee/LICENSE — development/test exception | No EE production rights; keep isolated from Next and deployment | ADAPT | `src/mastra/index.ts`, `src/mastra-studio/index.ts` | 415 bundle scan, 7 gate tests |
| https://docs.npmjs.com/cli/v11/configuring-npm/package-json#overrides — scoped dependency overrides | Keep CopilotKit's existing OpenAI SDK without downgrading Studio deps | ADAPT | `package.json`, `package-lock.json` | Lockfile and installed nested SDK proof, 60 API tests |
| Installed `mastra@1.37.0` CLI `mastra dev --help` — `--dir` | Use native separate entry rather than an app-wide dynamic import | ADAPT | `package.json` (`dev:agent:builder`) | Studio port 4113 live |

**Final gating:** Do not resolve review blockers until the updated HEAD, post-update CI, reviewer threads and unchanged runtime checks have been re-read. This is development tooling, **not** a new customer AI or evidence of public launch certification.
