# Kart Kingdom v2 — documentation

The journey from a single-player prototype to a deterministic, multiplayer,
full-WebGL kart racer — every decision, evaluation and artifact is committed
to this branch (`v2-webgl`) so anyone can follow along.

## Map

| Doc | What it is |
| --- | ---------- |
| [../README.md](../README.md) | Game readme (v1, to be updated at milestone) |
| [adr/](./adr/README.md) | Architecture decision records (numbered, one per decision) |
| [architecture.md](./architecture.md) | System architecture: modules, diagrams, data flow |
| [multiplayer.md](./multiplayer.md) | Multiplayer product & netcode handbook (flows, boundaries) |
| [simulator.md](./simulator.md) | The deterministic simulator: command queues, controllable time, fixtures |
| [journal/](./journal/) | Build journal: what was built, round by round, with evidence |
| [evaluations/](./evaluations/) | Verbatim critic reports + judge verdicts per evaluation round |

## The loop

```mermaid
flowchart LR
    B[Builder builds\nranked backlog item] --> C[Critics attack it\ngameplay | arch | visual | UX]
    C --> J[Judge: truth-check, rank,\n'next builder instruction']
    J -->|next item| B
    J -->|milestone bar met| D[Ship: docs + demos + release notes]
```

- Critic outputs live verbatim in `evaluations/round-N/`.
- The judge's ranked backlog + "next builder instruction" live in
  `evaluations/round-N/JUDGE.md`.
- The journal records what the builder did about each backlog item.

## Ground rules (see ADRs 0001/0002)

- All work on branch `v2-webgl` inside the `.worktrees/v2-webgl` worktree;
  `main` is never touched.
- Commit small and often: DCO `Signed-off-by:` + `Co-authored-by:` trailer;
  push to `origin` at every natural checkpoint.
- Every critique claim carries evidence (metric/log/screenshot/file:line).
  Every build records what it built and why it believed the judge asked for it.