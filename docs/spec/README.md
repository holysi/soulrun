# Shared Contracts

These documents are the frozen implementation boundary for the v1 release of
魂夜輪迴. Normative words (`MUST`, `MUST NOT`, `SHOULD`) are intentional. A
contract change requires a `DECISION` comment on Issue #2 (or a follow-up spec
Issue after #2 closes) before code, tests, or assets adopt it.

| Contract | Consumers |
| --- | --- |
| [Gameplay configuration](gameplay-config.md) | Development, QA |
| [Runtime flow and events](runtime-flow.md) | Development, QA |
| [Storage and deterministic tests](storage-and-test-hooks.md) | Development, QA |
| [Visual and audio assets](asset-contract.md) | Art, Development, QA |
| [Ownership and handoffs](ownership.md) | All agents |

Canonical player-facing language remains in `GLOSSARY.md`; these specs use
stable English identifiers in code and manifests. Configuration and manifest
data are validated at startup. Unknown IDs, duplicate IDs, invalid ranges, and
missing required assets are fatal in development/test and produce one clear
diagnostic before the title screen in production.

## Frozen conventions

- Internal IDs are lowercase `kebab-case`; TypeScript names are `camelCase` or
  `PascalCase`; event names are lowercase colon-delimited strings.
- Times use milliseconds, distances use logical pixels, angles use clockwise
  degrees with `0` pointing right, and ratios use decimal multipliers.
- Logical rendering is `480x270` at 60 updates per second with nearest-neighbor
  scaling. Physics and random decisions use logical state, never display size.
- Arrays whose order affects random selection MUST be explicitly sorted by ID
  before sampling. Object/map iteration order MUST NOT determine gameplay.
- User-facing text is Traditional Chinese; internal keys and filenames are
  English.
