# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Nothing in progress. Pushed to `https://github.com/LeisHo/Handy-Set`
(deployed via the Vercel project at `https://vercel.com/lpeis/handy-set`,
with `GITHUB_TOKEN`/`DEV_PANEL_SAVE_SECRET` configured by the user for the
git-tracked Save/Sync path). See `docs/PROJECT_SUMMARY.txt` for full
current state.

## Recently completed

- Dev-panel DOM sync after preset "Use", Outline removal, the Toon
  Shading `onBeforeCompile` root cause, ghost/misaligned group
  checkboxes, Set-as-Default being wiped by the main Sync click, and
  Phone Tilt/Palm Facing defaulting off — all fixed and live-verified in
  earlier rounds this session (see `CHANGELOG.txt`).
- Camera Overwrite/Set-as-Default/Use restoring the wrong position —
  `applyCameraPreset()` was recomputing distance from a fit-sphere-to-FOV
  formula instead of restoring the literal saved position. Ported Handy
  Dandies' real function verbatim (literal restore, no recompute). This
  also exposed and fixed a corrupted `tz` value in the `FRONTOS` (default)
  saved camera, invisible until the recompute bug was fixed.
- Saved Poses rendering differently than Hando/Handy Dandies —
  `applyWristPoseToSkeleton()` used a reconstructed "true world axis"
  rotation method instead of Handy Dandies' real `bone.rotateX/Y/Z`
  sequential local rotation; ported verbatim after reading Handy Dandies'
  actual source. Pose Offset X/Y/Z's own camera-relative-vs-world-space
  divergence was found but NOT ported yet (no currently-seeded pose has a
  nonzero offset, so no visible effect) — documented in `CLAUDE.md` as a
  known gap to close before any pose uses one.
- Tween group's buttons were unstyled default browser buttons — fixed to
  use the same `dev-buttons` styling every other panel button relies on.
- Removed the "Enable Motion" button — Phone Tilt on/off is now purely
  the Tracking Enabled checkbox, which requests iOS motion permission
  directly on check (a real user gesture); Android was never gated by
  this either way.

## What's next

1. Verify all of the above on the user's actual deployed Vercel instance
   and real device — every fix this session was only verified against a
   local static-server preview (no physical phone available here),
   except for one direct read of the live Vercel deployment's
   `cfg.trackingEnabled` value and a cursor-hover rotation test there.
2. Verify Phone Tilt gyroscope rotation specifically on the user's actual
   Pixel 9a.
3. Port Pose Offset X/Y/Z to Handy Dandies' camera-relative resolution
   before any saved pose is given a nonzero offset value.
4. Tune default Camera/Lighting/Toon values to taste, now that Camera
   restore, the color/rim controls, and Set-as-Default persistence all
   actually work — any prior visual tuning attempts made while any of
   those were broken likely need revisiting.

## Open questions / blockers

None currently blocking.
