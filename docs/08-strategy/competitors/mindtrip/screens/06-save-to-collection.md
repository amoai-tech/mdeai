# 06 — Save to a collection

Evidence: own session (`own-captures/auth-11-after-save.png`). The test save was undone and the account state verified afterwards.

## Layout

Small centred dialog titled "Save to a collection" with the property name and area under it.

## Content

- One default private list, **Your Places** (lock icon, "0 places").
- **Create a collection** (black plus button).
- Close (×).

## Behaviour

| Step | Result | Level |
| --- | --- | --- |
| Open from card heart or detail "Save" | Dialog opens | V |
| Tap the **Your Places** row | Saves, closes the dialog, shows toast "… saved to Your Places. **Change**" | V |
| After saving | Header button reads "Saved" with a filled heart; a small heart appears on the pin; "Saved by N" rose from 1 to 2 | V |
| Dialog count | Still said "0 places" right after saving (stale) | V |
| Tap the row again | Un-saves; "Saved by" returned to 1 | V |
| Network | No ordinary HTTP request in the capture window; transport unknown | V (negative) / U |

A mis-tap on the dialog's first button (Create a collection) did not create a collection (verified: only "Your Places" existed afterwards).

## MDE today

- `rental-card.tsx`: Save button is `disabled`, title "Save for later (coming soon)".
- `/saved` (`src/app/saved/page.tsx`) lists rows from `collections` via `loadUserCollections`. No code in `src/` writes `collections` or `saved_places` (searched `origin/main`).
- Tables exist in migrations: `collections`, `saved_places`.
- `/trips` workspace tabs "Ideas" and "Bookings" are stubs ("Phase 2").

## Worth adapting

Fix 3. Needs database permission rules checked by someone other than the builder (S4). Pattern worth copying: one tap saves to a private default list, a toast with "Change", a heart on both card and pin.
