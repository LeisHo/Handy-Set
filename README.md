# Handyset — a single hand that tilts with your phone

A mobile-first three.js scene: one rigged hand, centered on screen, that
rotates in response to your phone's gyroscope/accelerometer tilt. On
desktop (no real sensors), cursor distance/angle from the screen center
stands in for phone tilt. An offshoot of the `HANDY DANDIES` project,
reusing its rigged hand asset and pose/camera/lighting/toon-shading
systems.

See `docs/PROJECT_SUMMARY.txt` for the current state (objective, scope,
current state, recent decisions, known limitations, next action) and
`docs/PROJECT_PROGRESS.md` for what's being worked on right now.

## How to run it

**Must be served over HTTP** — ES modules and the GLB fetch don't resolve
under a bare `file://` origin. `.claude/launch.json` has ready-made
`python3 -m http.server` configs on ports 8420-8423. Open
`http://localhost:<port>` — the dev panel (top-right, or press `D`) is
automatically enabled on `localhost`/`127.0.0.1`/`file:`/`?dev=1`.

On a real phone, open the deployed Vercel URL and tap **Enable Motion**
when prompted (iOS requires an explicit permission grant for motion
sensors; Android generally doesn't).

## Project structure

```
HANDYSET/
├── index.html               <entry point: import map, canvas, dev panel markup>
├── src/
│   ├── main.js               <all real logic — see docs/CODE_SUMMARY.txt>
│   ├── style.css              <page styles + verbatim template dev-panel CSS>
│   └── devpanel/devPanel.js  <TEMPLATE_DEV_PANEL.html's engine, copied verbatim>
├── data/processed/HAND3D/
│   └── Hand2.glb              <rigged hand model, shared with HANDY DANDIES>
├── docs/                     <README (pointer only), PROJECT_SUMMARY.txt,
│                              CODE_SUMMARY.txt, PROJECT_PROGRESS.md, CHANGELOG.txt>
├── scripts/{active,archive}, data/raw/, logs/, results/, tests/  <empty, standard skeleton>
```

## Dev panel Save button setup (one-time Vercel setup)

The dev panel's SYNC buttons write through to a git-tracked file
(`data/processed/dev-panel-settings.json`) via `api/save-settings.js`, a
Vercel serverless function, in addition to the browser's own localStorage
— so a Save from any device/browser is visible everywhere. Ported from
HANDY DANDIES' own identical setup (workspace convention, `CLAUDE.md`
§12l).

This only works once 2 environment variables are set on this project's
own Vercel project (Settings → Environment Variables), then redeployed:

1. **`GITHUB_TOKEN`** — a GitHub fine-grained personal access token,
   scoped to only this repo (`LeisHo/Handy-Set`), with **Contents: Read
   and write** permission and nothing else.
2. **`DEV_PANEL_SAVE_SECRET`** — an anti-abuse shared token (not a real
   secret — it also ships baked into this page's own client-side source).
   Set it to `PkrbMti03M6xm3FEThYXa8gGW_08BOGj` (the same value every
   other project in this workspace uses, since it's one workspace-wide
   shared token) — or change both the Vercel env var and `src/main.js`'s
   own `DEV_PANEL_SAVE_SECRET` constant together if a different value was
   already set.

Without both set, Sync requests to `/api/save-settings` return a clear
`"Server not configured - missing: ..."` error. Optional env vars
(`GITHUB_REPO`, `GITHUB_BRANCH`, `SETTINGS_FILE_PATH`) override the
defaults baked into `api/save-settings.js` if ever needed.

## Known limitations

See `docs/PROJECT_SUMMARY.txt`'s Known Limitations section — several real
simplifications vs. HANDY DANDIES (wrist-crop reach, toon rim-lighting,
saved-preset UI) are documented there and in this project's own
`CLAUDE.md`.

## Roadmap

See `docs/PROJECT_PROGRESS.md` for what's next, and `docs/CHANGELOG.txt`
for the full build history.
