# ADR-0001: Worktree & branch policy (v2-webgl, main untouched)

- **Status:** Accepted
- **Date:** 2025-08-26 (session)

## Context

The repository's default branch `main` carries the shipped static deploy
(GitHub Pages) and prior experiment branches (`pre`, `boost`, `jump`). The v2
effort is a large, multi-week evolution: new architecture, multiplayer, new
features. Working directly on `main` would couple a migrating codebase to the
deployed Pages site and violate the reviewable-history principle ("commit
often, push, never rebase away the journey").

## Decision

1. All v2 work happens in a dedicated **git worktree** at
   `.worktrees/v2-webgl` (inside the session workspace, so tooling and
   sandboxes can address it) on a dedicated long-lived branch **`v2-webgl`**,
   forked from `main@1ccb5cd`.
2. `main` is never checked out again in this worktree; no branch switching
   back. `main`'s working tree is also protected from stray files by registering
   `.worktrees/` in `.git/info/exclude` — an *untracked*, repo-local ignore
   file, so no commit ever touches `main` to hide the worktree.
3. The `v2-webgl` branch is pushed to `origin` early and often. History is
   append-only: rebase/squash only ever on the worktree branch, never to
   rewrite what has been pushed.
4. Commits carry a DCO `Signed-off-by:` (machine default git identity) plus a
   `Co-authored-by:` trailer crediting the agent pair-programmer, e.g.
   `Co-authored-by: GLM Agent (DeepSeek Harness) <glm-agent@harness.local>`.

## Consequences

- `main` stays deployable at all times; the Pages deploy workflow keeps
  building whatever is checked out on each branch root.
- CI/deploy for `v2-webgl` gets its own Pages sub-path, consistent with the
  per-branch deploy workflow introduced on `main`.
- The worktree shares the repo object database, so a `git diff main...v2-webgl`
  in the primary checkout shows the whole delta of the journey at any time.
- Node resolution caveat: a worktree nested under the primary checkout
  resolves missing modules from the parent `node_modules`; we install an
  explicit worktree-local `node_modules` (with workspace-local npm cache) so
  new tooling does not leak into `main`.