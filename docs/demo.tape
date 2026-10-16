# Records docs/demo.gif for the README.
# Requires VHS (https://github.com/charmbracelet/vhs). From the repository root:
#   npm run build && vhs docs/demo.tape

Output docs/demo.gif

Require git
Require node

Set Shell "bash"
Set FontSize 16
Set Width 1280
Set Height 720
Set Padding 20
Set TypingSpeed 60ms

Hide
Type `alias spilot="node $PWD/dist/cli.js" && bash docs/demo-repo.sh /tmp/spilot-demo && cd /tmp/spilot-demo && clear`
Enter
Sleep 1s
Show

Type "spilot"
Enter
Sleep 2s

# Browse stashes and their files
Down
Sleep 1s
Down
Sleep 1.5s
Tab
Sleep 500ms
Down
Sleep 1s
Down
Sleep 1.5s

# Full diff
Enter
Sleep 1.5s
Space
Sleep 1.5s
Enter
Sleep 1s
Tab
Tab
Sleep 500ms

# Find a stash by changed filename
Type "/"
Sleep 300ms
Type "schema"
Sleep 2s
Escape
Sleep 1s

# Safe by default: every action shows the exact command first
Type "d"
Sleep 3s
Type "n"
Sleep 1s

Type "q"
Sleep 500ms
