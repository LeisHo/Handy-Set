# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Verifying the finger curl/splay wrist-tracking fix against multiple
camera angles, per direct request, to get a clearer look at whether
remaining poses render correctly.

## Recently completed

- Dev-panel DOM sync after preset "Use", Outline removal, the Toon
  Shading `onBeforeCompile` root cause, ghost/misaligned group
  checkboxes, Set-as-Default being wiped by the main Sync click, Phone
  Tilt/Palm Facing defaulting off, Camera literal-restore + a corrupted
  `FRONTOS` seed value, Tween button styling, and the Enable Motion
  button removal — all fixed and live-verified in earlier rounds this
  session (see `CHANGELOG.txt`).
- Finger curl/splay axis not tracking wrist bend/splay — the real,
  separate bug behind "some poses work, some are still messed up" after
  the wrist-rotation-method fix alone. Found by reading Handy Dandies'
  own CHANGELOG for this exact bug class (per direct instruction) and
  ported its real, twice-corrected formula verbatim
  (`computeCurlAxisRefQuat()`). Live-verified: zero regression at
  wristBend=wristSplay=0 (pixel-identical), real visible effect at
  nonzero wristSplay.
- Investigated a separate "Phone Tilt/cursor tracking does nothing"
  report by testing directly against the real live Vercel deployment:
  confirmed the rotation mechanism itself works
  (`hands[0].wrapper.quaternion` genuinely changes on mouse move). Found
  a likely explanation instead — the live default color scheme is all
  white (`toonBaseTint`/`bgColor`/`keyColor` all `#ffffff`), making the
  hand nearly invisible against the page. Pre-existing, not a regression;
  not fixed yet (a deliberate color choice, not unilaterally changed).

## What's next

1. Verify all of the above on the user's actual deployed Vercel instance
   and real device — most fixes this session were only verified against
   a local static-server preview.
2. Verify Phone Tilt gyroscope rotation specifically on the user's actual
   Pixel 9a.
3. Decide on a visible default color scheme (current all-white default
   makes the hand nearly invisible against the page background).
4. Port Pose Offset X/Y/Z to Handy Dandies' camera-relative resolution
   before any saved pose is given a nonzero offset value.
5. Tune default Camera/Lighting/Toon values to taste, now that Camera
   restore, the color/rim controls, and Set-as-Default persistence all
   actually work.

## Open questions / blockers

None currently blocking.
