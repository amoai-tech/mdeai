# Maps and Places PR review invariants

## Source of truth

1. Changed MDE map/place source, tests and grounded provider records.
2. Canonical `.claude/skills/maps/SKILL.md`; actual installed Maps packages and official Google documentation.
3. Verified live API responses for claims about external Maps/Places behavior.

## Review invariants

- Do not invent or transform ungrounded coordinates, place IDs, addresses, ratings, prices, availability or opening hours.
- Review consistency of grounded listing/place identities across cards, maps, details and AI answers.
- Confirm Maps JavaScript AdvancedMarker setup includes a valid `mapId` where required.
- Use the minimum required Places API (New) field mask and account for billable fields; flag accidental broad retrieval.
- Keep server-side credentials server-side; browser keys need appropriate restrictions. Never ship secrets to client code.
- Preserve attribution and distinguish unknown external facts from verified, grounded provider data.
- For suspected API differences, inspect exact installed package versions and current official documentation; otherwise mark NEEDS VERIFICATION.
- Every actionable finding needs changed-file lines, a concrete failure path and targeted regression proof.
