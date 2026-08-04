# Known Issues

## Tweak emulator lifecycle. Current behaviour: When navigating to the play view the emulator is always destroyed first. When navigating away from the play view the emulator (worker + audio-worklet) keeps running in the background. I want to change this behaviour in the following way: When navigating to the play view check if the emulator was running the same game before. If yes then try to reattach it (does the canvas have to be reattached?) if not keep the current behaviour (destroy first). When navigating away from the play view the emulator should pause. Make a plan first and explore potential problems.

## Full-screen should show 4:3

## Load/save-state should not show context menu

## Move controller config to header, simplyfy disk select
