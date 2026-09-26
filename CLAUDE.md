# HANDYSET — Project Conventions

A mobile-first three.js scene rendering a single rigged hand (offshoot of
`J:\CLAUDE\PROJECTS\HANDY DANDIES`, reusing its rigged hand asset and pose/
camera/lighting/toon-shading systems) that rotates in response to the
phone's own gyroscope/accelerometer tilt. On desktop, cursor distance/angle
from the viewport center stands in for phone tilt. Deployed/tested on
Vercel. See `docs/PROJECT_SUMMARY.txt` for full scope and
`docs/CODE_SUMMARY.txt` for architecture.

The dev panel follows the workspace-wide standard in the parent
`CLAUDE.md` §12, built from the ACTUAL `.claude/TEMPLATE_DEV_PANEL.html`
engine (`src/devpanel/devPanel.js` is that file's own `<script>` block,
copied verbatim — not a divergent hand-rolled copy the way HANDY DANDIES'
own devPanel.js is). Only extend `devPanel.js` itself for a genuinely
generic engine capability it doesn't have yet; add project settings via
`src/main.js`'s own `render*Group()` functions, called from
`window.renderHandysetDevGroups` (wired into the template's
`ensureDevPanelBuilt()` splice point).

## File map

- `index.html` — import map (three.js via CDN, matching HANDY DANDIES'
  pinned version), canvas, loading/motion-permission UI, and the dev
  panel's body markup (copied verbatim from the template). Script load
  order matters: `src/main.js` (a module, always deferred) loads BEFORE
  `src/devpanel/devPanel.js` (`defer` attribute added so it participates
  in the same deferred-execution queue) — `main.js` must define
  `window.renderHandysetDevGroups` before `devPanel.js`'s own eager
  `ensureDevPanelBuilt()` call (auto-open on localhost/dev-mode) runs, or
  that call finds nothing to render. See index.html's own comment.
- `src/main.js` — all real logic: bind-pose measurement, finger/wrist
  posing (ported verbatim from HANDY DANDIES' `applyCurlToSkeleton`/
  `rotateOnTrueWorldAxis`), toon material + gradient map, wrist-crop
  clipping plane, camera/lighting preset system, Phone Tilt mechanic
  (device orientation + desktop mouse fallback, both reduced to the same
  normalized tilt-vector abstraction), Tween playback, and every dev-panel
  group's render/wire functions.
- `src/style.css` — page styles + the template's own dev-panel CSS,
  copied verbatim (see its own header comment for the exact source).
- `src/devpanel/devPanel.js` — the template's engine `<script>` block,
  copied verbatim except for one inserted line at the documented splice
  point inside `ensureDevPanelBuilt()`.
- `data/processed/HAND3D/Hand2.glb` — the rigged hand asset, already
  present from before this project's reset (same asset HANDY DANDIES
  uses).
- `api/save-settings.js` — Vercel serverless function backing the dev
  panel's git-tracked Save (§12l upgrade), ported from HANDY DANDIES' own.
  Wired from `main.js`'s own `wireRemoteSaveButtons()`/
  `loadRemoteSettingsOnStartup()` — deliberately NOT wired inside
  `devpanel/devPanel.js` itself (kept a verbatim copy); instead attaches
  its own extra click listeners to the existing SYNC buttons and polls
  for devPanel.js's globals to become available. Requires `GITHUB_TOKEN`/
  `DEV_PANEL_SAVE_SECRET` set on this project's own Vercel project — see
  README.md's own setup section.

## Known simplifications vs. HANDY DANDIES

**Corrected 2026-09-21** — the original version of this section documented
several SILENT scope cuts (a plain select+3-buttons instead of the real
list-picker, generic group/setting names instead of HANDY DANDIES' actual
current ones) that should have been surfaced and asked about instead of
disclosed after the fact — see the parent workspace `CLAUDE.md` §0a's new
"Full fidelity or ask" subsection, added the same day this was caught. The
list-picker (Save/Overwrite/Use/Rename/Delete/+Group, Export/Import on
Saved Poses, a real scrollable list) and exact group/setting names/
groupings (cross-checked against `HANDY DANDIES/data/processed/dev-panel-
settings.json`'s actual saved `order`/`textOverrides` — NOT just the base
DEV_GROUPS code, which the LIVE panel had already been reorganized away
from) are now ported properly. The full Field Layout group (rows/cols/
spacing/offsets/hide) is also now ported, defaulted to 1x1 (a single
centered hand) per direct instruction, ready for more hands later.

Genuine remaining gaps — these need real new subsystems, not just
wiring, and are still open:

- ~~Reactive Arm Length~~ — **fixed 2026-09-21**, ported verbatim from
  HANDY DANDIES' real curve-editor widgets (Catmull-Rom spline + optional
  bezier handles, SVG draggable-point editor, dual-handle range bar) and
  reactive math. One deliberate, disclosed adaptation: HANDY DANDIES
  normalizes "distance" against the live min/max distance across a whole
  FIELD of hands each frame — a concept that doesn't exist for this
  project's single-hand case — so `tiltMagnitude` (already computed every
  frame for Phone Tilt) stands in as the distance input instead. Every
  control (reactive on/off, default value, min/max range, curve editor)
  is otherwise a full port. See `docs/CHANGELOG.txt`'s matching entry.
- **Responsive Wrist Splay — built, then REMOVED ENTIRELY 2026-09-21**,
  same day, per direct request ("you didn't fix it, I'm going to build it
  from scratch with you... remove this group entirely from the code").
  Not a scope gap to silently re-fill — a future rebuild of this feature
  needs fresh direction from the user, not a repeat of this session's own
  port. `buildReactiveRangeWidget()`/`buildReactiveCurveWidget()` (the
  generic curve-editor widgets Reactive Arm Length still uses) were kept,
  since they're genuinely shared infrastructure, not wrist-splay-specific.
- ~~Toon rim-lighting~~ — **fixed 2026-09-21**, ported verbatim from HANDY
  DANDIES' real `createToonMaterial()` onBeforeCompile GLSL patch (not
  reconstructed). See `docs/CHANGELOG.txt`'s matching entry.
- **Outline: Use OutlinePass toggle + Hull-shader alternative** (Hull
  Outline Thickness) — this project only ever built the OutlinePass
  technique; HANDY DANDIES lets you switch between 2.
- **Camera Max Extents** only clamps zoom distance (`controls.maxDistance`)
  — HANDY DANDIES' own `enforceCameraPanExtent()` also clamps the PAN
  target to a bounding sphere every frame; not ported.
- ~~Wrist bend/splay/rotation axis choices~~ — **fixed 2026-09-21**, ported
  verbatim from HANDY DANDIES' real `applyWristPoseToSkeleton()`
  (`bone.rotateX/rotateZ/rotateY`, not `rotateOnTrueWorldAxis`). See
  `docs/CHANGELOG.txt`'s matching entry.
