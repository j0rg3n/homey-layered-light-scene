---
name: issue-worker
description: One iteration of the unattended issue loop - sync the worker checkout, pick the oldest open GitHub issue labelled `ready` that has no open PR, and hand it to the feature-work skill on a fresh branch. Use from `/loop` (e.g. `/loop 30m /issue-worker`); run only in the dedicated worker worktree, never in a checkout with uncommitted work.
---

# Issue worker (one iteration)

Handles **at most one issue** per run, then stops.

## 1. Preconditions

- `git status --porcelain` must be empty (ignoring `.claude/worktrees/`). If it isn't, stop and report; don't clean up someone else's work.
- `gh auth status` must succeed. If it doesn't, stop and report.

## 2. Sync

```bash
git fetch origin --prune
git checkout --detach origin/master
```

In `com.fabeljet.layeredlight/`, run `npm ci` if `package-lock.json` changed since the last run (or `node_modules/` is missing).

## 3. Pick an issue

```bash
gh issue list --state open --label ready --json number,title,createdAt --limit 50
gh pr list --state open --json number,headRefName,body --limit 100
```

Skip issues that already have an open PR (a head branch `issue-<n>-*`, or `#<n>` in a PR body)
and issues labelled `needs-refinement` or `in-review`. Pick the oldest remaining one.

If none remain, report "no ready issues" and stop. That's a normal outcome.

## 4. Work it

```bash
git checkout -b issue-<n>-<short-slug> origin/master
```

Then invoke the `feature-work` skill with the issue number. It ends by either opening a PR
or asking for refinement on the issue.

## 5. Reset

Whatever the outcome:

```bash
git checkout --detach origin/master
```

Delete the local issue branch if it was pushed, or if the issue went to refinement. Report
one line: `#<n> → PR <url>`, `#<n> → needs-refinement`, or `no ready issues`.
