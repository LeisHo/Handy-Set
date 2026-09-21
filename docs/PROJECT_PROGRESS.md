# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

Nothing in progress. Pushed to `https://github.com/LeisHo/Handy-Set`
(deployed via the Vercel project at `https://vercel.com/lpeis/handy-set`,
with `GITHUB_TOKEN`/`DEV_PANEL_SAVE_SECRET` configured by the user for the
git-tracked Save/Sync path). See `docs/PROJECT_SUMMARY.txt` for full
current state.

## Recently completed

- Dev-panel DOM sync after preset "Use" (Pose/Camera/Lighting/Toon) — the
  saved-preset apply functions updated `cfg` and the live scene correctly
  but never updated the panel's own displayed slider/color/checkbox
  values, making a working "Use" click look like it silently did nothing.
  Fixed and live-verified.
- Outline settings group removed entirely per direct request (the
  composer's `outlinePass` stays permanently disabled rather than being
  torn out); the git-tracked `dev-panel-settings.json` was also swept of
  every stale `:Outline`-suffixed key so a leftover reference couldn't
  rebuild an empty ghost group on next load.
- Toon Shading's color/rim-light controls (`colorToonTint`,
  `sliderRimIntensity`/`colorRimColor`/`sliderRimPower`,
  `sliderTextureInfluence`) had zero visual effect regardless of their
  values — root-caused to `Material.prototype.copy()` (three.js) not
  copying `onBeforeCompile`, so every per-hand cloned material silently
  used the stock toon shader. Fixed by explicitly reassigning
  `onBeforeCompile` after every `.clone()`; live-verified before/after.
- A stale dev-panel layout (both `localStorage` and the git-tracked
  settings file) that was producing duplicate/"ghost" groups and rows
  was fixed via a schema-version guard plus a one-time file reset.

## What's next

1. Verify all of the above on the user's actual deployed Vercel instance
   and real device — this session's fixes were only verified against a
   local static-server preview.
2. Verify Phone Tilt gyroscope rotation on the user's actual Pixel 9a —
   only the desktop mouse-fallback path has been directly verified so far.
3. Tune default Camera/Lighting/Toon values to taste once the color/rim
   fix above is confirmed live — those controls were effectively inert
   until this session, so any prior visual tuning attempts likely need
   revisiting now that they actually work.

## Open questions / blockers

None currently blocking.
