---
name: cloudinary
description: >-
  Use when MDE work explicitly introduces or changes Cloudinary uploads, assets, transformations, delivery URLs, signatures, webhooks, or media lifecycle behavior.
metadata:
  verified-package: "none — Cloudinary is not installed and not wired"
  verified-at: "2026-09-28"
---

# Cloudinary

Own Cloudinary-specific media behavior. Do not assume Cloudinary is active merely because the project may use media assets.

## Verified current state (2026-09-28)

No Cloudinary SDK is declared in `package.json`, and no source file under `src/**`
or `supabase/functions/**` imports Cloudinary or references a `cloudinary://` URL.
This skill is therefore **reference-only** today: it covers how to do Cloudinary work
correctly when it is introduced, not how to maintain a live integration. Confirm with
a fresh search before assuming an integration exists.

## Current-state rule

The current repo has no direct Cloudinary dependency or active source reference in the audited application paths. First verify that the task actually uses Cloudinary. If not, do not introduce it as architecture by default.

## Invariants

- Keep API secrets and signing secrets server-side.
- Prefer signed uploads/transformations when the operation requires trust.
- Validate resource ownership before destructive asset changes.
- Keep durable application metadata in the application database; Cloudinary is media infrastructure, not the business source of truth.
- Verify webhook signatures before applying side effects.

## Workflow

1. Confirm Cloudinary is in scope and inspect any existing integration.
2. Verify the current official API/SDK contract.
3. Define upload, transformation, deletion, and failure behavior.
4. Implement only the required integration surface.
5. Test invalid signatures, missing assets, and retry behavior when applicable.

## Handoff

Use `nextjs` for framework upload routes, `supabase` for application metadata/authorization, and the owning domain skill for product behavior.
