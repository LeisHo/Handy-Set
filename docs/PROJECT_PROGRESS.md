# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Nothing in progress — the 6-part Palm Rotation/Responsive-features
request (2026-09-27) is fully complete, plus 3 interjected fixes from
the same session (Saved Cameras/list-picker persistence; Palm Rotation
height/distance independence + forearm-base marker; a real hand-
disappears bug where Responsive Pose Tween and Base Arm Rotation
fought over the same transform). See Recently completed below for the
full account.

Pushed to `https://github.com/LeisHo/Handy-Set`
(deployed via the Vercel project at `https://vercel.com/lpeis/handy-set`).

## Recently completed

- **RESOLVED (2026-09-27): hand disappeared (collapsed to a tiny
  sliver) whenever Responsive Pose Tween and Responsive Arm Rotation
  at Base were both active — user's own hypothesis ("bug clash with
  the whole hand rotation at base slider") was exactly right.**
  `applyModelRootTransform()` (run every frame by Pose Tween) reset
  `h.clone.quaternion`/`position` without telling
  `applyBaseArmRotation()`'s own delta-tracker, so the 2 systems fought
  over the same transform using stale assumptions every frame. Fixed
  by invalidating that tracker (`h.lastBaseArmQuat = null`) inside
  `applyModelRootTransform()` itself. Reproduced the exact symptom
  first, then confirmed the fix resolves it with both features active
  simultaneously — see `docs/CHANGELOG.txt`'s matching 2026-09-27
  (16th) entry.

- **DONE (2026-09-27): items 4-6 of the 6-part Palm Rotation request —
  Responsive Arm Rotation at Base, unified distance metric on
  Responsive Wrist Splay, Responsive Pose Tween.** New shared
  `armBaseDistanceT` metric (cursor-to-arm-base distance on desktop,
  phone-tilt % on mobile — deliberately different from the existing
  `tiltMagnitude`). Base Arm Rotation reuses `applyBaseArmRotation()`'s
  own curl-axis-safe delta-tracking; Pose Tween blends between
  `DEFAULT_POSE_NAME` and a picked target pose through the existing
  `applyPoseValuesToHand()` pipeline, specifically to avoid a 5th
  instance of this file's own recurring curl-axis bug class. Live-
  verified via direct finger-bone quaternion reads (not just
  screenshots): Base Arm Rotation's On/Off applies/reverts a measured
  exact delta; Pose Tween visibly and measurably blends between Fist
  and Big Open Palm by cursor distance. See `docs/CHANGELOG.txt`'s
  matching 2026-09-27 (15th) entry.
- **RESOLVED (2026-09-27): Palm Rotation depended on height and cursor
  distance when it shouldn't have; added a 2nd marker for the forearm
  base point.** `tiltOriginGround` now drops the forearm bone's world Y
  directly instead of sliding it along the camera's forward direction
  (which coupled the result to height/camera pitch); removed the
  `tiltMagnitude` scaling on Palm Rotation's angle entirely. New cyan
  `forearmBaseMarkerMesh`, sharing Show Target Marker's own checkbox.
  See `docs/CHANGELOG.txt`'s matching 2026-09-27 (14th) entry.
- **RESOLVED (2026-09-27): Saved Cameras (and all 5 list-pickers —
  Poses/Cameras/Lighting/Toon Shading/Tween Sequences) never actually
  persisted their Save/Overwrite/Rename/Delete/+Group/Import
  mutations.** Root cause: `buildListPicker()` called
  `saveDevPanelSettings()`, which only captures REGISTERED dev-panel
  controls — a raw items array has no such registration. Fixed with a
  dedicated localStorage + best-effort remote-sync persistence layer.
  Live-verified: Save/Delete on Saved Cameras survives a real page
  reload. See `docs/CHANGELOG.txt`'s matching 2026-09-27 (13th) entry.
- **DONE (2026-09-27): items 1-2 of the same 6-part request — Palm
  Rotation direction inverted + wrap-safe smoothing (11th entry);
  Whole-Hand-Rotation-at-Base curl-axis bug fixed, same class as 3
  prior fixes (12th entry).**

