# ADR-0002: Builder / Critic / Judge process

- **Status:** Accepted
- **Date:** 2025-08-26 (session)

## Context

A solo/agent-driven build can drift: features get built because they are
buildable, regressions creep into feel, and nobody is accountable for saying
"no". The project explicitly calls for an evaluate → build loop: **builder,
critic, judge**; and for the work to continue iteratively ("in subagents and
loops until…") rather than as a single pass.

## Decision

The program runs in rounds of three roles, all exercised through independent
subagents so each keeps a genuinely fresh context:

- **Critics** (evaluation-only, read-only on `src/`, scratch files under
  `scripts/scratch-*`): several run in parallel each round with narrow,
  adversarial remits (gameplay feel, architecture/netcode, visuals, UX/holes).
  Every finding must carry evidence produced by the critic itself: a metric, a
  log line, a screenshot reviewed with image reading, or a `file:line`.
- **Judge** consumes all critic reports plus the build log and produces a:
  - truth check (which findings are wrong / already handled),
  - de-duplicated, severity-ranked backlog (**P0 blocks the vision, P3 cosmetic**),
  - an explicit "next builder instruction", i.e. what the *next* round builds.
- **Builder** (the orchestrating agent + implementation subagents) only builds
  items from the judge's backlog, commits small and often (sign-off +
  `Co-authored-by:`), and records what was built in `docs/journal/` so the
  critics of the next round read the *same* ground truth.

Round N reports live in `docs/evaluations/round-N/` (critic outputs verbatim),
and the judge verdict in `docs/evaluations/round-N/JUDGE.md`. The loop continues
until the judge's acceptance criteria for the v2 milestone pass — not until the
backlog is empty (a backlog that never empties is fine; an unshipped bar is not).

## Consequences

- Findings are auditable: a reader can retrace every claim to evidence.
- The builder has a stable contract (the judge's ranked backlog) instead of
  reacting to whichever critic shouts loudest.
- Cost is bounded: each round is a fixed fan-out of 4 critics + 1 judge, run
  against the dev server + headless pipeline that is already part of CI.