---
name: cloudinary
description: >-
  Use when MDE work explicitly introduces or changes Cloudinary uploads, assets, transformations, delivery URLs, signatures, webhooks, or media lifecycle behavior.
---

# Cloudinary

Own Cloudinary-specific media behavior. Do not assume Cloudinary is active merely because the project may use media assets.

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