- **NEW (2026-09-27): Finger Gizmos (visual-only, confirmed with the
  user — no TransformControls/IK dragging).** Markers + 3 colored axis
  lines (X=red/Y=green/Z=blue) at every finger joint (15 per hand),
  with Gizmo Size/Color and Axis Line Length/Thickness sliders plus an
  On/Off checkbox. Ported the marker/tip-offset concept from HANDO's
  own real `setupFingerGizmos()` (read directly, not reconstructed) —
  the axis lines themselves are this project's own addition, not in
  HANDO's version. Live-verified: exact mesh counts (15+45), a
  screenshot showing correctly colored lines on top of the hand,
  slider-driven scale changes, and checkbox-driven visibility. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (10th) entry.

- **RESOLVED (2026-09-27): the Y=0 ground-plane dead-zone (raycast only
  hit the bottom ~third of the screen) — per direct instruction, a
  missed raycast now skips Palm Rotation's per-hand update entirely
  instead of computing a bogus angle from a stale point.** Live-
  verified: quaternion reads byte-identical while frozen in the dead
  zone, resumes correctly once back in the valid zone. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (9th) entry.
- **RESOLVED (2026-09-27): Show Target Marker checkbox had no actual
  mesh behind it since Phone Tilt was first built.** Added a small
  magenta sphere synced to `tiltTarget` every frame when enabled. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (8th) entry.

- **NEW (2026-09-27): Ground Plane dev-panel group (real visible slab,
  4 controls: On/Off, Height, Color, Scale) + a World Axes Gizmo
  checkbox in Debug.** Ground Height positions the slab's TOP face
  (not center); Ground Scale only affects X/Z (thickness is a fixed
  constant). Both live-verified: real checkbox clicks + `Box3`-measured
  world bounds. See `docs/CHANGELOG.txt`'s matching 2026-09-27 (7th)
  entry.

- **RESOLVED (2026-09-27, 6th pass): Palm rotation still didn't feel
  right on desktop — root cause was measuring the cursor's offset from
  SCREEN CENTER (arbitrary) instead of from the hand's own actual
  position.** Fixed per direct spec: the forearm base's live world
  position is projected onto the world Y=0 ground plane along the
  CAMERA's own forward direction, and the cursor is raycast onto that
  same ground plane — the rotation angle is measured directly between
  those two points. Live-verified: forearm anchor still holds (~7e-14
  noise), screen-center now correctly reads ~0deg. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (6th) entry.

- **RESOLVED (2026-09-27, 5th pass): Palm rotation snapped instantly to
  full strength on any nonzero cursor offset or device tilt, instead of
  scaling proportionally — fixed mouse "not aligned with cursor" feel
  and enabled the requested "more tilt = more rotation" mobile
  behavior in one change.** `computeRadialRollDeg()` is a pure `atan2`
  (direction only, magnitude-blind); a first attempt suspected the
  raycast/depth-plane math instead and was disproven live (reprojecting
  `tiltTarget` back through the camera showed it landing nowhere near
  the real cursor, even after "fixing" it — the plane's depth was never
  actually the issue, since both raycasts always shared one plane
  either way). Fixed by scaling the resulting angle by `tiltMagnitude`
  (already computed for both mouse and device-tilt input) in
  `animate()` — one change covers both input paths. Live-verified: near
  screen-center ~0deg, moderate offset ~-26deg, a corner ~-156deg —
  smooth, monotonic, correct direction at each point. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (5th) entry.

