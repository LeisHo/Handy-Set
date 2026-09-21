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

- **Reactive Arm Length** (Reactive On/Off, Min/Max Crop %, a distance→crop
  curve editor, `armLengthRange`/`armLengthCurve`) — `updateWristCrop()`
  still only does the simplified fixed-multiple-of-hand-length version.
- **Responsive Wrist Splay** (Master On/Off, stagger, default, reactive
  on/off, Min/Max range, a distance→splay curve editor) — not built at
  all yet.
- ~~Toon rim-lighting~~ — **fixed 2026-09-21**, ported verbatim from HANDY
  DANDIES' real `createToonMaterial()` onBeforeCompile GLSL patch (not
  reconstructed). See `docs/CHANGELOG.txt`'s matching entry.
- **Outline: Use OutlinePass toggle + Hull-shader alternative** (Hull
  Outline Thickness) — this project only ever built the OutlinePass
  technique; HANDY DANDIES lets you switch between 2.
- **Camera Max Extents** only clamps zoom distance (`controls.maxDistance`)
  — HANDY DANDIES' own `enforceCameraPanExtent()` also clamps the PAN
  target to a bounding sphere every frame; not ported.
- **Wrist bend/splay/rotation axis choices** in `applyWristPoseToSkeleton()`
  were reconstructed (matching the finger system's own
  `rotateOnTrueWorldAxis` mechanism) rather than copied from HANDY
  DANDIES' real function body — still worth a visual sanity check.
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
