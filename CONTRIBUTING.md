# Contributing to Stashpilot

Thanks for helping out! Stashpilot is intentionally small and stash-focused; please open an
issue before working on large features (see _Non-goals_ in the README).

## Setup

Development requires Node.js 22.12+ (the published package runs on Node.js 20+) and Git.

```bash
npm ci
npm run dev          # run the TUI from source (inside any Git repository)
npm run dev -- list  # run a subcommand from source
```

## Checks

CI runs all of these; run them before opening a pull request:

```bash
npm run typecheck
npm run lint          # warnings fail the build
npm run format:check  # use `npm run format` to fix
npm test
npm run build
```

Tests live in `tests/`:

- `tests/unit` — parsers and utilities
- `tests/integration` — Git operations and the CLI against temporary repositories
- `tests/tui` — the Ink interface, driven with `ink-testing-library`

## Versioning and releases

Stashpilot uses [Changesets](https://github.com/changesets/changesets). Do not edit the
`version` in `package.json` or `CHANGELOG.md` by hand.

Every user-facing change needs a changeset:

```bash
npm run changeset
```

Pick the bump type and write a one-line summary for the changelog. Commit the generated file
in `.changeset/` with your change.

| Bump      | When                                                                 | Example         |
| --------- | -------------------------------------------------------------------- | --------------- |
| **patch** | Bug fixes and internal changes users can notice but need not act on  | `0.1.0 → 0.1.1` |
| **minor** | New, backward-compatible features (new key binding, new list field)  | `0.1.0 → 0.2.0` |
| **major** | Breaking changes (removed command, changed JSON shape or exit codes) | `0.1.0 → 1.0.0` |

Changes that do not affect users (tests, CI, refactors) can skip the changeset, or use
`npm run changeset -- --empty`.

### How a release happens

1. Pull requests with changesets are merged into `main`.
2. The **Release** workflow opens or updates a **Version Packages** pull request that runs
   `changeset version`, bumping `package.json` and updating `CHANGELOG.md`.
3. Merging that pull request triggers the workflow again; it publishes the new version to npm
   (requires the `NPM_TOKEN` repository secret), creates the `vX.Y.Z` tag and GitHub Release,
   then builds standalone binaries with Bun and attaches them to the release.

As a fallback, pushing a `vX.Y.Z` tag that matches `package.json` publishes that version (if it
is not on npm yet) and builds the binaries.

To build binaries locally (requires [Bun](https://bun.sh)):

```bash
bun scripts/build-binaries.ts bun-darwin-arm64
```
