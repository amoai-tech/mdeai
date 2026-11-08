# SAN-1631 · MVP-3B — Let Ask MDE Change Existing Rentals and Events Filters

## Production proof

- Live SHA: `d537700f87f85d22f093b1f3f234db8d68fa3b35`
- `/api/version`: confirmed same SHA
- PR #828 certification: passed

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

- Rentals native command, 1440px
- Rentals native command, 390px
- Manual 2-bedroom filter and Back/Forward
- Cards/map pin parity, including the 390px map sheet
- Simulated CopilotKit 503 without unsafe duplicate Retry
- Stopped slow request cannot restore a 3-bedroom filter over the manual 2-bedroom choice
- Normal rental AI request completes with grounded results
- Events regression

Authenticated screenshots, traces and video are disabled by QA policy.

Local checks: `npm run lint`, `npx tsc --noEmit`, and `npm run floor` passed.
