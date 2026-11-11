# Vercel deployment and runtime

Use for Vercel preview/production deploys, project linking, environment variables, domains, rollbacks, deployment inspection, and Vercel-specific runtime configuration.

## Safety rule

Deploy as a **preview by default**. Use production only when the user explicitly requests production or an established release workflow already authorizes it.

## Inspect before acting

1. Check the git remote and current branch.
2. Check `.vercel/project.json` or `.vercel/repo.json` for project/team binding.
3. Check whether the available Vercel tooling is authenticated before relying on it.
4. Inspect `vercel.json`, `.vercelignore`, environment contracts, and the current repository deployment workflow.

## Preferred flow

- For a git-integrated project, prefer the repository's normal push/PR deployment path.
- For direct CLI deployment, use the currently installed Vercel CLI contract and avoid commands that silently link or mutate project state during discovery.
- Preserve team/project scope explicitly when the repository is linked to more than one account/team.
- Report the resulting deployment URL and status evidence.
- For environment/domain changes, verify the target scope (preview vs production) before mutation.
- For rollback, inspect the currently promoted deployment and intended rollback target before changing production traffic.

## Troubleshooting

Separate build failures, runtime failures, missing environment variables, domain/DNS issues, and project-linking problems before changing configuration. If the root cause is unknown, hand off to `systematic-debugging` while keeping this reference as domain context.
