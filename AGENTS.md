# Repository Guidelines

## Project Structure & Module Organization

This repository is currently a clean scaffold with no application code or build system. Keep the root focused on project-wide configuration and documentation. When implementation begins, use a predictable layout:

- `src/` for production code, grouped by feature or domain.
- `tests/` for automated tests that mirror the structure under `src/`.
- `assets/` for static images, audio, fixtures, or other game resources.
- `docs/` for design notes, architecture decisions, and contributor documentation.

Avoid committing generated output, dependency directories, editor settings, or secrets. Add them to `.gitignore` as soon as the relevant toolchain is introduced.

## Build, Test, and Development Commands

No build, test, or local-run commands are defined yet. When selecting a toolchain, expose a small, consistent command set and document it here and in `README.md`. For example:

```text
npm run dev      # Start the local development environment
npm test         # Run the complete automated test suite
npm run lint     # Check formatting and static-analysis rules
npm run build    # Produce a release build
```

Contributors should run the applicable test and lint commands before opening a pull request.

## Coding Style & Naming Conventions

Follow the formatter and linter configured for the chosen language; do not hand-format around those tools. Use spaces rather than tabs unless the formatter requires otherwise. Prefer descriptive names: `PascalCase` for types, `camelCase` for functions and variables, and lowercase kebab-case for asset names such as `player-idle.png`. Keep modules small and organize them by responsibility rather than file type.

## Testing Guidelines

Add tests with every behavior change and regression fix. Name tests after observable behavior, for example `player_stops_at_wall` or `playerStopsAtWall`. Keep test fixtures deterministic and place reusable fixtures under `tests/fixtures/`. Once a framework is chosen, document its focused-test and coverage commands here.

## Commit & Pull Request Guidelines

There is no existing commit history to establish a local convention. Use short, imperative commit subjects such as `Add player movement` or `Fix collision bounds`. Keep each commit focused. Pull requests should explain the change, verification performed, and any remaining risks; link related issues and include screenshots or recordings for visible gameplay or UI changes.
