# SAN-1600 local browser evidence
- Source: Next.js 16.4.3 local candidate on `http://localhost:3298`, using existing Supabase public event records. No checkout/payment write.
- `browser-results.json`: 8/8 read-only Chrome checks pass for Feria and Reina priced event at 320, 390, 768 and 1440px: HTTP 200, one h1, responsive no overflow, available Share/Back to Events/Ask MDE, Maps direction link; priced mobile CTA focuses the existing ticket picker.
- Screenshots: `after-feria-390.png`, `after-feria-1440.png`, `after-priced-390.png`.
- Verified focused Vitest 7/7 and TypeScript/targeted ESLint. Full `npm run floor` and broader E2E tracked separately.
- **Not fixed:** Feria's stored unrelated Unsplash ocean image or event-specific Dec 6 source proof; live admin content editor should correct image/verify source, not fake it in React. Stripe paid settlement and exact Concierge output not certified here.
