# Runtime and React

Current MDE baseline: `@copilotkit/react-core` 1.55.2 and `@copilotkit/runtime` 1.55.2. The app imports v2 React APIs and styles and uses `/api/copilotkit` as the same-origin runtime.

Inspect before editing:
- `src/components/copilot/copilot-kit-provider*`
- `src/lib/copilotkit-client-props.ts`
- `src/app/api/copilotkit/[[...path]]/route*`
- `src/lib/hooks/use-concierge-chat.ts`
- `src/lib/hooks/use-host-ops-chat.ts`

Protect auth/rate limiting and stable provider props. Verify current installed source when an API signature is uncertain; do not copy latest-main examples blindly into 1.55.2.
