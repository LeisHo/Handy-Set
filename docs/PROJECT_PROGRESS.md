# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Porting 2 explicitly-requested, still-missing features from Handy
Dandies: "Responsive Wrist Splay" (master on/off, stagger, default,
reactive-by-cursor-distance, min/max range + curve) and "Reactive Arm
Length" (the distance-reactive version of wrist cropping — currently a
plain fixed-percentage slider here). A background research pass is
extracting the real Handy Dandies source for both before porting, per
this workspace's "read real source, never reconstruct" rule. Pushed to
`https://github.com/LeisHo/Handy-Set` (deployed via the Vercel project at
`https://vercel.com/lpeis/handy-set`).

## Recently completed

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

1. Finish porting Responsive Wrist Splay + Reactive Arm Length from Handy
   Dandies (in progress — see "Currently working on" above).
2. Confirm with the user whether they were testing Palm Face Rotation on
   `localhost` or the deployed Vercel URL — localhost's flaky script
   delivery is the leading remaining explanation for their experience.
3. Verify Phone Tilt gyroscope rotation specifically on the user's actual
   Pixel 9a — still unverified, no physical device available here.
4. Decide on a visible default color scheme (current all-white default
   makes the hand nearly invisible against the page background).
5. Port Pose Offset X/Y/Z to Handy Dandies' camera-relative resolution
   before any saved pose is given a nonzero offset value.
6. Tune default Camera/Lighting/Toon values to taste, now that Camera
   restore, the color/rim controls, and Set-as-Default persistence all
   actually work.

## Open questions / blockers

None currently blocking.
