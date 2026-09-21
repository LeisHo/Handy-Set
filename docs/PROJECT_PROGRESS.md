# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Nothing in progress. Pushed to `https://github.com/LeisHo/Handy-Set`
(deployed via the Vercel project at `https://vercel.com/lpeis/handy-set`).

## Recently completed

- Ported Reactive Arm Length and Responsive Wrist Splay from Handy
  Dandies (both explicitly, repeatedly requested) — real curve-editor
  widgets and reactive math ported verbatim, genericized into 2 shared
  widget builders. `tiltMagnitude` (already computed for Phone Tilt)
  stands in for Handy Dandies' own per-field live-distance-across-hands
  normalization, since that concept doesn't apply to this project's
  single-hand case — a disclosed adaptation, not a scope cut; every
  actual control is a full port. Live-verified on localhost: both
  widgets render/drag correctly, the master toggles genuinely gate the
  behavior (direct clip-plane-constant comparison), and cursor movement
  produces real, measured live changes to both the wrist bone's
  quaternion and the wrist-crop clip plane.
- Dev-panel DOM sync after preset "Use", Outline removal, the Toon
  Shading `onBeforeCompile` root cause, ghost/misaligned group
  checkboxes, Set-as-Default being wiped by the main Sync click, Phone
  Tilt/Palm Facing defaulting off, Camera literal-restore + a corrupted
  `FRONTOS` seed value, Tween button styling, and the Enable Motion
  button removal — all fixed and live-verified in earlier rounds this
  session (see `CHANGELOG.txt`).
- Finger curl/splay axis not tracking wrist bend/splay — found by reading
  Handy Dandies' own CHANGELOG for this exact bug class and porting its
  real, twice-corrected formula verbatim (`computeCurlAxisRefQuat()`).
- Hide Wrist not applying to the live model — the crop's clip plane
  stopped being attached to the material forever the first time Crop
  Wrist was ever toggled off and back on (`h.clipPlane` persisted but
  never got re-added to `material.clippingPlanes`). Fixed, then also
  made the plane recompute every frame via `onBeforeRender` (matches
  Handy Dandies' own pattern) so it stays correctly aligned while the
  hand is actively rotating, not just at the moment a slider changes.
- **Palm Face Rotation "does nothing" / "messes up poses"** — a PRIOR
  session's conclusion here ("roll axis nearly aligned with camera") was
  itself wrong and has been corrected (see `CHANGELOG.txt`'s 7:05-7:24 AM
  entry for the full account). The real problem was 2 testing-
  methodology confounds in this environment (`canvas.toDataURL()`
  silently returning a stale/blank buffer without
  `preserveDrawingBuffer`; `requestAnimationFrame` freezing on a
  non-fronted browser-pane tab). With both fixed, direct screenshot
  comparison on the live Vercel deployment confirms rotation and
  finger-pose decoupling both work correctly. Leading candidate for the
  user's real-world experience: this project's own documented flaky-
  localhost script-delivery gotcha, directly observed again this
  session (repeated connection resets / 404s / a null-reference crash
  on page load).

## What's next

1. Confirm with the user whether they were testing Palm Face Rotation on
   `localhost` or the deployed Vercel URL — localhost's flaky script
   delivery is the leading remaining explanation for their experience.
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
