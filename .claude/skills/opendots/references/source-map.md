# OpenDots → MDE source map (SAN-1555 / SAN-1548)

**Reference status:** OpenDots is a template. PR
[#426](https://github.com/amoai-tech/mdeai/pull/426) records reviewed
[`ab39f2508f3fd23a949837622456f3d61a108e9a`](https://github.com/CopilotKit/OpenDots/commit/ab39f2508f3fd23a949837622456f3d61a108e9a);
confirm current SHA and merge state, do not silently track `main`.

- **REFERENCE ONLY:** https://github.com/CopilotKit/OpenDots
  → upstream architecture, version and license, into *this map*;
  verify pinned commit and avoid copying its SQLite workspace.
- **REFERENCE ONLY:** https://www.copilotkit.ai/opendots
  → product use cases, not proof of implemented MDE features. Destination:
  skill scope; verify against source and installed MDE code.
- **MODEL:** https://github.com/CopilotKit/OpenDots/blob/ab39f2508f3fd23a949837622456f3d61a108e9a/src/client/PageReviewCard.tsx
  → editable review card, progress/error/restore/conflict UI. Destination:
  current host review screen + partner suggestion cards from PRs
  [#403](https://github.com/amoai-tech/mdeai/pull/403) and
  [#404](https://github.com/amoai-tech/mdeai/pull/404), **only after
  verifying branch/base**. Verify accept/edit/ignore/reload in browser.
- **ADAPT pattern:** https://github.com/CopilotKit/OpenDots/blob/ab39f2508f3fd23a949837622456f3d61a108e9a/src/client/page-review-decision.ts
  → same thread/toolCall and exact draft identity; recover committed result
  before retry; modified draft conflicts. Destination: SAN-1548 shared
  contract and existing `src/lib/normalize-tool-envelope.ts` + domain
  actions (verify path exists on active branch). Test duplicate, response
  loss, stale draft and actual persisted receipt.
- **MODEL:** https://github.com/CopilotKit/OpenDots/blob/ab39f2508f3fd23a949837622456f3d61a108e9a/src/server/pages.ts
  → compare-and-set revision, atomic save and conflict semantics.
  Destination: existing Supabase RPC/server write owner, **not** SQLite
  tables/page-review subsystem. Test auth/RLS, concurrent update,
  idempotent replay and cancel writes nothing.

No new publishing/ownership/business eligibility prerequisites in Phase A.
The human review here controls **AI-authored edits**, not launch certification.
