# stashpilot

## 0.2.0

### Minor Changes

- 6e74fb1: Make the diff pane easy to scroll and read: focus now moves between the stash list, file list, and diff (`Tab` / `Shift+Tab`, `h` / `l`), so `j`/`k`, arrow keys, and the mouse wheel scroll the diff when it is focused. Each file is introduced by a highlighted bar with its status, path, and line counts, `[` / `]` jump between files, and the pane shows the visible line range. `Enter` opens the full diff at the selected file.

### Patch Changes

- 198aebd: Fix keys pressed right after the screen updates acting on the previous state, which could report "No stash selected" at startup or target the previously selected stash after a quick move.

## 0.1.0

### Minor Changes

- Initial release: interactive two-pane stash browser (`spilot`) with file summary and full diff preview, live filtering, apply/pop/drop/branch actions with confirmation and conflict warnings, and non-interactive `spilot list` / `spilot list --json`.