- **Pose Offset X/Y/Z is plain world-space** (`h.clone.position.set(...)`),
  not HANDY DANDIES' own camera-relative resolution
  (`applyPoseOffsetToPosition()`, against the camera's own right/up/
  toward-camera basis) — confirmed via direct source read, not yet
  ported since every seeded saved pose currently has
  `poseOffsetX/Y/Z: 0` (no visible effect either way yet). Port this
  before any pose actually uses a nonzero offset, or it will visually
  point in the wrong direction whenever the camera isn't aligned with
  world axes.
- **Shoulder/elbow/forearm pose fields** (`shoulderRaise`, `elbowBend`,
  etc.) in the imported pose JSON are not wired to any bone — every
  provided pose has them at 0, and the wrist crop hides that region
  regardless.
- **Multi-hand camera framing**: `getHandCenterWorld()`/camera presets
  target the PRIMARY hand (`hands[0]`) only — reasonable for the current
  1x1 default, but once more hands are added the camera won't automatically
  frame the whole field; needs its own follow-up.
- ~~Tween group doesn't match Hando's UI~~ — **fixed 2026-09-21**,
  rebuilt with a real ordered multi-select pose list, Hold entries, a
  manual scrub slider, and PNG export, researched directly from Hando's
  own source. Two disclosed sub-simplifications remain: the drag-reorder
  MECHANISM uses native HTML5 drag-and-drop rather than Hando's own
  pointer-capture engine drag (that infra isn't part of the raw
  TEMPLATE_DEV_PANEL.html this project is built on), and
  `exportTweenSequence()` is a faithful from-scratch rebuild of the
  render-and-download behavior, not a verbatim port (Hando's own exact
  implementation wasn't available to extract).

## Gotchas

- **Reactive Arm Length / Responsive Wrist Splay's "distance" input is
  `tiltMagnitude` (0-1, the same normalized cursor/tilt-from-center value
  Phone Tilt already computes every frame), not HANDY DANDIES' own
  per-field live min/max distance across a whole array of hands** — that
  concept doesn't exist for a single hand. If this project's Field Layout
  ever grows past 1x1 in a way that matters for this feature, revisit
  whether `tiltMagnitude` is still the right per-hand distance signal (it
  currently is NOT per-hand — every hand in a future multi-hand field
  would share the exact same value) before assuming it scales. Both
  features' curve math (`evaluateReactiveCurve`/`catmullRomY`/
  `cubicBezier1D`/`bezierSegmentY`), 2 widget builders
  (`buildReactiveRangeWidget`/`buildReactiveCurveWidget`, genericized —
  HANDY DANDIES has 4 near-duplicate functions, one pair per feature)
  and their shared per-frame `curveWidgetResyncs` poll array (detects a
  devPanel.js Reset/restore that writes straight to `input.value` without
  firing an 'input' event, via a plain last-seen-value string compare)
  are a verbatim/genericized port — see `docs/CHANGELOG.txt`'s 2026-09-21
  entry for the full account. Responsive Wrist Splay's own live
  reapplication (`applyReactiveWristSplayFrame()`, called from
  `animate()`) re-bakes BOTH the wrist bone AND all 5 finger curls every
  frame while reactive — necessary because finger curl axes
  (`computeCurlAxisRefQuat()`) depend on the wrist's current orientation,
  same reasoning as HANDY DANDIES' own documented "idle repose" pattern.
  This project's single/small hand count made HANDY DANDIES' own
  stagger-across-hands performance optimization unnecessary — not ported.

- **Any dev-panel group/row structural change (rename, split, merge, id
  change) needs `HANDYSET_SETTINGS_SCHEMA_VERSION` (top of `main.js`)
  bumped**, or a visitor's own stale `localStorage` (and the git-tracked
  `data/processed/dev-panel-settings.json`, if also stale) restores the
  OLD layout on top of the new one — `applySectionOrder()` appends an
  unmatched old group rather than replacing it, producing literal
  duplicate groups/rows with dead ids. This was the real cause of a
  "Pose Offset/Rotation/Thumb in the wrong place" + "miscellaneous
  unclickable checkboxes" report that looked like two unrelated bugs.
  Bumping the version constant clears the stale local save automatically
  on next load; the git file needs a manual reset if it's also stale.

- **`registerDevControlArray()` is REQUIRED, not optional, for the "Show in
  Mobile/Landscape" checkbox to actually do anything.** Every control this
  project builds via `addRow()` is collected into `HANDYSET_CONTROLS` and
  registered once at the end of `renderHandysetDevGroups()`. Without this
  call, `ensureDynamicTargetRow()` (devPanel.js)'s own
  `findRegisteredControlById()` lookup always fails, so it silently bails
  out (`if (!desktopCtrl) return existingId || null`) and never creates
  the actual Mobile/Landscape row — regardless of what the checkbox itself
  says. This was missing entirely on the first pass: every checkbox
  toggled and cascaded correctly (its own state is independent of the
  registry), which is exactly what made the bug easy to miss without
  actually checking whether the mirrored row showed up.

