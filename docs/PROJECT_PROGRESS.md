# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Nothing in progress. Pushed to `https://github.com/LeisHo/Handy-Set`
(deployed via the Vercel project at `https://vercel.com/lpeis/handy-set`).

## Recently completed

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

1. Find "Responsive Palm Rotation" — the user says this group exists in
   their own app, but an exhaustive search of the git-tracked
   dev-panel-settings.json found no trace of it anywhere. Likely needs
   the user to hit Sync from whichever device/browser shows it (so its
   real state reaches git), or a screenshot/more specific description.
2. Verify Phone Tilt gyroscope rotation specifically on the user's actual
   Pixel 9a — still unverified, no physical device available here.
3. ~~Decide on a visible default color scheme~~ — now moot for production:
   the startup-sync fix above means production correctly picks up the
   git-tracked gray background (`#bfbfbf`) instead of the all-white
   hardcoded default. Revisit only if the *hardcoded* literal defaults
   in `main.js` (the fallback when no git settings are reachable, e.g.
   `file://` or an offline API) still need their own deliberate tuning.
4. Port Pose Offset X/Y/Z to Handy Dandies' camera-relative resolution
   before any saved pose is given a nonzero offset value.
5. Tune default Camera/Lighting/Toon values to taste, now that Camera
   restore, the color/rim controls, and Set-as-Default persistence all
   actually work.

## Open questions / blockers

- **"Responsive Palm Rotation"** — see What's next #1. Not blocking other
  work, but unresolved.
