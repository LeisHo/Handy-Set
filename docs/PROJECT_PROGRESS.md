# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Nothing in progress. Pushed to `https://github.com/LeisHo/Handy-Set`
(deployed via the Vercel project at `https://vercel.com/lpeis/handy-set`).

## Recently completed

- **Fixed the real cause of "wrist splay tracks the cursor but palm
  rotation doesn't" and "wrist crop cuts into the top of the hand"** —
  the user correctly guessed both were the same bug. The wrist-crop
  plane's normal only accounted for Phone Tilt's own wrapper rotation,
  never the wrist bone's own live rotation, so at large Responsive Wrist
  Splay angles it clipped away most of the hand — leaving too little
  visible geometry to perceive Palm Face Rotation working at all (the
  rotation math itself was, yet again, confirmed correct). Fixed by
  deriving the plane's normal from the live wrist->fingertip direction
  each frame instead of a static forearm->wrist axis. See CLAUDE.md's
  wrist-crop gotcha and `CHANGELOG.txt`'s 8:11-8:26 AM entry for the full
  account. One secondary finding not yet fixed: the hand can go fully
  invisible at an extreme combined rotation (large manual Palm Face
  Rotation offset stacked on an already-large cursor tilt) — not a crop
  or backface-culling issue, cause still unknown.
- Ported Reactive Arm Length and Responsive Wrist Splay from Handy
  Dandies (both explicitly, repeatedly requested) — real curve-editor
  widgets and reactive math ported verbatim, genericized into 2 shared
  widget builders. `tiltMagnitude` (already computed for Phone Tilt)
  stands in for Handy Dandies' own per-field live-distance-across-hands
  normalization, since that concept doesn't apply to this project's
  single-hand case — a disclosed adaptation, not a scope cut.
- Earlier this session: dev-panel DOM sync fixes, Toon Shading
  `onBeforeCompile` root cause, finger curl/splay not tracking wrist
  bend/splay, Hide Wrist not applying to the live model — see
  `CHANGELOG.txt` for the full history.

## What's next

1. Investigate the "hand goes fully invisible at extreme combined
   rotation" finding above — confirmed not crop or backface culling;
   possibly the mesh landing outside the camera's narrow 32° FOV.
2. Verify Phone Tilt gyroscope rotation specifically on the user's actual
   Pixel 9a — still unverified, no physical device available here.
3. Decide on a visible default color scheme (current all-white default
   makes the hand nearly invisible against the page background).
4. Port Pose Offset X/Y/Z to Handy Dandies' camera-relative resolution
   before any saved pose is given a nonzero offset value.
5. Tune default Camera/Lighting/Toon values to taste, now that Camera
   restore, the color/rim controls, and Set-as-Default persistence all
   actually work.
6. If Field Layout ever grows past 1x1, revisit whether `tiltMagnitude`
   is still the right distance signal for Reactive Arm Length/Responsive
   Wrist Splay — it's currently shared identically across every hand,
   not per-hand (see CLAUDE.md's matching gotcha).

## Open questions / blockers

None currently blocking.
