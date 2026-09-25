# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Nothing in progress. Pushed to `https://github.com/LeisHo/Handy-Set`
(deployed via the Vercel project at `https://vercel.com/lpeis/handy-set`).

## Recently completed

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
