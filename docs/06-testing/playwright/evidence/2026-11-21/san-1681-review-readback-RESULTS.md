# SAN-1681 · RENTALS-COMPARISON — Review follow-up evidence

**PR:** https://github.com/amoai-tech/mdeai/pull/887
**Branch baseline:** dbd9c74ff2aa05b9c3efe53e0522c8d9c088f102

## Verified in the current review

- Existing official CopilotKit Table, Title, Badge and Caption remain; no alternate renderer.
- Same feature ID ordering is checked from real listing-card DOM through the official comparison action surface for both first-two and second/third requests.
- Real dedicated renter QA account reads the same selected apartments via a Supabase publishable client and RLS, not a service-role data query. The test compares table column names, neighborhood, bedrooms, furnished state and recorded monthly/nightly prices, and a missing field when present.
- No mock AG-UI events, fabricated apartment records or booking/payment mutations are introduced.
- Focused tests on updated branch baseline: **65 passed / 65 total** (six test files).
- `npm run typecheck` passed after correcting nullable QA-email handling.
- Focused file ESLint passed.
- Currency-format regression verifies the distinction between USD 99.50 and USD 99.60 while keeping integer COP rates whole.
- New-project comparison intent does not force the rental comparison tool.

## Real browser verification

Run from an authorized environment with the existing dedicated renter QA identity:

```bash
MDE_COMPARE_TABLE_QA=1 PW_SKIP_WEBSERVER=1 PROD_SMOKE_BASE_URL=http://localhost:3002 \
  npx playwright test e2e/prod-rental-comparison-table.spec.ts --project=prod-smoke --workers=1 --retries=0
```

**Strict on-branch renter-RLS readback + second-request replacement: PASS (2/2).** Real authenticated Next.js/CopilotKit/Mastra/Supabase journey on localhost:3002:
- 1440px: PASS (20.2s).
- 390px: PASS (17.3s), including unusually long apartment name and COP-price horizontal scroll stress.
- First comparison's displayed table identities, title, neighborhood, bedrooms, furnishing, and monthly/nightly rent matched rows read using the existing dedicated renter QA identity with a Supabase publishable client; missing fields were checked when present.
- A second Ask MDE request made comparison actions and column headings change to the second and third actual listed apartment identities. The test requires exactly one visible table and unchanged search cards with no new rental-search request.
- Underlying repair: give every CopilotKit A2UI comparison activity a unique surface ID so a later render does not delete/recreate a live surface; when the model sends both IDs and numbered positions, resolve positions using current authorized result order before considering IDs. Unit tests cover both.
- No user-visible rental, viewing, booking, or payment records were created. This proof is local signed-in integration E2E, **not** a hosted exact-head preview.

## Not run / limitations

- No payment, booking or viewing writes.
- No change to Supabase schema, migrations, roles or RLS policy.
- Earlier local full `npm run floor` failed at a pre-existing pinned PR-Agent Docker read-only file mount permission error. Do not weaken filesystem permissions for this feature.
- The hosted signed-in exact-head preview and post-merge production flow remain unverified in this evidence.
- GitHub required checks and current `main` integration must be rechecked on the final pushed commit.