- **RESOLVED (2026-09-27, 4th pass — supersedes the 3rd pass's own axis
  choice below, anchor logic unchanged): Palm Faces Cursor and Palm
  Face Rotation rotate around plain canonical UP (0,1,0), not a
  bone-measured "local Y" axis.** The 3rd pass's `armYAxisAligned`
  (the bone's raw local Y, transformed through its own quaternion then
  `alignQuat`) turned out to be a correct reading of the WRONG thing:
  direct measurement showed `rForearmBend`'s local AND world quaternion
  are both identity (~1e-8) — this rig keeps bones fully unrotated at
  bind pose, orientation baked into geometry instead — so "the bone's
  raw local Y" reduces to just `alignQuat` applied to canonical Y,
  which lands near ALIGNED -Z (confirmed identical to
  `wristCropNormalAligned`), not anywhere near Y in the aligned/
  rendering frame the rest of this file already uses. Fixed by using
  plain UP directly; `armYAxisAligned`'s measurement is removed. The
  forearm-base anchor/pivot logic (3rd pass) is untouched — this was
  purely an axis bug. Live-verified via direct quaternion/position
  comparison (a 90deg rotation matched an independently-computed
  quaternion exactly, forearm world position unchanged to ~1e-14) — a
  visual screenshot check was inconclusive due to this sandbox's own
  documented WebGL-canvas-readback unreliability, confirmed via direct
  pixel sampling rather than dismissed. See `docs/CHANGELOG.txt`'s
  matching 2026-09-27 (4th) entry.

- **RESOLVED (2026-09-27): Tracking Enabled itself caused the whole arm
  to rotate, even with Palm Rotation/Responsive Wrist Splay/Wrist Crop
  all off.** An earlier same-morning fix (Haiku session, `dd070b3`)
  moved `updateTiltTarget()` inside the input-check block but left the
  actual wrapper reorientation (`hands.forEach` lookAt+slerp) running
  unconditionally whenever tracking + input were present, independent
  of `cfg.palmFacesCursor` — the checkbox that's actually supposed to
  gate that rotation. Fixed by gating the reorientation on
  `cfg.palmFacesCursor` (data pipeline `updateTiltTarget()` still runs
  unconditionally, since Wrist Splay/Crop need live `tiltMagnitude`),
  and by adding an explicit `cfg.trackingEnabled` check to
  `computeArmLengthT()`/`computeResponsiveWristSplayDeg()` so Tracking
  Enabled is a true master gate for all 3 features and has no visible
  effect on its own. Live-verified via direct wrapper-quaternion
  before/after checks with real mouse input. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 entry.

