# SAN-1332 PR-Agent Evidence Design

**Goal:** Give PR-Agent deterministic, exact-version framework evidence before it makes API/version claims.

## Architecture

Trusted base-branch code builds a small evidence artifact from base/head lockfile metadata and changed filenames. The artifact records SHA provenance, exact resolved package versions, touched domains, and confidence state. PR-Agent consumes the artifact as prompt context while skills and policy remain trusted-base controlled.

## Security boundary

- Evidence-builder code, policy, and skills come from the trusted base checkout.
- PR head data is treated as untrusted input only.
- Never execute PR-controlled scripts during evidence collection.
- Missing or ambiguous evidence downgrades framework/API findings to `NEEDS VERIFICATION` and cannot independently block merge.

## Verification

Deterministic tests cover lockfile resolution, base/head version changes, domain detection, malformed/missing evidence, skill-budget completeness, `proxy.ts`, and `getClaims()` regressions. Full Floor remains authoritative; live PR-Agent certification is a separate final proof.
