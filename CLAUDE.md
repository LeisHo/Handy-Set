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
- `data/processed/SMARTPHONE MODELS/*.glb` — 8 loadable smartphone
  models for the Phone Model group (`PHONE_MODEL_OPTIONS`, `main.js`).
  Only the top-level `.glb` files are tracked/loaded — the folder's own
  `.zip`/`.blend`/`.blend1` files and 4 extracted source/textures
  subfolders are raw provenance (~104MB), gitignored, not runtime
  assets. Filenames contain literal spaces — `loadPhoneModel()` calls
  `encodeURI()` at the fetch site; `cfg.phoneModelFile` itself stores
  the raw, readable path.
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
- **`cfg.trackingEnabled` must never itself apply a rotation — it's a
  pure data/master gate for Responsive Wrist Splay, Palm Rotation
  (`cfg.palmFacesCursor`), and Wrist Crop, nothing more.** Found
  2026-09-27, direct report: "when i turn on Tracking Enabled the whole
  arm is rotating around some origin anchor outside of the arm... If
  the other checkboxes on off are turned off, turning trackingenabled
  on shouldnt show any visible change." An EARLIER same-morning fix
  (Haiku session, `dd070b3`) had already attempted this exact report
  and missed it — it moved `updateTiltTarget()` inside `animate()`'s
  input-check block, but the real bug was one level down: the
  `hands.forEach` body that actually computes and applies
  `h.wrapper.quaternion.slerp(desired, ...)` ran unconditionally
  whenever `cfg.trackingEnabled && hands.length && (input present)` —
  completely independent of `cfg.palmFacesCursor`, the checkbox that's
  actually supposed to gate this rotation. Fixed by wrapping that whole
  `hands.forEach` block in `if (cfg.palmFacesCursor)` (kept
  `updateTiltTarget()` itself unconditional inside the outer gate, since
  Responsive Wrist Splay/Wrist Crop need live `tiltMagnitude`/
  `tiltTarget` regardless of Palm Rotation), and by adding an explicit
  `if (!cfg.trackingEnabled) return 0` to the TOP of both
  `computeArmLengthT()` and `computeResponsiveWristSplayDeg()` — those
  two previously only checked their OWN master toggle
  (`cropWristEnabled`/`wristSplayResponsiveEnabled`), not
  `trackingEnabled`, so with tracking off but a feature's own toggle on
  they'd still have reacted to a live (or stale) `tiltMagnitude`.
  Live-verified via direct `cfg`/`wrapper.quaternion` manipulation
  (not just code reading): with `palmFacesCursor=false` and real mouse
  movement dispatched, `hands[0].wrapper.quaternion` stayed exactly
  `[0,0,0,1]`; flipping `palmFacesCursor=true` and moving the mouse
  again produced a real non-identity quaternion. **If a future report
  says one of these 3 features "does something even with its own
  checkbox off," check whether `cfg.trackingEnabled` is being read at
  all in that feature's own compute path — it wasn't, for 2 of the 3,
  until this fix.** See `docs/CHANGELOG.txt`'s matching 2026-09-27
  entry for the full account.
- **CORRECTED, same day (2nd pass) — the `hands.forEach` gating
  structure the entry above describes ("wrapping that whole
  `hands.forEach` block in `if (cfg.palmFacesCursor)`") no longer
  matches the code.** Direct follow-up report: "Palm faces cursor
  doesnt work correctly. It should just be rotating to follow the
  cursor. Also provide a Palm Face Rotation slider just like Handy
  Dandies but it should be adjusting the palm rotation around the Y
  axis of the arm, which may be different from Handy Dandies." Per the
  user's own NEW standing rule ("from now on when i tell you to
  reference another project, take that as a hard rule — you must
  always check what i tell you to reference"), read HANDY DANDIES' real
  `computeRadialRollDeg()`/`computeRollQuat()`/animate()-loop usage
  directly before touching anything. Found HANDYSET already had a
  STALE, never-wired-up partial port of that exact mechanism sitting in
  the file (defined at module scope, never called from `animate()`) —
  the code actually running was a different, ad-hoc roll: an EXTRA
  rotation composed on top of the lookAt, around a Y axis read from
  `rForearmBend`'s own LIVE (previous-frame) world quaternion every
  frame — a moving reference frame that compounds with itself and
  duplicates what the lookAt already does, matching "doesn't work
  correctly." `hands.forEach` now always runs (whenever
  `cfg.trackingEnabled && hands.length`, no `if (cfg.palmFacesCursor)`
  wrapper around the loop itself anymore); INSIDE the loop, `desired` is
  the lookAt when `cfg.palmFacesCursor` is on, identity otherwise — so
  the net visible effect (nothing, with both Palm Faces Cursor and Palm
  Face Rotation at their off/0 defaults) is unchanged from the entry
  above's own invariant, just restructured to also host the new
  always-additive slider. Verified live: with `palmFacesCursor=true`,
  the real wrapper quaternion matched an independently-computed pure
  lookAt quaternion (`angleTo` ~0.0000017 deg) — confirming NO extra
  roll is baked in anymore.
- **New Palm Face Rotation (Deg) slider (`cfg.palmFaceRotationOffset`,
  -180 to 180, def 0) rolls around world UP (0,1,0), applied in WORLD
  SPACE via `desired.premultiply(...)` (i.e. AFTER the lookAt) — NOT
  HANDY DANDIES' own axis (`wristCropNormalAligned`, composed in OBJECT
  space via `desired.multiply(...)`, i.e. BEFORE the lookAt).** Found
  2026-09-27: an earlier draft tried to stay closer to Handy Dandies'
  own pattern by measuring `rForearmBend`'s own local Y axis at bind
  pose (the same "measure once at load, align via `alignQuat`" recipe
  `wristCropNormalAligned` itself uses) — live-tested and found this
  measured vector was numerically IDENTICAL to `wristCropNormalAligned`
  to 6 decimal places. Root cause: this rig's bones are authored with
  local Y running along their own length (a common rigging convention),
  so "the bone's local Y" and "the bone's own forward/length direction"
  are the same vector here — using it would have made the new slider
  behave identically to Handy Dandies' own, directly failing the user's
  explicit "may be different from Handy Dandies" spec. Switched to
  plain world UP instead (no bone measurement needed at all — simpler,
  and trivially distinct from Handy Dandies' roughly-forward/-Z-ish
  axis). Always composes onto `desired` regardless of
  `cfg.palmFacesCursor` (matching HANDY DANDIES' own always-additive
  slider behavior) — with the slider at its 0 default this has no
  visible effect, so it doesn't violate the "Tracking Enabled alone =
  no visible change" invariant above; a nonzero slider value is a
  deliberate, expected effect, the same way `cfg.hideWrist`'s own
  static (non-reactive) crop value already works elsewhere in this
  file. Verified live 2 ways: (1) direct math — `cfg.palmFaceRotationOffset
  = 45` with Palm Faces Cursor off produced a wrapper quaternion
  matching a 45 deg rotation around (0,1,0) exactly (`angleTo` 0 deg);
  (2) through the real dev-panel slider itself — typed 90 into its
  click-to-type field, wrapper quaternion exactly matched a 90 deg
  world-Y rotation. **If a future project's own "Y axis" or "local
  axis" spec produces a degenerate/coincidental match with an existing
  axis, don't silently ship it — the coincidence itself is worth
  surfacing, the way this one was.** See `docs/CHANGELOG.txt`'s matching
  2026-09-27 (2nd) entry for the full account.
