# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Nothing in progress. Pushed to `https://github.com/LeisHo/Handy-Set`
(deployed via the Vercel project at `https://vercel.com/lpeis/handy-set`).

## Recently completed

- **Made cursor tracking proportionate to normal mouse movement instead
  of requiring extreme cursor positions** (direct report: "look at Handy
  Dandies' implementation, why does ours need extreme values?"). Ported
  Handy Dandies' real raycast-based cursor targeting for the mouse path,
  adapted to use the offset from a screen-center raycast (not a raw
  absolute hit) since HANDYSET's single hand sits at world origin while
  its camera is framed at a very different point. This also fully
  resolved the previously-flagged "hand goes invisible at extreme
  rotation" finding — the real cause turned out to be three.js's default
  frustum culling using a stale, unskinned bind-pose bounding sphere;
  fixed by disabling it per-hand. See CLAUDE.md's gotchas and
  `CHANGELOG.txt`'s 6:22-6:36 PM entry for the full account.
- **Fixed the real cause of "wrist splay tracks the cursor but palm
  rotation doesn't" and "wrist crop cuts into the top of the hand"** —
  the wrist-crop plane's normal only accounted for Phone Tilt's own
  wrapper rotation, never the wrist bone's own live rotation, so at large
  Responsive Wrist Splay angles it clipped away most of the hand. Fixed
  by deriving the plane's normal from the live wrist->fingertip direction
  each frame instead of a static forearm->wrist axis.
- Ported Reactive Arm Length and Responsive Wrist Splay from Handy
  Dandies (both explicitly, repeatedly requested) — real curve-editor
  widgets and reactive math ported verbatim, genericized into 2 shared
  widget builders. `tiltMagnitude` stands in for Handy Dandies' own
  per-field live-distance-across-hands normalization, since that concept
  doesn't apply to this project's single-hand case.
- Earlier: dev-panel DOM sync fixes, Toon Shading `onBeforeCompile` root
  cause, finger curl/splay not tracking wrist bend/splay, Hide Wrist not
  applying to the live model — see `CHANGELOG.txt` for the full history.

## What's next

1. Verify Phone Tilt gyroscope rotation specifically on the user's actual
   Pixel 9a — still unverified, no physical device available here.
2. Decide on a visible default color scheme (current all-white default
   makes the hand nearly invisible against the page background).
3. Port Pose Offset X/Y/Z to Handy Dandies' camera-relative resolution
   before any saved pose is given a nonzero offset value.
4. Tune default Camera/Lighting/Toon values to taste, now that Camera
   restore, the color/rim controls, and Set-as-Default persistence all
   actually work.
5. If Field Layout ever grows past 1x1, revisit whether `tiltMagnitude`
   is still the right distance signal for Reactive Arm Length/Responsive
   Wrist Splay — it's currently shared identically across every hand,
   not per-hand (see CLAUDE.md's matching gotcha).

## Open questions / blockers

None currently blocking.