- **`addRow()` (main.js) must set `ctrl.tab = 'desktop'` on every control**,
  or `buildUniformControlRow()` (devPanel.js) silently attaches the wrong
  per-row device checkbox ("Independent from Desktop" instead of "Show in
  Mobile/Landscape") since it checks `ctrl.tab === 'desktop'` explicitly
  with no sensible default for a missing field. Missed on the first pass
  across every control literal in every `render*Group()` function — fixed
  centrally in `addRow()` itself (the one choke point every control passes
  through) rather than touching ~150 individual control objects.
- **The group-level cascade checkbox (`buildGroupCascadeCheckbox()` in
  devPanel.js) ships from `TEMPLATE_DEV_PANEL.html` with
  `cb.style.display = 'none'` hardcoded at creation, and nothing anywhere
  in that ~5700-line file ever sets it back to visible** (confirmed by
  exhaustive grep) — a real latent bug in the template file itself, not a
  simplification made here. Fixed locally by removing that line (see the
  function's own comment). Worth folding back into
  `.claude/TEMPLATE_DEV_PANEL.html` itself per its own MAINTENANCE note,
  since every other project built from this template has the same bug.
- **This sandbox's local static server can intermittently fail to fully
  deliver `devPanel.js`** (`200 OK` but also `net::ERR_CONNECTION_RESET`
  on the same request, per `read_network_requests`) — when the dev panel
  loads with every group showing 0 children and devPanel.js's own globals
  never become available, this is very likely the cause, not a real code
  regression. Same documented gotcha as HANDY DANDIES' own `main.js` size
  issue, just hitting `devPanel.js` here (4557 lines) instead. Retry the
  navigation before assuming a just-made change broke something.

- **The `html.dev-mode` class comes from a tiny early `<head>` script**
  (before `<link rel="stylesheet">`), not from `devPanel.js` itself —
  missing it (an early mistake this session made when first assembling
  `index.html`) leaves the DEV toggle button and panel permanently
  `display:none` even though `devPanel.js` itself loads and runs fine.
  Copy it from `TEMPLATE_DEV_PANEL.html` lines 178-186 verbatim if ever
  rebuilding `index.html` from scratch.
- **Script tag order/defer matters** — see the File Map note above.
- **`window.innerWidth`/`innerHeight` can read 0 at script-parse time in
  this sandbox** (same documented HANDY DANDIES gotcha) — `animate()`
  self-heals every frame by comparing `renderer.getSize()` against the
  live window size, same fix shape as that project's own.
- **Bump `?v=` on `src/main.js`/`devpanel/devPanel.js` in `index.html`
  when their content changes** — this static server can serve a stale
  cached copy otherwise (same documented HANDY DANDIES gotcha; caused
  real confusion this session before being caught).
- **A stack-overflow error** (`RangeError: Maximum call stack size
  exceeded`, inside `devPanel.js`'s own dynamicDevice mirroring code,
  `onDevTargetControlEdited`) was observed once during this session's own
  live verification, after clicking a Debug-group checkbox. Not yet
  root-caused or reproduced deliberately — the panel kept working
  afterward (checkbox toggled correctly, rendering unaffected), so it
  wasn't fatal, but flag it if it recurs.
- **Real device sensor data (accelerometer/gyroscope/compass) could not be
  verified in this session** — no physical device was available; only the
  gating logic (touch-device detection, iOS permission-request flow,
  Desktop-silence) was verified to run without crashing.
- **`Material.prototype.copy()` (three.js) does NOT copy `onBeforeCompile`
  — a `.clone()`'d material silently falls back to the inherited no-op
  stub, not the source material's own custom shader-injection function.**
  Confirmed 2026-09-21 by fetching and reading three.js 0.169.0's actual
  `src/materials/Material.js` `copy()` method body from unpkg — no such
  line exists. `rebuildField()` clones a shared `toonMaterial` per hand
  (`skinnedMesh.material = toonMaterial.clone()`) on the strength of an
  in-code comment that asserted the opposite; that assumption was wrong,
  and it meant the ENTIRE Toon Shading rim-light + diffuse-tint-override
  system had zero effect on any rendered hand — only `material.color`
  (a normal, correctly-copied property) had any visible effect, which is
  exactly the shape of the report that surfaced this ("with all color
  pickers as black or white, our hand is still showing up with color").
  Live-confirmed both before (colorToonTint=red and rimIntensity=3 with
  rimColor=green both produced literally zero visual change) and after
  (same inputs produced a fully red hand / a visible green rim glow) the
  fix: explicitly reassign
  `skinnedMesh.material.onBeforeCompile = toonMaterial.onBeforeCompile`
  immediately after every `.clone()` call. Any future material clone in
  this file that relies on a custom `onBeforeCompile` needs the same
  explicit reassignment — it is never implicit.
- **`Object3D.clone(true)` on a hierarchy containing a `SkinnedMesh` does
  NOT rebind that mesh's `skeleton.bones` to the newly-cloned bone
  objects — a second, more severe instance of the same "generic
  three.js `.clone()` silently drops something" family as the
  `Material.prototype.copy()` entry above.** Root-caused 2026-09-21 for
  the "Whole Hand Rotation X/Y/Z" bug (sliders visibly affected finger
  curl/splay instead of rigidly rotating the model) — 2 earlier rounds
  of curl-axis-exclusion fixes this session couldn't work because they
  assumed `skeleton.getBoneByName(...)` returned a descendant of
  `h.clone`; it didn't. `rebuildField()` cloned each hand via
  `modelRoot.clone(true)`, which DOES clone the Bone objects as part of
  the scene graph (they're ordinary `Object3D` descendants), but
  `SkinnedMesh.copy()` never rebinds the mesh's own `.skeleton.bones`
  array to point at them — it's left referencing the ORIGINAL,
  un-cloned template's bones. Confirmed live via direct uuid comparison
  (`skeleton.getBoneByName('rIndex1').uuid` differed from the
  same-named bone found by walking DOWN from `h.clone` itself) and by
  walking a bone's own `.parent` chain up to its root, which never
  reached `h.clone` at all. Fixed by switching to `SkeletonUtils.clone()`
  (`three/addons/utils/SkeletonUtils.js`) — three.js's own documented
  fix for exactly this case. **Gotcha on the fix itself:** that module
  exports `{ retarget, retargetClip, clone }` as bare named exports, NOT
  a `SkeletonUtils` namespace object — `import { SkeletonUtils } from
  '...'` throws `SyntaxError: does not provide an export named
  'SkeletonUtils'` at the very first deploy attempt (caught live via
  `read_console_messages` within a minute). Import `clone` directly
  (this file aliases it to `cloneSkinnedSkeleton` to avoid shadowing the
  many local `clone` variables already in use). **Any other project in
  this family (HANDY DANDIES, HANDO) that clones a hand via a plain
  `Object3D.clone(true)` on a `SkinnedMesh`-containing hierarchy likely
  has this exact same latent bug** — worth checking if a similar
  whole-model-rotation or multi-instance feature there ever seemed to
  "not really rotate the skeleton."
- **Isolated `javascript_tool` eval can't see the page's own classic-
  script-declared globals (`ensureDevPanelBuilt is not defined`, etc. —
  same documented HANDY DANDIES gotcha) but CAN drive real DOM event
  listeners** — setting `el.value` and dispatching a real
  `new Event('input', {bubbles:true})` on a dev-panel slider/color input
  correctly triggers `wireSlider()`/`wireColor()`'s own
  `addEventListener('input', ...)` handlers (confirmed live this
  session, used to test Toon Shading controls without needing a native
  OS color-picker dialog). Useful for testing form controls specifically
  even though calling a page-defined FUNCTION by name still fails.
  **A top-level module (`type="module"`) function is never reachable via
  `window.fnName` at all, from ANY context, real or isolated** — ES
  modules don't leak top-level declarations to global scope, unlike a
  classic script. To test a module function's OWN logic without a real
  network backend, patch `window.fetch` instead (a real, shared, global
  API every context can see and every context's real code actually
  calls at runtime) and drive the page through its real UI (`computer`
  clicks on the real buttons) — confirmed working this session to verify
  `remoteSaveCurrentSettings()`'s GET-merge-POST logic against an
  in-memory mock store, with no real `/api/save-settings` backend
  available locally.
- **`.dev-group-cascade-checkbox` (devPanel.js) needs
  `.dev-section-title { position: relative; }` in `style.css`, or it
  renders as a "ghost checkbox" floating in the middle of a group's own
  content instead of on its title bar.** Root cause: the checkbox is
  appended as a CHILD of `.dev-section-title` and absolutely positioned
  (`top:50%; right:52px`), but `.dev-section-title` itself never
  declared a `position`, so the checkbox's absolute positioning escapes
  to the next positioned ancestor — `.dev-section`, which spans the
  WHOLE group (title + every row/subgroup inside it), not just the
  title bar. `top:50%` then resolves against that much taller box.
  Reported twice this session as two seemingly different bugs ("ghost
  checkboxes" and, separately, "some checkboxes aren't aligned to the
  right edge of the dev panel") before being traced to one shared cause.
  Fixed 2026-09-21, and confirmed `.claude/TEMPLATE_DEV_PANEL.html` has
  this identical latent bug (folded the fix back into it too).
- **`remoteSaveCurrentSettings()` (main.js) MUST GET-merge-POST, never
  blind-POST `captureFullDevPanelState()`'s own snapshot** — that
  function (devPanel.js-owned) has no knowledge of this project's own
  extra top-level settings-JSON fields (`defaultPose`/`defaultCamera`/
  `defaultLighting`/`defaultToon`, written by `saveFieldAsDefault()`), so
  a blind overwrite from the main Save/Sync button silently wiped
  whatever `saveFieldAsDefault()` had just written the moment before —
  confirmed live as the exact cause of "I click [Set as Default], and i
  click save, and on refresh its still the old settings." Any FUTURE
  custom top-level field added to this settings JSON needs the same
  GET-merge-POST discipline everywhere it's written, not just in
  `saveFieldAsDefault()` — a single blind-overwrite call anywhere in the
  save pipeline can silently erase it.
- **`cfg.trackingEnabled` defaults to `true` (corrected 2026-09-21, was
  `false`)** — it's the master gate for the ENTIRE Phone Tilt / Palm
  Facing mechanism (`animate()`'s own
  `if (cfg.trackingEnabled && hands.length) {...}` block is the only
  place any of that code runs at all, gyroscope or desktop-mouse
  fallback alike). Defaulting it off meant a fresh visitor with no prior
  Sync — including the real Vercel deployment — saw the app's own
  headline mechanic do nothing at all, confirmed as the shared root
  cause behind 2 separate direct reports ("phone tilting does nothing"
  and the Palm Facing rotation slider having no visible effect). Don't
  reintroduce a `false` default here without a real reason.
- **The "Enable Motion" button was removed entirely (2026-09-21)** — Phone
  Tilt's on/off is now purely `checkboxTrackingEnabled` (`Tracking
  Enabled`, Phone Tilt group). Checking it calls
  `requestMotionPermissionIfNeeded()` directly, which is a real enough
  user gesture to satisfy iOS's own `DeviceOrientationEvent.requestPermission()`
  gate. Android was never affected either way — it has no such permission
  API, so `attachMotionListeners()` already ran unconditionally there.
  Don't reintroduce a separate button; wire any future motion-permission
  need through this same checkbox handler.
- **`applyCameraPreset()` does a LITERAL restore (corrected 2026-09-21,
  was a "recompute distance from a fit-sphere-to-FOV formula" reconstruction)**
  — ported verbatim from HANDY DANDIES' own real function after a direct
  report that Camera Overwrite/Set-as-Default/Use all restored the wrong
  position despite preserving the correct angle. The recompute version
  only ever used the saved `tx/ty/tz` to derive a direction, silently
  discarding the actual saved distance/zoom — any future camera-preset
  code needs to preserve this literal-restore behavior, not reintroduce a
  recompute step. `captureCameraFromLive()` now also captures
  `cfg.cameraZoom`.
- **`SAVED_CAMERAS`' `FRONTOS` entry had a corrupted `tz` value
  (-314.7 vs. every other camera's shared -1.789)**, invisible under the
  old recompute-based `applyCameraPreset()` (which discarded `tz`'s
  literal magnitude) but producing a badly-framed default view once that
  was fixed to a literal restore — FRONTOS is `DEFAULT_CAMERA_NAME`, so
  this was visible on every fresh page load. Corrected in the seed data.
  If a FUTURE saved-camera entry ever looks badly framed after a
  literal-restore-based apply, check its own `tx/ty/tz` against sibling
  cameras' shared target first, before assuming the apply logic is wrong.
- **`applyWristPoseToSkeleton()` uses `bone.rotateX/rotateZ/rotateY`
  (corrected 2026-09-21, was `rotateOnTrueWorldAxis()` for all 3 axes)**
  — ported verbatim from HANDY DANDIES' own real function after a direct
  report that Saved Poses render differently than in Hando/Handy Dandies,
  with the user specifically flagging "position and rotation axes/
  origin/anchor (local/global)" as the thing to verify against real
  source rather than reconstruct. `rotateOnTrueWorldAxis()` converts a
  FIXED world-space axis into the bone's current local frame before each
  rotation; `bone.rotateX/Y/Z()` is three.js's own LOCAL-axis rotation,
  genuinely sequential (each subsequent rotation spins around the axis as
  already reoriented by the previous one). The two only agree at
  near-zero angles — for any real combined bend+splay+rotation pose they
  diverge. **Corrected 2026-09-21:** this entry originally claimed finger
  curl/splay's own `rotateOnTrueWorldAxis` mechanism was "cross-checked
  against Handy Dandies' real source and found to already match" — that
  was wrong. The rotation MECHANISM matched, but the curl/splay axis
  *reference frame* did not — see the next gotcha entry below for the
  real, separate bug this missed (found only after the user reported
  poses were "still an issue... not as bad" after this wrist-rotation fix
  alone). Model-rotation (`alignQuat * Euler(modelRotX/Y/Z)`) is still
  confirmed correct. Pose Offset X/Y/Z (`h.clone.position.set(...)`) is a
  KNOWN remaining gap, not yet ported: Handy Dandies resolves its own
  pose offset against the camera's own right/up/toward-camera basis
  (`applyPoseOffsetToPosition()`), not plain world-space axes like this
  project's own version — currently harmless only because every seeded
  saved pose has `poseOffsetX/Y/Z: 0`, so port this before any pose
  actually uses a nonzero offset.
- **`applyCurlToSkeleton()`'s curl/splay axis reference must track the
  wrist bone's own current bend/splay, not just the pre-wrist `baseQuat`
  (fixed 2026-09-21)** — the real, separate bug behind "some poses work,
  some others are still messed up" after the wrist-rotation-method fix
  above. Every finger's base joint is a structural descendant of the
  wrist bone (`rHand`), so anatomically curl/splay direction must rotate
  WITH the wrist (closing a fist still closes toward your own palm no
  matter how your wrist is bent) — but the axis reference was just
  `baseQuat` (whole-hand orientation BEFORE the wrist), so curl/splay
  increasingly "missed" the real rotated palm the further wristBend/
  wristSplay moved from wherever a pose was tuned by eye. Found by
  reading HANDY DANDIES' own `docs/CHANGELOG.txt` per direct instruction,
  not re-derived — its 2026-09-14/15 entries document a multi-round saga
  ending in the correct formula:
  `computeCurlAxisRefQuat()` (main.js) conjugates the wrist's LOCAL
  delta-from-rest by its own rest quaternion, composed onto `baseQuat`:
  `baseQuat * wristRest * delta * wristRest^-1`, `delta = wristRest^-1 *
  wristBone.quaternion`. **Do NOT "simplify" this to conjugating by the
  wrist bone's full WORLD quaternion instead** — Handy Dandies tried that
  first and it passes every relative-to-wrist self-consistency test
  (looks correct) while silently collapsing to IDENTITY — discarding
  `baseQuat` entirely — at `wristBend=wristSplay=0` exactly, breaking
  every pose that has zero wrist rotation (which is most of them). Any
  test of this formula MUST include the delta=identity case explicitly,
  not just a range of nonzero wrist values, or a systematically-biased-
  but-self-consistent regression can look green while still being wrong
  — the exact trap Handy Dandies' own history fell into twice. Requires
  `applyWristPoseToSkeleton()` to have already run for the current frame
  (sets the wrist bone's live `.quaternion`) — Handyset's own
  `applyPoseValuesToHand()` already orders wrist before fingers, matching
  Handy Dandies' own documented ordering requirement.
- **Cursor Tracking's rotation mechanism was confirmed working via direct
  state inspection on the real live Vercel deployment** (2026-09-21,
  `https://handy-set.vercel.app` with no `?dev=1`): `hands[0].wrapper.quaternion`
  changed from `[0,1,0,0]` to `[-0.11,0.84,-0.19,-0.49]` after a real
  mouse hover, proving mousemove -> tiltTarget -> rotation genuinely
  works end to end. If a future report says tracking "does nothing,"
  check this mechanism directly (`window.__debug.hands[0].wrapper.quaternion`
  before/after a mouse move) before assuming the wiring is broken — it
  may instead be the next gotcha below.
- **The live default color scheme (`toonBaseTint`, `bgColor`, `keyColor`
  all `#ffffff`, `ambientIntensity: 0`) makes the hand nearly invisible
  against the page background** — confirmed via a screenshot of the real
  deployed site (no dev panel): only faint edge/shading lines are
  visible, no clear filled shape. This is a PRE-EXISTING default (these
  are the literal hardcoded `cfg` values, unrelated to any fix made this
  session), not a regression — but it's a real, live usability problem:
  a user can't tell whether Phone Tilt/Cursor Tracking is rotating the
  hand if they can barely see it at all, which is a very plausible
  explanation for "nothing happens" reports even when the underlying
  mechanism (see the gotcha above) is confirmed working correctly. Not
  yet fixed — needs a deliberate color-scheme decision, not a unilateral
  change.
- **`updateWristCrop()`'s clip plane silently stopped affecting rendering
  forever, the first time Crop Wrist was ever toggled off and back on
  (fixed 2026-09-21)** — the disable branch clears
  `material.clippingPlanes` to a fresh `[]` but never clears `h.clipPlane`
  itself, so the `if (!h.clipPlane)` creation guard stayed permanently
  false afterward and the plane was never re-added to
  `material.clippingPlanes` — confirmed live: `clippingPlanes[0].constant`
  genuinely kept changing on every Hide Wrist slider input (the JS-side
  math was never broken), but `material.clippingPlanes` itself stayed the
  stale empty array, so none of it ever reached the renderer. Fixed by
  unconditionally reassigning `material.clippingPlanes = [h.clipPlane]`
  every call. **Separately, even with this fixed, Hide Wrist's own visual
  range can still look subtle** — `maxReach` (the crop's own total travel
  distance) reduces to `2.8 * cfg.handScale` world units algebraically
  (handLengthRaw cancels out of `handLengthRaw * computeBaseScale() *
  0.35`), which may be small relative to the visible framing for some
  camera/pose combinations. If Hide Wrist still looks like it does little
  after this fix, check `maxReach`'s actual magnitude against the
  visible scene scale before assuming another wiring bug.
- **CORRECTED 2026-09-21 — the "roll axis nearly aligned with camera /
  narrow FOV" explanation below (this bullet, an earlier session's own
  conclusion) was WRONG and has been superseded.** Re-investigated after
  the user firmly rejected it too. The real problem was 2 testing-
  methodology confounds in the Claude Code browser-pane sandbox, not
  anything about the app or the camera: (1) `canvas.toDataURL()` on this
  project's WebGL canvas (no `preserveDrawingBuffer`) silently returns a
  stale/blank buffer when read outside the render loop — direct pixel
  sampling showed fully transparent `[0,0,0,0]` at every point even while
  the app was visibly rendering a solid hand on screen, so "pixels
  unchanged" conclusions from `toDataURL()` comparisons (this project's
  and the earlier session's) were comparing two blanks, not two real
  frames; (2) `requestAnimationFrame` genuinely stops advancing on a
  non-fronted/unobserved browser-pane tab in this sandbox — confirmed
  with an independent, app-code-free rAF counter frozen at 0 until a
  `computer{action:"screenshot"}` interaction touched the tab. **So: a
  direct `wrapper.quaternion` before/after comparison is NOT sufficient
  proof either way** (the earlier session's own recommendation, now
  retracted) — the quaternion can be completely correct while the actual
  rendered pixels are frozen or unreadable for reasons that have nothing
  to do with the app's own code. With both confounds worked around (front
  the tab via `tabs_select`, pump real frames with a `computer{action:
  "screenshot"}` between state changes, read pixels by sampling a
  `drawImage`'d copy rather than `canvas.toDataURL()` on the live
  canvas), direct screenshot comparison on the live Vercel deployment
  confirms Palm Face Rotation genuinely, visibly rotates the whole hand,
  and does so without distorting the finger pose. If a future report says
  this slider "does nothing," suspect the testing methodology (or
  localhost's own flaky script delivery, next bullet) before the app
  code — see `docs/CHANGELOG.txt`'s 2026-09-21 7:05-7:24 AM entry for the
  full account.
- **CORRECTED AGAIN, same day — the "genuinely works, testing methodology
  was the problem" conclusion directly above was INCOMPLETE, not wrong.**
  The rotation math was always fine (never in question again), but there
  WAS a real, separate app bug making it LOOK broken in practice: the
  wrist-crop plane (`updateWristClipPlaneForHand()`) didn't account for
  the wrist bone's own live rotation (see the dedicated wrist-crop gotcha
  below), so at large Responsive Wrist Splay angles it clipped away most
  of the hand — leaving too little visible geometry on screen to perceive
  Palm Face Rotation working at all. User's own diagnosis, confirmed
  live: disabling Crop Wrist revealed the full hand at a cursor position
  where, with Crop Wrist on, only a thin sliver remained; direct
  `wrapper.quaternion` comparison at that same position (offset 0 vs 180)
  showed it changing substantially regardless. Fixed alongside the crop
  bug itself — see that entry for the mechanism.
- **`updateWristClipPlaneForHand()` — REWRITTEN 2026-09-21, 3rd round
  same day; the 2nd round's own fix (below, kept for history) was ITSELF
  wrong per a direct correction.** The 2nd round switched the plane's
  normal from a static forearm->wrist axis to a LIVE wrist->fingertip
  axis (`rHand`->`rMid3`), reasoning it needed to track wrist bend. The
  user directly identified this as backwards: "the cropping plane doesn't
  seem like the right rotation... it should be the plane perpendicular to
  the axis of the first bone, the arm bone" — plus 2 more real bugs: the
  crop was removing the HAND instead of the ARM (a sign/direction bug),
  and 0%/100% were inverted with even 100% still cropping the whole hand.
  Root cause of the misdiagnosis: a bone's own local rotation does NOT
  move its own or its parent's world position (confirmed directly,
  multiple times this session) — so `rForearmBend`/`rHand`'s own axis is
  genuinely wrist-bend-INVARIANT, and switching away from it in round 2
  was solving a problem (the axis "not tracking wrist bend") that was
  never actually the bug; the real, still-live cause at that point was
  the frustum-culling bug below, not the crop axis. Current, correct
  implementation — ported EXACTLY from HANDO's own real
  `updateWristClipPlane()` (background research agent extracted it
  verbatim, not reconstructed) — see `docs/CHANGELOG.txt`'s matching
  entry for the full formula, bone names, and live-verification account.
  **If this ever looks wrong again: re-read HANDO's real source first,
  don't re-derive from first principles** — this exact function has now
  been gotten wrong twice in one session by reasoning about it fresh.
- **`h.clone.quaternion` must actually receive `modelRotX/Y/Z` — it never
  did before 2026-09-21, so all 3 "Whole-Hand Rotation" sliders had ZERO
  visible effect on the rendered hand.** Direct report: "the Whole Hand
  rotation sliders, all 3, dont rotate the hand correctly... check Hando
  and see what axes and anchors are used." Found live: `computeBaseQuatFromValues()`
  correctly folded modelRotX/Y/Z into a quaternion, but that quaternion
  (`h.currentBaseQuat`) was ONLY ever consumed as a finger-curl axis
  reference — `h.clone.quaternion`, the object that actually holds the
  rendered geometry, was set exactly once at hand creation (to
  `alignQuat`) and never touched again by anything. Fixed by porting
  HANDO's own real fix for this exact bug class (its docs/CHANGELOG.txt,
  2026-09-11): apply the quaternion to `h.clone` directly, pivoted around
  `modelRotationPivot` (palm center — midpoint of the wrist bone `rHand`
  and the middle finger's own base joint `rMid1`, measured once at model
  load BEFORE any posing touches the skeleton — HANDO's own docs document
  a second regression from measuring this AFTER default posing had
  already bent the skeleton), with `h.clone.position` recomputed every
  change via the standard rotate-about-an-arbitrary-point formula
  (`position = pivot - rotation*(scale*pivot)`) so the palm stays fixed
  in `h.wrapper`-local space regardless of rotation — HANDYSET's own
  extra `wrapper` layer (Phone Tilt) that HANDO doesn't have. Live-
  verified: the wrist bone's world position read byte-identical across 2
  very different `modelRotZ` values, and the visible hand now dramatically
  and correctly reorients when any of the 3 sliders change.
- **`skinnedMesh.frustumCulled` must stay `false` for every hand (set at
- **`skinnedMesh.frustumCulled` must stay `false` for every hand (set at
  creation in `rebuildField()`) — three.js's default culling check uses
  `geometry.boundingSphere`, computed once from raw UNSKINNED bind-pose
  vertex data, and never accounts for skin/bone deformation.** This was
  the real cause of "the hand goes fully invisible at an extreme combined
  rotation" (flagged as unresolved earlier the same day) AND, once cursor
  tracking became proportionate to normal mouse movement (see the
  `updateTiltTarget()` gotcha below), the same culling bug started
  triggering at completely ORDINARY cursor positions too — confirmed
  directly via an independent `WebGLRenderer` instance (bypassing this
  app's own composer/outline pipeline entirely): 0 triangles drawn with
  `frustumCulled` at its `true` default, 15,046 triangles drawn with it
  forced `false`, same scene/camera/pose, nothing else changed. This also
  retroactively explains the OLD, previously-misdiagnosed "hand vanished
  at offset=179°, widening FOV to 90° brought it back" observation from
  an earlier session (wrongly generalized to "the roll axis is just hard
  to see in general" — it was really this culling bug, reachable at any
  sufficiently-rotated pose, not a property of the axis itself).
- **`updateTiltTarget()`'s mouse path raycasts the true cursor position
  through the camera (ported from Handy Dandies' real
  `updateCursorTarget()`), it does NOT use the normalized `tiltMagnitude`/
  `tiltAngle` circular-offset abstraction that device-orientation input
  still uses** — fixed 2026-09-21 after a direct report ("look at Palm
  Face Rotation cursor tracking in Handy Dandies, that implementation
  doesn't require extreme values, why does ours?"). The old shared
  abstraction divided screen distance by half the smaller screen
  dimension, so a cursor near screen center produced only a tiny signal —
  a real screen-edge position was needed before tracking looked like it
  was doing anything. **Adaptation beyond a literal port, required by
  this project's own geometry**: HANDYSET's single hand sits at world
  origin `(0,0,0)`, but its saved camera is framed/aimed at a completely
  different point (`controls.target` ≈ `(2.3, 33.6, -1.8)`, matching the
  model's own visible geometry after scale/pivot) — a literal absolute
  raycast hit used directly as the lookAt target (Handy Dandies' own
  approach, correct for ITS field where hands and the raycast plane share
  a coordinate range) produced wildly wrong, near-vertical rotations even
  for a dead-center cursor here. Fixed by using the OFFSET from a
  screen-CENTER raycast (screen center → zero offset → neutral gaze,
  hand faces the camera) added onto the hand's own true position, instead
  of the raw absolute hit. `tiltMagnitude`/`tiltAngle` still need to be
  computed for mouse input too, in parallel with the new raycast — found
  live: an initial cut removed them from `handleMouseMoveFallback()`
  entirely (reasoning they were now redundant with `cursorNDC`), which
  silently froze Reactive Arm Length/Responsive Wrist Splay
  (`computeArmLengthT()`/`computeResponsiveWristSplayDeg()`, which read
  `tiltMagnitude` directly, not `tiltTarget`) at their startup value the
  instant mouse input took over.
- **Debugging tip: `THREE.*.prototype` monkey-patching (e.g. patching
  `Quaternion.prototype.slerp`, `Matrix4.prototype.lookAt`,
  `WebGLRenderer.prototype.render` from `javascript_tool` eval) produced
  inconsistent/unreliable call counts this session** — patched methods
  sometimes reported zero calls even when the underlying behavior (proven
  via direct before/after state reads) showed the exact opposite. Don't
  trust a "zero calls" result from this technique as proof a code path
  isn't running; prefer direct state comparison (read a value, trigger
  the action, read the value again) over call-counting instrumentation
  in this environment.
- **The git-tracked remote Sync settings (§12l upgrade) silently failed
  to apply at all on a plain production visit (no `?dev=1`, not
  localhost) — root-caused and fixed 2026-09-23.** `main.js`'s own
  `loadRemoteSettingsOnStartup()` calls devPanel.js's
  `applyFullDevPanelState()`, which applies every saved value via
  `document.getElementById(id)` + a real `input`/`change` event dispatch
  (`applyControlValues()`'s own `if (!el) return` makes a missing
  element a silent no-op). devPanel.js's `initDevPanelEngine()` only
  builds that DOM eagerly when `isDevAllowed` — the panel's *visibility*
  gate, by `TEMPLATE_DEV_PANEL.html`'s own design (`if (isDevAllowed)
  ensureDevPanelBuilt();`). On a plain production visit that DOM never
  existed, so the ENTIRE remote-settings apply was a no-op on every
  control — confirmed live via `window.__debug.cfg`: `bgColor`/
  `wristSplayResponsiveEnabled`/etc. read the raw hardcoded literal
  defaults in production while correctly reflecting the git-tracked
  Sync'd values under `?dev=1`. Fixed in `main.js` only (kept
  `devPanel.js` a verbatim template copy, per this project's own
  convention): call `window.ensureDevPanelBuilt()` unconditionally right
  before `applyFullDevPanelState()` in `loadRemoteSettingsOnStartup()` —
  safe because it's already idempotent (`devPanelBuilt` guard) and the
  panel's own visibility stays a separate, untouched pure-CSS gate.
  **Any other project using both the §12l git-tracked-settings upgrade
  AND the template's own dev-mode-gated eager-build pattern (e.g. HANDY
  DANDIES, whose `api/save-settings.js` this project's own was ported
  from) likely has this exact same latent bug** — worth checking whether
  its production deployment's actual rendered defaults match its
  git-tracked Sync'd settings, not just what shows under `?dev=1`.
- **`computeCurlAxisRefQuat()`'s conjugation was missing a factor —
  partially fixed 2026-09-26, NOT fully resolved, disclosed honestly
  rather than declared done.** The formula conjugated the wrist's local
  delta-from-rest by `boneRestQuat.rHand` alone; `rHand`'s own parent
  chain (`rForearmTwist`/`rForearmBend`) has nonzero rest rotation the
  old formula silently ignored. Quantitative test (index finger's
  orientation RELATIVE TO THE WRIST, which should barely drift when only
  a wrist slider changes): before the fix, Wrist Splay (±30°) drifted
  ~2.5°, Wrist Rotation (±180°) ~11°, **Wrist Bend (±90°) ~101-116°** —
  the exact "wrist moves, fingers point the wrong direction" report,
  worst on Bend because it has the widest slider range and the old
  formula's error scales with angle. Fixed via `getWristWorldRestQuat()`
  (composes every ancestor bone's own rest quaternion, root-most first,
  instead of just `rHand`'s own) — still correctly reduces to `baseQuat`
  at delta=identity. **Re-measured after deploying: real but incomplete.**
  Splay ~0.6-0.7° (much better). Bend ~31-41° (real improvement from
  ~101-116°, but still a visible error, and inconsistent by finger:
  index ~31°, middle ~2.8°, pinky ~40° — the fix's own derivation
  predicts NO finger-dependence, since each finger's own carpal bone
  should cancel out algebraically; it doesn't in practice, meaning the
  derivation is still incomplete somewhere). **Wrist Rotation got WORSE:
  ~11° before, ~41° after.** Shipped anyway because it's a real,
  measured improvement on the specific axis (Bend) the direct report was
  about — but this is NOT a complete fix, and the Rotation regression
  needs weighing against real usage before assuming this trade was
  worth it. If this needs another attempt: don't guess a 3rd formula
  cold — instrument `computeCurlAxisRefQuat()`'s own intermediate values
  (`P`, `Q`, `delta`) live and compare against directly-measured world
  quaternions, per finger (`rIndex1` vs `rMid1` vs `rPinky1` — each has
  its own distinct carpal parent, `rCarpal1`-`4`; `rThumb1` uniquely has
  none, parented straight to `rHand`), before proposing a fix — this
  round's own derivation looked sound on paper and still didn't fully
  match reality. HANDY DANDIES shares this exact formula verbatim
  (confirmed by direct source comparison) and has not been checked for
  this same bug. See `docs/CHANGELOG.txt`'s 2026-09-26 entry for the full
  test methodology and numbers.
- **CORRECTED, same day — the bug above is now GENUINELY, COMPLETELY
  FIXED (0.0° measured drift on every axis, every finger tested), and it
  was never actually in `computeCurlAxisRefQuat()` at all.** Found by
  directly comparing HANDY DANDIES' own real, working call site
  (`applyCurlToSkeleton(fingerName, hand.skinnedMesh.skeleton,
  cloneBaseQuat, hand.wrapper.quaternion)` — passes the wrapper's
  quaternion ALONE) against this project's own `curlExcludeQuatForHand()`
  (was `h.wrapper.quaternion * h.clone.quaternion` — wrapper combined
  with `baseQuat`). That extra `baseQuat` factor is the real bug:
  `rotateOnTrueWorldAxis()` divides this exclude-quat out of a bone's
  TRUE world quaternion BEFORE computing a local axis, while
  `computeCurlAxisRefQuat()` separately composes `baseQuat * Q * R^-1`
  — for these to cancel cleanly, the exclude-quat must contain EXACTLY
  the wrapper's own rotation and nothing more. Including `baseQuat` a 2nd
  time divides it out too EARLY (before the wrist's own current rotation
  Q enters the expression), leaving a real residual conjugation
  (`Q^-1 * baseQuat * Q`, not identity) instead of clean cancellation —
  ~0 when Q is near rest (why Splay's own ±30° range looked "mostly
  fine"), large when Q is far from rest (why Bend's ±90° and Rotation's
  ±180° both broke badly) — exactly the signature already measured
  above. Fix: `curlExcludeQuatForHand()` now returns the wrapper's
  quaternion alone; `computeCurlAxisRefQuat()` reverted to its ORIGINAL
  formula (`baseQuat * wristRest * delta * wristRest^-1`) — it was never
  actually wrong, it just needed the correct exclude-quat paired with it.
  Both of this same day's earlier "fixes" to that function (the
  ancestor-chain composition, then the HANDO-style live-parent-quaternion
  formula) are reverted as unnecessary. **A real methodology trap hit
  while verifying this against HANDO directly, worth flagging for next
  time:** the first HANDO comparison run showed HANDO at 0° drift too
  easily — it turned out HANDO's own Whole-Hand Rotation was simply OFF
  (identity) in that test, an apples-to-oranges comparison against this
  project's own ALWAYS-nontrivial `alignQuat`. Re-testing HANDO WITH a
  substantial Whole-Hand Rotation active (still 0° drift there) is what
  confirmed HANDO's formula genuinely works in general, rather than only
  working by coincidence in an easy case — don't trust a cross-project
  comparison that didn't control for every "always-on" factor the
  reference project might not have active in a quick test. See
  `docs/CHANGELOG.txt`'s 2026-09-26 (2nd) entry for the full derivation
  and live-verification numbers.
- **`bone.rotateOnWorldAxis()` (three.js's own built-in) is NOT a true
  world-space rotation once the bone's ancestor chain carries any real
  rotation — it silently treats the given axis as already expressed in
  the bone's PARENT's local frame, a well-known three.js naming trap.**
  Found 2026-09-26, right after the curl/splay fix above was declared
  complete: a direct follow-up report ("Fist... at wrist rotation 90 the
  thumb is close, at -90 it splays out more," then broadened to "the
  other fingers also dont look perfect... a splay issue for all
  segments") turned out to be neither a splay bug nor a regression of
  the fix above — a full 15-bone × 2-axis (Bend/Rotation) drift sweep
  showed EVERY joint at ~0° EXCEPT `rThumb3`, at ~31-53°. Isolated to
  Tip Twist's own code path: "Fist" is the only saved pose with a
  nonzero `tipTwist*` value at all (`tipTwistThumb: 46`), so this was the
  only joint actually exercising `bone.rotateOnWorldAxis(twistAxis,
  angle)` — a call that was ALWAYS wrong here, just never visible until
  a pose with a real Tip Twist value met a real wrist rotation. Fixed by
  switching to `rotateOnTrueWorldAxis(bone, twistAxis, angle)` (no
  exclude-quat — `segmentDirection()`'s own output is already genuine
  world space, unlike `FINGER_CURL_AXIS`), ported verbatim from HANDY
  DANDIES' own real fix for this identical trap on the identical rig —
  its own `rotateOnTrueWorldAxis()` comment documents this exact case.
  Re-verified: full 15×2 sweep at 0.0° (floating-point noise) after the
  fix. **If a future report describes ONE specific finger/joint looking
  wrong while others look fine, check which pose fields are actually
  NONZERO for that exact joint in the saved pose being used before
  assuming a general axis/formula bug — a code path that's never
  exercised can hide a real bug indefinitely.**
- **CORRECTED, same day (3rd round) — the SAME curl-axis-tracking bug
  class as the wrist fix above, this time on Whole-Hand Rotation
  (modelRotX/Y/Z), not the wrist.** Direct report: "the same issue is
  occurring but with Whole Hand rotation. All 3 axes." Root cause:
  `applyCurl()`/`applyPoseValuesToHand()`/`applyReactiveWristSplayFrame()`
  all passed `alignQuat` (modelRot-EXCLUDED) as `applyCurlToSkeleton()`'s
  own `baseQuat` — a 2026-09-21 workaround for a double-counting bug
  that existed in `curlExcludeQuatForHand()` AT THE TIME (it used to
  ALSO exclude `h.clone.quaternion`, which already contains
  `modelRotQuat`). Once the wrist fix above corrected
  `curlExcludeQuatForHand()` to exclude `wrapper.quaternion` alone, this
  workaround went stale (an asymmetry: baseQuat still avoiding
  modelRotQuat while the exclude no longer needed to) but was never
  revisited. Confirmed by direct comparison against HANDY DANDIES' own
  real, working call site: `cloneBaseQuat = alignQuat *
  wholeHandRotQuat`, passed as `baseQuat` WITH `wrapper.quaternion`
  alone excluded — i.e. baseQuat there correctly BAKES IN Whole-Hand
  Rotation, matching the same intent as the wrist's own `wristRest *
  delta * wristRest^-1` composition. Fixed by passing `h.currentBaseQuat`
  (already computed fresh by `applyPoseValuesToHand()` before every
  curl call) instead of `alignQuat` at all 3 real call sites. Verified
  via a standalone quaternion-math script (no browser needed) BEFORE
  editing: buggy code drifts 12.4-71.3° across modelRotX/Y/Z
  individually, combined, and the degenerate wristBend=wristSplay=0
  case; the fix measures 0.0000° on all 5. Live-verified against the
  real running app via real dev-panel slider `input` events (not a
  direct function call — `applyPoseValuesToHand` isn't exposed on
  `window.__debug` here) and direct `getWorldQuaternion()` reads:
  0.0058-0.0245° (floating-point noise) across all 3 axes. **If a
  future report describes this same "fingers point wrong when I change
  an unrelated whole-hand transform" symptom for some OTHER transform
  (a new pivot, a new per-hand offset, etc.), check whether that
  transform's own contribution is correctly baked into BOTH `baseQuat`
  (so the curl axis reference rotates with it) AND left OUT of
  `curlExcludeQuatForHand()` (so it isn't divided out a 2nd time) —
  this is now the 3rd time this exact double-counting-vs-omission
  asymmetry has caused this bug in this file alone (wrist, Whole-Hand
  Rotation), and HANDY DANDIES' own real call site is the reference
  pattern to check against, not a fresh derivation.** See
  `docs/CHANGELOG.txt`'s matching 2026-09-26 (03:31 AM - 03:54 AM EDT)
  entry for the full account.
- **`applyCurlToSkeleton()`'s own per-joint rotation ORDER was wrong —
  curl was applied BEFORE splay/splay2, HANDY DANDIES' real source
  applies splay/splay2 FIRST, then curl.** Found 2026-09-26, right after
  the Whole-Hand Rotation fix above, per a direct follow-up: "the finger
  splays arent showing correctly... not aggressively wrong, but its
  still not the pose i intended" (on the "Fist" saved pose). This is a
  DIFFERENT bug class from every other curl-axis fix above (those were
  all about the `baseQuat`/`excludeQuat` MATH being wrong) — the
  individual `rotateOnTrueWorldAxis()` calls were each already correct
  in isolation; the SEQUENCE they ran in wasn't. Since that function
  reads the bone's `getWorldQuaternion()` FRESH on every call, whichever
  rotation runs first sees the bone at rest, but every rotation AFTER it
  sees the PRIOR one already baked into the bone's local quaternion —
  its own world-axis-to-local conversion gets conjugated by that prior
  rotation's inverse. With curl running first (this project's original
  order), splay's own axis was computed relative to the CURLED joint
  instead of rest — an error that scales with how much curl is
  simultaneously active on that SAME joint, which is exactly why it
  looked like a subtle, "not aggressively wrong" deviation rather than
  an obviously broken pose (Fist has real curl+splay both active on the
  same joint for index and thumb — the worst case for this bug).
  Correct order, read directly from HANDY DANDIES' real
  `applyCurlToSkeleton()`: **splay → splay2 → curl(+bias) → base-only
  curl → mid-only curl → tip-only curl → tip twist**. Fixed by moving
  the splay/splay2 blocks to run before curl (no new math — every
  individual rotation call was already correct, only the order changed).
  Live-verified: applied Fist's real index/thumb curl+splay values via
  the real sliders — every tested bone quaternion is a well-formed unit
  quaternion (no NaN, magnitude ~1.0), and a screenshot shows a natural,
  correctly-articulated closed fist with clean knuckle definition.
  **If a future report describes a finger/thumb pose looking subtly
  "off" (not obviously broken) specifically on a pose with substantial
  curl AND splay both active on the same joint, check the ORDER
  rotations are applied in, not just the axis math — this bug class is
  invisible on poses that only use ONE of curl/splay/splay2 per joint,
  since order doesn't matter when there's nothing else to conjugate
  against.** See `docs/CHANGELOG.txt`'s matching 2026-09-26
  (09:02 AM - 09:06 AM EDT) entry for the full account.