- **CORRECTED, same day (3rd pass) — the "surface the coincidence, then
  avoid it" conclusion in the entry directly above was WRONG.** Direct
  correction: "i said palm face rotation cursor tracking should be
  rotating the entire arm by the Y axis of the forearm bone. the
  rotation should be anchored to the base point of the forearm bone" /
  "its a locaize rotation." Surfacing the world-UP-vs-bone-Y coincidence
  was the right call per §0c (don't silently ship an unexplained
  divergence) — but the correct response to it was to ask/confirm, not
  to unilaterally pick a different axis than what was actually
  specified. The user wants the REAL forearm-bone-local Y axis, full
  stop, whether or not it happens to equal `wristCropNormalAligned` on
  this rig. Also corrected in this same pass: Palm Faces Cursor and
  Palm Face Rotation are ONE combined, LOCAL, single-axis rotation (not
  a full 3D `lookAt` with a separate roll on top, per the 2nd pass) —
  `desired = Quaternion.setFromAxisAngle(armYAxisAligned, degToRad(baseDeg
  + offsetDeg))`, where `baseDeg = palmFacesCursor ?
  computeRadialRollDeg(wrapperPos, tiltTarget) : 0` — matching HANDY
  DANDIES' own `computeRollQuat()` composition pattern (just with a
  different axis/anchor). `armYAxisAligned` and `computeRadialRollDeg()`
  (both removed in the 2nd pass) are restored.
- **New in this same pass: the rotation is ANCHORED at the forearm
  bone's own base position, not `h.wrapper`'s own arbitrary local
  origin.** Recomputed every frame from `h.clone`'s LIVE transform
  (its scale/quaternion/position all change as poses/model-rotation
  are applied): `pivotLocal = forearmPosRaw.multiplyScalar(scale)
  .applyQuaternion(h.clone.quaternion).add(h.clone.position)`, then the
  same `position = pivot - rotation*pivot` technique
  `applyModelRootTransform()` already uses for `modelRotationPivot` —
  just one level up (`h.wrapper` instead of `h.clone`). **This
  overwrites `h.wrapper.position` outright every frame now**, which
  previously held only the field-grid layout position set once by
  `relayoutField()` — added `h.basePosition` (a new per-hand field) to
  preserve that grid placement, added back in as
  `h.wrapper.position.copy(h.basePosition).add(pivotLocal).sub(rotatedPivot)`.
  If a future Field Layout feature (multi-hand grids) ever seems to
  mis-position hands once Palm Rotation/Cursor Tracking is active,
  check `h.basePosition` is being read/written correctly before
  assuming the grid math itself is wrong.
  Live-verified precisely (not just visually): with a 60deg slider
  offset, `rForearmBend`'s own real world position (via
  `getWorldPosition()`) was unchanged to floating-point noise (~2e-15)
  despite the whole arm visibly rotating 60deg around it; the applied
  quaternion matched an independently-computed
  `Quaternion.setFromAxisAngle(armYAxisAligned, 60deg)` exactly
  (`angleTo` 0deg). Repeated with Palm Faces Cursor's own dynamic angle
  (real mouse movement, `computeRadialRollDeg` against the live
  `tiltTarget`) instead of a fixed offset — identical result. **If this
  feature needs correction a 4th time, re-read this entry's own
  `desired`/pivot formulas directly rather than re-deriving from
  scratch — the axis and composition pattern are now directly
  user-confirmed, not a guess.** See `docs/CHANGELOG.txt`'s matching
  2026-09-27 (3rd) entry for the full account.
- **CORRECTED, same day (4th pass) — the 3rd pass's own axis choice
  (`armYAxisAligned`, the bone's raw local Y transformed by its own
  world quaternion then `alignQuat`) was itself wrong.** Direct
  correction: "you are rotating the hand around x or z axis. I want
  the Forearms Y axis to be the axis of rotation. So it should be
  rotating parallel to the XZ plane of the forearm bone." Measured
  `rForearmBend`'s own local AND world quaternion directly (exposed
  temporarily via `window.__armAxisDebug`) and found BOTH are identity
  to ~1e-8 — **this rig keeps every bone completely UNROTATED at bind
  pose; visual orientation is baked into the mesh/vertex geometry
  instead of bone transforms** (a real, common glTF export convention
  for this kind of rig, not a bug in the asset). This means "the
  bone's raw local Y axis" reduces to nothing more than `alignQuat`
  applied to canonical raw Y — which this particular alignment happens
  to send to roughly ALIGNED -Z (confirmed: numerically identical to
  `wristCropNormalAligned`, the bone's own LENGTH direction — so the
  3rd pass's own "coincidence" finding was real, not a measurement
  bug). Measured raw local X and Z the same way too, for completeness:
  raw X aligns to roughly `[0.999, -0.03, -0.03]` (≈ aligned +X, mostly
  unchanged — makes sense, alignQuat's own rotation axis is roughly
  X-ish), raw Z aligns to roughly `[0.03, 0.999, -0.015]` (≈ aligned
  +Y!). So `alignQuat` effectively SWAPS which raw axis maps to which
  aligned axis — raw Y → aligned -Z, raw Z → aligned +Y — and "the
  bone's local Y," read literally, was never going to match "Y" in the
  aligned/rendering frame this whole file already uses for camera
  position, `modelRotY`, etc. **The general lesson: on a rig where a
  bone's own local rotation is identity, "the bone's local axis" is a
  meaningless/circular concept — it can only sensibly mean the axis in
  whatever OUTER frame (here, the aligned/render frame) the rest of the
  system already uses.** Fixed by using plain canonical `UP` (0,1,0)
  directly — removed the `armYAxisAligned` bind-pose measurement
  entirely (kept a detailed comment at the removal site in `main.js`,
  so a 5th round doesn't have to re-derive this from scratch). The
  anchor/pivot logic from the 3rd pass is untouched — confirmed this
  was purely an axis bug.
  Live-verified via direct state comparison: with a 90deg slider
  value, `wrapper.quaternion` matched
  `Quaternion.setFromAxisAngle((0,1,0), 90deg)` exactly (`angleTo`
  0deg), and the forearm bone's real world position was unchanged to
  floating-point noise (~1e-14) across the rotation. **A visual
  screenshot check at nonzero angles appeared to show the hand vanish
  entirely — investigated rather than dismissed, since it directly
  contradicted the precise numeric check.** Direct pixel sampling of
  the actual canvas (`drawImage` to an offscreen canvas +
  `getImageData`) showed literally every pixel reading as "non-white"
  uniformly, at BOTH the 0deg baseline AND the "vanished" angles alike
  — the exact signature of this sandbox's own already-documented
  WebGL-canvas-readback gotcha (stale/blank buffer when read outside
  the render loop, since this canvas has no `preserveDrawingBuffer`),
  not a real rendering difference. **If a future visual check in this
  sandbox seems to contradict a precise numeric/state-based check on
  this project, suspect the canvas read first (per this same gotcha,
  already documented elsewhere in this file) rather than assuming the
  numeric check or the code is wrong.** See `docs/CHANGELOG.txt`'s
  matching 2026-09-27 (4th) entry for the full account.
- **`computeRadialRollDeg()` is a pure `atan2` — direction only, blind
  to magnitude — so Palm Rotation's angle must be explicitly scaled by
  `tiltMagnitude` (in `animate()`, where `baseDeg` is computed) or ANY
  nonzero cursor offset/device tilt snaps to the SAME full-strength
  rotation as a huge one.** Found 2026-09-27 (5th round), direct
  reports: mouse — "does the cursor trackig have to track a 3d
  projected point? right now its not tracking correctly since the
  actual tracking point isnt aligned with my cursor" (this turned out
  to be a magnitude/proportionality complaint, not a genuine
  directional-alignment bug — see below); mobile — "the more i tilt the
  more the hand rotates to face that direction" (not actually true
  before this fix). **A first attempt chased the wrong cause**:
  suspected `updateTiltTarget()`'s raycast-onto-a-fixed-Z-plane, tried
  moving the plane to match `targetDepthFactor`'s own depth so the
  raycast and the final `tiltTarget.z` would agree — live-verified via
  `tiltTarget.clone().project(camera)` reprojected back to screen
  pixels, and the result landed nowhere near the real cursor (off-
  canvas), proving the "fix" changed nothing real. Reason: moving the
  plane changes a point's Z, which changes WHERE that point reprojects
  on screen under perspective, but never changes the XY OFFSET's own
  DIRECTION — both raycasts (center and cursor) always shared one
  plane either way, so the offset's angle was never actually affected
  by which fixed depth was chosen. Reverted to the original fixed
  ground plane (Z=0, matching `hand.wrapper.position.z`, always 0) with
  `targetDepthFactor` added on top as an independent Z, per direct
  correction: "cant you just raycast to a specific groundplane height
  and use that as 0? then add the offset from the slider depth thing."
  **The REAL fix** was in `animate()`, not `updateTiltTarget()` at all:
  `baseDeg = computeRadialRollDeg(...) * tiltMagnitude` — one line,
  covering both the mouse and device-tilt input paths at once, since
  both already compute `tiltMagnitude` and both feed the same formula.
  Live-verified via real mouse movement at 3 screen positions: near-
  center ~-0.22 deg, a moderate offset ~-25.9 deg, a screen corner
  ~-156.0 deg (a different final angle than a DIFFERENT corner, at
  similar distance from center — correctly reflecting direction, not
  just magnitude). **If a future report on this feature describes
  "not aligned" or "not tracking correctly," check whether the
  complaint is really about magnitude/proportionality (is a SMALL
  input producing a SMALL effect?) before assuming it's a
  directional/raycast bug — this is now the 2nd time on this exact
  feature (see the 3rd-round axis entry above) that a plausible-
  looking raycast/geometry theory turned out not to be the real cause,
  and both times a `.project(camera)`-based reprojection check (or an
  equivalent direct, quantitative live check) is what caught it, not a
  visual impression.** See `docs/CHANGELOG.txt`'s matching 2026-09-27
  (5th) entry for the full account.
