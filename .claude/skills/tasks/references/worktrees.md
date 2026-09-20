# Worktree and PR isolation

Use this for worktree creation, forensic cleanup, and branch isolation inside `tasks`. It replaces the retired `mde-worktree-pr-flow` skill.

## Core rule

Protect unrelated work first. A task should run from the correct base in an isolated workspace when code changes are substantial or the main checkout is dirty. Never discard, overwrite, or bulk-stage unrelated user work.

## Before creating a worktree

1. Resolve the intended base (`origin/main`, parent branch, or merge-base for stacked work).
2. Detect whether the current directory is already a linked worktree.
3. If using project-local `.worktrees/`, verify it is ignored.
4. Inspect existing worktrees and dirty state before creating another path.
5. Prefer a native worktree tool when the environment provides one; otherwise use Git directly.

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
git worktree list
git check-ignore -q .worktrees
```

If already in a linked worktree, continue there unless the task requires a different base. Do not create nested worktrees.

## Manual fallback

```bash
git fetch origin
git worktree add .worktrees/wt-san-NNN-slug -b ai/san-NNN-slug <resolved-base>
git -C .worktrees/wt-san-NNN-slug status --short
```

Do not hardcode developer-specific legacy app paths or obsolete split repositories. Treat the current repository root and resolved Git base as authoritative.

## Dependency setup

Use the repository's current package-manager/bootstrap contract. Do not reuse `node_modules` through symlinks. If an existing dependency tree is reused through hardlinks, treat it as read-only and never run an install that could mutate shared inodes; otherwise prefer a clean install in the worktree.

## Forensic cleanup

Before removing a worktree:

1. inspect `git status --short` and untracked files;
2. identify branch/upstream and whether commits are reachable from a durable remote/main;
3. back up or commit/stash work that must be preserved;
4. verify the related PR/merge state;
5. remove only after preservation is proven.

Useful canonical scripts now live under `.claude/skills/tasks/scripts/`. Keep them focused: guards answer one preflight question; audit/list scripts are read-only; backup runs before destructive cleanup.

- `guard-gitignore-worktrees.sh`
- `guard-worktree-context.sh`
- `audit-worktrees.sh`
- `list-worktrees.sh`
- `backup-worktree.sh`
- `preflight-worktree.sh`
- `tidy-worktrees.sh`
- `guard-worktree-size.sh`

Run script-specific `--help`/read the script before destructive cleanup. Treat cleanup as preservation-first, not "make status clean at any cost."

## Focused PR rule

One PR should represent one independently reviewable outcome. Split only at a real dependency/risk/ownership boundary; do not create extra PRs merely to record verification. Exact-head CI/review evidence becomes stale after a push.