- **RESOLVED (2026-09-26, 4th pass): finger/thumb splay was subtly off
  on poses with both curl AND splay active on the same joint (e.g.
  "Fist"'s index and thumb) — a rotation-ORDER bug, not an axis-math
  bug.** HANDY DANDIES' real `applyCurlToSkeleton()` applies splay/
  splay2 BEFORE curl; this project had curl first. Since
  `rotateOnTrueWorldAxis()` reads the bone's world quaternion fresh each
  call, applying curl first meant splay's own axis got computed relative
  to the already-curled joint instead of rest — an error proportional to
  how much curl was also active, exactly matching "not aggressively
  wrong, but not the pose I intended." Fixed by reordering to match
  HANDY DANDIES exactly (no new math, every individual rotation call was
  already correct). Live-verified: Fist's real index/thumb values
  produce well-formed unit quaternions and a natural, correctly-
  articulated closed fist. See `docs/CHANGELOG.txt`'s matching
  2026-09-26 (09:02-09:06 AM) entry.

- **RESOLVED (2026-09-26, 3rd pass): the same curl-axis-tracking bug
  class, this time on Whole-Hand Rotation (modelRotX/Y/Z) instead of the
  wrist -- 0.0deg (floating-point noise) drift across all 3 axes,
  individually and combined, both via a standalone quaternion-math
  script and live against the real running app.** Root cause:
  `applyCurl()`/`applyPoseValuesToHand()`/`applyReactiveWristSplayFrame()`
  all passed `alignQuat` (modelRot-excluded) as `applyCurlToSkeleton()`'s
  `baseQuat` -- a 2026-09-21 workaround for a double-counting bug that
  existed in `curlExcludeQuatForHand()` at the time (it used to also
  exclude `h.clone.quaternion`, which already contains `modelRotQuat`).
  Once the 2nd-pass fix below corrected `curlExcludeQuatForHand()` to
  exclude `wrapper.quaternion` alone, that workaround went stale and
  should have been reverted alongside it, but wasn't. Fixed by passing
  `h.currentBaseQuat` (which correctly bakes in `modelRotQuat`) at all 3
  real call sites, matching HANDY DANDIES' own real, working pattern
  (`cloneBaseQuat = alignQuat * wholeHandRotQuat`, wrapper alone
  excluded) confirmed by reading that file's source directly. See
  `docs/CHANGELOG.txt`'s matching 2026-09-26 (03:31-03:54 AM) entry.

- **RESOLVED (2026-09-26, 2nd pass): a real, separate residual bug found
  right after the fix below was declared complete -- Tip Twist's own
  code path, not the curl/splay system. Now genuinely fully fixed: a
  15-bone x 2-axis (Bend/Rotation) sweep is 0.0deg (floating-point noise)
  on every single measurement.** Root cause: `bone.rotateOnWorldAxis()`
  (three.js's own built-in) silently misinterprets its axis as the
  bone's PARENT's local frame once any ancestor has real rotation --
  only ever visible on `rThumb3` because "Fist" is the only saved pose
  with a nonzero `tipTwist*` value at all. Fixed by switching to the
  SAME `rotateOnTrueWorldAxis()` helper curl/splay already use (no
  exclude-quat needed here), ported verbatim from HANDY DANDIES' own
  real fix for this identical issue. See `docs/CHANGELOG.txt`'s matching
  2026-09-26 (01:40-01:46 AM) entry.

- **RESOLVED (2026-09-26): the curl-axis-tracks-wrist bug is genuinely,
  completely fixed -- 0.0deg measured drift across Wrist Splay/Bend/
  Rotation's own full ranges, on 3 different fingers, matching HANDO's
  own real deployment exactly.** The real root cause (found via direct
  algebra, cross-checked against HANDY DANDIES' own working call site):
  `curlExcludeQuatForHand()` incorrectly combined `baseQuat` into the
  quaternion `rotateOnTrueWorldAxis()` excludes from a bone's world
  orientation -- HANDY DANDIES' own equivalent passes the wrapper's
  rotation ALONE. That extra factor left a real, angle-dependent residual
  (a conjugation that doesn't cancel) instead of a clean cancellation --
  near-zero at small angles (why Wrist Splay's own +-30deg range looked
  "mostly fine"), huge at large ones (Wrist Bend's own +-90deg, Wrist
  Rotation's own +-180deg). Fixed by excluding only the wrapper, and
  reverting `computeCurlAxisRefQuat()` to its original, always-correct
  formula (it never needed changing -- it just needed the right
  exclude-quat next to it). 2 earlier same-day attempts at this exact fix
  (an ancestor-chain rest composition, then a HANDO-style live-parent-
  quaternion port) are both reverted -- neither was wrong in isolation,
  neither was actually the bug. See `docs/CHANGELOG.txt`'s 2026-09-26
  (2nd) entry for the full account, including why the HANDO comparison
  that found this had to control for HANDO's own Whole-Hand Rotation
  being off in the first naive test (a non-apples-to-apples comparison
  that briefly looked like it disproved the fix).

- **Reverted the 2026-09-25 `withLiveFieldsPreserved()` fix (2026-09-26)
  -- it had its own real regression.** It omitted a saved pose's own
  `wristSplay`/`modelRotX/Y/Z` unconditionally, which silently broke 2 of
  the 4 `SAVED_POSES` ("Big Open Palm (S)", "Fist - Bent Back") that are
  defined ENTIRELY by their own `wristSplay` value -- confirmed applying
  either produced a wrist quaternion byte-identical to its non-splayed
  sibling. A saved pose's wrist/rotation fields apply normally again; the
  original reactive-stacking problem already has its own correct fix
  (the Min/Max clamp sliders) sitting unused.

- **A saved pose no longer overwrites Wrist Splay or Whole-Hand-Rotation
  X/Y/Z — Responsive Wrist Splay and Phone Tilt stay fully live.** Root
  cause of the original "fingers bent at weird angles" report:
  `applyWristPoseToSkeleton()` summed the pose's own wristSplay with
  Responsive Wrist Splay's live contribution (e.g. -55 + -71 at rest =
  -126), and since finger curl correctly tracks the wrist, that dragged
  every finger's curl along too. 2 earlier fixes this same day both got
  the scope wrong and were directly corrected: Min/Max clamps only
  bounded the distortion rather than stopping it; a full rendering-layer
  decoupling stopped Responsive Wrist Splay from having ANY live effect
  at all ("all phone tilt function died"), which wasn't wanted either.
  The correct scope, per direct instruction: leave every live system
  (Reactive Wrist Splay, Phone Tilt) fully functional, and instead make
  applying a SAVED POSE (`applyPosePreset`/"Use", and Tween's own
  hold/lerp playback) skip `wristSplay`/`modelRotX`/`modelRotY`/
  `modelRotZ` specifically — those 4 stay whatever they currently are;
  every other saved field still applies normally. Live-verified via the
  real "Use" button: set wristSplay/modelRotY to distinctive test
  values, applied "Fist" (whose own data has both at 0), confirmed both
  stayed untouched while curlIndex correctly updated to the pose's own
  value (90). Also re-confirmed Reactive Wrist Splay's live wrist
  movement is genuinely restored. The 3 Min/Max clamp sliders (Pose ->
  Wrist) are still there as a harmless safety ceiling, unused by this
  particular fix.
  Separately confirmed (not yet fixed, not requested): Phone Tilt's own
  "Tracking Enabled" checkbox doesn't gate Responsive Wrist Splay or
  Reactive Arm Length — those have their own independent toggles, which
  is why gyro effects can persist with the whole Phone Tilt group off.
- **Added browser-based device identification, surfaced in Dev Panel ->
  Debug -> Settings -> Device Information.** New `src/deviceInfo.js`:
  User-Agent Client Hints (`navigator.userAgentData` +
  `getHighEntropyValues()`) as the primary source for device
  type/brand/model/platform/OS version/browser/version/mobile, with a
  UA-string fallback for browsers without Client Hints (Safari). Every
  field is explicitly CONFIRMED/INFERRED/UNAVAILABLE — never guesses an
  exact model from screen size or other indirect signals. Live-verified
  end-to-end on desktop Chromium (checkbox toggle, Refresh, correct
  "Not exposed by browser" handling when Client Hints returns no model,
  zero console errors) — real Android/Pixel 9a Chrome and real iOS/
  Safari are NOT yet verified (no physical device available in this
  environment); see What's Next.
- **Production (no `?dev=1`) and the dev-mode URL showed different
  startup state — root-caused and fixed.** The git-tracked Sync settings
  apply mechanism (`applyFullDevPanelState()`) writes each value by
  finding its dev-panel DOM element and dispatching a real input event —
  a missing element is a silent no-op. The dev panel's DOM was only ever
  built eagerly in dev mode (`if (isDevAllowed) ensureDevPanelBuilt()`,
  the panel's own *visibility* gate), so on a plain production visit that
  DOM never existed and the whole remote-settings apply silently did
  nothing — every ordinary visitor saw the raw hardcoded literal
  defaults, not the tuned/saved ones. Fixed by calling the already-
  idempotent `ensureDevPanelBuilt()` unconditionally before applying,
  in `main.js` only (`devPanel.js` stayed the verbatim template copy).
  The panel's visibility itself is untouched — still a separate, pure-CSS
  gate, so ordinary visitors never see a DEV button or panel. Live-
  verified byte-identical `cfg` state between a fresh `?dev=1` load and a
  fresh plain load. As a side effect, this also resolved the "hand nearly
  invisible on production" concern below (#3) — production now correctly
  picks up the git-tracked gray background instead of the all-white
  hardcoded default.
- **Whole-Hand Rotation X/Y/Z leaked into finger curl/splay instead of
  rigidly rotating the model — real root cause found and fixed.** An
  earlier fix (rotating `h.clone` around a palm-center pivot) turned out
  to only be half the story: `rebuildField()` cloned each hand via a
  plain `modelRoot.clone(true)` (`Object3D.clone`), which clones Bone
  objects as part of the scene graph but does NOT rebind the
  `SkinnedMesh`'s own `skeleton.bones` to them — a known three.js pitfall.
  Every bone actually used for posing (curl, splay, wrist bend) was
  silently still the original, un-cloned template's bones, living in a
  disconnected hierarchy never affected by rotating `h.clone`. 2 earlier
  rounds of curl-axis-exclusion math (this session) couldn't work because
  they assumed a parent-child relationship that never existed. Fixed by
  switching to `SkeletonUtils.clone()` (three.js's own fix for this
  case). Live-verified: a finger bone's local quaternion is now
  byte-identical across very different Whole-Hand-Rotation values (its
  world quaternion correctly differs), and a screenshot comparison shows
  the same posed hand shape rotating rigidly.
- **Restored "Responsive Wrist Splay"** after a direct correction that an
  earlier removal this session had misidentified it as a different group
  ("Responsive Palm Rotation") the user actually meant to flag. Fully
  restored from git history, dev-panel-settings.json's 2 orphaned empty
  group shells cleaned up.
- **Wrist crop was using the wrong axis, wrong direction, and a hard
  clamp** — 2 earlier attempts this session both got it wrong in
  different ways. Re-read HANDO's own real `updateWristClipPlane()`
  verbatim and ported it exactly: the arm bone's own axis (not a
  wrist-bend-following one), un-negated (fixes cropping the hand instead
  of the arm), and completely unclamped (0-100%+ all do something now,
  instead of clamping at 1.0). Live-verified: 0% shows the full forearm,
  100% crops it away with the hand fully intact, 150%+ correctly pushes
  the crop into the hand.
- Made cursor tracking proportionate to normal mouse movement instead of
  requiring extreme cursor positions, ported from Handy Dandies' real
  raycast-based targeting. This also resolved "hand goes invisible at
  extreme rotation" — three.js's default frustum culling using a stale
  bind-pose bounding sphere; fixed by disabling it per-hand.
- Earlier: Toon Shading `onBeforeCompile` root cause, finger curl/splay
  not tracking wrist bend/splay, Hide Wrist not applying to the live
  model, dev-panel DOM sync fixes — see `CHANGELOG.txt` for full history.

## What's next

1. **Test Device Information on a real Pixel 9a + Chrome** (and ideally a
   real iPhone/Safari) — open `https://handy-set.vercel.app/?dev=1` ->
   DEV -> Debug -> Settings, check "Device Information". Confirm whether
   Chrome's `getHighEntropyValues()` actually returns `model: "Pixel 9a"`
   on real hardware (unverified — this environment has no physical
   device), and that the fallback path behaves sensibly on Safari.
2. Decide whether a single master kill-switch for all gyro-driven
   effects is wanted — Phone Tilt's own "Tracking Enabled" checkbox
   currently only gates whole-hand rotation, NOT Responsive Wrist Splay
   or Reactive Arm Length (each has its own separate toggle). Flagged to
   the user 2026-09-25, not yet built (not requested).
3. Find "Responsive Palm Rotation" — the user says this group exists in
   their own app, but an exhaustive search of the git-tracked
   dev-panel-settings.json found no trace of it anywhere. Likely needs
   the user to hit Sync from whichever device/browser shows it (so its
   real state reaches git), or a screenshot/more specific description.
4. Verify Phone Tilt gyroscope rotation specifically on the user's actual
   Pixel 9a — still unverified, no physical device available here (can be
   folded into the same real-device session as item 1 above).
5. ~~Decide on a visible default color scheme~~ — now moot for production:
   the startup-sync fix above means production correctly picks up the
   git-tracked gray background (`#bfbfbf`) instead of the all-white
   hardcoded default. Revisit only if the *hardcoded* literal defaults
   in `main.js` (the fallback when no git settings are reachable, e.g.
   `file://` or an offline API) still need their own deliberate tuning.
6. Port Pose Offset X/Y/Z to Handy Dandies' camera-relative resolution
   before any saved pose is given a nonzero offset value.
7. Tune default Camera/Lighting/Toon values to taste, now that Camera
   restore, the color/rim controls, and Set-as-Default persistence all
   actually work.

## Open questions / blockers

- **"Responsive Palm Rotation"** — see What's next #3. Not blocking other
  work, but unresolved.
