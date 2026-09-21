# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Nothing in progress. Pushed to `https://github.com/LeisHo/Handy-Set`
(deployed via the Vercel project at `https://vercel.com/lpeis/handy-set`).

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
  never got re-added to `material.clippingPlanes`). Fixed.
- Extensively verified (after repeated, firm pushback) that Phone Tilt
  and Palm Face Rotation's underlying rotation mechanism is NOT broken —
  confirmed via direct quaternion comparisons on both local preview and
  the real Vercel deployment. The real explanation for why Palm Face
  Rotation looks like it does nothing: its roll axis is nearly aligned
  with the default cameras' own view direction, so the visible effect is
  genuinely hard to see (a real usability problem) rather than a wiring
  bug. Documented in CLAUDE.md with the specific ruled-out hypotheses.

## What's next

1. Verify all of the above on the user's actual deployed Vercel instance
   and real device.
2. Verify Phone Tilt gyroscope rotation specifically on the user's actual
   Pixel 9a — still unverified, no physical device available here.
3. Decide what to do about Palm Face Rotation's visual imperceptibility
   — either a different default roll axis, or camera framing that makes
   the roll actually visible, or accept it as a subtle "twist" effect by
   design. This needs a decision, not a unilateral code change.
4. Decide on a visible default color scheme (current all-white default
   makes the hand nearly invisible against the page background).
5. Port Pose Offset X/Y/Z to Handy Dandies' camera-relative resolution
   before any saved pose is given a nonzero offset value.
6. Tune default Camera/Lighting/Toon values to taste, now that Camera
   restore, the color/rim controls, and Set-as-Default persistence all
   actually work.

## Open questions / blockers

None currently blocking.
