# SAN-1631 · MVP-3B — Let Ask MDE Change Existing Rentals and Events Filters

## Production proof

- Live SHA: `d537700f87f85d22f093b1f3f234db8d68fa3b35`
- `/api/version`: confirmed same SHA
- PR #828 certification: passed

## Spec commit

`9780694edad70b9a099811f166a84951cfb576b3`

The production suite was run at this spec commit after the final stale-filter and completion assertions.

## Command

```bash
MDE_SAN1631_POSTMERGE=1 \
PROD_SMOKE_BASE_URL=https://www.mdeai.co \
PW_SKIP_WEBSERVER=1 \
npx playwright test \
  e2e/prod-san1631-page-control.spec.ts \
  e2e/prod-san1631-failure-recovery.spec.ts \
  --project=prod-smoke --workers=1 --retries=0
```

## Result

**5 passed** against production.

| Test | Scenarios |
| --- | --- |
| Page control — desktop 1440 | Fast path, exact URL, real cards or empty state, card↔map pins, manual 2BR, Back/Forward, Events→Rentals |
| Page control — mobile 390 | Same journey, 390px map sheet, no overflow |
| Failure recovery — 503 | Error shown, no unsafe duplicate Retry, fast path still works |
| Failure recovery — stopped slow request | Stale 3BR request cannot overwrite manual 2BR choice |
| Failure recovery — normal AI | POST 200, AG-UI `TOOL_CALL_RESULT`, `TEXT_MESSAGE_END`, `RUN_FINISHED`, no error |

Authenticated screenshots, traces and video are disabled by QA policy.

Local checks: `npm run lint`, `npx tsc --noEmit`, and `npm run floor` passed.
