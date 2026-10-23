# Ownership and Handoff Contract

## Boundaries

| Owner | May change | Must coordinate before changing |
| --- | --- | --- |
| Root coordinator | Issue scope, dependencies, merge order, accepted decisions | Any frozen contract or milestone gate |
| Art | Original PNG/audio source, palettes, previews, manifest metadata | Keys, dimensions, frame order, collision, required asset list |
| Development | Runtime implementation and authored config values | Events, schemas, test API, asset contract, accepted gameplay rules |
| QA | Tests, fixtures, evidence, bug Issues | Production behavior; product fixes belong to Development |
| Review | Findings and approval state | Must not author fixes in the PR under review |

The contract owner is the root coordinator. A consumer that finds ambiguity
posts `BLOCKED` with a concrete scenario and proposed decision; it MUST NOT
silently create a second convention. Contract changes update the relevant spec,
schema, fixtures, and affected Issue acceptance criteria in one PR.

## Required handoffs

Art hands Development and QA: manifest entry, source/output paths, 1x and 4x
contact sheet, frame labels, anchor/collision overlay, palette ID, and license
attestation. Development rejects an asset package that fails the schema or
changes keys/dimensions without a decision.

Development hands QA: linked Issue/PR, implemented event/config changes, exact
commands, fixed seed, test API version, reset steps, expected snapshots, known
risks, and performance impact. Configuration examples used by tests are shared
fixtures, not copied constants.

QA hands Review/root: browser and viewport, commit SHA, seed, exact steps,
expected/actual result, unit/E2E output, evidence paths, severity, and whether
the result blocks acceptance. Nondeterministic failures include at least three
runs and event snapshots.

Review hands root: scope/spec assessment, prioritized findings (`P0`–`P3`),
verification performed, unresolved threads, and approval state. P0/P1 blocks;
P2 requires a fix or accepted follow-up Issue.

## Cross-contract acceptance checklist

- IDs referenced by config exist in config or the manifest exactly once.
- Every manifest key resolves to an existing, case-matching file.
- Every cross-system emit is in `GameEventMap` and preserves envelope ordering.
- Gameplay randomness is sourced from the named deterministic stream.
- UI reads events/snapshots and does not directly mutate `GameScene` entities.
- Stored data passes v1 validation and corrupt/denied-storage tests.
- Asset sheets match direction/frame order and collision overlays.
- Test evidence states seed, viewport, browser, commit, and commands.
