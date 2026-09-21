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

## Known limitations

See `docs/PROJECT_SUMMARY.txt`'s Known Limitations section — several real
simplifications vs. HANDY DANDIES (wrist-crop reach, toon rim-lighting,
saved-preset UI) are documented there and in this project's own
`CLAUDE.md`.

## Roadmap

See `docs/PROJECT_PROGRESS.md` for what's next, and `docs/CHANGELOG.txt`
for the full build history.
