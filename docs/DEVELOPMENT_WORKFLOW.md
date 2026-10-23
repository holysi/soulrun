# Multi-Agent Development Workflow

## Source of Truth

All specifications, dependencies, progress, decisions, and acceptance evidence live in GitHub Issues in `holysi/soulrun`. Chat messages dispatch work, but never replace an Issue update. One umbrella issue, `[EPIC] 魂夜輪迴 v1`, owns the scope, child checklist, milestone state, risks, and current summary.

The root coordinator is the only workflow owner. It freezes acceptance criteria, orders dependencies, assigns work, resolves conflicts, updates the Epic, approves milestone gates, and controls merge order. It normally does not implement feature work.

## Agent Roles

| Role | Owns | Must not do |
| --- | --- | --- |
| Art agent | Art bible, ImageGen references, palettes, sprites, tiles, VFX, previews, asset manifest | Change gameplay rules or undocumented asset contracts |
| Development agent | TypeScript/Phaser systems, levels, UI, storage, audio integration, performance | Invent requirements or silently alter approved art contracts |
| QA agent | Vitest, Playwright, deterministic fixtures, browser/manual testing, bug reports | Hide product fixes inside test-only PRs |
| Review agent | Independent correctness, architecture, performance, security, asset, and spec review | Review its own implementation |
| Root coordinator | Issues, dependencies, assignments, status roll-up, integration, merge and release gates | Become the default feature author |

With four concurrent slots, root remains active while Art, Development, and QA work. Review replaces a worker after a PR becomes reviewable.

## GitHub Issue Model

Each Issue delivers one independently verifiable result and contains:

- Context, user outcome, in-scope and out-of-scope items.
- Acceptance criteria as checkboxes.
- `Blocked by #N` and `Blocks #N` dependencies.
- Expected files/assets and cross-agent contracts.
- Test plan, evidence requirements, owner role, and linked PR.
- A status log using `STARTED`, `PROGRESS`, `BLOCKED`, `HANDOFF`, and `DECISION` entries.

Use templates for `Epic`, `Feature`, `Asset`, `Test`, `Review`, and `Bug`. Use small, orthogonal label groups:

- Type: `type:epic`, `type:feature`, `type:asset`, `type:test`, `type:review`, `type:bug`, `type:docs`.
- Area: `area:art`, `area:gameplay`, `area:level`, `area:ui`, `area:audio`, `area:infra`, `area:qa`.
- Status: `status:ready`, `status:in-progress`, `status:blocked`, `status:review`, `status:verified`.
- Priority: `priority:p0` through `priority:p3`.

Only one status label is allowed. Agent names are not labels; ownership belongs in the Issue and assignment record.

## Milestones and Planned Issue Graph

Milestones are `M0 Foundation & contracts`, `M1 Graveyard vertical slice`, `M2 Three-stage loop`, `M3 Content & polish`, and `M4 Release candidate`. A milestone passes only when every acceptance Issue is verified.

Planned Issues, numbered here only as creation order:

1. Epic and complete MVP acceptance checklist.
2. Freeze gameplay config, scene events, storage, test hooks, and asset contracts.
3. Scaffold Vite, TypeScript, Phaser, linting, tests, and CI.
4. Create the art bible, asset manifest, palette, and vertical-slice assets.
5. Create Vitest/Playwright harnesses and deterministic seed fixtures.
6. Implement player input, aiming, camera, collision, and auto-attack.
7. Implement XP, upgrades, weapons, passives, mastery, and scoring.
8. Implement map, wave, enemy, and Boss data pipelines.
9. Implement Cemetery, Graveyard Guardian, and its enemies.
10. Implement Dungeon, Skeleton Warden, and its enemies.
11. Implement Inferno, Flame Demon, and its enemies.
12. Implement Boss completion, transitions, three-stage looping, and scaling.
13. Implement title, HUD, upgrade, pause, results, settings, and local records.
14. Produce final sprites, tiles, VFX, manifests, and visual previews.
15. Produce and integrate original music and sound effects.
16. Complete unit, E2E, browser, gameplay, and asset QA.
17. Profile pooling, entity caps, 60 FPS, resizing, and accessibility.
18. Run an independent MVP code/spec/asset audit and resolve findings.
19. Verify README, clean build, release checklist, and candidate artifact.

Critical path: `2 → 3 → 6 → 7 → 9–11 → 12 → 16/17 → 18 → 19`. Art follows `2 → 4 → 14` in parallel and joins before Issue 18.

## Execution Waves and Handoffs

1. **Wave 0:** root creates the Epic, contracts, labels, milestones, and templates.
2. **Wave 1:** Art delivers Issue 4; Development delivers Issue 3; QA prepares Issue 5. Review rotates in for foundation and contract PRs.
3. **Wave 2:** Art advances Issue 14; Development implements Issues 6–8; QA finishes deterministic harnesses. Review gates each PR.
4. **Wave 3:** Development completes Issues 9–13 while Art finishes content and QA builds Issue 16 coverage.
5. **Wave 4:** Audio, integration, performance, full QA, independent audit, and release candidate.

Art hands Code a manifest containing asset key, path, frame size/order, anchor, animation rate, palette, PNG sheet, and contact-sheet preview. Code hands QA a fixed seed, debug/test entry point, reset procedure, config schema, and commands. QA reports browser, viewport, seed, exact reproduction, expected/actual result, evidence, and severity. Authors hand Review the Issue, risks, test output, visual evidence, and performance impact.

## Branches, Pull Requests, and Quality Gates

Use `codex/<issue-number>-<short-name>`. One Issue normally maps to one PR; the PR includes `Closes #N`, scope/non-goals, acceptance checkboxes, commands run, deterministic seed, screenshots or video, risks, and follow-ups.

Every PR must pass formatting, lint, typecheck, Vitest, production build, and Chromium smoke tests. Player-visible changes also require QA evidence. `main` requires an up-to-date branch, green checks, no unresolved threads, one independent approval, and root verification. P0/P1 findings block merge; P2 requires a fix or an accepted follow-up Issue. Use squash merge, then run a post-merge smoke check before marking the Issue `status:verified`.

The Epic status comment uses:

```text
Done:
In progress: Issue / owner role / branch or PR
Blocked: Issue / reason / decision owner
Next:
Risks:
```

Root updates it on every handoff, merge, blocker, or material decision so GitHub remains the authoritative progress view.
