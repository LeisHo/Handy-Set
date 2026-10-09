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
  uses). `HandiBonesB-IK.glb` (same folder) is a 2nd selectable hand
  model (`HAND_MODEL_OPTIONS`, `main.js`) sharing the exact same
  functional bone names/rig as Hand2.glb, selected via the Hand Model
  Selector (HAND MODEL group's own "Model" Item Selector).
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
- `api/upload-phone-model.js` — Vercel serverless function backing the
  PHONE MODEL group's Item Selector "Import GLB" feature (added
  2026-09-29), reusing the SAME `GITHUB_TOKEN`/`DEV_PANEL_SAVE_SECRET`
  env vars. Unlike `save-settings.js`, it commits via GitHub's **Git
  Data API** (blob → tree → commit → ref), not the simple Contents API
  — every real phone GLB here (1.8-4MB) is already over the Contents
  API's 1MB single-file cap. Also maintains
  `data/processed/SMARTPHONE MODELS/manifest.json` (what the client
  fetches, live via this same endpoint's GET, to populate the Item
  Selector's list) in a 2nd, separate commit via the simpler Contents
  API, since that file is small JSON. See that file's own top comment
  for the full reasoning, including the accepted ~4.5MB Vercel
  request-body ceiling (a direct, deliberate decision — no chunked
  upload built, see CLAUDE.md's own Gotchas entry below).

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

- **Polled widgets (range-bar / curve-editor) need a frame requested and must be polled BEFORE the scene work (fixed 2026-10-09).** Those widgets set a hidden
  input value with no event; `curveWidgetResyncs` copies it into cfg. It used to run after `renderVirtualScreen()` in `renderOneFrame()` and nothing requested
  a frame on edit, so edits to Recursive Render's per-level Scale Min/Max + Curve (and every other polled widget) did nothing visible. It now runs first, and a
  delegated listener requests a frame for any pointer interaction inside `#devPanel`. If a new widget "does nothing" while sliders work, check this pair first.

- **A restored slider value must not be clamped by the slider's range (fixed 2026-10-09).** A range input silently clamps an
  assigned `.value` to its min/max and snaps it to its step, so a value saved after click-to-type auto-expanded the range
  (Recursion Levels 15 on a max-10 slider; Key Azimuth 439 on max 360) came back clamped on every reload -- the synced file was
  right, the restore lost it. Any code that restores/applies a slider value must go through `window.setDevControlValue()` (devPanel.js;
  `setControlValueFitted()` in main.js), never `el.value = ...`. Audit recipe that found it: on the live site, fetch
  `data/processed/dev-panel-settings.json` and compare every `controls` entry to the DOM element's value (and to `window.__debug.cfg`).

- **Base Rotation X/Y/Z turn about the hand MESH's axes, not the clone's (fixed 2026-10-09, ported from HANDO).**
  `applyBaseArmRotation()` composes `desired = G * (Rx*Ry*Rz) * G^-1`, `G = q0 * F`, where `F` is
  `getHandMeshFrameQuat(h)` (local quaternions mesh -> h.clone; +90 deg about X for HandiBonesB-IK, identity for Hand2.glb) and
  `q0 = lastBaseArmQuat^-1 * clone.q`. If a future hand file's mesh is rotated differently, F handles it; if axes look swapped
  again, print F first. **IK Min / Max bars are offsets FROM the base pose** (`[base+Min, base+Max]`, labels say "From Base").

- **Default phone pose vs Synced offsets (fixed 2026-10-09).** `defaultPhonePose` is only a
  STARTING pose: `loadRemoteSettingsOnStartup()` fills a field only when the Synced
  `controls` hold no value for that id. It used to be re-applied after the restore on every
  load and silently overwrote Synced Offset X/Y/Z and Rot ("my offsets never save"). Check
  this first if a phone-pose value "reverts on refresh".
- **Per-mode settings stores (2026-10-09).** `createPerModeStore()` backs the Rotation
  (Gyro/Absolute) and Displace (5 modes) mode selects: each mode remembers its own tuning
  controls (the `ids` list passed in). A new tuning control for either feature must be added
  to that list or it will NOT swap with the mode. Swapping is gated on `event.isTrusted`, so
  restore/apply code paths that dispatch synthetic `change` events never trigger it. Both
  stores' hidden JSON ids are in `PHONE_MODEL_PER_MODEL_CONTROL_IDS`.
- **Axis groups (2026-10-09).** Rotation and Displace settings live in `ROTATION - X/Y/Z AXIS`
  and `DISPLACE - X/Y/Z AXIS` groups; the axis On/Off checkbox is moved into the group title
  by `makeDevGroupToggleable()` (same ids as before). The saved `sectionOrder` layout in
  `dev-panel-settings.json` had to be rewritten to match (and its nested `subgroups` copies
  re-normalized) -- a layout change like this needs that surgery plus the schema-version bump.

- **Hand <-> phone scale (2026-10-08): the HAND is scaled, the phone is not.**
  `computeBaseScale()` = `HAND_REFERENCE_LENGTH_M` (0.16086, measured rHand->rMid3
  in the Handi/Handipants GLBs; Hand2.glb is the same hand x100) x
  `UNITS_PER_METER` (100 = `PHONE_MODEL_SCALE_BASE`) / `handLengthRaw` x Hand
  Scale, so Hand Scale 1 is true size next to a phone at Model Scale 1 (every phone
  GLB is true metres, 0.125-0.163 m tall). It used to normalize the hand to a fixed
  8 units, which left a real-size phone ~2x too big. Do NOT "fix" a future
  mismatch by changing the phone's scale -- change the hand's. HANDO's
  equivalent is `scaleCorrection`/`objectScaleCorrection` = 388.436 for both.

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

- **`phoneTiltAxisXRaw` was renamed to `phoneTiltAxisYRaw` 2026-09-28 —
  it now drives the Y axis of Phone Model Responsive Rotation, not X.**
  Direct spec: "tilted forwards (facing the user, top of phone pointing
  up) = 90 X, tilting backwards = -90 X. Tilted left = 90 Z, tilted
  right = -90 Z. Handle the leftover axis (Y)." `computePhoneCombinedQuat()`
  now maps: **X <- beta** (front-back tilt), not inverted — W3C spec:
  positive beta means the device's top tilts toward the user, matching
  the "tilted forwards" example directly. **Z <- gamma** (left-right
  tilt), INVERTED — W3C spec: positive gamma = right edge down/tilting
  right, the opposite of this project's own left=+90/right=-90 spec, so
  `-nx` is passed instead of `nx`. **Y <- compass heading delta**
  (`phoneTiltAxisYRaw`, alpha-based) — the "leftover axis," previously
  assigned to X before this rename. **NOT verified against a real
  device** — no physical phone in this sandbox, and unusually,
  `DeviceOrientationEvent.requestPermission()` here auto-denies with no
  real gesture behind it, so not even a SYNTHETIC `deviceorientation`
  event reaches `handleDeviceOrientation()` (stricter than the
  already-documented "no real sensors on Desktop" limitation elsewhere
  in this file — that one still allows a synthetic event through).
  Verified instead via a standalone Node script replicating
  `computePhoneCombinedQuat()`'s own arithmetic with synthetic
  beta/gamma/alpha inputs — confirmed each axis responds independently
  with the correct sign and zero cross-talk onto the other 2. If any
  ONE axis comes out backwards on a real phone, flip that axis's own
  sign in `computePhoneCombinedQuat()` (negate the `rawComponent`
  passed to `computePhoneResponsiveAxisDeg()`) rather than re-deriving
  the whole mapping.
- **The Sensors log (Debug group) now has `Log Beta (Front/Back Tilt
  Angle)` / `Log Gamma (Left/Right Tilt Angle)` checkboxes
  (`cfg.sensorLogOrientBeta`/`sensorLogOrientGamma`, both default
  true) alongside the pre-existing Accel/Gyro/Compass toggles.**
  These read `deviceorientation.beta/gamma` (absolute tilt ANGLE,
  degrees) — genuinely different numbers from `Gyro`'s own
  `rotationRate.alpha/beta/gamma` (angular VELOCITY, deg/s) already
  logged, despite sharing greek-letter names. Labeled `Orient β:_ γ:_`
  in the log line specifically so the two are never mistaken for
  duplicates.
- **This session and the concurrent dev-panel-template re-sync session
  (`c69cb8a`/`1ae1f95`) shared the same physical working directory, not
  separate worktrees or clones.** The 2 changes above (both isolated to
  `src/main.js`, no overlap with the other session's `devPanel.js`/
  `style.css` work) rode along automatically inside that session's own
  `c69cb8a` commit the moment it ran `git commit` against the shared
  working tree — confirmed after the fact via `git show
  c69cb8a:src/main.js | grep phoneTiltAxisYRaw`. No separate code
  commit was made for them; this file's docs were added afterward in a
  separate commit once the other session went idle, specifically to
  avoid a lost-update collision from 2 sessions editing the same
  `CLAUDE.md`/`CHANGELOG.txt` concurrently.

- **Phone Model's rotation quaternion MUST be written to
  `phoneModelWrapper`, not `phoneModelRaw` — Object Axes (and anything
  else that parents onto a registered scene object) only ever sees the
  transform of whichever node was actually passed to
  `registerSceneObject()`.** `registerSceneObject('phoneModel', ...,
  phoneModelWrapper)` registers the WRAPPER; `ensureObjectAxesFor()`
  parents its gizmo group directly onto `entry.object3d` and relies on
  ordinary THREE.js parent-child inheritance — a gizmo attached to a
  node whose own quaternion never changes will never rotate, even if a
  child 2 levels down rotates correctly. This was the real cause of a
  2026-09-28 report that read as "missing an axis of rotation": the
  mesh itself (`phoneModelRaw`, a grandchild of the wrapper) was
  rotating correctly on all 3 axes the whole time, but the Object Axes
  gizmo the user was watching, parented to the wrapper, was frozen.
  Fixed by moving the quaternion write from `phoneModelRaw` to
  `phoneModelWrapper` in `applyPhoneModelTransform()` — safe with no
  pivot/visual change since `phoneModelRaw.position` stays `(0,0,0)`
  relative to the wrapper (rotating a parent around its own origin with
  a zero-offset child produces the same world result as rotating the
  child directly). **Scale deliberately stays on `phoneModelRaw`, not
  the wrapper** — so Object Axes' gizmo lines keep a fixed visual size
  regardless of Phone Model Scale, the same reasoning Finger Gizmos
  already use for not scaling with the hand. If a FUTURE feature
  registers a new scene object for Object Axes (or any other
  gizmo/overlay that parents onto the registered node), whichever
  transform that gizmo needs to track (position/rotation/scale) must
  actually live on the exact node passed to `registerSceneObject()` —
  check this explicitly rather than assuming "the object rotates
  correctly" also means "whatever's registered for it will too."
- **`cfg.phoneRotationDamping` (default `0.25`) smooths Phone Model's
  responsive rotation — same 1=instant/lower=smoother slerp semantic as
  `cfg.trackingDamping`.** Added 2026-09-28, direct report ("the
  rotation motion is jittery and not smooth") — real device
  beta/gamma/alpha readings carry natural high-frequency sensor noise,
  undamped in the original implementation.
  `phoneModelWrapper.quaternion.slerp(computePhoneCombinedQuat(),
  cfg.phoneRotationDamping)` replaces a direct `.copy()`. Applies
  uniformly to BOTH the responsive contribution and the manual
  `phoneModelRotX/Y/Z` sliders (they're combined into one quaternion
  before the slerp) — matching how `trackingDamping` already damps all
  of a hand's rotation sources together, not just live sensor input.
- **The Sensors log did NOT actually have per-line timestamps until
  2026-09-28, despite a commit titled "Add timestamps to all debug
  logs" existing before that.** That earlier commit (`f3efd23`) only
  prefixed `console.error()`/`console.warn()` calls (browser DevTools
  console output) — never the on-panel Sensors log UI itself. Fixed by
  adding a `ts()` prefix inside `pushSensorLog()` directly, so every
  future call site gets it automatically. If a future debug log in this
  project is asked to have timestamps "like the sensor log," verify
  that's actually true by reading `pushSensorLog()`/`pushPhoneModelLog()`
  rather than trusting the commit history's own title.
- **Phone Model Log (Debug group) is intentionally NOT gated to touch
  devices the way the Sensors log is** — `restartPhoneModelLogTimer()`
  is its own separate timer, not folded into `restartSensorTimer()`'s
  interval, specifically so it (and its Desktop-mouse-driven testing
  value) isn't lost to that function's `!isTouchDevice` bail-out, which
  is correct for accel/gyro/compass (genuinely absent on Desktop) but
  not for Phone Model position/rotation (an ordinary scene-object
  property, updated from mouse input on Desktop too). It still logs
  "at the same rate" by reading the same `cfg.sensorIntervalMs` and
  starting/stopping from the same `Stream Sensor Data` checkbox.
- **`cfg.phoneResponsiveRotationCurve`'s default was INVERTED
  (`{x:0,y:1}` -> `{x:1,y:0}`, decreasing) until 2026-09-28 — the real
  bug behind both "jittery" and "missing an axis"/doesn't-match reports
  on Phone Model Responsive Rotation, found from a real device log, not
  guessed.** Every axis mapping in `computePhoneCombinedQuat()`
  (X<-beta, Z<-gamma inverted, Y<-compass) was independently confirmed
  CORRECT against 4 real held test movements (Left/Right/Facing-Me/
  Facing-Away) by cross-referencing the Phone Model Log's plateaus
  against the Sensor Log's `Orient β/γ` at the same timestamps — sign
  flips in beta/gamma matched sign flips in the output every time, no
  exceptions. The actual bug was the CURVE that turns "how much tilt"
  into "how much rotation magnitude": with the old default, near-zero
  tilt (rest) produced near-MAXIMUM magnitude (with a noise-sensitive,
  unstable SIGN, since `Math.sign()` of a near-zero raw value flips
  unpredictably — this is the jitter), while a real, deliberate,
  full-strength tilt produced only a SMALL magnitude — backwards from
  "the phone rotates to match my tilt," and easy to misdiagnose as an
  axis/mapping bug since the symptom ("doesn't match, looks wrong")
  shows up at exactly the moments someone is actually testing it (a
  real tilt), while the "at rest = near-max" half of the bug is easy to
  miss unless you're staring at a rest-state log specifically. Fixed by
  flipping the default to `{x:0,y:0} -> {x:1,y:1}` (increasing) AND
  surgically patching the already-synced live value in
  `dev-panel-settings.json` (a code-default fix alone does NOT touch
  what a real device has already Synced — same discipline as every
  other settings-file surgery in this file: verify with a before/after
  key-count diff and a scoped `git diff`, check for newer remote
  commits before AND after). **If a future report about ANY reactive
  curve/range field in this file (Reactive Arm Length, Wrist Splay,
  Base Arm Rotation, Pose Tween — they all share the same generic
  `type:'curve-editor'` control and the same `min + (max-min)*curveY`
  formula) describes "backwards," "inverted," "feels wrong at rest but
  fine when I really push it" (or vice versa), check that field's own
  actual saved curve shape directly — via the git-tracked settings file
  or the dev panel's own curve-editor widget — before assuming the axis
  mapping or sign logic is the problem.** A real device log with
  BOTH a rest-state AND a full-range sample is what made this
  diagnosable at all; a report or test that only covers "does it move
  when I tilt" (not "what does it do when I DON'T") can hide this
  exact bug shape.
- **`deviceorientation`'s beta/gamma are absolute (relative to "phone
  lying flat," a fixed physical zero); alpha is NOT — it's relative to
  whatever direction the phone was facing on its FIRST reading after
  page load (`phoneAlphaBaseline`).** So Phone Model's X/Z axes never
  depend on when the page loaded or which way the phone was originally
  facing; its Y axis (the compass-driven "leftover axis") does, until
  Rotation Reset (below) is used. If a future report asks "does
  starting orientation matter," this is the direct, already-answered
  question — don't re-derive it, just check which axis is involved.
- **Phone Model's Rotation Reset (`cfg.phoneRotationResetEnabled`,
  double-tap/double-click gesture, `resetPhoneModelRotationBaseline()`)
  baselines `phoneNxBaseline`/`phoneNyBaseline`/`phoneAlphaBaseline` in
  the RAW, pre-final-clamp domain — NOT the shared, already-clamped
  nx/ny that `tiltMagnitude`/`tiltAngle` produce.** A baseline
  subtracted from an already-`clamp(x,-1,1)`'d value can be *itself*
  saturated at ±1 if the reset happens near a physical clamp boundary
  (e.g. lying in bed holding the phone near-vertical, where real beta
  is already near its own limit) — subtracting a saturated baseline
  leaves almost no headroom to respond to further real tilt around the
  new "neutral" pose. `computePhoneRawNxNy()` computes gamma/45 and
  beta/45 directly from `latestOrientation` (device path) or the
  existing `tiltMagnitude`/`tiltAngle` reconstruction (mouse path,
  reused as-is), and **beta's own clamp here is deliberately widened to
  its TRUE physical range (±180), not the ±90 the shared pipeline
  uses** — found via a standalone numeric sweep before shipping: even
  after moving the baseline to the raw domain, leaving beta clamped to
  ±90 still produced a one-sided, half-dead response range when reset
  happened exactly at that boundary (e.g. beta=90 lying in bed — fine
  sweeping 90→45, completely flat/unresponsive sweeping 90→135). gamma
  genuinely only spans ±90 physically, so it needs no such widening. If
  a FUTURE feature needs its own baseline/reset mechanism on a
  clamped-and-shared quantity (anything derived from `tiltMagnitude`/
  `tiltAngle`, which many features share), check BOTH of these before
  assuming a plain "capture current value, subtract it later" baseline
  is sufficient: (1) is the value already clamped to a narrower range
  than the sensor can actually report, and (2) does the baseline need
  its own raw computation, separate from the shared clamped pipeline,
  so other features aren't affected. A live/interactive test that only
  checks "does it respond when I tilt a bit" will NOT catch either
  problem — both were found by a synthetic sweep spanning the full
  range around the reset point in both directions, not by testing one
  nearby value.
- **Rotation Reset does NOT touch the manual `phoneModelRotX/Y/Z`
  sliders** — only the responsive/sensor-tracked rotation. This was a
  deliberate scope decision (the request was specifically about
  matching the phone's real orientation, not clearing a separate
  manual offset the user set intentionally), not an oversight — don't
  "fix" this without being asked.
- **Phone Model Responsive Rotation is 2 GENUINELY DIFFERENT pipelines
  by input source, not one shared formula — a real regression found via
  real device testing 2026-09-28, corrected the same day.** Mobile
  (`lastInputSource === 'device'`) is a direct, UNWRAPPED, unthresholded
  passthrough of real beta/gamma/alpha delta-from-baseline — NO curve,
  NO range, NO deadzone, NO clamp (direct request: "there shouldnt be
  any rotational thresholds on mobile"). Desktop (mouse) is unchanged:
  cursor-DISTANCE-driven, through `computePhoneResponsiveAxisDeg()`'s
  curve/range/fineTune system (direct confirmation: "on desktop, phone
  model rotation was determined by distance of the cursor... in a no
  cursor scenario i have no use for it"). **If a future change touches
  this feature, check `computePhoneCombinedQuat()`'s own `if
  (lastInputSource === 'device' && latestOrientation)` branch before
  assuming a single formula drives both — applying the curve/range
  system to mobile (or vice versa) is exactly the mistake that shipped
  once already.**
- **`computePhoneResponsiveAxisDeg()` has a mandatory deadzone
  (`PHONE_RESPONSIVE_DEADZONE = 0.02`) — do not remove it, even though
  mobile no longer calls this function at all.** Found from a REAL live
  bug: the synced "Min/Max Rotation" range drifted to
  `{min:-57,max:45}` — since `magnitude = min + (max-min)*curveY`, a
  NEGATIVE min means even near-zero input computes a large nonzero
  magnitude, multiplied by `Math.sign(rawComponent)` which flips
  unpredictably from ordinary sensor/cursor noise on a value that
  should read as ~0. Confirmed directly from a real device log: `Orient
  β/γ` held flat for 20+ seconds while logged rotation swung between
  +-57°, with zero correlation to any real input or user action (taps
  the user made were coincidental, not causal). The deadzone makes this
  bug class impossible regardless of what min/max is ever set to again
  — this is now the ONLY thing still protecting desktop's own
  cursor-distance path from the identical failure mode, since desktop
  still goes through this exact function.
- **Phone Model's axis mapping was corrected AGAIN 2026-09-28 (see the
  29th CHANGELOG entry for the version this supersedes) after directly
  checking the real Blender model's own local axes** ("+y is the top of
  the phone, direction of the camera... +x is right... Z axis [is]
  perpendicular to the true phone screen"): **X <- beta (up/down,
  unchanged), Y <- gamma (left/right, MOVED from Z), Z <- compass
  (MOVED from Y).** If this ever needs re-deriving, check the real
  Blender/GLB model's own axis convention directly (as was done here)
  rather than guessing from a verbal description alone — the previous,
  now-wrong mapping was based on a verbal spec that turned out not to
  match the actual model.
- **X/Y are combined into ONE axis-angle rotation, never composed as
  sequential Euler rotations, and this applies identically to BOTH the
  mobile and desktop pipelines above (only Z composes separately, on
  top).** A sequential Euler X-then-Y rotates the Y axis AFTER it's
  already tilted by the X rotation, not around the original rest-frame
  Y — for a compound tilt (e.g. up+left together) this produces real,
  visible cross-axis distortion (roughly the product of the 2 angles in
  radians — ~16° of error at two simultaneous 30° tilts, not
  negligible), which is likely a real part of why "the orientation is
  rarely what I want" even when each individual axis's sign/mapping is
  correct. The fix: build ONE rotation with `axis =
  normalize(xDeg, yDeg, 0)`, `angle = hypot(xDeg, yDeg)` (always
  non-negative — direction lives in the axis vector, not in
  `Math.sign()` of the angle). Verified algebraically and via a
  standalone script (rotating world test vectors through pure-X,
  pure-Y, a compound case, and a large 120° unbounded case) that this
  reduces to an EXACT pure single-axis rotation whenever only one of
  xDeg/yDeg is nonzero, with zero leakage into the other axis — this is
  what makes it safe to reuse for mobile's now-unbounded (uncurved,
  unclamped) degree values too, not just desktop's curve-bounded ones.
  **If a FUTURE feature in this file needs to combine 2 independent
  tilt/rotation axes, use this exact pattern, not a `THREE.Euler(x, y,
  z, 'XYZ')` construction** — the Euler constructor is fine for a
  single already-combined rotation or for axes that are never expected
  to be simultaneously large, but wrong for 2 independently-specified
  tilt axes meant to feel independent.
- **Real device orientation angles (beta/gamma/alpha) need UNWRAPPING
  for any feature that wants continuous rotation without a snap at the
  wrap boundary.** `deviceorientation`'s beta (-180..180), gamma
  (-90..90), and alpha (0..360) each wrap: a continuous physical
  rotation crossing the boundary produces an instantaneous jump in the
  RAW reading alone, even though the real motion was smooth (direct
  report: "when i rotate past 180 degrees, i dont want it to suddenly
  flip to -180"). `phoneUnwrappedBeta/Gamma/Alpha` (paired with
  `phoneLastRawBeta/Gamma/Alpha`) solve this by accumulating the
  SHORTEST delta between consecutive raw readings
  (`unwrapDelta360(raw, lastRaw)`) onto a running total that can exceed
  +-180/+-360 arbitrarily — verified with a synthetic sequence
  (170->175->179->-179->...->-160) climbing smoothly through 180 to 200
  instead of snapping back to -179. **This state is deliberately
  SEPARATE from the shared `tiltMagnitude`/`tiltAngle` pipeline** other
  features (Palm Rotation, Reactive Arm Length, Responsive Wrist Splay,
  Base Arm Rotation, Pose Tween) depend on — those still use the
  original wrapped/clamped beta/gamma inside `handleDeviceOrientation()`
  unchanged. If a FUTURE feature also wants unwrapped, unbounded
  rotation tracking from device orientation, reuse this exact
  unwrap-and-accumulate pattern rather than re-deriving it, and keep it
  in its own separate state (don't retrofit the shared pipeline, which
  several other features rely on staying wrapped/clamped exactly as-is).
- **A tap/touch on this project's canvas can fire a SYNTHETIC
  `mousemove` (a browser touch-compatibility shim) — any code reading
  `lastInputSource`/mouse-driven state must guard against this or it
  will misfire on mobile.** Found 2026-09-28: a single tap briefly
  flipped `lastInputSource` to `'mouse'` (via `handleMouseMoveFallback`)
  and computed Phone Model's rotation from the TAP'S OWN SCREEN
  POSITION via the desktop cursor-distance path, until the next real
  `deviceorientation` event reverted it — read by the user as "I tap,
  and for a split second I see the phone out of orientation, then it
  flashes back," with the direction depending on which side of the
  screen was tapped (exactly what the cursor-distance formula would
  produce for that tap position). Fixed with a guard at the top of
  `handleMouseMoveFallback(e)`:
  `if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return`
  — `firesTouchEvents` is `true` ONLY for a mouse event synthesized from
  a touch interaction (Chrome/Android, this project's real target),
  never for a genuine mouse/trackpad move, even on a touch-capable
  laptop. **Any FUTURE feature that reads `lastInputSource`/mouse state
  and could be affected by a momentary, incorrect flip to `'mouse'` on
  a touch device should check whether this guard is still doing its job
  before assuming a new bug is unrelated** — this is a real,
  reproducible mobile-browser behavior, not a one-off.
- **A `window`-level touch/click listener can be silently swallowed by
  OrbitControls' own canvas-level touch handlers, which commonly call
  `stopPropagation()` — use the CAPTURE phase for anything that must
  fire regardless of what OrbitControls does.** Found 2026-09-28,
  confirming the user's own suspicion ("I think the 3js pan and zoom
  controls may be interfering"): the Rotation Reset gesture's
  `dblclick`/`touchend` listeners were originally BUBBLE-phase on
  `window` — if OrbitControls' own handler (attached to the canvas, a
  descendant of `window`) calls `stopPropagation()`, a bubble-phase
  ancestor listener never sees the event at all. Fixed by adding
  `{ capture: true }` to both `addEventListener` calls in
  `setupPhoneRotationResetGesture()` — a capture-phase listener on
  `window` always runs FIRST, top-down, strictly before the event
  reaches the canvas, so it can't be blocked by anything a descendant
  does afterward. **Any FUTURE `window`-level gesture listener meant to
  fire "no matter what" on a page that also uses OrbitControls (or any
  other library that manages its own touch/pointer events) should
  default to the capture phase, not bubble** — this is a real,
  reproduced conflict on this exact canvas, not a hypothetical one.
- **`applyCameraLockState()` must be called once at Camera-group BUILD
  time, not only from the 3 lock checkboxes' own `wireCheckbox`
  callbacks — otherwise a RESTORED "locked" state from Sync never
  actually takes effect until the user re-toggles the checkbox by
  hand.** Found while wiring Lock Pan/Zoom/Rotate to also disable their
  matching sliders (`setSliderLocked()`) — the function itself was
  correct, but a checked-on-restore checkbox never actually disabled
  OrbitControls (or now the sliders) because nothing ever called the
  apply function on load, only on a live user click. This is the SAME
  class of bug as the dev-panel-wide "restored value never gets
  applied" issue documented elsewhere in this file (e.g. the Phone
  Model remote-Sync fix) — any future lock/gate-style checkbox in this
  project should call its own apply function once at build time, not
  rely solely on its own change handler.
- **Phone Model's world-axis assignment required a 2nd correction the
  SAME DAY the Blender-verified mapping (see the entry above this one)
  shipped — the real GLB is Z-up (Blender), but glTF/three.js is Y-up,
  and standard glTF export bakes in a fixed Z-up->Y-up conversion that
  SWAPS Y and Z (X is untouched).** Found from real-device testing: "when
  i rotate my real phone around the Y axis, the phone model on screen
  rotates around the Z axis, and vice versa" (with beta/up-down
  confirmed correct). This means the earlier Blender-axis-based mapping
  was directionally/sign-correct (verified against 4 real movements)
  but WORLD-axis-wrong, since the export process itself already
  permutes Blender's authored Y/Z before the model ever reaches this
  file's own rotation code. Current, correct assignment: beta (up/down)
  -> world X; gamma (left/right, inverted) -> world Z, combined with
  beta in ONE axis-angle rotation (`_phoneTiltAxis`/`_phoneTiltQuat` —
  renamed from `_phoneXYAxis`/`_phoneXYQuat`, since the combined pair is
  now X/Z, not X/Y); alpha (compass/spin) -> world Y, its own separate
  rotation (`_phoneSpinQuat`/`PHONE_SPIN_AXIS` — renamed from
  `_phoneZQuat`/`PHONE_Z_AXIS`). **If a future project or feature in
  this file imports another Blender-authored GLB and maps its axes by
  reading the Blender file directly (the right first step, and what was
  done here), still expect a possible Y/Z swap once the asset is
  actually loaded in three.js — verify against the LOADED, IN-ENGINE
  model's actual behavior too, not just the source file's own stated
  axes, since the export pipeline itself is a second place a coordinate
  convention can change.**
- **`resetPhoneModelRotationBaseline()` must update EVERY baseline
  variable unconditionally, never branch on `lastInputSource` to decide
  which one(s) to update.** Found 2026-09-28, direct report: "double tap
  works. BUT. after the realignment, the rotation becomes wrong. I
  think its still using the rotation axes prior to the realignment."
  The original version updated ONLY the mobile (`phoneBeta/Gamma/
  AlphaBaseline`) OR ONLY the desktop (`phoneNx/NyBaseline`) baseline,
  based on whichever `lastInputSource` said was active AT THE EXACT
  INSTANT the reset fired — a real, established risk in this file this
  same session (synthetic touch-sourced `mousemove` events can flip
  this flag momentarily, see the entry above). If it read wrong for
  even one frame at tap-time, the reset silently re-baselined the
  INACTIVE pipeline while leaving the REAL one completely untouched —
  the user's own "still using the axes prior to realignment" is exactly
  that. Fixed by removing the branch entirely: every call updates BOTH
  the mobile and desktop baselines, always, regardless of which one is
  flagged active. **This is now the standing pattern for this function
  — if a future change reintroduces a `lastInputSource` branch here
  (e.g. to "optimize" by skipping the inactive pipeline's computation),
  it's reintroducing this exact bug, not a harmless simplification.**
- **Phone Model's per-axis enable/scale controls
  (`cfg.phoneAxisX/Y/ZEnabled`, `cfg.phoneRotationScaleX/Y/Z`) are
  applied in ONE shared place in `computePhoneCombinedQuat()`, after
  BOTH the mobile and desktop branches compute their own raw
  `betaDeg`/`gammaDeg`/`alphaDeg`** — not duplicated inside each
  branch. If a future change adds a 3rd input path (or restructures the
  mobile/desktop branching), keep this single shared application point
  so both/all paths automatically respect the same 6 controls. An axis
  being "disabled" sets its degree value to exactly `0` (not just a
  `0`-scale multiply) so it can never contribute even a tiny
  floating-point residual to the combined rotation.
- **SUPERSEDED 2026-09-28, same day as it shipped: Phone Model's mobile
  rotation is NO LONGER driven by `deviceorientation`'s beta/gamma/alpha
  at all — it's driven by `devicemotion.rotationRate` (gyroscope
  integration) instead.** The unwrap-tracking approach (`phoneUnwrappedBeta/
  Gamma/Alpha`, `unwrapDelta360()` — see the entries directly above this
  one) fixed the RAW READING'S wraparound jump, but not a deeper,
  UNFIXABLE limitation: beta/gamma/alpha are absolute orientation angles
  derived via Euler decomposition, and Euler angles have a hard
  representational limit — gamma physically cannot exceed ±90° (past
  that point the SAME real orientation re-expresses through different
  beta/alpha values instead — gimbal lock). No amount of patching the
  angle math fixes this, because the limitation is in the SIGNAL itself.
  Direct report that surfaced it: "when i tilt far... it jumps then
  rotates 180... i cant really describe it as its different for each
  axis... i want the rotation to continue forever." **If ANY future
  feature in this project needs continuous, unbounded rotation tracking
  from a real device (not just a bounded tilt), use gyroscope
  (`rotationRate`) integration from the start — do NOT reach for
  `deviceorientation`'s absolute angles, no matter how tempting the
  "just read the angle directly" approach looks. It will hit this exact
  wall the moment someone spins the device more than ~90-180° in one
  motion.**
- **`phoneGyroQuat` (Phone Model's mobile responsive rotation) is a
  PERSISTENT, ACCUMULATING quaternion, updated via
  `integratePhoneGyroRotation(e)` — called once per REAL `devicemotion`
  tick (inside `handleDeviceMotion`), NOT once per render frame.** This
  matters because the integration needs the ACTUAL elapsed time `dt`
  between real gyroscope samples (`rotationRate` is in deg/SECOND) —
  computing it per render frame instead would tie the integration rate
  to the display's frame rate rather than the sensor's real sample
  rate, subtly corrupting the integrated total on any device/browser
  where those rates don't match. `computePhoneCombinedQuat()` (called
  every render frame, for the actual quaternion COMPOSITION with the
  manual sliders) just READS `phoneGyroQuat` — it never integrates
  anything itself. **If a future change needs to read or reset this
  value, do it by reading/setting `phoneGyroQuat` directly (e.g.
  `resetPhoneModelRotationBaseline()`'s own `phoneGyroQuat.identity()`)
  — never try to recompute it from a snapshot of `rotationRate`, since
  that's an instantaneous velocity, not a position.**
- **Gyroscope integration composes each tiny per-tick rotation via
  RIGHT-multiply (`phoneGyroQuat.multiply(increment)`), never
  premultiply — this is what makes body-frame integration (and "spin
  around MY OWN current axis, not a fixed world axis") work at all.**
  Quaternion right-multiplication (`A.multiply(B)`) applies `B` in `A`'s
  own CURRENT LOCAL frame — exactly the semantic needed for "the next
  tiny rotation happens relative to wherever the device's local axes
  currently point, after all previous rotation." Using premultiply
  instead would apply each increment in a FIXED WORLD frame regardless
  of accumulated rotation, which is a materially different (and for
  this feature, wrong) result. Verified numerically (not just assumed
  correct): a synthetic constant 90°/s spin around local X, integrated
  at a realistic ~60Hz tick rate for 8 seconds (720° of physical
  rotation), tracked correctly with zero discontinuity at every 90°
  checkpoint, and the spin axis itself drifted by only ~5.5e-16
  (floating-point noise, not a real error) over 4 continuous seconds of
  spinning. **If this function is ever refactored, re-run an equivalent
  synthetic multi-second continuous-spin test before shipping — this is
  exactly the kind of bug (correct-looking for a moment, then subtly
  wrong once real accumulated rotation gets large) that a quick,
  small-angle-only test would miss.**
- **`integratePhoneGyroRotation()`'s axis assignment (beta -> combined
  tilt Y-slot, gamma -> tilt X-slot, alpha -> local Z) does NOT match
  the world-frame mapping used everywhere else in this file (beta ->
  X, gamma -> Z, alpha -> Y) — this is CORRECT and deliberate, not an
  inconsistency to "fix."** Found 2026-09-28, the SAME day gyro
  integration shipped: switching from world-frame absolute-angle
  rotation to body-frame gyroscope integration produced a clean, 3-way
  CYCLIC axis permutation (beta's motion visually landed on Z instead
  of X, gamma's on Y instead of Z, alpha's on X instead of Y) — despite
  the beta/gamma/alpha-to-physical-motion correspondence itself being
  independently re-derived and confirmed consistent with the already-
  verified world-frame mapping. The leading theory (not conclusively
  confirmed — no real device instrumentation or authoritative spec
  access was available to check directly) is that
  `devicemotion.rotationRate`'s own alpha/beta/gamma axis
  correspondence doesn't match `deviceorientation`'s the way naturally
  assumed, even though both interfaces use the same 3 letters for what
  looks like the same 3 physical axes. Rather than keep re-deriving the
  spec from memory, the fix applied the user's own precise empirical
  3-way-cyclic correction directly. **If a FUTURE feature also
  integrates `rotationRate` (not just reads `deviceorientation`), do
  NOT assume its axis letters map onto the same code-axis-letters as
  this file's other, world-frame, `deviceorientation`-based code — 
  verify empirically (a real device, one axis at a time) before
  assuming the correspondence carries over.**
- **If a FUTURE report about Phone Model's rotation describes a clean,
  consistent axis relabeling (X shows as Y, Y shows as Z, etc. — a
  permutation, not a random-looking error), the fastest fix is applying
  the user's OWN literal report as a direct relabeling of which
  signal/variable feeds which axis slot, not re-deriving the underlying
  spec/geometry from scratch again.** This project has now hit this
  exact shape of bug multiple times on this one feature (the 29th, 33rd,
  and 36th CHANGELOG entries), and re-deriving from first principles or
  memory of a spec has been unreliable each time (each "fix" held for
  the case it was tested against but not the next one). A precise,
  reproducible empirical report from actually testing on the real
  device is stronger evidence than any amount of geometric reasoning
  done without one.
- **CORRECTED 2026-09-28, 4th round on this same feature: the "3-way
  cyclic relabeling" diagnosis directly above (36th entry) was itself an
  OVERCOMPLICATION.** A follow-up report using an unambiguous physical
  description ("Z sticks out perpendicular to the screen" = spin;
  "top/bottom edge oscillate" = pitch) showed pitch was ALREADY landing
  correctly wherever it was coded — there was never a code-to-visual
  scramble at all; the target mapping is simply the IDENTITY (pitch->X,
  roll->Y, spin->Z). The real, much narrower bug:
  `devicemotion.rotationRate.alpha` and `.gamma` are CROSSED relative to
  what `deviceorientation`'s same-named fields would suggest — `rr.alpha`
  is the ROLL rate, `rr.gamma` is the SPIN rate. **If a future feature
  reads BOTH `deviceorientation`'s alpha/beta/gamma AND
  `devicemotion.rotationRate`'s alpha/beta/gamma, do NOT assume the same
  letter means the same physical axis across the two interfaces — this
  project has now directly observed a real device where `rotationRate`'s
  alpha and gamma are swapped relative to `deviceorientation`'s
  convention.** This is disclosed as an OBSERVATION from one real device
  (Android/Chrome, this project's own target), not a verified universal
  spec fact — if a future project or device shows the opposite, that's
  new evidence to weigh, not proof this entry was wrong.
- **`integratePhoneGyroRotation()`'s 3 per-tick local variables are
  named for their PHYSICAL ROLE (`dPitchDeg`/`dRollDeg`/`dSpinDeg`), not
  their raw `rotationRate` property name (`beta`/`gamma`/`alpha`) —
  keep it this way in any future edit.** The mismatch between "which raw
  property a variable is named after" and "which physical motion it
  actually carries" (e.g. a variable called `dGammaDeg` that doesn't
  hold gamma's real-world role) is exactly what made the alpha/gamma-
  crossing bug above hard to track across 3 correction rounds on this
  one feature. If the raw-property-to-role mapping ever needs to change
  again, update the ASSIGNMENT (which `rr.*` field feeds which
  physical-role variable), not the variable names.
- **This feature (Phone Model's mobile rotation) has now needed 4
  correction rounds in one session (29th/33rd/36th/37th CHANGELOG
  entries) — when a future report on it arrives, ask for (or write
  toward) an UNAMBIGUOUS PHYSICAL DESCRIPTION before assuming a fix,
  not axis letters alone.** Every round that used bare axis letters
  ("real X/Y/Z rotation") required a follow-up round to fully resolve;
  the round that finally succeeded used concrete physical landmarks
  ("Z sticks out perpendicular to the screen," "top/bottom edge
  oscillate"). Axis letters alone have proven ambiguous ACROSS
  MESSAGES in this same conversation — the same letter may not have
  meant the same physical motion in 2 different reports from the same
  user, simply because there was no fixed, restated physical anchor
  each time. **CORRECTED 2026-09-28 — this guidance is proven
  insufficient on its own.** A 5th round was needed: the 37th entry's
  "identity, just alpha/gamma crossed" fix STILL reproduced the exact
  same 3-way cyclic permutation the 36th entry described, even with an
  unambiguous physical report both times. Direct instruction that round:
  "just switch the outputs I told you" — stop re-deriving root causes
  and apply the reported before/after mapping as a literal permutation.
  Mechanism: relabeling "old-visual-A now shows as new-visual-B" for
  every case is a fixed permutation; applying it to each individual
  axis-angle increment's own axis vector (rather than conjugating the
  whole accumulated quaternion every frame) is mathematically
  equivalent and simpler. See the 38th CHANGELOG entry for the exact
  vectors. **A real, still-UNEXPLAINED discrepancy was found doing
  this: an isolated standalone quaternion-math script replicating the
  37th-entry code predicts an IDENTITY mapping (pitch/roll/spin each
  keep their own axis fixed) for that exact code — directly
  contradicting the real-device report of a 3-way cyclic permutation
  for that same code.** `computePhoneCombinedQuat()`/
  `applyPhoneModelTransform()` were read directly and ruled out as the
  source (no extra remap exists between `phoneGyroQuat` and the
  rendered `phoneModelWrapper.quaternion` — just a damped slerp). This
  fix trusted the real-device report over the isolated simulation
  rather than waiting to reconcile them. **CORRECTED 2026-09-28 (6th
  round, same day) — the "unexplained discrepancy" above is now
  explained, and this was the real root cause all along.** The 5th
  round's fix still reproduced the same cyclic permutation ("123 to
  YZX" — the user's own precise real-vs-model axis notation, established
  this round: 1/2/3 = the phone's own physical axes, X/Y/Z = the
  model's). Every round's verification, including the 4th and 5th,
  tested via AXIS INVARIANCE ("which world axis stays fixed") — but the
  actual ground truth is the Phone Model Log's `Rot x/y/z`, an
  Euler('XYZ')-decomposed quaternion (`restartPhoneModelLogTimer()`).
  These are NOT the same measurement past a tiny angle. Replicating
  three.js's own quaternion->Euler('XYZ') extraction (matrix form, not
  reconstructed from memory alone) confirmed the 5th round's shipped
  code reproduces "123->YZX" EXACTLY under Euler-XYZ — finally matching
  reality — and a brute-force search of all 6 (pitch,roll)-axis
  placements against that same measurement found exactly one clean,
  zero-cross-talk match: the plain, UN-permuted structure (combined
  tilt = pitch+roll on X/Y, spin separate on local Z) — literally the
  ORIGINAL structure from when gyro integration first shipped, before
  any permutation fix. Also reverted the 3rd-round "alpha/gamma
  crossed" raw-property theory back to W3C-spec-standard
  (`rr.beta`=pitch, `rr.gamma`=roll, `rr.alpha`=spin), since it was
  built on the same discredited measurement. Separately confirmed
  (checked `createFatAxesVisualization()`/`ensureObjectAxesFor()`
  directly): the Object Axes gizmo is correctly parented onto
  `phoneModelWrapper` and draws along its own local X/Y/Z, so it is NOT
  a contributing factor to this bug. **CORRECTED 2026-09-28 (rounds
  7-10, same day) — rounds 7/8/9 kept guessing whole-quaternion
  permutations and each produced a DIFFERENT clean-but-wrong result
  (never converging), because a real, DIFFERENT scramble existed
  underneath the whole time that no permutation of an already-scrambled
  signal could fix.** Round 9 proved algebraically that no single fixed
  code-level mapping explains rounds 6/7/8's 3 different reports
  together, reverted to the plainest mapping, and added an automatic
  rotation-reset-on-enable (to rule out inconsistent starting
  orientation as the cause) — round 10's test with that guaranteed
  clean start STILL came out scrambled ("YXZ" again), which ruled the
  starting-orientation theory out. The user then independently spotted
  and reported the real root cause: **the 3 per-axis enable checkboxes
  (§ "X/Y/Z Axis Rotation On/Off") don't gate the raw sensor property
  their label implies** — toggling ONLY one checkbox at a time and
  testing (the cleanest, most isolating test this feature has had all
  session — it removes the combined-axis-angle's own cross-talk between
  2 simultaneous values, unlike every prior round's test) revealed TWO
  independent, previously-conflated scrambles: (1) `rr.beta`/`rr.gamma`/
  `rr.alpha` don't correlate with physical X/Y/Z the way the W3C-spec-
  standard letter-matching assumption (which EVERY round through the
  9th relied on, including the "spec-standard, no swaps" reverts)
  suggested — actual correspondence is `beta`<->Y, `gamma`<->Z,
  `alpha`<->X; and (2) the code's own 2 rotation-composition mechanisms
  (the combined axis-angle vs. the separate single-axis rotation) don't
  read out as their own component names either — combined-x reads
  correctly as X, but combined-y reads as Z, and the separate mechanism
  reads as Y. Fixed by solving both simultaneously (see the 10th
  CHANGELOG entry for the exact routing) rather than patching either
  scramble in isolation, which is exactly what every earlier round did
  and why none of them converged. **If an 11th round is needed and it's
  a SIGN issue only (letters correct, direction backwards): fix that
  one role's own raw-value sign, don't revisit the letter/slot solve —
  it's now independently confirmed via isolated single-checkbox testing,
  the strongest evidence this feature has had.** If letters are STILL
  wrong even after this, the isolated single-checkbox testing technique
  itself (not full-rotation testing) is the thing to lean on again, not
  whole-rotation permutation guessing.

- **`computePhoneCombinedQuat()`'s DESKTOP branch had its own SEPARATE
  Y/Z mislabeling bug, fixed 2026-09-29 — this is the mobile-side
  scramble's own distinct desktop counterpart, not a re-occurrence of
  the same underlying cause.** Found via `AskUserQuestion` + a direct
  isolated one-checkbox-at-a-time report ("the current what is labeled
  as Z is Y, and vice versa" — desktop specifically). The combined-tilt
  contribution (`gammaDeg`, feeding the same axis-angle as X) is now
  gated by `cfg.phoneAxisYEnabled`/`cfg.phoneRotationScaleY`; the
  separate spin-around-world-UP contribution (`alphaDeg`, composed on
  top via `.multiply()`) is now gated by `cfg.phoneAxisZEnabled`/
  `cfg.phoneRotationScaleZ` — swapped from Y/Z's initial, un-tested
  assignment when desktop's Y axis was first wired the same day (it
  previously only existed on mobile at all). X's own gating
  (`cfg.phoneAxisXEnabled`/`cfg.phoneRotationScaleX` on `betaDeg`) is
  UNCHANGED — not reported as wrong. Mobile's own gating lives in a
  completely separate function (`integratePhoneGyroRotation()`) and is
  untouched by this. **If a future report says a desktop axis checkbox
  still doesn't match its own label, get an isolated one-checkbox-at-
  a-time test first (same methodology that resolved both this and the
  mobile scramble) before touching the gating again — do not guess
  another swap cold.**
- **Rotation Scale sliders (`sliderPhoneRotationScaleX/Y/Z`) now allow
  negative values (-3 to 3, was 0 to 3) — direct request 2026-09-29:
  "-1... rotate in the other direction at the same scale."** No other
  code change was needed: every consumer (`betaDeg * cfg.phoneRotationScaleX`,
  etc.) is already a plain multiply, so a negative scale already
  flipped direction correctly the moment the slider's own range allowed
  it through.
- **Virtual Screen (RECURSIVE RENDER group) renders the app's own scene
  onto the phone GLB's 'Screen Face' mesh via a FIXED N-pass ping-pong
  render-to-texture pipeline (`renderVirtualScreen()`), bounded by
  construction — pass 0 always renders with the screen mesh hidden (the
  recursion floor), and the loop always runs exactly
  `cfg.screenRecursionLevels` (1-10) times per frame, never a live
  feedback loop.** **CORRECTED TWICE, both 2026-09-29.** First
  correction: the claim originally here ("only Iphone17MaxPro.glb has
  a Screen Face mesh") was WRONG, based on a false-negative "no console
  warning" observation from a session where the page load itself was
  silently broken by this sandbox's own documented script-delivery
  flakiness at the time — not a real confirmation. Re-checked by
  parsing all 3 GLBs' raw JSON chunk directly (no browser needed, ground
  truth): at that point, P5 Project 1 had a mesh literally named
  'Screen Face'; Pixel 9A had no such mesh/node at all — its screen was
  one PRIMITIVE inside a combined 'Front' mesh, identified only by a
  MATERIAL named 'Screen Face' (a multi-material glTF mesh splits into
  separate `THREE.Mesh` objects on load, each with its own single
  material, but each such object's own NAME still comes from the shared
  parent node/mesh, not the material); iPhone 17 Max Pro had neither.
  `findPhoneScreenMesh()` was given a 2nd pass, falling back to
  `obj.material.name` matching for exactly the Pixel-9A-shaped case.
  **Second correction, same day: the user then re-exported all 3
  GLBs**, and the underlying ground truth changed again — re-checked
  the same way (direct GLB parse). All 3 models now have a mesh/node
  named 'Screen Face' directly (P5 Project 1 unchanged; Pixel 9A now
  has its own dedicated 'SCREEN FACE' node, no longer just a shared
  primitive+material; iPhone 17 Max Pro's screen mesh was renamed from
  'Cube.010_screen.001_0' to 'Screen Face') — pass 1 alone now finds
  the screen mesh on every model; pass 2's material-name fallback is
  no longer load-bearing for any of the 3 current models but is kept
  as a defensive fallback for a future re-export. **The lesson for next
  time this needs checking: parse the actual current GLB file's raw
  JSON directly (a ~30-line Node script, no browser/GLTFLoader needed)
  rather than inferring from an in-app console warning (or its
  absence)** — this project hit 2 different false conclusions from
  exactly that shortcut in one session alone (a broken page load
  producing a false negative, and a stale earlier read after the model
  files themselves changed underneath it).
  **`disposePhoneModelRaw()` swaps the screen mesh back to its own
  ORIGINAL material before the generic material/texture disposal
  traversal runs** — without this, switching phone models while Screen
  Render is on would dispose the shared render target's own texture
  (still referenced by the reusable `phoneScreenRenderMaterial`) out
  from under every model loaded afterward. If a future feature adds
  another render-to-texture consumer on a phone-model submesh, this
  same swap-before-dispose pattern is required, not optional.
- **`RECURSIVE RENDER` is a deliberately TOP-LEVEL dev-panel group (a
  sibling of PHONE MODEL, not nested inside it), specifically because
  devPanel.js's own `makeDevGroupToggleable()` looks up its title via a
  direct-child selector (`#tabTabContent > .dev-section > .dev-section-title[...]`)
  — the exact same restriction `findNestedGroupContent()` elsewhere in
  this file already works around for group CONTENT lookups.** Rather
  than reimplement that restriction away a 2nd time for a toggle
  checkbox, this group was kept top-level, which is exactly the shape
  `makeDevGroupToggleable()` is designed for (matching the template's
  own built-in Dev Panel/Debug groups' usage). If a future toggleable
  group is added and someone reaches for nesting it inside another
  group instead, either follow this same top-level precedent or write
  a `findNestedGroupContent()`-style any-depth replacement deliberately
  — don't assume `makeDevGroupToggleable()` works on a nested group
  without checking its own selector first.
- **Live browser-pane verification is SKIPPED for this project entirely,
  per direct instruction 2026-09-29** ("from now on you dont need to
  attempt sandbox verification. just skip that step"), after ~20+
  retries across 3 different local-server ports and both reused and
  fresh tabs all hit `net::ERR_CONNECTION_RESET` on `main.js`/
  `devPanel.js` — confirmed via the Python static server's own request
  log to be serving every file with a real `200` every single time,
  meaning the failure was in the sandbox's own browser-proxy layer, not
  the code or the file server. Go straight from `node --check` +
  careful manual code review to committing/pushing; do not attempt
  `preview_start`/`navigate`/screenshot verification for this project
  going forward, and say so plainly in the final report rather than
  claiming something was tested.
- **`findPhoneScreenMeshes()` (plural — was `findPhoneScreenMesh()`,
  singular, renamed 2026-09-29) returns an ARRAY because a glTF node
  with MULTIPLE primitives (e.g. P5 Project 1's own 'Screen Face', 2
  primitives: 'Display' + 'backcam') does NOT load as one THREE.Mesh —
  confirmed by reading the real, bundled `GLTFLoader.js` source
  directly (not guessed): it creates one Mesh per primitive and wraps
  them in a `Group`, applying the glTF NODE's own name to that GROUP,
  not to either child Mesh.** A single-primitive node (iPhone 17 Max
  Pro, Pixel 9A as of their own current export) IS still just one
  THREE.Mesh, correctly named directly from the node — pass 1's
  ancestor-chain walk handles both shapes uniformly, so don't special-
  case single- vs. multi-primitive at a call site; always go through
  `findPhoneScreenMeshes()` and iterate the result.
  `phoneScreenMeshes`/`phoneScreenOriginalMaterials` (both arrays,
  index-parallel) replace the old singular `phoneScreenMesh`/
  `phoneScreenOriginalMaterial` globals everywhere — if a future
  feature needs "the" screen mesh singular, that's itself a sign it's
  only accounting for the single-primitive case; iterate the array
  instead.
- **Virtual Screen's texture-transform controls (Scale/Rotation/X-Y
  Scale/"To Scale") are NOT independently browser/device-verified** —
  same standing limitation as everything else this session
  (`applyScreenTextureTransform()`'s own comment states the specific
  risk: the "To Scale" correction direction, `camAspect / targetAspect`,
  was reasoned through but not confirmed against a real resize). If a
  future report says "To Scale" makes the distortion WORSE instead of
  better, try the reciprocal (`targetAspect / camAspect`) at that one
  line first before re-deriving from scratch.
- **The Item Selector's "Import GLB" feature accepts files up to
  roughly Vercel's own ~4.5MB serverless request-body ceiling — a
  direct, deliberate decision (2026-09-29), not a chunked-upload
  implementation left unfinished.** If a future model export comes in
  larger than that, the upload will fail with a clear error from
  `api/upload-phone-model.js` (the import still loads and works LOCALLY
  for that browser session regardless — only persistence fails) — the
  fix, if ever needed, is chunked client-side upload reassembled
  server-side before the Git Data API commit step, not a config-file
  tweak (Vercel's own body-size cap for a plain serverless function
  isn't raiseable via a `config.api.bodyParser` export the way a
  Next.js API route's is — confirmed by NOT finding this pattern used
  anywhere in `save-settings.js`, this project's own other, already-
  working Vercel function, and deliberately not adding an unverified
  config export to the new one either).
- **`applyScreenTextureTransform()` negates `texture.repeat.x`
  (2026-09-29 fix) to correct a reported alternating left-right mirror
  in Recursive Render's own nested levels — this is NOT a per-pass bug
  in that function (it runs with identical `cfg` values on every
  single pass, confirmed by direct code re-read, so it can't itself be
  the source of a difference between generations).** The real cause:
  the Screen Face mesh's own UV is never sampled during pass 0 (screen
  hidden), only from pass 1 onward — a single, CONSTANT horizontal
  UV-mirror baked into that ONE mesh (a common glTF/Blender export
  quirk on a mirrored/duplicated part) reproduces the exact reported
  pattern on its own: applying a mirror once per recursion level
  behaves like two facing mirrors, alternating parity by construction
  (confirmed reproducible even at Recursion Levels=2 via
  `AskUserQuestion`, ruling out a compounding-only theory). Fixing it
  at the SOURCE (this one negation) corrects every level uniformly,
  rather than needing a per-level correction. **NOT independently
  verified against the real mesh/device** (standing limitation) — if
  this makes the mirroring WORSE instead of better, the mirror theory
  itself is disproven and the fix is reverting the `-1 *` (removing
  the negation entirely), not flipping to the Y axis or `repeat.y` on
  a 2nd guess — that would repeat this file's own well-documented
  "guess another axis cold" failure pattern (see the Phone Model
  mobile-rotation-axis saga elsewhere in this file for exactly what
  that looks like when it goes wrong repeatedly).
- **`data/processed/SMARTPHONE MODELS/` now has 8 real, committed
  `.glb` models (2026-09-29) — P5 Project 1/Pixel 9A/iPhone 17 Max Pro
  (all downsized to 61-315KB, from 1.8-4MB) plus 5 new ones (Galaxy
  S2, Motorola Razr, Nothing2, Samsung Galaxy S26, iPhone 17 Max) —
  all listed in `manifest.json`.** Several OTHER folders/files also
  live in that same directory (`BLENDER/`, `RAW GLB/`, `Zip/`,
  `blackberry/`, `Samsung Galaxy S2/` (a folder, distinct from the
  committed `Galaxy S2.glb` file), `samsung-galaxy-s26-black-low-poly/`)
  — these are the user's own raw/source asset staging, deliberately
  LEFT UNCOMMITTED per direct instruction ("please replace and add the
  new ones" meant the finished `.glb` files specifically, not the
  staging folders) — matching this project's own §11 raw-vs-processed
  convention. Don't assume every file/folder under this directory is
  fair game to commit just because it's physically present there;
  check `manifest.json` and this note for what's actually meant to be
  tracked.
- **CORRECTED 2026-09-29, same day — the per-model `manifest.json`
  `scale` field this entry originally described is REMOVED, not just
  unused.** Direct instruction after it shipped: "No, I don't want you
  to override my personal settings, but make by default scale to one
  and placed at world origin." `manifest.json` entries are back to
  plain `{file, name}` — no `.scale` field, no
  `currentPhoneModelScaleMultiplier` lookup in `loadPhoneModel()`. Do
  NOT reintroduce a per-model or automatically-measured scale override
  without a new, explicit request — this was tried once and reverted.
  The underlying measurement technique (a small Node script parsing a
  GLB's raw JSON, accumulating each node's TRS/matrix from every scene
  root down to each mesh-bearing node, transforming accessor min/max
  corners by the accumulated world matrix) is still the right way to
  get a ground-truth bounding box for a phone model if ever needed
  again for some OTHER purpose — just not for a silent per-model scale
  correction. Samsung Galaxy S26's own root node separately carries a
  `[-1,-1,-1]` scale (a full point-inversion) — a property of that ONE
  model's own file, unrelated to Recursive Render's own mirror bug
  above; flag it if a future report describes that specific model
  looking mirrored/inside-out.
- **`PHONE_MODEL_SCALE_BASE = 100` (main.js, a fixed constant) is
  ALWAYS multiplied into every phone model's scale, uniformly — this
  is what actually replaced the reverted per-model scale field above.**
  `applyPhoneModelTransform()` sets
  `phoneModelRaw.scale.setScalar(PHONE_MODEL_SCALE_BASE * cfg.phoneModelScale)`.
  `cfg.phoneModelScale` itself defaults to `1` with a `0.5-5` slider
  range (label "Model Scale (x100)") — a pure FINE-TUNE multiplier on
  top of the fixed base, not the real scale by itself. Exists because
  the hand's own reference scale
  (`computeBaseScale() = (8 / handLengthRaw) * cfg.handScale`) puts it
  in roughly meter-scale units, while these phone GLBs are natively
  much smaller — confirmed by direct user instruction ("the hand is
  probably in meters, so just scale up all my phones by 100") after a
  slider-range request (0.5-5) conflicted with a scale=100 default,
  resolved via `AskUserQuestion`: "I wanted you to scale it up to 100
  but on the sliders that will read as one... 100 is one now."
  `sliderHandScale`'s own range was widened to 0.5-5 (was 0.1-3) in the
  same pass. **If a future report says a phone model looks wrong-sized
  again, adjust `cfg.phoneModelScale` (the slider) first — do not touch
  `PHONE_MODEL_SCALE_BASE` itself unless the user explicitly asks to
  change the baseline for every model at once**, and do not reintroduce
  a per-model override (see the entry directly above).
- **The Item Selector's own model selection was never actually
  persisted through Sync until fixed 2026-09-29 — a 4th recurrence of
  this project's own recurring "hand-built dev-panel widget invisible
  to Sync" bug class** (previously hit by the curve/range fields and
  the 5 list-pickers, both documented elsewhere in this file).
  `renderPhoneModelItemSelector()`'s clickable rows are plain `<div>`s,
  never registered via `addRow()`/`HANDYSET_CONTROLS.push()`, so
  devPanel.js's fully-generic `captureAllRegisteredControlValues()`/
  `applyControlValues()` never saw `cfg.phoneModelFile` at all —
  confirmed directly from the real git-tracked settings file
  (`selectPhoneModelFile: null`). Fixed with a hidden
  `type:'text'` control (`id: 'hiddenPhoneModelFile'`, `skipDeviceCheckbox:
  true`, `display:'none'`) that mirrors the current selection both ways:
  clicking an item updates the hidden input's `.value`; the hidden
  input's own `input` listener (guarded against redundant firing,
  matching this file's other Sync-restore listeners) applies a
  Sync/Reset/Undo-restored value back onto `cfg.phoneModelFile` and
  reloads the model. **Any FUTURE hand-built dev-panel widget in this
  project (not built via `addRow()`) needs this exact same hidden-
  input-mirror treatment to survive Sync — this bug class has now
  recurred 4 times in this one project alone.**
- **`wireDeviceSlider()` (main.js) only wires the DESKTOP element — any
  control using it needs a SEPARATE `wireDeviceSliderMirror()` call too,
  or its "Independent from Desktop" Mobile/Landscape value is silently
  never written to `cfg` at all, no matter how it's dragged.** Found
  2026-10-01, direct report: "texture x and y offset still doesnt wok on
  either tab. I have the cehckboxes checked" / "they work on dsktop...
  just not mobile." Root cause, found by reading `devPanel.js` directly
  rather than guessing: `ensureDynamicTargetRow()` ([JS-4b0]) auto-clones
  a Mobile/Landscape row with its OWN DOM id — confirmed via
  `resolveDevControlId()`'s own regex
  (`^(slider|color|select|checkbox)(Mobile|Landscape)(.+)$`) that the
  device name is inserted right after the type prefix
  (`sliderMobileScreenTextureOffsetX`), NOT appended at the end the way
  cfg keys are (`screenTextureOffsetXMobile`) — a real naming mismatch
  between the DOM id scheme and the cfg key scheme. That cloned element
  only ever gets devPanel.js's own generic text-readout listener
  (`buildSliderRow()`) — when the row is Independent (the entire point
  of a device-specific value), the edited value is written ONLY into
  devPanel.js's own internal `devDeviceValues` store
  (`onDevTargetControlEdited()`'s own independent branch) and NEVER
  reaches the project's `cfg` object — confirmed by grepping every
  `devDeviceValues` reference in devPanel.js: none call back into any
  project-supplied callback. `cfg[key + 'Mobile']` stays frozen at its
  declared default forever, regardless of what the Mobile slider is
  dragged to. This is a DIFFERENT bug class from the "hand-built widget
  invisible to Sync" one directly above (4 recurrences, persistence-only
  — the control still correctly drove the LIVE render while editing) —
  this one is about the live `cfg` write never happening at all, for a
  control built the RIGHT way (`addRow()` + `HANDYSET_CONTROLS`) using
  the project's own dedicated device-aware wiring helper. Fixed with a
  new `wireDeviceSliderMirror(desktopId, cfgKey)`, using the SAME
  `curveWidgetResyncs` polling pattern already established for "an
  element that doesn't exist until later and devPanel.js's own generic
  engine won't wire for me" — reads the live DOM value directly (works
  whether independent OR mirroring Desktop) rather than reading
  `devDeviceValues`. **Call it right after EVERY `wireDeviceSlider()`
  call in this file** — found 4 real call sites when fixing this
  (Texture X/Y Offset, the reported bug; Texture X/Y Scale, the
  identical bug on an adjacent control) and fixed all 4 in one pass;
  `wireDeviceSlider()` itself was NOT changed, so any call site missed
  here will silently reproduce this exact symptom. `wireCheckbox()`/
  `wireColor()`/`wireSelect()` have no per-device variant at all in this
  file (only `wireSlider`/`wireDeviceSlider` do) — if a future device-
  aware checkbox/color/select control is ever added, it needs its OWN
  equivalent mirror bridge, not an assumption that this fix already
  covers it.
  **CORRECTED, same day — the polling mechanism above was itself
  insufficient, not wrong about the value-bridging part.** Direct
  follow-up: "when i update mobile tab settings, othing happens, but if
  i save ad refresh, they show up. make it isntantneous." This project
  uses ON-DEMAND rendering (`requestRender()`'s own top-of-file comment)
  — the render loop fully stops once idle, and `curveWidgetResyncs`
  only runs AS PART OF that loop's own per-frame body. Once the loop
  goes idle (its normal resting state), the poll never gets scheduled
  again at all, no matter how long you wait — dragging the Mobile
  slider alone never called `requestRender()` (nothing was ever wired to
  do so), so the edited value sat correctly in the DOM with nobody left
  to read it. Save+refresh only *looked* fixed because a page load
  naturally triggers several renders in a row, giving the poll enough
  chances to catch up once. `wireDeviceSliderMirror()` now uses EVENT
  DELEGATION instead — one `document`-level `'input'` listener per
  device (registered once, not per-element), checking `e.target.id`.
  This needs no knowledge of whether the cloned element exists yet,
  survives it being removed/recreated, and — the actual fix for THIS
  report — calls `requestRender()` directly in the handler, which a
  poll tied to the render loop can never do for itself once that loop
  has already stopped. **The general lesson: any future bridge from a
  devPanel.js-owned dynamic element into `cfg`, in a project using
  on-demand rendering, needs an explicit `requestRender()` call in its
  own write path — reaching `cfg` correctly is necessary but not
  sufficient if nothing then asks for a new frame.**
- **Responsive Displace's `'acceleration'`/`'worldPosition'` modes have
  a FUNDAMENTAL limitation — not a tunable decay-rate bug — where a
  push-then-stop gesture nets to ~zero displacement once
  double-integrated, no matter how decay rates are tuned.** Found
  2026-10-01, direct report with a real device log: "I move the phone
  forward and backward... I pause in between... once I stop, it drifts
  back to its default position." Confirmed by replaying the actual
  logged `LinearAccel` values against the real integrator math: stopping
  a push IS a real deceleration (an opposite-direction acceleration
  pulse, directly visible in the log as the sign flipping right as
  motion stops), which cancels most of the velocity the push just built
  up — basic impulse-momentum physics, not a software defect. This is
  the textbook "dead reckoning drift" limitation every inertial-only
  (accelerometer) position-tracking system has without an external
  reference (GPS, vision, etc.) — **no amount of retuning
  `phoneDisplaceVelDecayRate`/`phoneDisplacePosDecayRate` fixes this,
  because the cancellation isn't caused by decay at all.** A proposed
  "just cancel the deceleration after the fact" fix was investigated and
  rejected: there's no way to distinguish "deceleration from my own
  just-finished push" from "a genuine new push in the opposite
  direction" using acceleration data alone — both are just
  negative-signed acceleration — so cancelling one would also cancel
  real backward motion. It would also mean showing MORE displacement
  than the phone actually underwent, which directly contradicts
  "mirror my real movement and nothing else." **If a future report
  describes this same symptom on `'acceleration'`/`'worldPosition'`
  mode, don't reach for decay-rate tuning as the fix — it fundamentally
  cannot work; point the user at the 2 alternative modes below instead.**
- **2 additional Displace modes exist specifically because of the
  limitation above — `'freeze'` and `'tilt'` — each solving it a
  genuinely different way, each with ITS OWN disclosed, real
  limitation; neither is a strict upgrade over the other.** `'freeze'`:
  the existing Stationary Gate (gyroscope-based on mobile, cursor-delta
  on desktop) now gates whether `applyPhoneDisplaceSample()` runs AT
  ALL once motion is judged stopped — not just fed zero input, which
  still lets its own leaky decay erode position every tick regardless.
  **Its own real limitation**, found by walking the real log's Gyro
  magnitude at the exact moment of the original snap-back: a push's own
  deceleration is itself real, gyro-correlated motion (stopping a moved
  phone naturally involves some wrist wobble) that can keep gyroMag
  ABOVE the gate's threshold for the first several ticks after the push
  ends — meaning most of the cancellation can already happen BEFORE the
  gate ever trips. This mode freezes whatever's left at that point; it
  cannot retroactively undo cancellation that already occurred while
  still "moving" per the gate. `'tilt'`: skips integration (and
  therefore drift) entirely — reads the phone's CURRENT orientation
  angle directly every frame (mobile: `deviceorientation` beta/gamma;
  desktop: `computeDesktopRotationNxNy()`, the SAME memoryless
  cursor-offset signal Rotation's own desktop branch already uses)
  relative to a baseline, mapped straight to displacement with no
  curve/range/reference/clamp — the same "pure, memoryless function of
  the current reading" technique Rotation's own `'absolute'` mode
  already uses to eliminate ITS equivalent drift. **Its own real,
  disclosed limitation**: only covers X/Y (left-right, forward-back) —
  Z (depth, toward/away from the phone's own face) has NO angle
  equivalent at all, since rotating a phone in place never changes its
  distance from anything; only genuine translation does, which is
  exactly the kind of motion that can't be read without integration
  (and therefore without the same drift this mode exists to avoid). Z
  always reads exactly 0 in Tilt mode — a deliberate choice, not a bug,
  made rather than silently keeping the old drifting behavior on just
  that one axis. **The general lesson for the 3-axis asymmetry, in case
  a future feature hits the same question ("xyz are all just axes, why
  does X work differently from Z"): the asymmetry is never in the axes
  themselves, it's in which real sensor reading happens to exist as a
  substitute for each one.** A phone reports exactly 2 independent tilt
  angles (beta/gamma) and ZERO depth-equivalent readings — a hard
  hardware/sensor limitation to check for directly before assuming a
  3-axis feature should trivially generalize to all 3 the same way.
  Baseline re-capture (`resetPhoneDisplaceTiltBaseline()`) is called
  UNCONDITIONALLY from Displace Reset regardless of which mode is
  active (matching this file's own established "update every baseline
  every time, never branch on the active mode" discipline — see the
  Phone Model rotation-reset gotcha earlier in this file for the exact
  bug class that pattern exists to prevent), on switching INTO Tilt mode
  via the dropdown, and on enabling Displace while Tilt is already
  selected.
- **The EXISTING `'acceleration'`/`'worldPosition'` Displace modes' own
  Stationary Gate now does a true ZUPT (Zero-Velocity-Update) — fixed
  2026-10-01, per a detailed, explicitly-scoped user request (2 real
  device logs, an explicit A/B/C/D report requirement, and a long list
  of "do NOT" constraints: no position decay as a substitute, no
  increasing velocity decay to hide it, no snapping to origin, no
  fabricating translation from orientation, no large rewrite).** The old
  gate checked gyro magnitude ONLY and, when quiet, zeroed that TICK'S
  acceleration INPUT — it never touched velocity directly. Since
  `vel = vel*exp(-velDecayRate*dt) + accel*dt` is a leaky integrator,
  any RESIDUAL velocity already present when "stationary" begins (e.g.
  from the deceleration right before a real push ends) only ever decays
  asymptotically — it mathematically never reaches exactly 0 — and with
  `phoneDisplacePosDecayRate=0` (a legitimate, common config, since
  position decay pulls virtual position toward the origin independent of
  real motion) nothing ever corrects what that never-finished decay
  keeps feeding into position (`pos += vel*dt`) every tick. Over a long
  hold this creeps toward the full theoretical `v0/velDecayRate` — small
  per-tick, but real and sustained, which is exactly the "drifts back
  toward default after I stop moving" symptom. Fixed by adding an
  acceleration-magnitude check alongside the existing gyro check (new
  `phoneDisplaceZuptAccelThresholdMps2`, default 0.6 m/s², read from the
  ALREADY bias-corrected/filtered ax/ay/az — not raw) plus a short dwell
  timer (new `phoneDisplaceZuptDwellMs`, default 150ms) so a single
  quiet sample mid-motion doesn't instantly trigger anything. Once BOTH
  conditions hold continuously through the dwell window, velocity is
  force-set to EXACTLY 0 (the standard INS/IMU ZUPT technique) —
  POSITION IS NEVER TOUCHED by this fix, so real accumulated
  displacement holds exactly wherever it already was. **Verified via a
  standalone Node simulation only, matched against closed-form
  predictions** (not a real device — no accelerometer/gyroscope hardware
  in this sandbox, same standing limitation as every other sensor
  feature in this file): a 10-second hold starting from residual
  velocity 0.5 showed the OLD gate's position creeping all the way to
  the full theoretical limit (0.16172 vs 0.16667 predicted) while the
  NEW gate stopped at the much smaller, dwell-window-bounded limit
  (0.06165 vs 0.06040 predicted) and then held there PERMANENTLY no
  matter how much longer the hold continued — the actual fix is this
  hard, duration-independent cap, not a smaller number alone. A separate
  push-then-hold test confirmed position keeps settling naturally DURING
  the dwell window (expected, not a bug) but then holds bit-identical
  from the instant ZUPT engages, never reset to 0. **If a future report
  describes this same "settles, then creeps back toward center over
  several seconds of holding still" shape on `'acceleration'`/
  `'worldPosition'` mode specifically, check `ZUPT Accel Threshold`/
  `ZUPT Dwell Time` (too high a threshold or too long a dwell lets more
  residual velocity survive into the hard-zero point) before assuming a
  new bug — the mechanism is bounded by construction, not driftless, so
  some small fixed residual is expected and correct, not a sign the fix
  failed.** 4 new diagnostics on `window.__debug`
  (`phoneDisplaceZuptActive`, `phoneDisplaceVel`, `phoneDisplacePos`,
  `phoneDisplaceBias`) — added to the project's EXISTING debug-exposure
  object per direct instruction, not a separate diagnostic system.
- **A 5th Displace mode, `'nativeSensor'`, exists specifically so a
  pasted-in AI suggestion to change the acceleration SOURCE could be
  tried without risking the already-working default — added 2026-10-01,
  direct mid-request correction: "well actually... make it a new
  displacement mode so we dont erase anything."** The prompt (from
  ChatGPT) asked to replace `computePhoneLinearAccelDeviceLocal()`'s
  manual gravity subtraction with `DeviceMotionEvent.acceleration`
  directly, reasoning the browser's own field should be better native
  sensor data. **That's backwards for THIS project specifically** — the
  manual-gravity-subtraction default was switched TO on 2026-09-30
  after a real controlled test found `accelerationIncludingGravity`
  rich/continuous/reliable while `e.acceleration` had never actually
  been observed performing well on this project's own real test device
  (see that function's own 2026-09-30 comment). Blindly applying an AI
  suggestion that contradicts a project's own prior evidence-based fix
  is exactly the failure mode this workspace's §0b ("don't execute an
  expensive/risky suggestion just because an agent made it") exists to
  catch — reusing it as an opt-in mode instead of a default swap sidesteps
  the risk entirely: `computePhoneLinearAccelNative(e)` (returns
  `e.acceleration` directly, null-safe) is selected instead of the
  existing function ONLY when `cfg.phoneDisplaceMode === 'nativeSensor'`,
  every other mode is byte-for-byte unchanged, and "reverting" this
  change is just not selecting the dropdown option — no code change
  needed. **If a future pasted AI suggestion proposes changing a
  SOURCE/DEFAULT this file has already evidence-tuned once, check
  whether making it an opt-in alternative (not a replacement) gets the
  same "try it for real" value without the regression risk — this is
  now the established pattern for exactly that situation.** The
  orientation-fusion half of that same prompt (replace manual gravity's
  orientation input with a fused, non-magnetometer rotation) was
  deliberately NOT pursued — this mode bypasses gravity subtraction
  entirely, so it has no orientation-quality dependency left to fix, and
  the user's own revised ask didn't call for a parallel orientation
  system. The Generic Sensor API's `RelativeOrientationSensor` was
  identified as the real closest browser equivalent to Android's Game
  Rotation Vector, in case that scope ever comes back.
- **Every Displace dev-panel row that Tilt mode's own code path never
  reads is now hidden whenever Tilt is selected (18 rows) —
  `updateDisplaceModeRowVisibility()`, added 2026-10-01, direct request:
  "dont show irrelevant sliders and inputs if the mode doesnt need
  it."** Confirmed by tracing the actual code, not guessed:
  `computePhoneResponsiveDisplacement()`'s tilt branch reads only X/Y
  axis On/Off+Scale+Invert (Z is hardcoded to 0) with NO curve/range/
  reference involved at all, and `integratePhoneDisplacement()` early-
  returns for tilt mode before the Stationary Gate/ZUPT/Vel-Pos-Decay
  code ever runs. Hidden rows: Z axis On/Off+Scale+Invert (3), Velocity/
  Position Decay Rate (2), Stationary Gate checkbox+threshold (2), ZUPT
  Accel Threshold+Dwell (2), and all 9 per-axis Range-bar/Curve-editor/
  Reference-distance rows. **Every other mode (`'acceleration'`,
  `'worldPosition'`, `'freeze'`, `'nativeSensor'`) shares the IDENTICAL
  full control set** — confirmed by reading each mode's own code path
  (Freeze and Native Sensor both reuse the exact same integrator/gate/
  ZUPT/curve pipeline as `'acceleration'`, just swapping one internal
  step), so the only real split needed is "Tilt vs. everything else," not
  a per-mode-pair matrix. Implemented as a plain array of row elements
  (`displaceNonTiltRows`, populated by wrapping the relevant `addRow()`
  calls: `displaceNonTiltRows.push(addRow(...))`) toggled via
  `row.style.display`, called once at dev-panel build time (so a Sync-
  restored Tilt mode shows the right set from first paint) and again
  from the Mode dropdown's own `wireSelect` callback. **If a future
  Displace mode is added, check which of these 18 rows its own code
  path actually reads before assuming it needs the full set or the Tilt-
  only subset — don't default to showing everything.**
- **This same turn is also this project's 2nd documented case of 2
  Claude Code sessions sharing one physical working directory (not
  separate worktrees), confirmed and handled the same way as the first
  (2026-09-28, the `phoneTiltAxisYRaw` rename).** A concurrent session's
  complete, self-contained Rotation Fine-Tune per-axis split (3 sliders
  replacing 1, `phoneResponsiveRotationFineTune` → `X/Y/Z`) had already
  landed in the live `src/main.js` and `docs/CHANGELOG.txt` on disk
  before this session's own commit ran. **Before letting it ride along
  in the same commit, its diff was read in full** (`git diff --stat` +
  every hunk) to confirm it was genuinely complete (not a mid-save
  half-edit — both the `cfg` default and its one consumer,
  `computePhoneResponsiveAxisDeg()`, were updated together consistently,
  and the dev-panel UI change correctly called an already-existing
  helper, `wireDeviceSliderMirror()`, not a function the concurrent
  session was still in the middle of adding) and non-overlapping with
  this session's own Displace changes (different cfg fields, different
  dev-panel subgroup, zero shared lines). **The general check before
  trusting a surprise uncommitted change found sitting in a shared
  working tree: read its full diff, confirm internal consistency (every
  piece of a multi-part change present together, not just some of them),
  and confirm it doesn't touch any line your own change touches — only
  then is it safe to let it ride along in one commit** rather than
  risking a `git stash`/reset that could destroy someone else's
  in-progress work.
- **The Debug group's "Displace Log" subgroup (added 2026-10-01) needed
  2 NEW pieces of module-level state — `phoneDisplaceLastAx/Ay/Az` and
  `phoneDisplaceIsStationary` — because neither value had ever been
  tracked outside a single function/branch before, despite this file
  already exposing plenty of other Displace internals on
  `window.__debug`.** `phoneDisplaceLastAx/Ay/Az` is captured at the TOP
  of `applyPhoneDisplaceSample(ax, ay, az, dt)` specifically because
  that's the ONE real shared entry point both the mobile accelerometer
  path (`integratePhoneDisplacement()`) and the desktop cursor-delta
  path (`updatePhoneDisplaceDesktopFrame()`) funnel through — a single
  capture site covers both platforms for free, no per-platform logging
  code needed. **If a future diagnostic needs "the value that actually
  reached the integrator" for any other per-tick quantity, check whether
  it's cheaper to capture it at this one shared choke point first, before
  adding separate capture code to each input path.** `phoneDisplaceIsStationary`
  mirrors the Stationary Gate's own local `isStationary` variable into
  module state right after its own if/else block — **deliberately kept
  as a SEPARATE field from the existing `phoneDisplaceZuptActive`, not
  folded into it or treated as redundant**: the gate's own verdict flips
  true the instant gyro+accel both read quiet, while `phoneDisplaceZuptActive`
  only engages once that quiet state has held for the full
  `phoneDisplaceZuptDwellMs` dwell window — the two legitimately
  disagree for that entire window right after every real stop, and
  that disagreement is exactly what a future ZUPT-tuning session would
  want to see in the log, not something to collapse into one flag.
- **`applyPhoneDisplaceSample()` must explicitly zero `phoneDisplaceLastAx/Ay/Az`
  inside Freeze mode's own early-return branch (where the function is
  skipped entirely, not called with zeros) — otherwise the Displace
  Log's "Processed Accel" field would keep showing the LAST real
  pre-stop value forever once Freeze engages, since nothing ever
  overwrites it.** This is a narrow, deliberate exception to "only
  `applyPhoneDisplaceSample()` itself writes these 3 variables" — Freeze
  mode's own early return in `integratePhoneDisplacement()` is the one
  other call site that sets them directly, specifically because
  "the integrator was not called this tick" and "the integrator was
  called with zero input" are semantically different claims, and only
  the explicit zero in the Freeze branch gets that distinction right.
- **The Displace Log's "Target vs. Rendered" field deliberately excludes
  `cfg.phoneModelOffsetX/Y/Z` (the manual position-offset sliders) from
  BOTH sides of the comparison** — `_phoneDisplaceTargetVec` (the
  undamped per-frame output of `computePhoneResponsiveDisplacement()`)
  and `_phoneDisplaceCurrentVec` (the same value after
  `cfg.phoneDisplaceDamping`'s lerp) are logged directly, not
  `phoneModelWrapper.position` (which also adds the offset sliders on
  top, per `applyPhoneModelTransform()`'s own comment). **If this field
  is ever changed to include the offset, it has to go on BOTH sides
  identically** — adding it to only one side would silently turn a
  "how much lag is damping introducing" diagnostic into "how big is the
  offset slider," which is a different question this log was never
  meant to answer.
- **`computePhoneDisplaceAxisUnits()` had a genuine "clamp the input,
  not the output" bug — fixed 2026-10-01 — that produced a COMPLETELY
  FLAT, zero-derivative dead zone for the entire range
  `|rawMeters| >= xReference`, not just a boundary hold.** `t =
  clamp(|rawMeters|/xReference, 0, 1)` clamped the CURVE'S INPUT before
  the curve ever ran — once `rawMeters` (the raw integrator state in
  meters) crossed `xReference`, `t` was pinned at exactly `1` FOREVER,
  so `curveY`/`magnitude` were a literal constant for any further growth
  OR shrinkage of `rawMeters`, as long as it stayed above `xReference`.
  Any real push or accumulated drift carrying displacement past the
  Reference Distance froze the mapping completely — the user's own
  report ("appears stuck at the movement boundary") and explicit
  diagram (`internalPosition -> outputPosition = clamp/map(internalPosition)`,
  clamp applies ONLY to the final output) both named this exact class of
  bug directly. **Fixed by removing the pre-clamp on `t` entirely** —
  the curve lookup itself still only ever receives a value clamped to
  `[0,1]` (curves have no defined shape outside their own authored
  domain), but a linear extension now continues `idealMagnitude` past
  the curve's own ceiling at the curve's own average per-unit-`t` rate,
  so the underlying value is STRICTLY INCREASING across its entire
  domain. The ACTUAL boundary clamp (`clamp(idealMagnitude, 0, max)`,
  floor still `0` not `min`, preserving the pre-existing negative-min
  fix from earlier the same day) is applied exactly once, as the literal
  last line, to this function's own local return value — never to
  `phoneDisplacePosX/Y/Z`/`phoneDisplaceVelX/Y/Z`, which were never
  touched by this function and were never the actual problem.
- **PROVEN, not assumed, via a standalone script: the recovery
  THRESHOLD (the exact `rawMeters` value at which the clamped output
  starts moving again) is mathematically IDENTICAL for the old buggy
  formula and the new fixed one — "`rawMeters` returns inside
  `xReference`" — because ANY bounded clamp on a function satisfying
  `f(xReference) = max` must have `f(rawMeters) >= max` for ALL
  `rawMeters >= xReference`, by simple monotonicity.** This is an
  INHERENT property of what "Reference Distance = the distance that
  maps to full output" means, not a remaining bug, and no further
  tweak to this function can change it without redefining what
  Reference Distance means (which the user explicitly asked NOT to do
  — "keep the existing range/reference system"). **What the fix
  genuinely changes is DIFFERENT from "recovery happens sooner": it's
  that the underlying state keeps measurably, continuously responding
  to a reversal throughout the ENTIRE overshoot** (visible in the new
  `phoneDisplaceBoundaryX/Y/Z` flag and the existing Target/Rendered
  Displace Log fields), **instead of giving ZERO signal of any kind
  until the exact instant of release** — which is what actually reads
  as "dead/broken" vs. "expected boundary hold, and I can see it's
  still live." **If a future report describes this same "stuck at
  boundary" symptom persisting even after this fix, the next lever is
  NOT another mapping tweak — it's tuning `xReference` itself larger
  (a config/UX question: does the configured Reference Distance
  realistically match how far the phone actually gets pushed?) or
  addressing it at the INTEGRATOR level (the already-documented ZUPT/
  Freeze/Tilt mitigations for accumulated drift, a completely separate
  subsystem from this mapping function).** Any future "fix the clamp
  so output can move the instant the real-world device reverses, even
  while still deep in overshoot" request should be answered with this
  proof, not a fresh attempt at a cleverer mapping formula — multiple
  alternative formula shapes (asymptotic extension, steeper/shallower
  linear extension) were considered and algebraically ruled out during
  this fix's own development for exactly this reason, before settling
  on the straightforward linear extension that at least makes the
  underlying state genuinely responsive (even though the final clamp's
  release point can't move).
- **`phoneDisplaceBoundaryX/Y/Z` is set INSIDE `computePhoneDisplaceAxisUnits()`
  itself, once per axis per call — NOT computed separately from the
  function's own return value afterward.** Since the function is called
  once per axis per frame from `computePhoneResponsiveDisplacement()`,
  this is the one place that already has `idealMagnitude`/`max` in
  scope without needing to re-derive or re-expose them. **If a future
  diagnostic needs another per-axis internal quantity from this
  function (not already on `window.__debug` or the Displace Log), set
  it here too, at the point of computation, rather than trying to
  reconstruct it from the function's single scalar return value
  afterward** — the return value alone (a signed world-units magnitude)
  has already thrown away the sign-independent `idealMagnitude`/
  boundary-state information a diagnostic would need.
- **2 new "shadow" A/B diagnostic pipelines (`displaceShadowExisting`/
  `displaceShadowNative`, added 2026-10-02) run in parallel with the
  real, mode-selected Displace pipeline, fed the EXACT SAME devicemotion
  sample every tick — direct request to compare the Existing (manual
  gravity-subtraction) vs. Native (`e.acceleration`) acceleration
  sources against ONE physical movement, since the 2 cannot be
  reproduced identically across 2 separate test passes.** Implemented by
  DUPLICATING (not sharing or refactoring into) the real pipeline's own
  bias high-pass + raw deadzone/clamp filter + Y/Z swap + Stationary
  Gate/ZUPT + leaky integrator math inside a new
  `stepDisplaceShadowPipeline(state, e, linear)` function, called twice
  per tick from `updateDisplaceAbComparison(e)` — once per shadow state,
  each with `linear` computed from a DIFFERENT source
  (`computePhoneLinearAccelDeviceLocal(e)` for Existing,
  `computePhoneLinearAccelNative(e)` for Native) but the SAME `e` and
  therefore the same real sensor sample and the same `e.rotationRate`
  gyro reading. **This is a deliberate duplication, not a DRY violation
  to "clean up" later** — the real pipeline's own code
  (`integratePhoneDisplacement()`, `applyPhoneDisplaceSample()`) is
  completely untouched by this feature, per the explicit "do not
  redesign the displacement system" instruction; collapsing all 3 call
  sites (real + 2 shadow) onto one shared stepping function would have
  required restructuring the real pipeline's own already-shipped,
  already-verified code path, which was explicitly out of scope.
  **Neither shadow pipeline EVER writes to `phoneModelWrapper.position`**
  — both are pure bookkeeping; the currently selected `cfg.phoneDisplaceMode`
  remains the only thing that drives the rendered phone, unchanged.
- **`computePhoneDisplaceAxisUnits()` gained ONE new, OPTIONAL 6th
  parameter (`setBoundary`, a write-callback) specifically so the 2
  shadow pipelines above could reuse its exact curve/range/reference/
  boundary-clamp math WITHOUT contaminating the real pipeline's own
  `phoneDisplaceBoundaryX/Y/Z` module flags.** Defaults to exactly the
  original inline module-variable assignment when omitted — all 3
  PRE-EXISTING call sites (inside `computePhoneResponsiveDisplacement()`)
  pass nothing new and are byte-identical to their pre-2026-10-02
  behavior. The 2 shadow pipelines each pass their own closure
  (`(v) => { state.boundaryX = v }`) so their boundary state lives
  entirely inside their own state object. **This IS the one piece of
  logic genuinely SHARED (not duplicated) between the real and shadow
  pipelines** — safe to share here specifically because this function
  was ALREADY a pure function taking its subject (`rawMeters`) as an
  explicit parameter rather than reading module state internally, unlike
  `applyPhoneDisplaceSample()`/`integratePhoneDisplacement()` which read
  and write bare module-level variables directly and therefore could NOT
  be safely reused for a 2nd/3rd independent caller without first being
  refactored (exactly why those were duplicated instead). **If a future
  diagnostic or shadow system needs to reuse another EXISTING Displace
  function, check whether it already takes its state as an explicit
  parameter (safe to reuse directly, extend with an optional callback
  like this one if it has a side effect) or reads bare module variables
  (duplicate it instead, following this same pattern, rather than
  refactoring the real pipeline's own call sites).**
- **Shadow-pipeline reset (`resetDisplaceShadowPipelines()`, called from
  `resetPhoneDisplaceBaseline()`) zeroes velocity/position/rendered-state
  but DELIBERATELY PRESERVES each shadow's own bias estimate — matching
  the real pipeline's own already-hard-won 2026-10-01 fix (zeroing a
  still-valid bias estimate on reset was confirmed, via a real device
  test, to CAUSE post-reset drift rather than prevent it).** If a future
  change to EITHER shadow pipeline's reset behavior is considered, check
  this precedent first — don't reintroduce bias-zeroing-on-reset
  independently for the shadow states just because it "looks more like
  a clean reset" than leaving bias alone; that reasoning was already
  tried and reverted once for the real pipeline.
- **`fmtDisplaceShadowLog(label, state)` is a single shared formatter
  used for BOTH shadow pipelines' own Displace Log line, on purpose —
  not 2 separate, independently-maintained format strings.** The whole
  point of the A/B comparison is that the 2 pipelines' log output is
  structurally IDENTICAL (same field order, same units, same precision)
  so a human can visually diff them line-by-line; if a future change
  needs to add/remove/rename a field in this format, it MUST go through
  this one shared function, never be applied to only one pipeline's own
  call site, or the comparison becomes misleading rather than just
  incomplete.
- **"X/Z still appear stuck at the boundary while Y works" is NOT a
  code-architecture problem — investigated 2026-10-02, direct request
  to port a supposed "Y-only" boundary fix to X/Z, and the premise was
  false.** `computePhoneDisplaceAxisUnits()` (the 2026-10-01 boundary
  fix) was NEVER axis-specific — it's one shared function, called
  identically for X/Y/Z from `computePhoneResponsiveDisplacement()`,
  with zero per-axis branching anywhere in the pipeline
  (`parsePhoneResponsiveDisplaceConfig()`'s curve/range parser and
  `applyPhoneDisplaceSample()`'s integrator are equally axis-generic).
  **The real cause of an observed per-axis asymmetry is almost always
  the LIVE, user-tuned `Reference Distance`/`Range` values in the
  git-tracked `dev-panel-settings.json`, not the code** — since the
  boundary clamp's release threshold is mathematically always "internal
  position returns inside the Reference Distance" (proven in the prior
  fix, inherent to any bounded clamp), an axis configured with a SHORT
  Reference Distance saturates far more easily during ordinary real
  motion than one configured with a generous one, making the IDENTICAL
  underlying mapping look broken on the more tightly-tuned axis. Found
  by checking `cfg.phoneDisplace{X,Y,Z}ReferenceM`/`phoneDisplaceRange{X,Y,Z}`
  in the live settings file (Y: 1.15m/max 52 vs. X/Z still at the
  shared code default 0.35m/max 20) — not by reading `main.js` a second
  time. **If a future report describes this same "one axis feels fixed,
  others don't" shape for ANY Displace mechanism (boundary clamp, ZUPT,
  bias, curve shape), check the LIVE SYNCED per-axis config FIRST
  (per CLAUDE.md's own S12s "check git state first" discipline) before
  assuming a per-axis code bug exists** — this project's Displace
  pipeline has been axis-generic by construction since the 2026-10-01
  fix, and every call site treats X/Y/Z identically; a real per-axis
  code divergence would be a NEW, surprising finding at this point, not
  the default assumption.
- **A live settings-file surgery mid-investigation found the user had
  independently, concurrently live-tuned the SAME control (X's
  Reference Distance/Range) WHILE this conversation was diagnosing it —
  confirmed by re-reading the settings file fresh immediately before
  editing, not trusting an earlier read from a few tool calls prior.**
  The fix (matching Z to Y) deliberately left X completely untouched
  once this was discovered, rather than overwriting the user's own
  in-progress real-device tuning to force an exact match — same
  "preserve another session's/the user's own active work" discipline
  this file already applies to concurrent Claude sessions, extended
  here to the user's own live phone interaction racing against this
  conversation's own investigation. **Any settings-file edit in this
  project should re-fetch/re-read the file's current state immediately
  before writing, not rely on a read from several tool calls earlier in
  the same turn** — live Sync commits from the user's own device can
  and do land mid-conversation, confirmed directly this round (3 new
  remote commits appeared between 2 git-fetch checks a few minutes
  apart, and the live values had already changed again between an
  earlier grep and the actual edit).
- **`devPanel.js`'s own `window.formatDevNumericValue(raw)` (added
  2026-10-02) is the SINGLE shared formatter for every slider's numeric
  readout project-wide — caps at 4 decimals, strips trailing zeros via
  `String(Number(n.toFixed(4)))` rather than manual regex trimming.**
  Direct request: "for all sliders, show and use only max 4 decimal
  places... dont show all decimal places if theyre just 0s." **If a
  future control needs different precision (more or fewer decimals),
  this is the ONE function to parameterize/extend — never hand-roll a
  second formatter for one control**, or the project's sliders will
  silently disagree on precision again, the same inconsistency this fix
  was written to eliminate.
- **`main.js`'s `wireSlider()`/`wireDeviceSlider()`/`wireDeviceSliderMirror()`
  MUST apply the SAME formatting/rounding `devPanel.js`'s own
  `buildSliderRow()` listener already does — because they're attached
  AFTER it and therefore run SECOND, silently overwriting the engine's
  own correctly-formatted display with whatever raw value they compute.**
  This is the SAME "2 listeners on the same event, last one wins" shape
  CLAUDE.md already documents for the Camera group's own live-sync
  guards — if a FUTURE project-level slider-wiring helper is ever added
  to this file, it needs the identical treatment
  (`window.formatDevNumericValue` for display,
  `roundSliderValue()` — already defined in `main.js` — for the actual
  value fed into `cfg`) or it will reproduce this exact "engine shows it
  right, then my own code overwrites it wrong" bug class.
- **`roundSliderValue()` (`main.js`) now rounds the ACTUAL value written
  into `cfg` to 4 decimals, not just the on-screen text** — direct
  instruction was "show AND USE," not just "show." **If a future control
  genuinely needs more than 4 decimals of real precision (not just
  display), it must bypass `roundSliderValue()`/`wireSlider()` entirely
  and wire its own listener directly** — there is no per-control opt-out
  built into the shared helper, by design, since the request was a
  blanket project-wide policy, not a per-control toggle.
- **A SECOND real-device Mobile-tab-independent-override contamination
  was found and fixed the same round as the Z Reference Distance case
  above: `sliderPhoneDisplacePosDecayRate` was already `0` at the
  Desktop level but still `12` on the Mobile-tab override.** This is
  now the 2nd confirmed instance of this exact bug class in one session
  — **any time a user reports "I already set X to Y" but the live app
  still behaves like the old value, check for an independent Mobile/
  Landscape override in `devDeviceValues.<tab>` before assuming the
  Desktop-level fix didn't take effect or some other mechanism is
  broken.** A Desktop-level settings fix is NOT sufficient on its own
  for any control that has ever had its own device-independent value
  set — both locations need checking.
- **Investigated, not fixed (deliberately): `sliderScreenTextureScale`
  "snaps to whole numbers" despite having `step: 'any'` through its
  ENTIRE chain** (`main.js`'s own control definition → `buildSliderRow()`'s
  DOM attribute assignment → `wireSlider()`'s `parseFloat` read → the
  click-to-edit popup's own step-inheritance, all read and confirmed
  correct line by line). **No code-level cause was found** — the leading
  theory is a native mobile touch-drag precision limitation (a well-
  known, largely inherent constraint of `<input type=range>` on
  touchscreens, not something `step` can fix once you're dragging rather
  than typing an exact value via click-to-edit). **If this comes back
  with a more specific repro (confirm: drag vs. click-to-type, which
  exact slider, which device), re-investigate with that detail — don't
  assume the earlier "probably touch-drag precision" theory is settled
  fact, since it was never confirmed against a real device, only argued
  from the absence of a found code bug.**
- **"StationaryGate:ACTIVE but ZUPT inactive for far longer than the
  dwell" has 2 non-bug explanations and 1 real bug — check them in this
  order (investigated 2026-10-04; the dwell state machine itself was
  verified correct, one writer, set-once dwell start).** (1) **Log
  aliasing**: the Displace Log samples every ~200ms but devicemotion
  ticks far faster, so ACTIVE on consecutive lines does NOT mean the gate
  held continuously between them. Read the new `ZUPTDwell:… (peak …ms /
  need …ms)` field — if peak < need, the gate is flickering, not the
  timer failing. (2) **Sensor noise**: this phone's still-state gyro
  magnitude has median 3.8 °/s (only 12% of samples under a 2 °/s gate),
  so a continuous 150ms quiet window is rare; loosening the gate is a
  tuning decision, not a bug fix. (3) **The real bug, now fixed**:
  `integratePhoneDisplacement()` used to leave `phoneDisplaceIsStationary`/
  `phoneDisplaceZuptActive`/`phoneDisplaceZuptDwellStart` frozen on any
  tick that didn't evaluate the gate — Displace disabled, Tilt mode, or
  an acceleration source returning `null` (e.g. `'nativeSensor'` with an
  empty `e.acceleration`). `clearPhoneDisplaceGateState()` now clears
  them at all three (never velocity/position). **Any NEW early-return or
  skip path added to `integratePhoneDisplacement()` must call it too, or
  the log will again show a stale flag pair that looks like a timer
  failure.** The A/B shadow pipelines (`stepDisplaceShadowPipeline`) were
  not changed and don't log dwell.
- **Mobile-tab "Independent from Desktop" values for the Displace
  sliders do not reach `cfg` (found 2026-10-04, NOT fixed).** Only
  `sliderPhoneResponsiveRotationFineTuneX/Y/Z` and the Texture
  offset/scale sliders have `wireDeviceSliderMirror()` bridges; every
  other Displace slider (decay rates, damping, gate threshold, ZUPT,
  Reference Distance) uses plain `wireSlider()`, which binds only the
  Desktop element, so Mobile overrides sit unused in `devDeviceValues`
  and the phone runs on Desktop values. This is the same bug class as
  the 2026-10-01 Texture Offset fix, and it means the earlier "set the
  Mobile override too" settings edits (Z Reference, Position Decay) were
  harmless but ineffective on the phone. **Before telling the user a
  Mobile-tab value is "in effect," confirm that control has a bridge.**
- **"The phone drifts back to center while held still" has TWO separate
  causes in this integrator — don't conflate them (investigated
  2026-10-04).** (1) **Position decay**: `applyPhoneDisplaceSample()`'s
  `pos = pos*posDecay + vel*dt` shrinks position every tick, even on
  ZUPT ticks, whenever `cfg.phoneDisplacePosDecayRate > 0` (code default
  0.08). Fixed by `holdPosition` (decay factor 1 on Stationary-Gate
  ticks; shadow pipelines use the same rule via a local `holdPos`).
  (2) **Velocity-driven wander**: with Velocity Decay 0 an unzeroed
  velocity integrates forever, and ZUPT only zeroes it when the gate
  holds. On this phone the still-state gyro magnitude has median 3.8 °/s,
  so a 2 °/s gate is active ~9% of ticks (ZUPT ~3.6%): replaying the
  user's real still log with decay 0/0 gave 0.14–0.24 m of wander on a
  motionless phone. A gate of ~6–8 °/s made ZUPT engage 72–87% of ticks
  and zeroed final velocity. **When the settings show decay 0, the
  position-decay line is a no-op and cannot be the cause — check the
  Displace Log's `(decay vel:… pos:…)` readout (added 2026-10-04) for the
  rates actually in `cfg`, then `ZUPTDwell … peak`, before touching
  integrator math.** The hold rule does NOT fix cause (2); that needs a
  gate/velocity-decay tuning decision from the user.
- **Debug-log "Log ..." checkboxes filter at VIEW/COPY time, not at write time
  (2026-10-04, direct standing request: toggles must also change what gets
  copied, e.g. "not copy the A/B data").** Sensor Log and Displace Log entries
  are `{ts, parts:[{k,t}]}` with every field captured; `formatLogEntry()` +
  `SENSOR_LOG_FLAGS` / `DISPLACE_LOG_FLAGS` apply the cfg flags when rendering,
  copying, saving, and in COPY ALL / COPY SELECTED, and each checkbox handler
  calls `render{Sensor,Displace}LogView()` to rebuild the on-screen list. **Any
  NEW toggleable log field must be pushed as a part with a `k` registered in the
  matching flag map -- never gate it with `if (cfg.x) parts.push(...)` at write
  time, or old lines can't be re-filtered and the copy will ignore the toggle.**
- **Low-Speed Velocity Snap (`cfg.phoneDisplaceVelSnapMps`, default 0.03 m/s):**
  the Stationary Gate flickers on the real phone (still-state gyro median
  3.8 deg/s), so the 150 ms ZUPT dwell rarely completes and a leftover
  ~0.01-0.02 m/s velocity crept the phone (~0.3 units/s). While the gate reads
  quiet, speed under this threshold is zeroed at once (velocity only, never
  position); mirrored in `stepDisplaceShadowPipeline`. Not device-verified. If a
  slow deliberate push seems swallowed, lower it; 0 disables.
- **`computePhoneDisplaceAxisUnits()` feeds the curve a deadzone-REMAPPED ratio
  (`(min(t,1)-DZ)/(1-DZ)`), not the raw ratio (2026-10-04).** The raw ratio made
  output jump ~1 unit the instant |raw| crossed the 0.02 deadzone (visible as
  repeated exact `31.00` readings then a snap). Reference Distance still maps to
  full output; the deadzone edge now maps to 0.
- **CORRECTED 2026-10-04 (same day): Low-Speed Velocity Snap default is now 0.15 m/s, not 0.03.** A real up/pause/down/pause test showed the stop leaves a +0.11 m/s velocity (braking pulses integrated ~0.6 vs push ~0.44) that persisted ~0.4 s (gate flicker + 150 ms dwell) and bounced the phone back ~1.2 units; 0.03 ignored it. 0.15 zeroes it the moment the gate reads quiet. Tradeoff: with the gate quiet, a constant glide slower than 0.15 m/s is also zeroed -- lower the slider if slow deliberate moves feel swallowed. The remaining ~1.3-unit bounce happens while the gate is still inactive (the braking overshoot itself) and is NOT fixed. The bias tracker was evaluated and ruled out as the main cause (synthetic sim: ~0.02-0.05 m/s of the 0.11), so it was left alone.

- **CORRECTED 2026-10-04 (3rd round on the post-stop "bounce back"): the bias tracker WAS the main cause, and the earlier entry above that rules it out is wrong.** The full up/pause/down/pause log showed Bias Z swinging up to 0.24 m/s^2 during a push: `PHONE_DISPLACE_BIAS_TRACK_RATE` (0.4/s) learned the push itself as "bias", shrinking it, then un-learned it during the brake, inflating it -> 25-37% of peak speed left over after every stop (+0.11 m/s, -0.21 m/s). The ruling-out sim was wrong because it used pushes ~half as long as real ones (overshoot scales roughly with duration squared). `stepDisplaceBias()` now clamps each sample's correction to `cfg.phoneDisplaceBiasInnovationClampMps2` (default 0.10 m/s^2; 0 = old behavior) in the real pipeline AND both A/B shadows: balanced push/brake residual -0.08 -> -0.01/-0.02 m/s, slow drift tracking unchanged. Tradeoff: a static offset > 0.1 m/s^2 is learned slowly (0.3 m/s^2 -> 0.287 after 10 s). **Testing lesson: when simulating a push/brake pair use integer tick counts and realistic duration/strength -- a float `t < 0.5` loop gave a fake 0.025 m/s residual (31 push ticks vs 30 brake ticks), and a too-short pulse hid the effect entirely.** Also noted: wrist wobble during a "pause" reads ~9-11 deg/s gyro, above the 8 deg/s gate, so the Stationary Gate/ZUPT/velocity snap often never engage between moves -- the bias clamp fixes the residual without depending on them.
- **IK Nodes / IK POSING (2026-10-04).** **SUPERSEDED 2026-10-04 (IK was re-implemented as a port of HANDO's pose-slider solver -- see the last IK entry at the end of this file; only the node-binding/GLTF-naming facts below still hold):**  (a) The HAND's IK empties are children of the skinned MESH node, not of any bone -- they must be bound to bones (`computeHandIkBindings()` at load, `setupIkNodesForHand()` per clone) or they stay frozen at bind pose; the PHONE's empties are inside its own hierarchy and follow for free. Hand2.glb / Galaxy S2 / Motorola Razr have no IK layer (zero nodes, not an error). The bone binding uses nearest bone head->tail segment at bind pose and was checked 40/40 against the real GLB; re-check it (`scratchpad`-style node script) if the hand GLB is re-exported -- the user is actively editing HandiBonesB-IK.glb. (b) Bone STRETCH scales ONLY the chain's root bone: scaling every bone compounds through the hierarchy (x1.4 under x1.4 = x1.96) and overshoots. Stretch axis = the dominant axis of the child bone's local offset. (c) With Overlap Position on, POSITION is the primary task and orientation the secondary: pure CCD leaves the fingertip pointing 55-145 deg off, folding orientation INTO CCD cost 10-50 mm of position, and a leaf-only orientation fix swings the node ~21 mm/rad (the tip empty sits ~21 mm past the last joint) -- only the task-priority DLS refinement (`ikRefine6D`) gets both (0.00 mm / 0.0 deg when feasible). It judges the FINAL pose, not each step (good routes pass through poses that stray from the goal), and reverts if position ends worse or orientation didn't improve (protects a straight, singular chain). (d) Chain bones are restored to the pose system's value every frame before solving, via `ikBoneState` (base vs. written quaternions/scales); a bone whose value changed since IK wrote it is adopted as the new base. Anything that adds ANOTHER per-frame writer of finger bone rotations must run BEFORE `applyIkPosing()` in `animate()`. (e) Test lessons: `angleTo` between a float32 GLB quaternion and itself reads ~5e-4 rad (not exactly unit length) -- compare components instead; read a proxy's `matrixWorld` only after `scene.updateMatrixWorld(true)`. (f) The Allow Bone Stretching / pairs UI, click-picking and the sphere/axes rendering were NOT verified in a browser (project rule) -- only the solver and binding were, with real three.js in Node (`test-ik-solver-three.mjs`, `test-ik-binding-three.mjs` in the session scratchpad; r169 `three.module.js` from unpkg).
- **Hand Model selector order is saved state (2026-10-04):** `hiddenHandModelOrder` (JSON of file paths) -> `applyHandModelOrder()` reorders `HAND_MODEL_OPTIONS` in place; the first entry is also the fallback model when nothing is selected. Drag starts only from the row's ⠿ icon (`.dp-list-picker-handle`, pointer events, `touch-action:none`).
- **GLTFLoader RENAMES every node (`PropertyBinding.sanitizeNodeName`: each whitespace char -> `_`, and `[ ] . / :` removed), so any code that finds a node by its Blender/GLB name must match the sanitized form (2026-10-04).** "IK Target Points" arrives as `IK_Target_Points`, "Back - Center.002" as `Back_-_Center002`. The first IK Nodes version searched `/ik\s*target/` and found NOTHING on both the hand and phone in the real app, while every Node test passed -- the tests had built node names straight from the GLB JSON. Use `ikNorm()` (underscores back to spaces) to match/display; and in any GLB-derived Node test run names through `THREE.PropertyBinding.sanitizeNodeName()` first. (`findPhoneScreenMeshes()` already tolerated this via its case/whitespace-tolerant match.) IK node ids are built from the normalized names so they stay stable across loads and phone-model swaps. The hand GLB is being edited by the user (44 empties now, was 40) -- never hard-code the count.
- **ALL hand loads (including the first) go through `loadHandModel()` and its `handModelLoadToken` (2026-10-04).** The first load used to be a separate unguarded loader for `MODEL_URL` (Hand2.glb, big); the synced selection's guarded swap to the small IK hand finished first and the stale first load then overwrote it -- the selector showed HandiBones while Hand2 was on screen (0 IK nodes). Never add a second place that calls `measureAndSetHandModel()`/`rebuildField()` for a hand load without the token check; one-time boot work lives in `runHandFirstLoadTail()`. **Diagnostic that found it: the LIVE deployed site is probeable** (`https://handy-set.vercel.app/?dev=1`, browser pane `javascript_tool`, `window.__debug.hands[0].clone` / `.ikNodes` / `.cfg`) even though the local sandbox server is not -- when a report can't be explained by reading code, one targeted probe of the deployed page beats more Node simulation (Node tests with hand-built node trees passed the whole time). Debug > IK Nodes also shows the live hand/phone node counts + which hand file is loaded. The deployed site serves the COMMITTED `HandiBonesB-IK.glb`, not the user's uncommitted local edits.
- **Every descendant of the "IK Target Points" layer is an IK node (not just leaf empties)** -- `ikLayerNodes()`. The finger/palm group objects are nodes too (they sit at the layer origin).
- **IK POSING chain now includes the arm (2026-10-04):** **SUPERSEDED 2026-10-04 (IK was re-implemented as a port of HANDO's pose-slider solver -- see the last IK entry at the end of this file; only the node-binding/GLTF-naming facts below still hold):**  `ikChainFor()` returns the target's bone up to `rForearmBend` (<= 8 bones); `ikSolvePosition()` is STAGED (finger bones first via `ikStretchRootIndex()`, then the full chain only if the finger can't reach) and returns how many bones it used, which `ikRefine6D()` then reuses (finger-only first, full chain if orientation error is still > 0.1 rad). Reasons: (a) a finger-only chain barely moved the hand when the source (usually the phone) is tens of units away -- the hand is ~8 world units long; (b) un-staged CCD moves every bone each pass so two pairs on one hand fought (61 mm error). Stretch scales only the topmost FINGER bone (never the arm); palm/wrist targets can't stretch. If a future change makes IK "do nothing" on the live site, first check the hand<->source distance against the arm's reach before suspecting the solver. **Live-site probing gotcha:** the browser pane pauses `requestAnimationFrame` on an unfocused tab, so toggling IK and reading bones immediately shows NO change -- pump a frame (a `computer` screenshot) between the toggle and the read.
- **IK Influence tiers (2026-10-04):** **SUPERSEDED 2026-10-04 (IK was re-implemented as a port of HANDO's pose-slider solver -- see the last IK entry at the end of this file; only the node-binding/GLTF-naming facts below still hold):**  `cfg.ikInfluence` (0-100) -> `ikGroupFreedom('wrist'|'forearm'|'model')` (thirds, in that order; fingers always 1) -> `ikBoneLimitRad()` = freedom x pi. `ikChainFor()` now goes all the way to `RootNode`; `ikActiveChain()` trims it to the bones with freedom > 0; `ikClampToLimit()` enforces the rotation cap relative to `ikBoneState.baseQ` (so EVERY chain bone needs a state entry BEFORE solving -- ikSolvePair creates them for the full chain). The whole-model tier translates the `RootNode` BONE (`ikTranslateModel`), which is why `ikBoneState` also stores `baseP/writtenP` -- if anything else ever translates a bone, it will be treated as an external pose change. Default is 66 (arm free, model locked) to match the pre-slider behaviour. Float32 GLB quaternions are not exactly unit length: in tests, "this bone didn't move" needs ~0.3 deg tolerance when measured through `invert().multiply()`.
- **Hand + Phone model selectors share one import/default design (2026-10-04).** `api/upload-phone-model.js` serves both via `?kind=hand|phone` (GET) / `X-Dev-Panel-Model-Kind` (POST), mapped to a fixed folder whitelist -- never a client-supplied path. `HAND3D/manifest.json` must keep listing the shipped hands or the first server-side import would write a manifest without them. `selectHandModelFile()` / `selectPhoneModelFile()` are the DOM-free "switch model" steps (used by row clicks AND the Set-as-Default restore); a `blob:` URL (import not yet uploaded) is never a valid restore/default target. Defaults (`defaultHandModel`, `defaultPhoneModel`, `defaultPhonePose`) are applied in `loadRemoteSettingsOnStartup()` right after `apply(settings)`, so they override the Sync'd selection by design. `saveFieldAsDefault()` now returns true/false.
- **IK = a port of HANDO's IK Hand Pose (2026-10-04, replaces the bone-level CCD solver).** The UNKNOWNS are pose sliders (whole-hand rot/offset, wrist, arm: elbowBend/elbowSideBend/forearmTwist + 9 bone offsets, curl/splay of only the involved fingers), solved by damped least squares (`solveIkHandPose`) against position+orientation residuals measured on the target node's SKIN-bound world matrix (`ikAttachedWorldMatrix`), with a penalty for leaving the BASELINE pose captured when IK is turned on (restored when turned off). `ikInfluence(key)` = master% x part% caps each DOF's travel from the baseline as a fraction of its slider range (0 = frozen; ranges are read from the live dev-panel slider's min/max, so a typed-in widened range widens the solver's too). Re-solve only when `ikSignature()` changes. When IK is OFF nothing runs (`updateIkHandPose()` early-returns; node following only while the node display or a pick is on; the skin binding is lazy -- `att.pending` -> `ikResolveAtt`). Any NEW per-frame writer of pose bones must either write through the same cfg pose keys or run BEFORE the solve, or the solver's result is overwritten. Arm bones: `applyArmPoseToSkeleton()` runs BEFORE wrist/fingers in `applyPoseValuesToHand()`/`ikApplyPose()`, and `computeCurlAxisRefQuat()` uses the whole arm chain (`ARM_CHAIN_BONES`): that is the 6th place this file needed "a rotation above the hand must also move the curl axis reference" -- adding ANY new bone rotation above `rHand` needs the same treatment. Bone OFFSETS use a WeakMap of rest positions (never `userData`: `Object3D.clone` JSON-copies it). The hand GLB is Draco-compressed, so a Node test must decode it (draco3d) before the skin data exists -- a stripped-loader test sees ALL vertices at the origin and "passes" vacuously (this happened: the first binding test reported 0.000 error because nothing was found). Test recipe that worked: real three@0.169.0 + draco3d in the scratchpad, `new Function` over main.js slices (see test-hando-ik.mjs / run2.mjs).
- **CAMERA ANCHOR = world origin (2026-10-04).** `controls.target` starts at (0,0,0) and `applyCameraPreset()` ignores a saved camera's `tx/ty/tz`; Zoom/Yaw/Pitch/orbit all measure from the target, pan stays free. If the hand looks off-center that is expected (it sits ~Y33 above the origin); re-save cameras after framing them.
- **Phone Responsive Rotation is INDEPENDENT of the hand's "Tracking Enabled" (2026-10-04).** Its gates are its own On/Off + the Debug global override only; `cfg.trackingEnabled` stays the master for Palm Rotation / Wrist Splay / Arm Rotation / Pose Tween / Wrist Crop. Any new phone-side responsive feature must (a) not read `trackingEnabled`, (b) add itself to `continuousRenderNeeded` (on-demand rendering stops the loop otherwise), (c) request the sensors (`requestMotionPermissionIfNeeded()`) at load and when it is switched on. Also: the Item Selector's restore handler (`hiddenPhoneModelFile` 'input') must not treat the startup settings restore as a model switch (`phoneModelRestoreInProgress`) -- per-model snapshots are only captured/applied on real switches. Diagnosis recipe that found both: read the synced settings JSON FIRST (`checkboxTrackingEnabled: false` was sitting there all day), then probe the live page's `window.__debug.cfg` after load.
- **Phone Displace / Phone Rotation use the DEVICE's value (2026-10-04, `PHONE_DEVICE_AWARE_ID`).** The panel's Mobile/Landscape rows can be independent, but wired callbacks only see the Desktop element, so a phone silently ran on Desktop values. `applyPhoneDeviceAwareValue()` now copies the Mobile (portrait) / Landscape row's live value into cfg on a touch device (`getRuntimeDeviceSuffix()`, never the editor's open tab). A NEW control that should honour per-device values must either match that regex (cfg key = id minus type prefix, lowercase first letter) or have its own `cfg*Mobile` key + `wireDeviceSlider`/`wireDeviceSliderMirror`. This supersedes the "Mobile-tab values for the Displace sliders do not reach cfg (NOT fixed)" note above. Also: `getActiveDevPanelTab()` (devPanel.js) returns a STRING ('desktop'/'mobile'/'landscape'), so `wireDeviceSlider()`'s `activeTab?.id === 'mobileTab'` test is always false (it always writes the Desktop cfg key) -- harmless only because `wireDeviceSliderMirror()` also feeds the suffixed keys. **Live-test recipe for sensor features (no real phone):** fetch the page HTML, inject `<base href=origin>` + a script that stubs `DeviceOrientationEvent/DeviceMotionEvent.requestPermission` (the browser pane exposes the iOS-style permission API, which auto-denies, so the real listeners never attach otherwise) and `window.ontouchstart=null` (touch mode), load it as an iframe `srcdoc`, then dispatch synthetic `deviceorientation`/`devicemotion` events on the iframe window with a BUSY-WAIT between them (timers are throttled in the iframe; the code reads `performance.now()`), and read `iframe.contentWindow.__debug`.
- **IK follows HANDO's CURRENT system (2026-10-04, v=224) -- re-read HANDO's source before porting again, it kept changing all day.** Solver = two-stage hierarchical LM (`solveIkHandPose`: stage 1 pair error only, stage 2 influence cost + guarded line search); influence = one slider per pose slider + All (`IK_INFLUENCE_PARTS`, `ikPartsOfKey`, `ikInfluence`) with a Min / Max window per part (`ikRangeOf`, cfg `ikRange<Part>` JSON strings, range-bar ids `textIkRange<Part>`, polled every 250 ms); per-pair `priority`; red overlap label (`updateIkPairOverlapHighlight`); `SAVED_IK_INFLUENCE` picker (storageKey `ikInfluence`). The bone-offset DOFs are NOT solver DOFs (HANDO removed them). Node test: `run6.mjs` + `test-hando-ik2.mjs` in the session scratchpad (real three + Draco hand GLB; use `applyPoseValuesToHand` in the test's `pose()` -- a hand-rolled pose that skips `applyModelRootTransform` makes the "start gap" differ from what the solver sees and gives a false failure when whole-hand is locked). The earlier "IK = a port of HANDO's IK Hand Pose" entry above describes the first, single-stage version.
