# Stashpilot

**The missing interface for Git stashes.** Preview, search, and clean up your stashes without
leaving the terminal.

[![npm version](https://img.shields.io/npm/v/stashpilot.svg)](https://www.npmjs.com/package/stashpilot)
[![CI](https://github.com/pierroberto/stashpilot/actions/workflows/ci.yml/badge.svg)](https://github.com/pierroberto/stashpilot/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/stashpilot.svg)](https://nodejs.org)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/pierroberto/stashpilot/blob/main/LICENSE)

```bash
npx stashpilot
```

No config and no setup. Run it in any Git repository.

![Stashpilot demo](https://raw.githubusercontent.com/pierroberto/stashpilot/main/docs/demo.gif)


## Why Stashpilot

- **See inside before you apply.** Every stash shows its changed files and diff. Browsing is
  read-only and never touches your repository.
- **Find any stash in seconds.** Press `/` and type part of a message, a branch, or a
  **filename** that the stash changed. Results update as you type.
- **Clean up without fear.** Apply, pop, drop, or branch from a single key. Each action shows
  the exact Git command first and runs only after you press `y`.
- **Catch conflicts before they happen.** Stashpilot warns you when your working tree is dirty,
  when your local changes overlap the stash, or when a simulated merge predicts a conflict.
- **Stash-first, nothing else.** It isn't a Git client to learn. It opens, you deal with your
  stashes, and you're back to work.
- **Fits your workflow.** It runs with `npx`, as a global npm install, or as a standalone binary
  with no Node.js required. `spilot list --json` lets you script it.

### Built for developers who…

- stash to switch context for a hotfix, a review, or a quick `git pull`, and forget to come back
- have a stash list that grew to 20+ entries named `WIP on main`
- want to clear out old stashes but aren't sure which ones are safe to drop
- stash on short-lived branches that have since been merged or deleted

## Quickstart

```bash
cd your-repo
npx stashpilot
```

You'll use these keys most:

| Key       | Action                                |
| --------- | ------------------------------------- |
| `j` / `k` | Move between stashes                  |
| `Enter`   | Toggle file summary / full diff       |
| `/`       | Filter by message, branch, or file    |
| `a` / `p` | Apply (keep) / pop (apply and remove) |
| `?`       | Show every shortcut                   |

## Installation

### npx (no install)

```bash
npx stashpilot
```

### npm (global)

```bash
npm install -g stashpilot
spilot
```

Requires Node.js 20 or newer and Git on your `PATH`.

### Standalone binary (no Node.js required)

Download the binary for your platform from the
[latest GitHub Release](https://github.com/pierroberto/stashpilot/releases/latest):

| Platform              | Asset                    |
| --------------------- | ------------------------ |
| macOS (Apple Silicon) | `spilot-darwin-arm64`    |
| macOS (Intel)         | `spilot-darwin-x64`      |
| Linux x64             | `spilot-linux-x64`       |
| Linux arm64           | `spilot-linux-arm64`     |
| Windows x64           | `spilot-windows-x64.exe` |

For example, on Linux x64:

```bash
curl -fsSL -o spilot https://github.com/pierroberto/stashpilot/releases/latest/download/spilot-linux-x64
chmod +x spilot
sudo mv spilot /usr/local/bin/
```

On macOS, binaries downloaded with a browser may be quarantined; remove the flag with
`xattr -d com.apple.quarantine ./spilot`.

## Usage

Run inside any Git repository:

```bash
spilot                 # open the interactive stash browser
spilot list            # print a summary of all stashes
spilot list --json     # print all stash metadata as JSON
spilot --help
spilot --version
```

The exit code is `0` on success and non-zero on error: `1` for runtime errors such as running
outside a Git repository, `2` for invalid arguments.

### The interface

- **Left pane:** every stash with its index (`stash@{0}`), message, source branch (marked
  `(deleted)` if that branch no longer exists, or `detached`), relative age, number of changed
  files, insertions/deletions, `U` when it contains untracked files, and `merge` when it was
  created on top of a merge commit.
- **Right pane:** the selected stash's file list with the selected file's diff underneath,
  or the full diff of every file (toggle with `Enter`). Each file starts with a highlighted
  bar showing its status, path, and line counts, and the pane shows which lines you are
  viewing (`lines 18–34 of 82 ↑↓`).

The list appears immediately; file counts and line stats fill in progressively.

Focus moves between three panes: **stash list → file list → diff** (in full-diff mode: stash
list → diff). The focused pane has a highlighted border, and `j`/`k`, the arrow keys, and the
mouse wheel act on it.

<details>
<summary><strong>All keyboard shortcuts</strong></summary>

| Key                      | Action                                                       |
| ------------------------ | ------------------------------------------------------------ |
| `Tab` / `Shift+Tab`      | Move focus: stash list → file list → diff                    |
| `h` / `l`                | Move focus left / right                                      |
| `j` / `k`, `↓` / `↑`     | Move in the focused pane (stashes, files, or diff lines)     |
| `PgDn` / `PgUp`, `Space` | Scroll the diff by a page (from any pane)                    |
| `[` / `]`                | Previous / next file                                         |
| `g` / `G`                | Jump to top / bottom                                         |
| `Enter`                  | Toggle file summary / full diff (opens at the selected file) |
| `/`                      | Filter by message, branch, or changed filename (live)        |
| `a`                      | Apply the selected stash (keeps it)                          |
| `p`                      | Pop the selected stash (applies it, removes it on success)   |
| `d`                      | Drop the selected stash                                      |
| `b`                      | Create a branch from the selected stash                      |
| `r`                      | Refresh stash data                                           |
| `?`                      | Show help                                                    |
| `q` / `Esc`              | Quit (`Esc` clears an active filter first)                   |

While typing a filter or branch name: `Enter` confirms, `Esc` cancels, `Ctrl+U` clears.

</details>

## Safety

Stashes are often the only copy of half-finished work, so Stashpilot never makes a change
you didn't confirm:

```text
╭──────────────────────────────────────────────────────────────────────────────────────────────────╮
│ Drop stash stash@{2}?                                                                            │
│                                                                                                  │
│ This will run:                                                                                   │
│   $ git stash drop stash@{2}                                                                     │
│                                                                                                  │
│ Permanently removes the stash from the stash list.                                               │
│ Recovery is only possible via its commit SHA: d3507a1997a924debccf2ebeb5fe5cdd5130a2f1           │
│                                                                                                  │
│ Press y to confirm, n or Esc to cancel.                                                          │
╰──────────────────────────────────────────────────────────────────────────────────────────────────╯
```

- **Nothing changes until you confirm.** `apply`, `pop`, `drop`, and `branch` each open a
  confirmation dialog showing the exact Git command that will run. Only `y` confirms.
- **Conflict warnings.** Before `apply` and `pop`, Stashpilot checks the working tree. It warns
  when the tree is dirty, when locally modified files are also changed by the stash, when
  untracked files from the stash already exist, or when a simulated merge
  (`git merge-tree`, Git 2.40+) of the stash into `HEAD` conflicts.
- **Your changes are never discarded.** Stashpilot only runs `git stash apply|pop|drop|branch`.
  If Git refuses (for example because local changes would be overwritten), the stash and your
  files are left untouched and Git's error is shown.
- **The right stash, always.** Right before running an action, Stashpilot verifies that
  `stash@{n}` still points to the commit you selected. If the stash list changed in the
  meantime, it refuses and asks you to refresh.
- **Read-only browsing.** Listing, previewing, and filtering never modify the repository,
  index, or working tree.
- **Errors are never hidden.** Failed Git commands are shown in the status area together with
  the command that failed.

`spilot` never switches branches on its own. The one exception is `b`, which runs
`git stash branch` and therefore checks out the new branch; the dialog tells you this.

## Scripting with JSON

`spilot list --json` gives you everything the TUI shows, ready for `jq` and scripts. For
example, to list stashes whose source branch no longer exists:

```bash
spilot list --json | jq -r '.stashes[] | select(.branchExists == false) | .ref'
```

<details>
<summary><strong>JSON fields</strong></summary>

The output is an object with a `stashes` array. Each entry contains `index`, `ref`, `sha`,
`message`, `subject`, `branch`, `branchExists`, `baseSha`, `baseIsMerge`, `createdAt`
(ISO 8601), `timestamp` (Unix seconds), `relativeAge`, `fileCount`, `insertions`,
`deletions`, `hasUntracked`, `untrackedCount`, and `files` (each with `path`, `oldPath`,
`status`, `insertions`, `deletions`, `binary`).

</details>

## How it works

Stashpilot shells out to the Git CLI (no native bindings), with at most four concurrent Git
processes while the TUI is open. Output is cached until you press `r` or run an action.

<details>
<summary><strong>Git commands used for each feature</strong></summary>

| Feature                  | Git command                                                                  |
| ------------------------ | ---------------------------------------------------------------------------- |
| Find repository          | `git rev-parse --show-toplevel`                                              |
| List stashes             | `git stash list --format=…`                                                  |
| Deleted/renamed branches | `git for-each-ref --format=%(refname:short) refs/heads`                      |
| Merge-commit bases       | `git rev-list --no-walk --parents <bases…>`                                  |
| File stats               | `git diff-tree -r -z -M --raw --numstat <base> <stash>`                      |
| Untracked file stats     | `git diff-tree -r -z --root --raw --numstat <stash^3>`                       |
| Diff preview             | `git diff-tree -r -p -M <base> <stash>` (+ `--root <stash^3>` for untracked) |
| Working tree status      | `git status --porcelain=v1 -z --untracked-files=all`                         |
| Conflict prediction      | `git merge-tree --write-tree --name-only --merge-base=<base> HEAD <stash>`   |
| Apply / pop / drop       | `git stash apply\|pop\|drop stash@{n}`                                       |
| Branch                   | `git check-ref-format --branch <name>`, `git stash branch <name> stash@{n}`  |

Stats and diffs use `git diff-tree` instead of `git stash show` so that user configuration
(such as `stash.showIncludeUntracked`, `diff.external`, or color settings) cannot change the
output Stashpilot parses. The content shown is the same as `git stash show -p --include-untracked`.

</details>

## Limitations

- Filtering by filename only matches stashes whose file stats have finished loading
  (usually a fraction of a second after start).
- Conflict prediction against `HEAD` requires Git 2.40 or newer. With older Git, only working
  tree overlap is checked and the dialog says so.
- `apply` and `pop` run without `--index`, so staged vs. unstaged state is not restored.
- Binary files are listed but not diffed.
- Colors come from your terminal's ANSI palette. Set `NO_COLOR=1` to disable colors.
- The interactive mode requires a terminal; use `spilot list` in scripts and pipes.

## What Stashpilot is not

Stashpilot is deliberately small. It does not do commits, pushes, pulls, rebases, merges, or
general branch management, and it has no plugins, AI features, or cloud sync. It does one
job: stashes.

## Contributing

Bug reports and pull requests are welcome. See [CONTRIBUTING.md](https://github.com/pierroberto/stashpilot/blob/main/CONTRIBUTING.md) for
development setup, checks, and the Changesets release process.

If Stashpilot saved you from re-running `git stash show -p` a dozen times, a ⭐ on
[GitHub](https://github.com/pierroberto/stashpilot) helps other developers find it.

## License

[MIT](https://github.com/pierroberto/stashpilot/blob/main/LICENSE) © Pier Roberto Lucisano
