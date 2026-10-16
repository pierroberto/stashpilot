---
'stashpilot': patch
---

Fix keys pressed right after the screen updates acting on the previous state, which could report "No stash selected" at startup or target the previously selected stash after a quick move.
