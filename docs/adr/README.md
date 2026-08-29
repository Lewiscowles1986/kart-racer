# Decision Records

Architecture decisions for Kart Kingdom v2 live here, one ADR per numbered
file, `ADR-NNNN-kebab-title.md`. Each records context, decision, and
consequences so future readers can follow the journey.

| ADR | Title | Status |
| --- | ----- | ------ |
| [0001](./0001-worktree-and-branch-policy.md) | Worktree & branch policy (v2-webgl, main untouched) | Accepted |
| [0002](./0002-builder-critic-judge-process.md) | Builder / Critic / Judge evaluation & build loop | Accepted |
| [0003](./0003-deterministic-core.md) | Deterministic simulation core (fixed timestep, command queue, seeded RNG) | Accepted |
| [0004](./0004-multiplayer-netcode-and-boundaries.md) | Multiplayer transport & netcode; system boundaries with few/no servers | Accepted |
| [0005](./0005-presentation-split.md) | Sim/presentation split: headless-capable `sim` package | Accepted |
| [0006](./0006-feature-flags-and-compat.md) | Feature flags & save compatibility for the v2 migration | Accepted |