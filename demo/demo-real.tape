# Lun demo — REAL run (not simulated)
# Render: vhs demo/demo-real.tape
# Requires: at least one agent CLI installed + authenticated.

Output demo/lun-demo.gif
Output demo/lun-demo.mp4

Set Shell "zsh"
Set FontSize 16
Set FontFamily "JetBrains Mono"
Set Width 1000
Set Height 640
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms

# Clean prompt + warm the daemon off-camera so the demo isn't dominated by
# CLI cold-start. The actual lun call below is 100% real.
Hide
Type "clear" Enter
Type "export PS1='%F{magenta}❯%f '" Enter
Type "alias lun='node bin/lun.js'" Enter
Type "lun daemon start >/dev/null 2>&1; sleep 12" Enter
Type "clear" Enter
Show

Sleep 800ms
Type "lun -P claude,kiro,copilot "
Sleep 200ms
Type `"In one sentence: REST or GraphQL?"`
Sleep 500ms
Enter

# Real agents answer here — give them room to stream in.
Sleep 30s
