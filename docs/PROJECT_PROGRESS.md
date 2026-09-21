# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Nothing in progress — first build just completed and pushed (or pending
push, see What's next). See `docs/PROJECT_SUMMARY.txt` for full current
state.

## Recently completed

- First working build (2026-09-21): single centered hand, Phone Tilt
  gyroscope + desktop mouse-fallback rotation, dev panel built from the
  real `TEMPLATE_DEV_PANEL.html` engine with all 9 requested groups
  (Tween/Field Layout/Pose/Camera/Phone Tilt/Lighting/Toon Shading/
  Background/Debug), Debug-group sensor console, seeded pose/camera/
  lighting presets with configured defaults. See `CLAUDE.md`'s own
  Gotchas/Known Simplifications sections for the real debugging history
  (zero-size-framebuffer self-heal, wrist-crop plane math, camera preset
  retargeting, dev-mode gating script) — several genuine bugs were found
  and fixed live during this session's own verification pass, not just
  assumed working.

## What's next

1. Push to https://github.com/LeisHo/Handy-Set.
2. Deploy to Vercel.
3. Verify on the user's actual Pixel 9a (real gyroscope/accelerometer —
   this session could only verify the desktop mouse-fallback path and
   that the motion-permission/gating logic runs without crashing).
4. Tune default Camera/Lighting to taste — the sliders all work, but the
   shipped defaults (FRONTOS camera + FLABOVE lighting + Fist pose) look
   tightly-framed and under-lit together.
5. Investigate the one observed `RangeError: Maximum call stack size
   exceeded` (devPanel.js's own dynamicDevice mirroring code) if it
   recurs — not reproduced deliberately yet, didn't block functionality.

## Open questions / blockers

- GitHub push not yet done as of this doc's last update — confirm
  `https://github.com/LeisHo/Handy-Set` is the correct, already-existing
  remote (given mid-task by the user) before pushing.
