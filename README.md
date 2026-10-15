# Stashpilot

> The missing interface for Git stashes: preview, search, and clean up stashes without leaving the terminal.

`spilot` is a fast, keyboard-first terminal UI for `git stash`. It is not a general Git client:
it does one thing — help you understand, find, and safely manage your stashes.

<!-- Demo GIF placeholder: replace with a recording of spilot in action. -->

![Stashpilot demo](docs/demo.gif)

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

Exit code is `0` on success and non-zero on error (`1` for runtime errors such as running
outside a Git repository, `2` for invalid arguments).

### The interface

- **Left pane** — every stash with its index (`stash@{0}`), message, source branch (marked
  `(deleted)` if that branch no longer exists, or `detached`), relative age, number of changed
  files, insertions/deletions, `U` when it contains untracked files, and `merge` when it was
  created on top of a merge commit.
- **Right pane** — the selected stash's file summary with the selected file's diff underneath,
  or the full unified diff (toggle with `Enter`).

The list appears immediately; file counts and line stats fill in progressively.

### Keyboard shortcuts

| Key                      | Action                                                            |
| ------------------------ | ----------------------------------------------------------------- |
| `j` / `k`, `↓` / `↑`     | Move between stashes (in the preview: between files / diff lines) |
| `h` / `l`, `Tab`         | Switch focus between stash list and preview                       |
| `Enter`                  | Toggle file summary / full diff                                   |
| `PgDn` / `PgUp`, `Space` | Scroll the diff by a page                                         |
| `g` / `G`                | Jump to top / bottom                                              |
| `/`                      | Filter by message, branch, or changed filename (live)             |
| `a`                      | Apply the selected stash (keeps it)                               |
| `p`                      | Pop the selected stash (applies it, removes it on success)        |
| `d`                      | Drop the selected stash                                           |
| `b`                      | Create a branch from the selected stash                           |
| `r`                      | Refresh stash data                                                |
| `?`                      | Show help                                                         |
| `q` / `Esc`              | Quit (`Esc` clears an active filter first)                        |

While typing a filter or branch name: `Enter` confirms, `Esc` cancels, `Ctrl+U` clears.

### JSON output

`spilot list --json` prints an object with a `stashes` array. Each entry contains `index`,
`ref`, `sha`, `message`, `subject`, `branch`, `branchExists`, `baseSha`, `baseIsMerge`,
`createdAt` (ISO 8601), `timestamp` (Unix seconds), `relativeAge`, `fileCount`, `insertions`,
`deletions`, `hasUntracked`, `untrackedCount`, and `files` (each with `path`, `oldPath`,
`status`, `insertions`, `deletions`, `binary`).

```bash
spilot list --json | jq -r '.stashes[] | select(.branchExists == false) | .ref'
```

## Safety

- **Nothing changes until you confirm.** `apply`, `pop`, `drop`, and `branch` each open a
  confirmation dialog showing the exact Git command that will run. Only `y` confirms.
- **Conflict warnings.** Before `apply` and `pop`, Stashpilot checks the working tree and
  warns when it is dirty, when locally modified files are also changed by the stash, when
  untracked files from the stash already exist, or when a simulated merge
  (`git merge-tree`, Git 2.40+) of the stash into `HEAD` conflicts.
- **Your changes are never discarded.** Stashpilot only runs `git stash apply|pop|drop|branch`;
  if Git refuses (for example because local changes would be overwritten), the stash and your
  files are left untouched and Git's error is shown.
- **The right stash, always.** Right before running an action, Stashpilot verifies that
  `stash@{n}` still points to the commit you selected; if the stash list changed in the
  meantime, it refuses and asks you to refresh.
- **Read-only browsing.** Listing, previewing, and filtering never modify the repository,
  index, or working tree.
- **Errors are never hidden.** Failed Git commands are shown in the status area together with
  the command that failed.

`spilot` does not switch branches, except for `b`, which runs `git stash branch` and therefore
checks out the new branch (the dialog says so).

## How it works

Stashpilot shells out to the Git CLI (no native bindings), with at most four concurrent Git
processes while the TUI is open. Output is cached until you press `r` or run an action.

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

## Limitations

- Filtering by filename only matches stashes whose file stats have finished loading
  (usually a fraction of a second after start).
- Conflict prediction against `HEAD` requires Git 2.40 or newer; with older Git, only working
  tree overlap is checked and the dialog says so.
- `apply` and `pop` run without `--index`, so staged vs. unstaged state is not restored.
- Binary files are listed but not diffed.
- Colors come from your terminal's ANSI palette. Set `NO_COLOR=1` to disable colors.
- The interactive mode requires a terminal; use `spilot list` in scripts and pipes.

## Non-goals

Stashpilot does not do commits, pushes, pulls, rebases, merges, or general branch
management, and has no plugins, AI features, or cloud sync.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, checks, and the Changesets
release process.

## License

[MIT](LICENSE) © Pier Roberto Lucisano
