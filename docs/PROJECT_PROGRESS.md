# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Nothing in progress. Pushed to `https://github.com/LeisHo/Handy-Set`
(deployed via the Vercel project at `https://vercel.com/lpeis/handy-set`).

## Recently completed

- **Whole-Hand Rotation X/Y/Z (Pose group) never actually rotated the
  visible hand at all** — `h.clone.quaternion` was set once at hand
  creation and never touched again; the 3 sliders only affected an
  internal finger-curl axis reference. Fixed by porting HANDO's real
  mechanism: rotate `h.clone` directly, pivoted around palm center
  (midpoint of the wrist bone and middle-finger base), with position
  recomputed every change so the palm stays fixed regardless of
  rotation. Live-verified with byte-identical wrist-position readings
  across very different rotation values.
- **Wrist crop was using the wrong axis, wrong direction, and a hard
  clamp** — 2 earlier attempts this session both got it wrong in
  different ways. Re-read HANDO's own real `updateWristClipPlane()`
  verbatim and ported it exactly: the arm bone's own axis (not a
  wrist-bend-following one), un-negated (fixes cropping the hand instead
  of the arm), and completely unclamped (0-100%+ all do something now,
  instead of clamping at 1.0). Live-verified: 0% shows the full forearm,
  100% crops it away with the hand fully intact, 150%+ correctly pushes
  the crop into the hand.
- **Removed the "Responsive Wrist Splay" group entirely**, per direct
  request after the cursor-tracking sensitivity fix didn't fully satisfy
  — the user is planning to rebuild this feature from scratch in a future
  session rather than have it silently kept. Reactive Arm Length (a
  separate, still-working feature) was left in place.
- Made cursor tracking proportionate to normal mouse movement instead of
  requiring extreme cursor positions, ported from Handy Dandies' real
  raycast-based targeting. This also resolved "hand goes invisible at
  extreme rotation" — three.js's default frustum culling using a stale
  bind-pose bounding sphere; fixed by disabling it per-hand.
- Earlier: Toon Shading `onBeforeCompile` root cause, finger curl/splay
  not tracking wrist bend/splay, Hide Wrist not applying to the live
  model, dev-panel DOM sync fixes — see `CHANGELOG.txt` for full history.

## What's next

1. Rebuild a responsive/reactive wrist-splay-style feature from scratch
   with the user, once they're ready — the old port was removed, not
   fixed in place.
2. Verify Phone Tilt gyroscope rotation specifically on the user's actual
   Pixel 9a — still unverified, no physical device available here.
3. Decide on a visible default color scheme (current all-white default
   makes the hand nearly invisible against the page background).
4. Port Pose Offset X/Y/Z to Handy Dandies' camera-relative resolution
   before any saved pose is given a nonzero offset value.
5. Tune default Camera/Lighting/Toon values to taste, now that Camera
   restore, the color/rim controls, and Set-as-Default persistence all
   actually work.

## Open questions / blockers

None currently blocking.
