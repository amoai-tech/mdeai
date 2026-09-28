# MDE Gemini background jobs

Use this reference when a Gemini task may run beyond a normal interactive request or when polling/background completion is being considered.

## Default routing

```text
Normal interactive request
→ existing CopilotKit/Mastra streaming

Long Gemini background interaction
→ background interaction only when it materially improves the workflow

Repeated polling becoming operationally expensive or unreliable
→ evaluate webhook completion flow
```

Do not introduce Gemini background jobs or webhooks just because the API supports them. Keep the existing MDE runtime unless the task genuinely needs long-running asynchronous Gemini work.

## Recommended completion flow

```text
User starts long research
→ MDE starts Gemini background interaction
→ store interaction/job id and state
→ Gemini completion reaches validated webhook
→ persist result idempotently
→ surface completion to MDE UI/user
```

## Webhook requirements

- Verify webhook authenticity using the mechanism documented by the current Gemini API.
- Make handlers idempotent; duplicate delivery must not duplicate writes or actions.
- Persist interaction/job IDs, status, timestamps, and terminal result/error state.
- Define retry, timeout, cancellation, and dead-letter/manual-recovery behavior.
- Reject events that cannot be tied to the expected MDE user/tenant/workflow.
- Do not expose secrets, raw credentials, or privileged payloads to the browser.
- Keep DB writes behind the authenticated backend/Supabase boundary.
- Log enough correlation data to diagnose a background run without logging sensitive content.

## Polling vs webhook

Polling is acceptable for a simple short-lived flow when frequency and duration are bounded. Prefer a webhook when polling would be long-lived, wasteful, or operationally fragile.

Official references:
- https://ai.google.dev/gemini-api/docs/webhooks
- https://ai.google.dev/gemini-api/docs/interactions-overview
