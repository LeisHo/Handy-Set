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

- Dev-panel DOM sync after preset "Use" (Pose/Camera/Lighting/Toon), the
  Outline group removal + stale-settings cleanup, and the Toon Shading
  `onBeforeCompile`-not-copied-by-`.clone()` root cause (color/rim
  controls had zero visual effect) — all fixed and live-verified in an
  earlier round this session.
- Ghost/misaligned group checkboxes (`.dev-group-cascade-checkbox`
  rendering in the middle of a group's own content instead of on its
  title bar — traced to a missing `position: relative` on
  `.dev-section-title`) — fixed here and folded back into the canonical
  `.claude/TEMPLATE_DEV_PANEL.html`, which had the identical latent bug.
- Set as Default (Pose/Camera/Lighting/Toon) silently undone by the next
  Sync click — `remoteSaveCurrentSettings()` was blind-overwriting the
  whole remote settings file instead of GET-merge-POSTing, wiping the
  `defaultPose`/etc fields `saveFieldAsDefault()` had just written. Fixed
  and verified via an in-page fetch-mock round-trip.
- Phone Tilt doing nothing on the real Vercel deployment, and the Palm
  Facing rotation slider having no effect — both traced to
  `cfg.trackingEnabled` (the whole mechanism's master gate) defaulting to
  `false`. Defaulted to `true`; live-verified via cursor-hover rotation
  on the desktop fallback path.

## What's next

1. Verify all of the above on the user's actual deployed Vercel instance
   and real device — every fix this session was only verified against a
   local static-server preview (no physical phone available here).
2. Verify Phone Tilt gyroscope rotation specifically on the user's actual
   Pixel 9a, now that the master `trackingEnabled` gate defaults on.
3. Tune default Camera/Lighting/Toon values to taste, now that the
   color/rim controls and the Set-as-Default persistence both actually
   work — any prior visual tuning attempts made while either was broken
   likely need revisiting.

## Open questions / blockers

None currently blocking.