- **6th round, same feature: Palm Rotation's angle is measured between
  the forearm base's OWN ground-projected position and the cursor's
  own ground-projected position — never screen center.** Direct spec:
  "Use the base point of the forearm bone. then project that
  perpendicular to the camera on to the ground plane. then use that
  point and the projected cursor point to measure the rotation angle."
  Every earlier round (including the 5th's own magnitude fix) still
  measured the cursor's offset from SCREEN CENTER — an arbitrary
  reference never actually tied to where the hand is — then bolted
  that offset onto `hand.wrapper.position` afterward. `tiltOriginGround`
  (new module var) = `rForearmBend`'s live world position, slid along
  `camera.getWorldDirection()` until it lands on world Y=0 (NOT
  straight down — "perpendicular to the camera" means along the
  camera's own optical axis). `tiltTarget` (reused) = the cursor's own
  raycast onto that SAME Y=0 plane (`cursorTargetPlane`, the old
  vertical Z=0 plane, is now fully unused and removed). `baseDeg`
  reads X/Z off both ground points via `computeRadialRollDeg()`'s
  existing `{x,y}` shape (Z aliased into `.y`) for the mouse path only
  — device-orientation is untouched, it has no camera ray to ground-
  project. Live-verified: `rForearmBend`'s real world position
  unchanged (~7e-14) across the rotation (anchor intact); screen
  center reads ~-0.44 deg (correctly near-neutral). **This is now the
  6th correction on this one feature (axis, anchor, magnitude, and now
  measurement origin) — if it needs a 7th, re-read this entry's own
  point-A/point-B construction directly rather than re-deriving.** See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (6th) entry.
- **New: `THREE.AxesHelper`/Ground Plane slab both live in the SAME
  scene-decoration category — neither is related to Palm Rotation's
  own Y=0 MATH plane above, despite both mentioning "ground."** The
  Ground Plane group's slab is a real, visible `BoxGeometry` with a
  fixed, non-slider-exposed thickness constant
  (`GROUND_PLANE_THICKNESS`) — Ground Height positions its TOP face
  (`position.y = height - thickness/2`), Ground Scale touches only
  X/Z. Live-verified via `Box3.setFromObject()`, not just visually.
  See `docs/CHANGELOG.txt`'s matching 2026-09-27 (7th) entry.
- **`checkboxShowTargetMarker` was a dormant control (no mesh) since
  Phone Tilt was first built — fixed 2026-09-27.** Wired to a small
  magenta sphere synced to `tiltTarget` every frame.
- **Real, unresolved limitation found while verifying that fix: the
  6th-round Y=0 ground-plane raycast (see that entry above) only hits
  the plane for the BOTTOM ~THIRD of the screen with the current
  default camera framing** (camera Y~31.4, looking toward Y~33.6 —
  level-to-upward, never down toward Y=0). Measured directly: screen Y
  0-500px of ~900px tall never intersects; ~600px+ does. Above that
  line `tiltTarget` is simply frozen at its last successful value, so
  Palm Rotation stops responding to the cursor across most of the
  screen — a real regression vs. the old vertical Z=0 plane (hit by
  nearly any ray regardless of camera tilt). **Flagged to the user, not
  silently patched** — needs a decision on the right fix (different
  reference Y, a fallback for the no-hit case, or reconsidering camera
  framing) before this is closed out. See `docs/CHANGELOG.txt`'s
  matching 2026-09-27 (8th) entry.
- **RESOLVED, same day (9th entry) — direct answer to the question
  above: "When the raycasting never hits the Y=0, just let the
  rotation not trigger. this is only a desktop issue since mobile uses
  tilt."** Kept the Y=0 plane as-is; added `tiltTargetValid` (from the
  mouse path's own `haveHit`, always `true` for device-orientation) and
  skip `animate()`'s WHOLE per-hand rotation block (quaternion AND
  anchor/position) on a miss, rather than just freezing `tiltTarget`
  while still recomputing an angle from it (which would mix a stale
  `tiltTarget` with a fresh `tiltOriginGround` into a meaningless
  result — a true freeze needs to skip the computation entirely, not
  just one of its two inputs). Live-verified: `wrapper.quaternion`
  read byte-identical across 2 reads while the cursor stayed in the
  dead zone; a valid-zone position afterward produced a different
  quaternion, confirming normal resume. **If a future report says Palm
  Rotation "does nothing" in part of the screen, this is EXPECTED,
  working-as-specified behavior for the dead zone, not a bug — check
  whether the cursor is in the bottom ~third of the screen before
  investigating further.** See `docs/CHANGELOG.txt`'s matching
  2026-09-27 (9th) entry for the full account.
- **Finger Gizmos (`fingerGizmoMarkers`/`fingerGizmoAxisLines` per
  hand) are added directly to `scene`, NOT parented under
  `h.wrapper`/`h.clone`.** Their own transform is set purely from each
  bone's live `matrixWorld` each frame (`updateFingerGizmoJoint()`), so
  there's no double-transformation risk from the hand's own wrapper
  rotation/scale — but it also means `rebuildField()` MUST explicitly
  call `teardownFingerGizmosForHand()` for every old hand before
  discarding the `hands` array, since removing `h.wrapper` from its
  parent does nothing to these meshes. **If a future Field Layout
  change (raising `fieldRows`/`fieldCols` above 1x1, or any other
  future `hands`-rebuilding code path) ever shows duplicate/leftover
  gizmo markers after a rebuild, check that this teardown call wasn't
  skipped.** HANDO's own real `setupFingerGizmos()`/
  `updateJointMarker()`/`getFingerTipWorldPosition()` (read directly,
  not reconstructed) is the reference for the marker/tip-offset
  concept — this project deliberately does NOT have HANDO's
  `TransformControls`/CCD-IK dragging (confirmed with the user via
  `AskUserQuestion` before building, given the large scope gap between
  "visual display" and "full interactive posing rig"). See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (10th) entry.
- **Palm Rotation direction was inverted (left cursor rotated right);
  a synthetic atan2-wrap test proved the quaternion pipeline was
  already smooth, so the "sudden jump" root cause is the dead-zone
  freeze resuming into an instant `trackingDamping=1` snap, not an
  atan2 discontinuity.** `smoothAngleDeg()` now smooths the mouse
  path's raw compass angle (wrap-aware, hard-capped deg/frame),
  independent of `cfg.trackingDamping`. **Before assuming a NEW angle/
  rotation bug on this feature is an atan2 or quaternion issue, test it
  synthetically first (sweep `computeRadialRollDeg()` through its own
  wrap, measure `angleTo()` on the resulting quaternions) — this is now
  the 2nd time a plausible-sounding "wrap bug" theory was disproven this
  way, with the real cause living elsewhere (the dead-zone freeze).**
  See `docs/CHANGELOG.txt`'s matching 2026-09-27 (11th) entry.
- **`applyBaseArmRotation()` (`baseRotationX/Y/Z`) is the 4TH place
  this exact "baseQuat doesn't bake in a whole-hand-level rotation"
  bug class has been found in this file** (Whole-Hand Rotation
  `modelRotX/Y/Z`, wrist bend/splay/rotation, now this). It mutated
  `h.clone.quaternion` directly, never touching `h.currentBaseQuat` (the
  curl-axis reference) — fixed by applying the same `deltaQuat` to both,
  then immediately re-baking finger curl. **If a future whole-hand-level
  rotation mechanism is added to this file, check from the start
  whether it updates `h.currentBaseQuat` — this has now been missed 4
  times.** Verified via the established relative-to-`h.clone.quaternion`
  drift test: 0.000-0.016deg across 4 joints with real curl+splay
  active. Disclosed, unfixed: this doesn't unify Base Rotation's own
  pivot (`rForearmBend`'s live position) with Whole-Hand Rotation's own
  pivot (`modelRotationPivot`) — combining both sliders can still shift
  where Base Rotation's pivot ends up; not the reported bug. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (12th) entry.
- **Every list-picker built via `buildListPicker()` (Saved Poses/
  Cameras/Lighting/Toon Shading/Tween Sequences) silently never
  persisted ANY of its own Save/Overwrite/Rename/Delete/+Group/Import
  mutations, since this file was first written — fixed 2026-09-27.**
  Root cause: those handlers only ever mutated their own `items` array
  in memory, then called `saveDevPanelSettings()` — but that
  devPanel.js-owned function only captures state from REGISTERED
  dev-panel controls (hidden inputs, sliders, etc.); a raw items array
  has no such registration, so it was completely invisible to Sync.
  Confirmed live via direct `localStorage` inspection: `devPanelSettings`
  had no camera/pose/lighting/toon/tween field anywhere, only the
  standard controls/layout/style keys. Fixed by adding a dedicated
  persistence layer — `persistListPickerItems()` (localStorage +
  best-effort remote GET-merge-POST, same shape as the existing
  `saveFieldAsDefault()` pattern), gated by a new required
  `opts.storageKey` on each `renderPresetPicker()` call site — wired
  into every mutation handler. `loadListPickerItemsFromLocalStorage()`
  runs synchronously right after the 5 `SAVED_*` arrays are declared
  (module load time), before anything else reads them; remote-synced
  data merges in via `loadRemoteSettingsOnStartup()`'s own single
  shared GET, before `ensureDevPanelBuilt()` runs. **Any FUTURE
  list-picker (a new `renderPresetPicker()` call, or a new raw array
  fed through some other dev-panel control type) needs its own
  `storageKey` — a control that only calls `saveDevPanelSettings()`
  without one will hit this exact same silent-non-persistence bug
  again.** Live-verified end-to-end: Save on Saved Cameras wrote to
  `localStorage.handyset_listPicker_cameras`, survived a REAL page
  reload (both in localStorage and in the rendered list UI), and
  Delete correctly removed it again. See `docs/CHANGELOG.txt`'s
  matching 2026-09-27 (13th) entry.
- **Projecting a world point onto Y=0 by sliding it along the CAMERA's
  forward direction (rather than just dropping its Y coordinate) makes
  the result depend on height/camera-pitch — a real trap for any
  future "purely XZ" measurement in this file.** `tiltOriginGround`
  (Palm Rotation's own Point A) did this in its 6th-round
  implementation; direct correction 2026-09-27: "Height should not
  matter to responsive palm rotation since its purely an XZ plane
  angle measurement." A camera-ray slide-to-Y=0 is the right technique
  for the CURSOR point (a genuine 2D screen input with no inherent
  world position), but wrong for a point that already HAS a real world
  position (the forearm bone) if the goal is "this point's own XZ,
  full stop" — sliding along a non-vertical ray changes the XZ landing
  spot based on how far the point started above/below Y=0, which
  itself depends on the point's height and the camera's own angle.
  Fixed by dropping Y directly (`set(x, 0, z)`), no camera involved.
  **If a future feature needs another "ignore height" measurement,
  drop the axis directly rather than projecting along any non-parallel
  ray, even one that looks locally reasonable ("perpendicular to the
  camera").** See `docs/CHANGELOG.txt`'s matching 2026-09-27 (14th)
  entry.
- **`armBaseDistanceT` (Responsive Arm Rotation at Base / Responsive
  Wrist Splay's shared distance metric, added 2026-09-27) is
  DELIBERATELY different from `tiltMagnitude`** — direct request:
  "make the right side of the X axis (max distance) be set as the
  farthest distance from the arm base point to the edge of browser."
  On the mouse path it's the real world XZ distance from
  `tiltOriginGround` to `tiltTarget`, normalized against the farthest
  of the 4 screen corners' own ground hits
  (`computeMaxArmBaseGroundDistance()`); on the device-orientation path
  it's just `tiltMagnitude` directly (no cursor/ground geometry exists
  there). **Any FUTURE reactive feature must pick deliberately between
  the 2 distance metrics now in this file** — `tiltMagnitude` (screen-
  distance-from-center; still used by Reactive Arm Length) vs.
  `armBaseDistanceT` (arm-base-relative; used by Base Arm Rotation and
  Wrist Splay) — they are NOT interchangeable, and defaulting to
  whichever one is already in scope at the call site is how this kind
  of inconsistency creeps in.
- **`applyBaseArmRotation(extraX)`'s per-frame delta-tracking
  (`h.lastBaseArmQuat`) is correct — a same-day debugging session that
  initially concluded otherwise was chasing a testing artifact, not a
  real bug.** Comparing `h.clone.quaternion` values captured across
  SEPARATE page reloads (rather than within one continuous session)
  produced a false "toggling Off doesn't reset the rotation" reading,
  because each reload's own actual starting baseline differed (this
  project's dev panel persists control state across reloads via
  localStorage) — 2 numbers that looked like "no reset happened" were
  actually 2 DIFFERENT sessions' own correct-but-different baselines
  being compared against each other. Resolved by re-testing within a
  single uninterrupted session (clear localStorage once, then toggle
  on/off back-to-back with no intervening reload) — confirmed 0 delta
  drift (~1e-19) on Off. **If a future test on this project's own
  reactive/delta-tracking features (Base Arm Rotation, Responsive Wrist
  Splay, Reactive Arm Length, or any future one) seems to show a
  "doesn't reset"/"doesn't update" result, verify the before/after
  reads came from the SAME session (no reload in between) before
  concluding it's a real bug** — this is now a documented, reproduced
  false-positive pattern specific to this project's own persist-across-
  reload dev panel behavior. See `docs/CHANGELOG.txt`'s matching
  2026-09-27 (15th) entry for the full account.
- **`applyResponsivePoseTweenFrame()` and `applyReactiveWristSplayFrame()`
  are mutually exclusive per frame, not both-run** — `animate()` calls
  `if (cfg.poseTweenResponsiveEnabled) { applyResponsivePoseTweenFrame() }
  else { applyReactiveWristSplayFrame() }`. Pose Tween already re-bakes
  the WHOLE pose (including wristSplay) every frame via
  `applyPoseValuesToHand()`; running Wrist Splay's own reapplication in
  the same frame would immediately overwrite that blended wrist value
  with `cfg.wristSplay` (the Pose group's own slider, untouched by the
  tween), undoing part of what the tween just did. **If a future
  feature adds a 3rd whole-pose-rebaking reactive system, it needs the
  same mutual-exclusion treatment against both of these** — Responsive
  Arm Rotation at Base is fine running alongside either (it's a
  separate bone/axis, rForearmBend's own rotation, untouched by
  `applyPoseValuesToHand()`).
- **"Default pose" for Responsive Pose Tween reads as `DEFAULT_POSE_NAME`
  (a named pose), not a live snapshot of whatever's posed when the
  feature is turned on** — a disclosed interpretation choice, since the
  request's own wording ("tween between the default pose and the
  target pose... the target pose is 100, and default is 0") was
  genuinely ambiguous between "2 named endpoints" and "current state +
  a named target." Chosen because it avoids needing a new "snapshot
  captured at an arbitrary moment" mechanism this file doesn't
  otherwise have, and because Target Pose is unambiguously a NAMED
  pose (a picker), making a named Default the more parallel reading.
  **If this interpretation turns out to be wrong, the fix is
  `findSavedPoseByName(DEFAULT_POSE_NAME)` -> some captured live-cfg
  snapshot inside `applyResponsivePoseTweenFrame()`, not a rewrite of
  the blend math itself.**
- **`applyModelRootTransform()` must invalidate `h.lastBaseArmQuat`
  (`applyBaseArmRotation()`'s own delta-tracker) EVERY time it runs —
  a 5th instance of this file's "a whole-hand-level rotation must bake
  into / invalidate whatever downstream system tracks it" bug class,
  this time on the position/quaternion delta side rather than the
  curl-axis side. Fixed 2026-09-27, direct report (user's own
  hypothesis was exactly right): "when i set responsive pose tween,
  the hand disappears. im pretty sure its some bug clash with...
  whole hand rotation at base."** Root cause:
  `applyModelRootTransform()` unconditionally overwrites
  `h.clone.quaternion`/`position` from `h.currentBaseQuat` — it always
  did this on a single slider touch or saved-pose "Use" too, but that
  was a one-shot, easy-to-miss silent-discard. Responsive Pose Tween
  calling it every frame (via `applyPoseValuesToHand()`) turned it
  catastrophic: with Responsive Arm Rotation at Base ALSO reactive
  (running every frame right after), the 2 systems fought over the
  same transform every frame using stale assumptions about what was
  already applied — confirmed live via screen-space bounding-box
  projection that the geometry scattered far outside the viewport
  (camera ending up effectively inside/beside the misplaced hand), NOT
  a NaN/zero-scale case. **No single state value (scale, position, an
  individual bone's quaternion) looked wrong in isolation — the
  screen-space projection check was what actually caught it.** Fixed
  by setting `h.lastBaseArmQuat = null` inside
  `applyModelRootTransform()` itself, so the delta-tracker always
  re-baselines against whatever this function JUST established, rather
  than a possibly-stale prior value. **If a future feature adds ANOTHER
  system that mutates `h.clone.quaternion`/`position`/`h.currentBaseQuat`
  directly (not through `applyBaseArmRotation()`'s own delta path), it
  needs this SAME invalidation — check `applyModelRootTransform()`'s
  own comment for the pattern before assuming a new one-off reset is
  needed.** See `docs/CHANGELOG.txt`'s matching 2026-09-27 (16th) entry
  for the full reproduction/diagnosis account.
- **`armBaseDistanceT` used to FREEZE (never update) on a ground-plane
  raycast miss — fixed 2026-09-27, direct follow-up after the 16th
  entry's fix turned out real but insufficient.** The dead zone (top
  ~2/3 of screen, where the raycast misses) covers almost the entire
  dev panel — meaning any interaction with the panel itself (dragging
  a curve point, clicking a checkbox) left this metric frozen at
  whatever UNRELATED value it last held. For Palm Rotation (whose own
  `tiltTarget`/`tiltTargetValid` freeze the same way, deliberately) a
  frozen rotation is a reasonable fallback. For a metric driving a
  FULL-POSE swap (Pose Tween) or even a smaller reactive amount (Wrist
  Splay, Base Arm Rotation), a frozen, arbitrary, leftover value reads
  as "broken" — 3 reports that looked like 3 different bugs ("curve
  does nothing," "even default position shifted," "applying the
  target's rotation to everything") were this ONE root cause. Fixed by
  falling back to `tiltMagnitude` (always-live, no raycast dependency)
  on a miss — see `updateTiltTarget()`'s own comment. **This is now
  the established pattern for this metric specifically: it must NEVER
  simply hold its previous value on a miss, unlike `tiltTarget`/
  `tiltTargetValid`, which are DELIBERATELY frozen on a miss and must
  stay that way (Palm Rotation's own explicit spec).** If a future
  report about Wrist Splay/Base Arm Rotation/Pose Tween describes
  "stuck," "frozen," "does nothing while I'm doing X," or "randomly
  jumps to a weird state," check whether the mouse was in the dead
  zone during that interaction BEFORE assuming the feature's own math
  is wrong — this exact symptom shape has already cost one full
  debugging round here. See `docs/CHANGELOG.txt`'s matching
  2026-09-27 (17th) entry for the live-verification methodology (a
  bit-identical bone-quaternion read minutes apart, with real
  interaction in between, is what actually proved the freeze — a
  screenshot alone did not).
- **`applyResponsivePoseTweenFrame()` overrides the blended pose's
  `modelRotX/Y/Z` with the LIVE `cfg` values (not the 2 named poses'
  own saved fields, both 0 for every seeded pose) — added 2026-09-27,
  direct request: "for the settings i set in Whole hand rotation at
  base, and rotation, apply those to whatever pose i set as the target
  pose."** It also re-applies Base Rotation X/Y/Z's current slider
  value every frame, but ONLY when that feature isn't already reactive
  (the reactive case is already covered by `animate()`'s own
  unconditional `applyResponsiveBaseArmRotationFrame()` call right
  after this function returns — check for that call before assuming a
  future change needs to duplicate it here too). **If a future SAVED
  pose is ever given a genuinely non-zero `modelRotX/Y/Z` (none
  currently are), this override means Pose Tween will NEVER blend
  toward that pose's own rotation — it always uses the live slider
  instead, by design, matching this direct request.** See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (18th) entry.
- **`applyBaseArmRotation()` takes an explicit `poseValues` parameter
  (default `cfg`) — fixed 2026-09-27, direct report: "the wrist data
  does [change]. but fingers odnt."** This function's own finger
  re-bake (present since the 12th entry) always used `cfg` before this
  fix. That's correct for a plain slider touch or the reactive-per-
  frame call, but was WRONG the moment the 18th entry's fix started
  calling this function from INSIDE `applyResponsivePoseTweenFrame()`
  to keep Base Rotation's slider live during the tween — the finger
  re-bake silently overwrote the tween's own just-applied finger blend
  back to `cfg`'s un-tweened values every frame, while wrist rotation
  (a completely separate function, `applyWristPoseToSkeleton`,
  untouched by this) kept responding correctly. **Any future call to
  `applyBaseArmRotation()` from a context that already has its OWN
  pose-values object (not the live `cfg`) MUST pass it explicitly as
  the 2nd argument — the default silently reverts to `cfg` and will
  reproduce this exact "some fields respond, others freeze" symptom
  again.** See `docs/CHANGELOG.txt`'s matching 2026-09-27 (19th) entry.
- **Every `'text'`/`'number'` type dev-panel control (every curve/range
  JSON field in this file) was silently excluded from Save/Sync since
  this project's very first commit — fixed 2026-09-27, direct report:
  "sae button isnt saving my phone tilt settings."** `addRow()` skipped
  `HANDYSET_CONTROLS.push(ctrl)` for these types, so devPanel.js's
  generic capture/restore mechanism (`captureAllRegisteredControlValues()`/
  `applyControlValues()`, both fully type-agnostic) never even saw
  them. Confirmed via the real git-tracked settings file: 7 genuine
  Save/Sync round-trips had never once saved `textWristSplayRange`,
  `textArmLengthRange`, or any other curve/range field. This was NOT
  scoped to the new Phone Tilt features — it affected every text-type
  control in the whole project from the start. Fixed by registering
  these controls too (the row-builder choice on the same line is
  unrelated and untouched — `buildTextInputRow()` vs.
  `buildUniformControlRow()` only decides how the DOM gets built, not
  whether it gets saved). **If a future control is ever added with
  `type: 'text'` or `'number'`, it registers automatically now — no
  special-casing needed.** See `docs/CHANGELOG.txt`'s matching
  2026-09-27 (20th) entry.
- **`src/devpanel/devPanel.js` was found to be 2 real fixes behind the
  canonical `.claude/TEMPLATE_DEV_PANEL.html` (both dated 2026-09-24
  there) — discovered and re-synced 2026-09-27, direct report: "why is
  it showing like 10 decimal points? ... it is jittery ... allow me to
  click and type."** This project's own file-map states this file is
  "copied verbatim" from the template, but that's a point-in-time
  copy, not a live link — the template has since gained (1)
  `buildSliderRow()` adding `dev-value-editable` at row-creation time
  and wiring a live `input`-event text sync (was: only a one-time
  init-time pass, missing any dynamically-built row; no live sync at
  all), and (2) the click-to-edit popup inheriting the source slider's
  `step`/`min`/`max` (was: a bare `<input type=number>`, silently
  defaulting to whole-number-only steps for any decimal-step slider).
  Re-synced both, verbatim, from the real template file. **If a future
  dev-panel oddity here doesn't match this project's own recent
  history, check whether `devPanel.js` has drifted further behind the
  template again before assuming it's a HANDYSET-specific bug** — a
  quick `diff` against `.claude/TEMPLATE_DEV_PANEL.html`'s own
  `<script>` block is cheap and can rule out (or confirm) a whole
  class of "already fixed upstream" issues at once. Separately: the
  camera group's own live-position-to-slider sync
  (`syncCameraPanelFromLive()`, `main.js`) now rounds its DISPLAY to 2
  decimals and skips resyncing a slider that currently has focus —
  **any FUTURE per-frame live-sync-to-slider function added to this
  file needs the same 2 guards, or it will reproduce this exact
  "shows 16 digits, fights the user's drag" symptom.** See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (21st) entry.
- **devPanel.js's own `window.findGroupContent(tabId, groupSid, ...)`
  only finds a TOP-LEVEL group, never a nested subgroup — its own
  selector uses a direct-child combinator
  (`#mobileTabContent > .dev-section > .dev-section-title[data-sid=...]`)
  — found 2026-09-27 while fixing "Show in Mobile checkbox" doing
  nothing for the Phone Tilt group's own curve/range widgets.** Those 3
  controls (`textBaseArmRotationRange`/`textBaseArmRotationCurve`/
  `textPoseTweenCurve`) are `type: 'text'` controls, which
  `ensureDynamicTargetRow()` (devPanel.js) explicitly excludes from its
  automatic mirroring (a genuine, permanent, documented scope limit of
  the shared template itself, confirmed via direct comparison — not a
  HANDYSET-specific lag this time), so this project built its own
  mirroring mechanism (`PHONE_TILT_MIRROR_WIDGETS`/
  `syncPhoneTiltWidgetMirrors()`, `main.js`) using
  `window.findGroupContent()` to locate each mirrored row's target
  group content — which failed for both target groups here
  ("Responsive Arm Rotation at Base"/"Responsive Pose Tween", both
  nested one level inside the top-level "Phone Tilt" group), confirmed
  live via repeated `findGroupContent`-own `console.warn` ("group not
  found") output. Fixed with a HANDYSET-owned
  `findNestedGroupContent(tabId, groupSid)` (`main.js`) — identical
  except it drops the `>` restriction. **Any future HANDYSET-owned code
  that needs to locate a group's content div (mirroring, dynamic row
  injection, etc.) should use `findNestedGroupContent()`, not
  `window.findGroupContent()` directly, unless the group is known to
  always be top-level.** See `docs/CHANGELOG.txt`'s matching 2026-09-27
  (22nd) entry.
- **A structural dev-panel change (moving/renaming a group, per the
  HAND MODEL reorg below) changes that group's own `data-sid` — which
  silently orphans its entry in the git-tracked
  `data/processed/dev-panel-settings.json` unless the JSON is
  surgically updated too, not just `HANDYSET_SETTINGS_SCHEMA_VERSION`
  bumped.** The schema-version bump (see the entry above it in this
  file) only clears stale LOCAL `localStorage` — it never touches the
  git file, and this project's own git file carries real, valuable user
  customizations (renamed groups, reordered subgroups) that a blanket
  reset would destroy. Fixed 2026-09-27 (HAND MODEL/Phone Tilt ->
  RESPONSIVE BEHAVIOUR - HAND rename) via a small Python script that
  relocates/renames the exact JSON subtree in place — verified
  correct via a full before/after key-diff (every group/row key
  present before must still be present after, modulo the deliberate
  rename/addition) rather than trusting a visual read of the nested
  JSON. **If a future structural change needs the same treatment: (1)
  read the live `sectionOrder`/`devTextOverrides` tree first (per the
  gotcha above these two), (2) write the transform as a script, not a
  manual edit, (3) verify with a flattened key-diff before committing,
  (4) if remote Sync commits land before you push, re-run the SAME
  transform against the freshly-pulled remote state rather than
  force-pushing your own older merge** — this exact sequence happened
  live this session (3 remote `Update dev-panel-settings.json via Save
  Settings` commits landed mid-task) and the re-run-against-fresh-pull
  approach is what kept both the reorg AND the newer remote values
  intact.
- **Phone Model's Responsive Rotation drives 3 axes from ONE shared
  4-control curve/range (On/Off, Fine-Tune, Min/Max Range, Curve) —
  the same pattern as Responsive Arm Rotation at Base, generalized to
  multiple axes via `computePhoneResponsiveAxisDeg(rawComponent)`:
  `|rawComponent|` drives the curve for magnitude,
  `Math.sign(rawComponent)` gives it a direction.** Y/Z axes reuse
  `tiltMagnitude`/`tiltAngle` (reconstructed into `nx =
  tiltMagnitude*cos(tiltAngle)`, `ny = tiltMagnitude*sin(tiltAngle)`),
  identical on desktop and mobile since both input paths already
  reduce to that same 2D representation. The X axis
  (`phoneTiltAxisXRaw`) is ONLY ever written inside
  `handleDeviceOrientation()`, from the device's own compass heading
  (`e.alpha`, baselined on first reading via `phoneAlphaBaseline` then
  read as a centered delta) — **this is what makes "desktop: Y/Z only,
  mobile: all 3 axes" true without any explicit `isTouchDevice`
  branch** in the responsive-rotation code itself; a mouse has no
  compass-equivalent 3rd dimension, so the variable simply never gets
  written there. If a future feature needs a similar
  platform-conditional axis, check whether this same "let the signal's
  own availability define the platform split" pattern applies before
  reaching for an explicit device-detection branch.
- **CORRECTED 2026-09-27, same day — the entry below (originally
  claiming a computed bounding-box CENTROID pivot) is superseded.**
  Direct report right after this shipped: "responsive phone rotation
  should be anchored by the phone models OWN geoemtr origin... its
  currently rotating around some world origin." A GLB's own local
  `(0,0,0)` is whatever point the modeler chose — it doesn't have to
  coincide with the mesh's geometric bounding-box center at all, so
  "centroid" and "the model's own origin" are genuinely different
  anchors. Fixed by removing the centroid computation and pivot-
  compensation math entirely: `phoneModelRaw.position` now simply
  stays `(0,0,0)` always (`applyPhoneModelTransform()`), rotating
  purely around its own local geometry origin;
  `phoneModelWrapper.position` (the Offset sliders) does all the actual
  world-space placement. `phoneModelCentroidLocal` and its own
  `Box3().setFromObject()` measurement (previously described directly
  below) are REMOVED, not just unused — don't reintroduce them. If a
  future model's own origin turns out to be positioned somewhere
  visually awkward for rotation (e.g. at one edge, not the middle),
  that's a property of that specific asset to fix in the source model
  or compensate for via the Offset sliders, not something this code
  should silently work around with a computed substitute again. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (24th) entry.
- ~~Phone Model's rotation pivots on its own geometry centroid using
  the EXACT SAME formula as `applyModelRootTransform()`'s own
  `modelRotationPivot`~~ (`position = pivot - rotation*(scale*pivot)`)
  — reused verbatim, not re-derived, since this project has already
  gotten this formula wrong from scratch multiple times for the hand
  (see the Whole-Hand Rotation gotchas above). The centroid itself
  (`phoneModelCentroidLocal`) is measured via `Box3().setFromObject()`
  right after load, BEFORE any scale/rotation is applied — same
  "measure at bind pose" discipline as `modelRotationPivot`'s own
  comment documents. Live-verified: a 90° Y-rotation left the model's
  world-space centroid unchanged to ~3.1e-16 (floating-point noise).
  **Superseded by the correction directly above — kept only for
  history, do not follow this description.**
- **A freshly-loaded Phone Model at `phoneModelScale: 1` is easy to
  mistake for "not loading" — it's genuinely tiny relative to this
  scene's own units** (a real GLB's native scale vs. the hand scene's
  much larger arbitrary units: the phone's own world bounding box
  measured ~1.3 x 0.19 x 2.65 units at scale 1, vs. the hand's own
  ~115 x 80 x 36). It's also NOT necessarily inside the camera's
  current frustum even after scaling up — "load model at world origin"
  places it at world Y=0, well below this project's own camera framing
  (centered around the hand's own ~Y33 position) — confirmed live via
  `.project(camera)` NDC coordinates (Y ~-1.94, outside the visible
  -1..1 range) before the Y Offset slider was used to bring it into
  frame. **If a future report says the Phone Model "doesn't show up,"
  check Scale and Y Offset before assuming a loading bug** — the GLB
  fetch itself succeeding (confirm via Network tab / a
  `console.error`'s absence) rules out the actual load path.
- **This sandbox's own documented flaky-large-file-delivery gotcha
  (`net::ERR_CONNECTION_RESET` on an otherwise-`200 OK` request) hit
  the Phone Model's own GLB fetches AND `main.js` itself repeatedly
  during this feature's live verification** — as `main.js` has grown
  (now 4,373 lines), it's apparently large enough to trip this same
  flakiness that previously only hit `devPanel.js`. A failed `main.js`
  fetch leaves `window.__debug` (and everything else) undefined with
  no clear synchronous error — check `read_network_requests` for a
  `[FAILED: net::ERR_CONNECTION_RESET]` tag on `main.js`/a GLB before
  assuming a real regression; a plain retry-by-navigating resolves it.
- **`window.__debug` gained several new getters this session**
  (`phoneModelRaw`, `phoneModelWrapper`, `sceneObjectEntries`,
  `tiltMagnitude`, `tiltAngle`, `phoneTiltAxisXRaw`, `lastInputSource`)
  — kept permanently, matching this file's own existing debug-exposure
  convention, not removed after this session's own live verification
  ended. (`phoneModelCentroidLocal` was ALSO added, then removed the
  same day when its own underlying variable was deleted — see the
  geometry-origin correction above.)
- **A NEW dev-panel group/subgroup name must be checked against every
  OTHER `addGroup()`/`addSubgroup()` call in this file first (grep for
  the literal string) — reusing a name that already exists elsewhere
  in the SAME device tab is a real, reproduced structural bug, not a
  cosmetic clash.** Found 2026-09-27: Phone Model's own "ROTATION"
  subgroup collided with Pose's own pre-existing "ROTATION" subgroup.
  `data-sid` identity is flat per device tab, not scoped by parent, so
  devPanel.js's own `sectionOrder` reconciliation genuinely merged the
  two groups' rows together in the real git-tracked settings file (Pose
  ended up with one empty phantom "ROTATION" entry plus one holding
  BOTH groups' rows mixed together, 6 total) — confirmed directly by
  reading the JSON, not just observed visually. Fixed by renaming
  Phone Model's subgroup to "PHONE ROTATION" (code) and, separately,
  by splitting the merged JSON entry back into its 2 real halves (a
  2nd Python surgery script, same discipline as the HAND MODEL reorg's
  own script — see that gotcha above). **This is now a standing check
  for every future group name in this file, not just Phone Model's.**
  See `docs/CHANGELOG.txt`'s matching 2026-09-27 (24th) entry.
- **`PHONE_MODEL_OPTIONS` (main.js) has no directory-listing mechanism
  — it has to be updated BY HAND every time `data/processed/SMARTPHONE
  MODELS/`'s own `.glb` contents change**, and it drifted out of sync
  with the real folder once already (2026-09-27: the user deleted 6 of
  the original 8 files and added a new one directly in the folder;
  `main.js`'s own list still referenced the deleted files and was
  missing the new one until corrected). If a future report says a
  dropdown option "doesn't load" or a real added/updated model "isn't
  showing up," check whether this list still matches
  `ls "data/processed/SMARTPHONE MODELS"` before assuming a code bug.
- **DISCLOSED, not fixed (out of scope for the request that surfaced
  it) — `rebuildField()` can throw `Cannot read properties of null
  (reading 'clone')` inside `SkeletonUtils.clone()` if a Field Layout
  slider's restore-triggered `rebuildField()` call fires before the
  hand's own async `GLTFLoader.load()` (Model load section) has
  resolved `modelRoot`.** Observed once, 2026-09-27, during a
  synthetic ~283KB `localStorage` injection used for live-testing this
  session's own settings-file surgery (not a normal page load) — the
  app self-recovered immediately afterward (`hands.length` back to 1).
  Not yet reproduced under normal load conditions, so not chased down
  this round — but if a future report describes a genuinely broken or
  missing hand specifically on first load (not after), this race
  between `applyFullDevPanelState()`'s synchronous control-restore
  loop and the hand's own asynchronous model load is the first thing
  to check.
- **`cfg.phoneModelScale`'s default/range is tied to the ACTUAL current
  export of the 3 models in `data/processed/SMARTPHONE MODELS/`, not a
  fixed constant — it changed once already (2026-09-27, default `1`
  → `300`, slider max `5` → `2000`) when the user re-exported all 3
  models ~18-20x smaller.** If the user re-scales/re-exports these
  models again in the future, live-measure the new bounding box
  (`new THREE.Box3().setFromObject(phoneModelRaw).getSize(...)` via
  `window.__debug`) before assuming the current default/range still
  makes sense — don't guess a round number.
- **Testing pitfall, this file specifically: never trust a
  fixed-`setTimeout` wait when verifying a Phone Model load — poll for
  `phoneModelRaw`'s own object identity to actually change instead.**
  Found 2026-09-27: cycling through all 3 dropdown options with a
  fixed wait produced IDENTICAL bounding-box numbers for 2 genuinely
  different models, which looked exactly like a real caching bug —
  the 3rd model's fetch had hit this sandbox's own documented
  flaky-large-file-delivery gotcha and never actually finished
  loading within the fixed wait, so the previous model's object was
  measured again by mistake. Re-verified by polling for the reference
  to change (or watching network completion) instead of a flat delay.
- **The HAND MODEL group's own top-level checkbox is "Hand Model
  On/Off" (`checkboxHandModelEnabled`), NOT a Phone Model duplicate —
  it drives `cfg.hideHands` in the OPPOSITE sense from Field Layout's
  own "Hide Hands" checkbox** (checked = visible here, vs. checked =
  hidden there), synced both ways via `syncHandModelEnabledCheckboxes()`.
  Corrected 2026-09-28 — this row started life 2026-09-27 as a Phone
  Model On/Off duplicate (see that entry above), then was directly
  repurposed the very next day: "The Phone Model On Off in the Hand
  Model group should actually be Hand Model On Off." If a future
  feature needs another "genuine on/off for THIS group" convenience
  checkbox (matching the pattern PHONE MODEL's own top-level checkbox
  already has), check whether it should drive an EXISTING cfg boolean
  (inverted or not) before inventing a new one — this group's own
  history shows the "obvious" choice (duplicate an existing checkbox)
  isn't always what's actually wanted.
- **Sensors log (Debug > Sensors) now has its own `sensorLog[]` array
  alongside `sensorLogEl` (the DOM element) — Copy/Save read from the
  array, not by scraping DOM text — mirroring devPanel.js's own Mouse
  Log split (`mouseLog[]`/`mouseLogEl`).** `restartSensorTimer()` no
  longer clears the log on a plain stop/uncheck (fixed 2026-09-28,
  direct report) — only `clearSensorLog()` (the explicit CLEAR button)
  does. If a future change touches this function, preserve that
  distinction — silently reintroducing an unconditional
  `sensorLogEl.innerHTML = ''` on stop would reproduce the exact bug
  just fixed.
- **`cfg.sensorLogAccel/Gyro/Compass`'s own interval-tick conditional
  logic (`restartSensorTimer()`) was NOT live-verified end-to-end** —
  this sandbox's Desktop browser has no real accelerometer/gyroscope/
  compass to stream, the same documented, repeated limitation as
  every other device-orientation feature in this file (Phone Tilt,
  the Sensors subgroup itself). Only the 3 checkboxes' own UI wiring
  (render correctly-checked by default, correctly update `cfg` on
  toggle) was verified live. If a future report says one of these 3
  toggles "doesn't actually filter the log" on a real device, check
  the interval callback's own per-sensor `if` blocks first — simple,
  independent conditionals, low risk, but genuinely never exercised
  with real sensor data.
- **All 12 of this project's own curve/range dev-panel fields are now
  on devPanel.js's own generic `type:'range-bar'`/`type:'curve-editor'`
  controls (migrated 2026-09-28) — `elLocal`/`commitTextControl`/
  `buildReactiveRangeWidget()`/`buildReactiveCurveWidget()` and the
  curve math behind them (`catmullRomY`/`cubicBezier1D`/
  `bezierSegmentY`/`evaluateReactiveCurve`) are REMOVED from
  `main.js`, not just unused.** If a future feature needs a curve or
  min/max-range control, register it via `addRow(group, {id,
  type:'curve-editor', defaultPoints, defaultMethod, caption})` /
  `{id, type:'range-bar', trackMin, trackMax, unit, defaultValue}`
  (devPanel.js's own generic engine, CLAUDE.md §12r-adjacent — see any
  of this file's own "MIGRATED 2026-09-28" comments, e.g. around
  Reactive Arm Length, for the exact pattern including the
  `curveWidgetResyncs.push()` polling entry each one needs), not by
  reintroducing the old hand-built widgets. These control types set
  `ctrl.skipDeviceCheckbox = true` internally — desktop-only by
  design (same precedent as Mouse Log) — so none of the 12 fields
  have a "Show in Mobile/Landscape" option any more; the
  HANDYSET-owned `PHONE_TILT_MIRROR_WIDGETS` mechanism that used to
  hand-roll this for 3 of them was removed in the same pass since it
  can no longer find anything to mirror.
- **The 5 list-pickers (Saved Poses/Cameras/Lighting/Toon Shading/
  Tween Sequences) are DELIBERATELY still HANDYSET's own hand-built
  `buildListPicker()`/`renderPresetPicker()` (main.js), not
  devPanel.js's own generic `type:'list-picker'` control — a direct
  decision (2026-09-28), not an oversight or a remaining migration
  step.** Investigated migrating them during the same dev-panel
  re-sync that moved the 12 curve/range fields above: the data shape
  is compatible (a flat items array with `.name`/`.group`), but the
  template's version stores state as `{items, groupOrder}` in a
  hidden input whose value is a fresh array reference on every
  restore — HANDYSET's own version deliberately mutates `SAVED_POSES`/
  `SAVED_CAMERAS`/etc. IN PLACE so other code holding a direct
  reference (Tween playback, `findSavedPoseByName()`) sees live
  updates without its own refresh call; migrating would need a new
  sync layer to preserve that, on top of real data-shape risk across
  5 populated lists and untangling the existing
  `persistListPickerItems()` custom persistence from the new standard
  Sync/Undo pipeline. Surfaced via AskUserQuestion rather than decided
  unilaterally; the user chose to leave them as-is. If a future
  session considers this migration again, re-read this note first —
  the trade-off has already been analyzed once.
