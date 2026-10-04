# HANDYSET — Project Progress

**This is a live document, not a log.** See `CHANGELOG.txt` for the full
append-only history.

--------------------------------------------------------------------------------

## Currently working on

**Nothing in progress right now.** Most recent work (2026-10-04):
investigated "StationaryGate ACTIVE but ZUPT never engages." The dwell
state machine was correct; the real bug was stale gate/ZUPT flags left
frozen when the integrator doesn't evaluate the gate (Displace off, Tilt
mode, null acceleration source) — fixed via `clearPhoneDisplaceGateState()`.
Added `ZUPTDwell:<ms> (peak / need)` to the Displace Log: the log samples
every ~200ms, and on the user's still-phone gyro data only 12% of samples
were under the 2 °/s gate, so a continuous 150ms window is rare. Open: the
next real test's `peak` value will show whether the gate is just flickering
(then a tuning question) or something else. Also found and NOT fixed:
Mobile-tab values for the Displace sliders never reach `cfg`. See CLAUDE.md's
2 new Gotchas entries and CHANGELOG's 2026-10-04 entry.

Before that: a round of
dev-panel precision/formatting fixes. Set Displace Position/Velocity
Decay Rate slider minimums to 0; found and fixed a 2nd instance of the
"Desktop value fixed, Mobile-tab independent override still stale" bug
class (Position Decay Rate was 0 on Desktop but still 12 on Mobile).
Audited every "Scale"-labeled slider for `step:'any'` (3 were missing
it: Pose/Hand/Ground Scale, now fixed) and investigated a report that
Texture Scale still "snaps to whole numbers" despite already having
`step:'any'` throughout its full chain — found no code-level cause,
flagged as likely a native mobile touch-drag precision limitation
pending a more specific repro. Added a new shared
`devPanel.js` formatter (`formatDevNumericValue`) capping every
slider's displayed AND actual value at 4 decimals with trailing zeros
stripped, applied in the engine's own display code and in `main.js`'s
`wireSlider`/`wireDeviceSlider`/`wireDeviceSliderMirror` (which run
after the engine's own listener and would otherwise overwrite its
formatting with the raw value). Verified via a standalone 11-check
script. See CLAUDE.md's 5 new Gotchas entries and CHANGELOG's matching
2026-10-02 entry.

Before that: investigated a
report that "the Y-axis boundary fix worked but X/Z still stick" and
found the premise was false — `computePhoneDisplaceAxisUnits()` was
never axis-specific; it's one shared function already applied
identically to X/Y/Z with zero per-axis branching anywhere in the
pipeline. The real cause was the LIVE, user-tuned Reference Distance/
Range values: Y was configured with a much larger Reference Distance
(1.15m vs. the shared code default 0.35m), so the mathematically-
inherent "clamp release threshold = internal position back inside
Reference Distance" (from the prior boundary fix) was hit far less
often on Y during ordinary motion than on the more tightly-configured
X/Z. Presented this directly rather than inventing a fake per-axis code
fix; the user chose to match Z's config to Y's (X had already been
live-tuned by the user themselves mid-conversation, so was left
untouched). Fixed via a targeted 3-value settings-file edit, zero
main.js changes. See CLAUDE.md's 2 new Gotchas entries and CHANGELOG's
matching 2026-10-02 entry for the full investigation.

Before that: added 2 "shadow"
A/B diagnostic pipelines (`displaceShadowExisting`/`displaceShadowNative`)
that run in parallel with the real, mode-selected Displace pipeline,
fed the exact same devicemotion sample every tick — lets one physical
phone movement be compared across the Existing (manual gravity-
subtraction) and Native (`e.acceleration`) acceleration sources at
once, since the 2 cannot be reproduced identically across 2 separate
test passes. Deliberately DUPLICATES the real pipeline's own bias/
filter/Stationary-Gate/ZUPT/integrator math into a new
`stepDisplaceShadowPipeline()` (rather than refactoring the real,
already-shipped pipeline to share a stepping function) so the real code
path is completely untouched. `computePhoneDisplaceAxisUnits()` gained
one new, optional, backward-compatible parameter (a boundary-flag write
callback) so the shadow pipelines can reuse its exact curve/range/
boundary-clamp math without contaminating the real pipeline's own
boundary flags. Neither shadow pipeline ever drives the rendered phone
— both are pure diagnostics, logged via one new Displace Log checkbox
("Log A/B Compare: Existing vs. Native"). Reset wired through the
existing Displace Reset gesture, preserving each shadow's own bias
estimate (matching the real pipeline's own already-established
convention). Verified via a standalone script (9/9 checks) — not
against a real device's actual dual-source sensor stream. See
CLAUDE.md's 4 new Gotchas entries and CHANGELOG's matching 2026-10-02
entry for the full account.

Before that: fixed a genuine
Responsive Displace boundary bug — `computePhoneDisplaceAxisUnits()`
clamped the curve's own INPUT (`t`) before the curve ran, so once
displacement crossed the Reference Distance, the output became a
literal flat constant for any further growth or shrinkage past that
point, requiring the full overshoot to be retraced before the mapping
responded to anything again. Matched the direct report exactly ("the
virtual phone appears stuck at the movement boundary") and its own
explicit architecture ask (clamp the final output only, never the
internal displacement state). Fixed by removing the pre-clamp and
linearly extending the mapping past the curve's own domain, with the
actual min/max clamp applied once, as the literal last step. Proved via
a standalone script that the recovery THRESHOLD itself can't change
(mathematically inherent to what "Reference Distance" means) — what
genuinely changed is that the underlying state now responds
continuously throughout an overshoot instead of giving zero signal
until the exact release instant. Added a new per-axis boundary flag
(`phoneDisplaceBoundaryX/Y/Z`) on `window.__debug` and a new Displace
Log checkbox. Verified via a standalone script (13/13 checks) — not
against a real device. See CLAUDE.md's 3 new Gotchas entries and
CHANGELOG's matching 2026-10-01 entry for the full mathematical account.

Before that: added a new
"Displace Log" Debug-group subgroup with 7 per-field on/off checkboxes
(processed accel into the integrator, velocity XYZ, pre-curve integrated
position XYZ, ZUPT active/inactive, Stationary Gate active/inactive,
bias being subtracted, displacement target vs. rendered phone position)
— same architecture as the existing Sensors/Phone Model Logs, sharing
their Stream/Interval controls. Required 2 new pieces of module-level
state (`phoneDisplaceLastAx/Ay/Az`, `phoneDisplaceIsStationary`) since
neither value was tracked outside a single tick before. Stationary Gate
and ZUPT are logged as genuinely distinct fields (they disagree for the
whole ZUPT dwell window after every stop); Target vs. Rendered confirmed
as real separate state before being logged as a pair. Verified via a
standalone script (7/7 checks) — not against a real device, per this
project's standing sandbox-verification limitation. See CLAUDE.md's 3
new Gotchas entries and CHANGELOG's matching 2026-10-01 entry.

Before that: added a 5th
Displace Mode, `'nativeSensor'`, as an opt-in A/B-testable alternative
acceleration source (`DeviceMotionEvent.acceleration` directly, reusing
the entire existing integrator/ZUPT/bias/gate pipeline unchanged) — per
a pasted ChatGPT suggestion that was deliberately NOT applied as a
default swap, since the existing default was itself switched to manual
gravity subtraction on 2026-09-30 after a real test found it more
reliable on this project's own device; made additive instead, per direct
mid-request correction ("make it a new displacement mode so we dont
erase anything"). Also hid 18 Displace dev-panel rows that Tilt mode's
own code path never reads (Z axis, Vel/Pos Decay, Stationary Gate, ZUPT,
all per-axis Range/Curve/Reference), applied once at build and on every
mode change. Verified via a standalone script (11/11 checks) — not
against a real device, which is the whole point of exposing this as a
testable mode rather than claiming the comparison already settled.
Also folded in a concurrent session's complete, unrelated Rotation
Fine-Tune per-axis split (found sharing this same working directory,
confirmed self-contained before including it in the same commit). See
CLAUDE.md's 2 new Gotchas entries and CHANGELOG's matching 2026-10-01
entry for the full account.

Before that: gave the EXISTING
`'acceleration'`/`'worldPosition'` Displace modes' Stationary Gate a true
ZUPT (Zero-Velocity-Update) — per a detailed, explicitly-scoped user
request with 2 real device logs and an A/B/C/D root-cause report
requirement. The old gate only zeroed that tick's acceleration INPUT on
quiet gyro; it never touched already-accumulated RESIDUAL velocity,
which only ever decayed asymptotically (never reaching exactly 0) and,
with position decay off, kept feeding small-but-real creep into position
for a long time after the phone actually stopped — the reported "drifts
back toward default after I stop moving." Fix: an acceleration-magnitude
check alongside the existing gyro check, plus a short dwell timer, then
a hard force-zero of velocity (not position) once both hold continuously.
Verified via a standalone simulation matched against closed-form
predictions (3/3 scenarios passing) — not a real device (no
accelerometer/gyroscope hardware in this sandbox). See CLAUDE.md's new
Gotchas entry and CHANGELOG's matching 2026-10-01 entry for the full
report and verification numbers.

Before that: added 2 new
Responsive Displace modes — `Freeze on Stop` and `Tilt (Driftless, X/Y
Only)` — after a real device log revealed that the existing
`'acceleration'`/`'worldPosition'` modes have a fundamental physics
limitation (push-then-stop nets to ~zero displacement once
double-integrated — the classic inertial "dead reckoning" drift, not a
tunable decay-rate bug). All 4 modes are selectable in the same
dropdown for A/B testing on a real device. Both new modes have their
own disclosed, real limitations (Freeze can't undo cancellation that
already happened before its gate trips; Tilt can't cover the depth
axis at all) — see CLAUDE.md's new Gotchas entries and CHANGELOG's
matching 2026-10-01 entry for the full physics reasoning and
verification.

Before that: made Mobile/
Landscape texture-offset edits take effect instantly. The prior fix
(below) correctly bridged the edited value into `cfg`, but missed a
2nd, deeper property of this project's on-demand-rendering architecture
— the render loop fully stops once idle, and the poll that bridge used
only runs as part of that loop's own body, so it never got scheduled
again once idle (dragging the Mobile slider alone never called
`requestRender()`). Replaced the poll with event delegation
(`document`-level `'input'` listener, fires regardless of render-loop
state, calls `requestRender()` directly). Verified via a standalone
simulation (9/9 checks). See CLAUDE.md's Gotchas (correction appended)
and CHANGELOG's matching 2026-10-01 entry.

Before that: found and fixed a new, previously-undocumented dev-panel
bug class — `wireDeviceSlider()` only ever wires the DESKTOP element, so
an "Independent from Desktop" Mobile/Landscape slider's edited value was
silently written ONLY into devPanel.js's own internal `devDeviceValues`
store, never reaching this project's `cfg` object at all. Hit Texture
X/Y Offset (the reported bug) and Texture X/Y Scale (the identical bug
on an adjacent control, found while fixing the first). See CLAUDE.md's
Gotchas and CHANGELOG's matching 2026-10-01 entry for the full
investigation.

Before that: reworked Rotation's desktop cursor-tracking normalization
to use half the browser WIDTH alone (`computeDesktopRotationNxNy()`,
`window.innerWidth/2`) instead of whichever screen dimension was
smaller — cursor movement now reaches the curve's own X=1 point exactly
at the real screen edge, rather than saturating well before it on a
typical landscape window. Kept deliberately separate from the shared
`tiltMagnitude` several other features still depend on. See CHANGELOG's
matching 2026-10-01 entry.

Before that: fixed a stale-localStorage dev-panel bug (the per-axis
curve-editor refactor below renamed/removed row ids without bumping
`HANDYSET_SETTINGS_SCHEMA_VERSION` — this project's own documented guard
for exactly this change class, caught via a report that unrelated Mirror
checkboxes had seemingly vanished) and reworked Responsive Rotation's
Min/Max Range to a symmetric 0-upward input (default 90, was 30) per
direct request — see CHANGELOG's matching 2026-10-01 entry.

Before that: the per-axis Min/Max Range + Curve Editor feature (direct
request) — Displace got its 3x Range-bar + 3x Curve-editor + 3x
Reference-distance slider UI (backend already existed from before the
truncation); Rotation needed a real restructuring of
`computePhoneCombinedQuat()`'s desktop branch (independent per-axis
curve evaluation replacing the old combine-then-split-by-direction
approach), verified via a standalone regression/independence/composition
script (15/15 checks). See CHANGELOG's matching 2026-10-01 entry for the
full account, including the EOL-normalization side effect found and fixed
in passing.

**Before that:** a CRITICAL regression —
commit `36e3e6c` (a concurrent session) had truncated main.js by ~2200
lines, deleting the ENTIRE HANDYSET-specific dev panel UI construction
layer (every render function, `window.renderHandysetDevGroups`, the
whole git-tracked remote Save/Sync subsystem). The dev panel had
effectively stopped rendering anything beyond devPanel.js's own built-in
groups. Surfaced to the user directly before touching anything; restored
by extracting the missing tail verbatim from the truncation's own parent
commit (confirmed to already contain every fix/feature from earlier this
session, including the camera yaw/pitch fix) and re-appending it, with
zero duplicate declarations after merging. See CHANGELOG's matching
2026-10-01 entry for the full verification account.

Before that, the last 3 active items, in order:

1. Fixed Texture X/Y Offset and Scale always applying the DESKTOP value
regardless of which device was actually running the app — root cause was
`applyScreenTextureTransform()` reading the dev panel's own currently-open
TAB (`getActiveDevPanelTab()`, an editing-UI concept) instead of the real
device (new `getRuntimeDeviceSuffix()`, using `isTouchDevice` + live
orientation).
2. Fixed "drift when phone is static" — real logged data showed a
MONOTONIC (never sign-changing) climb correlated with a slowly-settling
device orientation estimate (Orient β/γ drifting while raw accelerometer
stayed frozen), which a constant-bias filter can't fully cancel since
it's chasing a moving target. Fixed with a stationary gate: force
integrator input to exactly zero whenever real gyroscope rotation rate
is below a threshold (default 2°/s) — verified via replay to eliminate
the real logged drift (peak 0.063m → 0.000m) while this project's own
real deliberate-motion tests all showed gyro values far above that
threshold (5-90°/s), so real motion passes through.
3. Added 2 global on/off override checkboxes to the Debug group
(Responsive Rotation / Responsive Displacement), AND-combined with each
feature's existing per-model checkbox at every real gate, so switching
between phone models doesn't require re-toggling the individual
checkboxes each time.

See CHANGELOG's 3 matching 2026-10-01 entries. Before that: exposed the
Displace integrator's 2 internal decay rates (velocity/position) as dev-
panel sliders, after a direct report following a fresh 4-maneuver round of
real-device testing: "theres also damping even though i didnt set
any... sometimes I feel like the phone is tring to drift back into
default starting position." Confirmed from the code that
`cfg.phoneDisplaceDamping` only smooths the FINAL output — it never
touches the leaky integrator's own position decay (previously hardcoded
at ~8.7s half-life), which is slow enough that even ambient sensor noise
with the phone sitting still keeps visibly influencing position for
several seconds, independent of Damping. Attempted to verify a specific
replacement value against the real logged data and found a genuine
methodology gap instead — the Sensor Log samples at ~200ms while the
real integrator runs on the much-faster actual devicemotion stream, so a
replay at the logged rate doesn't reproduce real measured magnitudes
(predicted peak 0.046m vs. the real log's ~0.09m swing). Rather than
ship an unverifiable number, converted both rates to sliders
(`phoneDisplaceVelDecayRate`/`phoneDisplacePosDecayRate`, defaults
unchanged) so they can be tuned live against the real device. Also
flagged (not acted on) that the user's own Test 2/3 data looked swapped —
Test 2 ("left-right movement") shows completely flat Compass/Orientation
for 8 straight seconds, while Test 3 ("left untouched") shows a real
disturbance and a 2+ unit swing. See CHANGELOG's matching 2026-10-01
entry.

Before that: removed the
Displace Fine-Tune slider entirely (direct request: "i dont need whatever
it does") and fixed "On reset or startup, I see it immediately start to
drift" — confirmed via real device data that `resetPhoneDisplaceBaseline()`
was zeroing the bias high-pass filter's own tracked bias on every reset,
forcing it to re-learn the device's real, ongoing sensor bias from
scratch each time, which leaked through nearly unfiltered during that
~2.5s re-learning window. Bias now persists across a Displace Reset (only
velocity/position reset, matching the actual "back to starting location"
intent). Verified via a standalone replay of the full real logged session
(all 4 reset cycles): measurably improved in 3 of 4 segments. Disclosed,
not fully solved — some residual drift remains from genuine handheld
jitter, an inherent limit of accelerometer double-integration, though the
real measured magnitudes (1-5 world units against a Max Range of 8) are
more modest than they first appeared. See CHANGELOG's matching 2026-10-01
entry.

Before that: shipped a Hand
Model Selector: a "Model" Item Selector in the HAND MODEL group (visually
mirroring Phone Model's own clickable-list UI), with `Hand2.glb`
(existing default) and the new `HandiBonesB-IK.glb` as the 2 options.
Confirmed via direct GLB JSON parsing (no browser needed) before writing
any code that the new file shares the EXACT SAME functional bone names as
the current rig (`rHand`, `rIndex1/2/3`, `rForearmBend`, etc. — just with
~46 extra non-functional helper/IK-target nodes), so the existing bone-
name-based pose system works unchanged once swapped — a better outcome
than the filename's "IK" suggested. Refactored the bind-pose measurement
that used to run inline, once, at initial load into a shared
`measureAndSetHandModel()` function, so a new `loadHandModel()` swap path
(token-guarded, disposes the old model's geometry via
`disposeOldHandModelRoot()`) can re-run it against a freshly-loaded GLB
and re-pose with the user's CURRENT settings (not reset to defaults).
Deliberately narrower than Phone Model's own selector — no per-model
settings capture and no Import GLB upload flow, since neither has a hand-
model equivalent. Disclosed, not fixed: a fresh page load briefly shows
the default model before an async Sync/remote-settings restore corrects
it to a previously-selected model — the same timing trade-off every other
restore-dependent setting in this file already has. See CHANGELOG's
matching 2026-10-01 entry.

Also verified (a direct mid-task question, unrelated to this feature) that
the Camera Yaw/Pitch fix (below) carries no new gimbal-lock exposure —
smooth, continuous motion confirmed at the slider's own pre-existing
±89° clamp, with no conflicting OrbitControls polar-angle limit.

Before that: fixed the Camera
Yaw/Pitch sliders cross-corrupting each other's displayed value — a
direction-convention mismatch between `getCameraYawPitch()` and
`setCameraYawPitch()` (confirmed as a genuine latent bug already present
in HANDO's own real source, not introduced while porting). See
CHANGELOG's matching 2026-10-01 entry.

Before that: added a Mirror group to Pose (`handMirrorX/Y/Z`, 3
checkboxes mirroring the hand along each of the model's own local axes).
Read HANDO's real "demirror"
technique directly before implementing (per this project's own standing
rule), but it doesn't transfer verbatim — HANDO mirrors via a dedicated
ancestor node OUTSIDE the posed skeleton and cancels the reflection with
a left-multiply at the top of that chain; HANDYSET's single-hand mirror
naturally lives on `h.clone.scale`, which sits in the MIDDLE of the
hierarchy, so that exact trick doesn't apply. Worked out the HANDYSET-
specific fix instead: `bone.getWorldQuaternion()` gets corrupted by
`Matrix4.decompose()` once a reflection is present (a well-known three.js
quirk, confirmed in HANDO's own source comments), which would make curl/
splay/twist compute an arbitrary local rotation once mirrored. Fixed by
replacing the one call site (`rotateOnTrueWorldAxis()`) with a manual
composition of ancestor LOCAL quaternions — mathematically identical to
the old behavior with no mirror active, correct unconditionally once
mirrored. Also fixed 2 other call sites that bypassed the mirror
(`relayoutField()`, Palm Face Rotation's forearm anchor). Verified via 2
standalone Node scripts: 88 cases confirm zero regression, mirror-
invariant curl output, and that the un-fixed code really would have been
wrong; a separate check confirms the palm stays anchored under every
mirror combination to floating-point precision. See CHANGELOG's matching
2026-10-01 entry. Before that: found and fixed the REAL root cause of
Responsive Displace's erratic output, after the prior bias-filter fix
(below) turned out insufficient on its own. A follow-up real-device test
still showed the bug ("the moment i move it jumps out of frame");
replaying the real logged data through the exact
shipped bias-filter code predicted stable output, but the live app still
jumped — so the live Vercel deployment was checked directly (confirmed
running the latest code, ruling out a stale cache) and the actual synced
settings file was inspected, revealing the true cause: Displace's saved
Range was `{min:-20, max:20}`, and `computePhoneDisplaceAxisUnits()`'s
`magnitude = min + (max-min)*curveY` formula produces ~min the instant
curveY is near 0 — true for nearly every real movement — so any motion
clearing the deadzone snapped straight to ~20 units with an inverted
sign instead of ramping smoothly. Fixed by clamping magnitude to >= 0 in
both this function and Rotation's identical one (same formula, same
risk, not independently confirmed broken since Rotation is off), and by
correcting the saved Range to `{0,20}`. Verified by replaying the real
logged data through the literal formula: old formula snapped to ~19 on
the first real sample past the deadzone (matching the live bug exactly);
new formula + corrected Range produces smooth output under 1 unit on
the same data. The Y/Z axis-mapping question is still open and
lower-priority — it needs output stability confirmed on a fresh test
first. See CHANGELOG's matching 2026-10-01 entry. Before that: root-
caused and fixed the leaky-integrator bias/saturation issue, using 2
full real controlled-test datasets the user collected (flat orientation,
then a 90-degree-tilt start) via the Copy All Logs button. Both showed
the Phone Model Log's position output jumping wildly between near-max
extremes every ~500ms, completely uncorrelated with the small (1-2
m/s^2) LinearAccel readings actually driving it. A standalone simulation
confirmed the leaky accel integrator's steady-state gain is ~4.17m of
position per m/s^2 of SUSTAINED bias, so ordinary residual bias from
gravity-subtraction/sensor error (as little as ~0.06 m/s^2) alone
saturated the old 0.25m reference distance. Fixed with a per-axis
high-pass filter (`PHONE_DISPLACE_BIAS_TRACK_RATE`, ~2.5s time constant)
plus raising `PHONE_DISPLACE_REFERENCE_METERS` 0.25m → 0.35m — a real,
necessary fix, just not the dominant effect once the Range
misconfiguration above is also accounted for. See CHANGELOG's matching
2026-09-30 entry. Before that: switched Responsive Displace's whole data
source — a real
controlled device test (reset/move-one-axis/reset per axis, flat then
tilted) revealed Sensor Log was logging `accelerationIncludingGravity`
while Displace actually consumed the DIFFERENT `e.acceleration` field,
which had never been directly observed and whose gravity-exclusion
quality is device-dependent. Cross-referencing the real logged data (raw
accel + actual orientation at each sample) through a standalone gravity-
subtraction script confirmed accelerationIncludingGravity's own big
swings during the "Up" test were a pure rotation artifact (properly
gravity-subtracted linear accel stayed small/bounded through the same
window), and found compass (alpha) is highly unstable at steep tilt on
this device — directly explaining Real World Position mode's own
jumpiness. Switched to computing linear acceleration from
accelerationIncludingGravity minus a manually-computed gravity vector
(the standard AHRS technique), verified against 2 known orientations via
script. Added a "Log Linear Accel" diagnostic field so the next test
shows the actual signal driving Displacement. See CHANGELOG's matching
entry. Before that: added Clear All Logs / Copy All Logs /
Pause-Resume Logs buttons spanning all 3
Debug-group logs (Mouse Log, Sensors, Phone Model Log) — Mouse Log's own
state is private to `devPanel.js`, so 3 small bare-global helper
functions were exposed there for `main.js` to reach it. See CHANGELOG's
matching entry. (A prior message asking for the Phone Model Log to be
split into a sensors log + a position/orientation log turned out to
already exist as-is — the "Sensors" and "Phone Model Log" subgroups were
already fully separate; no change was needed there.) Before that, the
last active item made Double Tap Reset instant: `resetPhoneRotationBaseline()`/
`resetPhoneDisplaceBaseline()` already reset the underlying state, but
the per-frame slerp/lerp damping was still easing the DISPLAYED
rotation/offset toward that target over several frames — both functions
now also snap the live displayed value directly. See CHANGELOG's
matching entry. Before that: a real bug fix on `RESPONSIVE DISPLACE`
(mobile): reports of X drifting/jumping and Y/Z being inconsistent/
delayed/overshooting, all on the same device, both Displace Modes. Root-caused to `integratePhoneDisplacement()`
fully freezing velocity/position (no decay at all) whenever
`e.acceleration` came back momentarily null — a known intermittent
real-device behavior — then discarding the whole elapsed gap once a
valid reading resumed, producing exactly "frozen then overshoots."
Fixed to keep decaying through a null-reading tick instead of freezing;
also added a raw deadzone + outlier clamp and tightened the integration
dt cap. Verified via a standalone script showing the old logic freezing
solid across a simulated gap vs. the new logic decaying correctly — see
CHANGELOG's matching entry. NOT re-verified against a real device beyond
the user's own reports. Before that: a real-device axis correction
("switch the input outputs for y and z axis") swapped which raw signal
feeds the Y vs Z output slot on both mobile and desktop. (An earlier
"click functions"/Hand Behaviour Log question turned out to be pasted
content meant for a different project — HANDY DANDIES, not HANDYSET —
and was dropped, no action taken.)

Also shipped this session on `RESPONSIVE DISPLACE`: an independent
Displace Reset checkbox (double-tap now fires Rotation Reset and
Displace Reset separately, each gated by its own checkbox), dedicated
Invert X/Y/Z axis-flip checkboxes (self-service, no code edit needed),
and a reworked desktop mechanism — driven by actual cursor MOVEMENT
(frame-to-frame delta) fed through the same leaky integrator mobile's
accelerometer uses, not the cursor's static distance from screen center.
Displace is fully independent of Tracking Enabled. Shipped and pushed.
Waiting on the next request. Double Tap Reset in Absolute mode, the Set
Hotkey button-eligibility fix, on-demand rendering, and the render-loop-
stop follow-up (all below) are also shipped.

**Recursive Render mirror investigation — RESOLVED, per direct user
confirmation ("x mirror issue fixed by the way").** The depth-parity
X-mirror fix (CHANGELOG's 54th/55th entries: `checkboxFlipX` alternates
by viewer depth, `offBaseline(d) * (-1)^d`, not a flat per-pass
constant — each recursion pass embeds the previous pass's already-
mirrored capture, so a per-pass flip compounds as a PRODUCT across
nesting depth) is confirmed working on the real deployed site. Y-mirror
and the X/Y-both-checked interaction were never separately reported
back on and are assumed fine unless a new report says otherwise —
don't reopen that investigation without a fresh, concrete report.

Separately, Samsung Galaxy S26 (a genuine, pre-existing, already-
documented `[-1,-1,-1]` root-node scale inversion) and Galaxy S2 (a
genuinely degenerate Screen Face UV with zero vertical extent) remain
real, separate, per-model asset issues — neither is fixable via code;
both need re-export from the source (Blender, most likely).

**Slider-stepping request superseded/completed:** the earlier "widen
the step on every *Scale slider" request was overtaken by a broader,
more specific follow-up ("dont use any stepping of inputs... I
currently cant input '0.001'") scoped to the Phone Model group
specifically — `step` was removed entirely (`step: 'any'`) on all 12
Scale/Offset/Rotation-Scale/Texture-Scale/Texture-Offset sliders in
that group, not just widened. See CHANGELOG's on-demand-rendering-
adjacent backfill entry for detail.

**Also shipped since the last update to this doc** (backfilled into
`CHANGELOG.txt` — see its dated entries): Recursive Render's Min/Max
Scale + Level→Scale curve editor (with recursion levels uncapped from
10 to 30), 4 small dev-panel styling fixes (Pause button styling,
Saved Dev Settings label color, a new Group Nesting L Step slider,
"Accent Color #4" rename), the full Set Hotkey feature (a new
interactive subsystem in the shared `devPanel.js` template — see
CLAUDE.md's own file-map note on this file being a verbatim template
copy), and **on-demand rendering**: `animate()` no longer calls
`composer.render()` every RAF frame unconditionally — it now skips the
whole per-frame compute+render pass unless Responsive Rotation is
active or something discrete (a dev-panel control, OrbitControls
damping/drag, a resize, a Sync/Reset/Undo/Redo restore, a list-picker
Use, a hotkey trigger, an async phone-model load, or a curve-editor/
range-bar drag) flags a `requestRender()`/`needsRender` signal. NOT
independently browser-verified (standing project convention) — the
two spots worth a live spot-check are called out directly in
`CHANGELOG.txt`'s matching entry.

**Completed and verified live earlier this session** (see CHANGELOG's 52nd
and 53rd entries for full detail): the duplicate HAND MODEL/PHONE
MODEL dev-panel groups bug (root cause: an uncaught null-reference
throw aborting the whole panel build, not a settings-sync issue as
first suspected), Draco/Meshopt decoder wiring (3 models failed to
load entirely without it), the `rebuildField()` null-model race
(reproducing on every normal page load, now guarded), the phone
screen mesh `frustumCulled` invisibility bug (same class already
fixed for the hand mesh), Nothing2's Screen Face name-matching
(loaded name had underscores where the source has spaces), Per-Model
Settings for Scale/Offset/Responsive Rotation/Recursive Render (with
Rotation deliberately kept shared per direct correction), and a
checkbox-restore dispatch bug found while verifying the above
(checkboxes visually updated on a model switch but never actually
changed behavior, since the restore only dispatched 'input' while
`wireCheckbox()` listens for 'change').

**Browser-pane verification is back in active use this session** —
superseding the earlier "skipped entirely" note: the built-in browser
successfully drove the real, deployed Vercel site directly throughout
this session (dev-panel interaction, console log reads, live GLB/UV
measurement via `window.__debug`), which is different from the local
sandbox static server's own documented flakiness. That local-server
limitation is unrelated and still stands if a local dev server is
ever used again.

Untracked, not yet committed, by request: several raw asset-staging
folders and a stray `S4.glb` under `data/processed/SMARTPHONE MODELS/`
(`BLENDER/`, `RAW GLB/`, `Samsung Galaxy S2/` (folder), `Zip/`,
`blackberry/`, `samsung-galaxy-s26-black-low-poly/`) — only finished
`.glb` files were asked to be added, matching this project's own
raw-vs-processed convention (§11).

Pushed to `https://github.com/LeisHo/Handy-Set`
(deployed via the Vercel project at `https://vercel.com/lpeis/handy-set`).

## Recently completed

- **Per-axis Min/Max Range + Curve Editor for Responsive Rotation and
  Displace, plus a critical truncation discovery/restoration found while
  starting it.** Displace: 3x Range-bar + Curve-editor + Reference-
  distance slider UI wired to its already-existing per-axis backend.
  Rotation: `computePhoneCombinedQuat()`'s desktop branch restructured
  from "combine nx/ny into one radial magnitude, split by direction" to
  genuinely independent per-axis curve evaluation — verified via a
  standalone script (15/15 checks: sign-regression, independence, axis-
  angle composition preserved). Separately: a concurrent session's commit
  (`36e3e6c`) had truncated `main.js` by ~2200 lines mid-function,
  deleting the entire HANDYSET-specific dev-panel UI layer and the
  git-tracked remote Save/Sync subsystem — found, surfaced to the user,
  and fully restored (verified zero duplicate declarations) before this
  feature could even be built, since the UI layer it needed had been
  deleted. See `docs/CHANGELOG.txt`'s matching 2026-10-01 entries for
  the full account.
- **SUPERSEDED, same day — the per-model `manifest.json` `scale` field
  bullet that used to sit here is REVERTED, per direct instruction:
  "No, I don't want you to override my personal settings, but make by
  default scale to one and placed at world origin."** `manifest.json`
  entries carry no `scale` field any more (plain `{file, name}` only,
  8 models). Final resolution, after 2 more rounds of direct feedback
  ("the hand is probably in meters, so just scale up all my phones by
  100, but set that as default" → a slider-range conflict at
  min 0.5/max 5 surfaced via `AskUserQuestion` → "I wanted you to scale
  it up to 100 but on the sliders that will read as one... 100 is one
  now"): a new `PHONE_MODEL_SCALE_BASE = 100` constant is always
  applied uniformly to every model, with `cfg.phoneModelScale` (default
  `1`, slider range 0.5-5) as a fine-tune multiplier on top — so the
  slider itself reads "1" at the effective x100 baseline instead of
  showing "100." `sliderHandScale`'s own range was also widened to
  0.5-5 in the same pass (was 0.1-3). Separately, found while
  double-checking the settings file for this change: the Item
  Selector's own model selection was never actually persisted through
  Sync (`selectPhoneModelFile: null` in the live git-tracked settings,
  confirmed directly) — its plain `<div>` rows were never registered
  with devPanel.js's Sync pipeline. Fixed with a hidden `type:'text'`
  control (`hiddenPhoneModelFile`) that mirrors the current selection
  and reacts to Sync/Reset/Undo restores, the same fix shape already
  used for this project's curve/range fields and list-pickers earlier
  this session. Not independently browser-verified (standing
  limitation). See `docs/CHANGELOG.txt`'s matching 2026-09-29 (51st)
  entry.
- **RESOLVED (2026-09-29): Recursive Render's alternating left-right
  mirror.** Direct report: odd recursion levels flipped, even ones
  didn't. Diagnosed via `AskUserQuestion` (reproduces even at
  Recursion Levels=2, ruling out a compounding-only bug) — since
  `applyScreenTextureTransform()` uses identical values on every pass,
  the cause had to be structural: the Screen Face mesh's own UV is
  never sampled during the screen-hidden base pass, only from pass 1
  onward, so a single, constant UV-mirror baked into that one mesh
  (a common glTF/Blender export quirk) explains the exact reported
  alternation — applying a mirror once per recursion level behaves
  like two facing mirrors. Fixed by negating `texture.repeat.x`, which
  corrects every level uniformly. Not independently verified against
  the real mesh/device — see CLAUDE.md's own matching gotcha for how
  to revert if this turns out backwards. Also this round: the 3
  existing phone models downsized (1.8-4MB → 61-315KB) and 5 new ones
  added (Galaxy S2, Motorola Razr, Nothing2, Samsung Galaxy S26,
  iPhone 17 Max) — 8 total now listed in `manifest.json`. See
  `docs/CHANGELOG.txt`'s matching 2026-09-29 (49th) entry.
- **NEW (2026-09-29): Phone Model Item Selector + GLB import.** The
  plain model `<select>` is now a real Item Selector (a clickable
  list) with an "Import GLB..." button — importing checks for a
  filename collision and confirms overwrite, loads the model locally
  and instantly for preview, then persists it via a new
  `api/upload-phone-model.js` endpoint (GitHub's Git Data API, since
  every real phone GLB here is over the simpler Contents API's 1MB
  cap) that also maintains a `manifest.json` the app reads at startup
  instead of a hardcoded, manually-maintained model list. Also new,
  same round: RECURSIVE RENDER gained Texture Scale/Rotation/X Scale/Y
  Scale controls plus a "To Scale" checkbox that auto-corrects the
  render texture's aspect against the live browser window size (a
  reported distortion bug) and locks the X/Y sliders while on. Not
  independently browser-verified (standing limitation). See
  `docs/CHANGELOG.txt`'s matching 2026-09-29 (48th) entry.
- **RESOLVED (2026-09-29): Virtual Screen had no visible effect on
  Pixel 9A — a real bug in the mesh-finding logic, not a missing
  feature on that model.** Root cause found by parsing all 3 phone
  GLBs' raw JSON directly (ground truth, no browser needed): Pixel 9A
  had no mesh/node named 'Screen Face' at the time — its screen was one
  primitive inside a combined 'Front' mesh, identified only by a
  MATERIAL named 'Screen Face'. `findPhoneScreenMesh()` now falls back
  to matching by material name when no mesh/node name matches. Same
  day, the user then re-exported all 3 GLBs so every model now has its
  own dedicated 'Screen Face' mesh/node directly (Pixel 9A's own
  'SCREEN FACE' node; iPhone 17 Max Pro's screen renamed from
  'Cube.010_screen.001_0'; P5 Project 1 unchanged) — the material-name
  fallback is no longer load-bearing for any of the 3 current models
  but stays as a defensive fallback. See `docs/CHANGELOG.txt`'s
  matching 2026-09-29 (46th and 47th) entries.
- **NEW (2026-09-29): Virtual Screen** — renders the app's own live 3D
  scene onto the phone GLB's own 'Screen Face' mesh/material (found at
  load time). Recursion is bounded by construction — a fixed number of
  sequential off-screen passes each frame (1-10, dev-panel slider),
  never a live feedback loop, so it cannot recurse infinitely
  regardless of the slider value. New top-level, toggleable
  **RECURSIVE RENDER** group (Recursive Render On/Off, Recursion
  Levels, Render Resolution %). Also fixed,
  per direct reports on the existing Phone Model rotation controls:
  Rotation Scale sliders now allow negative values (flips direction at
  the same magnitude); desktop's Y axis (spin) is wired for the first
  time (previously mobile-only); desktop's Y/Z checkbox-to-motion
  gating was swapped per a real isolated one-checkbox-at-a-time test
  ("what is labeled as Z is Y, and vice versa") — X is unaffected,
  mobile's own gating is untouched. **Not independently browser-
  verified** — see "Currently working on" above for why. See
  `docs/CHANGELOG.txt`'s matching 2026-09-29 (45th) entry.
- **RESOLVED (2026-09-28, 10 rounds): Phone Model's gyroscope-integrated
  mobile rotation axis mapping.** Round 1 replaced the previous `deviceorientation`-based
  absolute-angle system (which hit a hard gimbal-lock-style limit around
  ±180°) with `devicemotion.rotationRate` integrated onto a persistent
  accumulating quaternion — the representational-limit problem itself
  is solved and not in question. Rounds 2-7 each attempted to fix a
  reported axis/permutation mismatch (a 3-way cyclic mix-up, an
  "alpha/gamma crossed" raw-property theory, 2 different input-axis-
  vector permutation attempts, and a brute-force fix verified against
  the Phone Model Log's actual Euler-XYZ readout) — every one looked
  correct by its own verification method and still didn't match the
  real device. Round 8 changed strategy: instead of another input-slot
  permutation, it applies a direct quaternion conjugation to the
  already-accumulated `phoneGyroQuat` at its read site — a different
  layer of the pipeline, not yet real-device tested. Full detail for
  every round is in `docs/CHANGELOG.txt`'s 35th-41st entries and the
  CLAUDE.md gotcha (search "Phone Model's mobile rotation").
- **RESOLVED (2026-09-28): Rotation Reset's real bug found — "double tap
  works but rotation is wrong afterward, still using axes prior to
  realignment."** Root cause: the reset only updated ONE of the 2
  possible baselines (mobile or desktop), chosen by which input source
  was flagged active at that exact instant — if that flag was wrong for
  even one frame, the reset silently updated the wrong one, leaving the
  real rotation pipeline's baseline untouched. Fixed by always updating
  both, regardless of which is actually in use. Also added, same
  round: 3 on/off checkboxes and 3 scale sliders (0-3x) for X/Y/Z axis
  rotation, so any axis can be disabled or sped up/slowed down
  independently. See `docs/CHANGELOG.txt`'s matching 2026-09-28 (34th)
  entry.
- **RESOLVED (2026-09-28): 3 more real-device-testing bugs on Phone
  Model, all root-caused and fixed.** (1) Tapping the screen briefly
  threw the rotation off before it snapped back — a tap can fire a
  synthetic `mousemove` on mobile browsers, momentarily making Phone
  Model read the tap's own screen position instead of real device
  orientation; fixed with a guard filtering synthetic touch-sourced
  mouse events. The user's own suspicion about OrbitControls was also
  confirmed real and fixed separately: its touch handlers can swallow
  events before a `window`-level listener sees them, so the Rotation
  Reset gesture listeners now use the capture phase. (2) Lock Pan/Zoom/
  Rotate now also disables the matching camera sliders (position/zoom/
  yaw-pitch), and a related bug — a restored "locked" state from Sync
  never actually took effect until the checkbox was re-toggled — is
  fixed too. (3) Left/right and compass were still swapped (Y<->Z) even
  after the Blender-axis check — root cause: the real Blender model is
  Z-up, but glTF/three.js is Y-up, and the export process itself
  swaps Y and Z on the way in, independent of the rotation code. Fixed
  by swapping which world axis gamma and alpha target; verified
  numerically that each of beta/gamma/alpha now produces a clean
  single-axis rotation with zero leakage. See `docs/CHANGELOG.txt`'s
  matching 2026-09-28 (33rd) entry.
- **RESOLVED (2026-09-28): Phone Model rotation was genuinely broken on
  a real device — random-looking swings at rest, distorted compound
  tilts, and a wrong axis mapping — all traced to real causes via the
  user's own device logs and fixed.** (1) The live "Min/Max Rotation"
  range had drifted to a negative min (`{-57,45}`), which combined with
  ordinary sensor noise near rest to make the rotation randomly flip
  between large values with zero correlation to real input — fixed with
  a permanent deadzone plus resetting the drifted value. (2) Compound
  tilts (tilting 2 directions at once) were visibly distorted by
  sequential Euler-angle composition — replaced with a single combined
  axis-angle rotation, verified to reduce to an exact pure-axis result
  in isolation with zero cross-talk. (3) The left/right axis was wrong
  (Z instead of Y) — corrected after checking the real Blender model's
  own axes directly. Mobile and desktop are now 2 deliberately different
  pipelines: mobile directly mirrors the real device's own orientation
  with no artificial range or threshold (and no snap when rotating past
  180°, via a new angle-unwrapping mechanism); desktop keeps its
  original cursor-distance-driven curve/range system. See
  `docs/CHANGELOG.txt`'s matching 2026-09-28 (32nd) entry for the full
  diagnosis and numeric verification.
- **NEW (2026-09-28): Phone Model Rotation Reset.** A new "Rotation
  Reset On/Off" checkbox (Responsive Rotation) — when on, a double-tap
  (mobile) or double-click (desktop) anywhere on screen (excluding the
  dev panel) re-baselines the phone model's rotation to match world
  XYZ at that instant, regardless of the phone's absolute orientation
  when reset. Also answered a direct question along the way: X/Z are
  absolute (always relative to "phone flat," unaffected by page-load
  timing); Y (compass) is relative to a baseline captured on the FIRST
  reading after load — which is exactly the gap this reset closes. Two
  real design flaws were caught and fixed BEFORE shipping, via a
  standalone numeric script rather than live testing: (1) baselining
  the shared, already-clamped nx/ny broke down near a physical clamp
  boundary (e.g. lying in bed, phone near-vertical) — fixed by
  baselining the raw, pre-clamp quantity instead; (2) even then, beta's
  own raw clamp was still the shared pipeline's ±90 instead of its true
  ±180 physical range, producing a one-sided, half-dead response when
  reset happened exactly at that boundary — fixed by widening beta's
  own clamp specifically for this feature. See `docs/CHANGELOG.txt`'s
  matching 2026-09-28 (31st) entry for the full numeric verification.
- **RESOLVED (2026-09-28): Phone Responsive Rotation's default curve
  was inverted — rest gave near-max rotation with an unstable sign
  (the jitter), full tilt gave only a small rotation (the "missing
  axis"/doesn't-match report).** Diagnosed from a real Phone Model Log
  + Sensor Log capture covering 4 held test movements — cross-
  referencing timestamps proved the axis MAPPING (which signal drives
  X/Y/Z, each one's sign) was correct for all 4, and the real bug was
  `cfg.phoneResponsiveRotationCurve`'s shape being backwards
  (`{x:0,y:1}->{x:1,y:0}` instead of `{x:0,y:0}->{x:1,y:1}`). Fixed the
  code default AND surgically patched the already-synced live value in
  `dev-panel-settings.json` (verified via a before/after key-count diff
  and a scoped `git diff` — exactly 1 line changed). See
  `docs/CHANGELOG.txt`'s matching 2026-09-28 (30th) entry.

- **FOLLOW-UP (2026-09-28): Phone Model rotation-node fix, damping, and
  a new Phone Model Log.** 3 direct reports on the previous round's
  rotation remap — jittery motion, what looked like a missing rotation
  axis, and a request for a position/rotation debug log — plus a
  clarifying 4th message ("its object axes... does no rotate with it")
  that pinpointed the real bug: Object Axes gizmos parent onto whatever
  node is registered via `registerSceneObject()` (for Phone Model,
  `phoneModelWrapper`), but the rotation quaternion was being written to
  `phoneModelRaw` (a child) instead — the gizmo never rotated even
  though the mesh itself always did, likely the actual source of the
  "missing axis" read too. Fixed by moving the rotation write to the
  wrapper (no pivot/visual change — the child sits at the wrapper's own
  origin either way). Added `cfg.phoneRotationDamping` (a new slider,
  same semantic as `cfg.trackingDamping`) to smooth out real sensor
  jitter via slerp instead of a direct copy. Built a new "Phone Model
  Log" Debug subgroup (position + rotation, same interval/checkbox as
  the Sensors log, Copy/Save/Clear) — and discovered along the way that
  the Sensors log itself never actually had per-line timestamps despite
  an earlier commit's title claiming so (that commit only timestamped
  `console.error`/`console.warn`); fixed to match. Not independently
  browser-verified this round, per direct instruction. See
  `docs/CHANGELOG.txt`'s matching 2026-09-28 (29th) entry.
- **FOLLOW-UP (2026-09-28): Sensors log Beta/Gamma + Phone Model
  Responsive Rotation axis remap.** Added `Log Beta`/`Log Gamma`
  checkboxes to the Sensors log (Debug group), reading
  `deviceorientation.beta/gamma` (absolute tilt angle) — distinct from
  `Gyro`'s own `rotationRate` numbers, which share the same greek
  letters but measure angular velocity instead. Remapped Phone Model
  Responsive Rotation to match a literal device-tilt spec: X <- beta
  (front-back tilt, forward = +90), Z <- gamma (left-right tilt,
  inverted so left = +90/right = -90), Y <- compass heading (the
  leftover axis, previously on X). Verified via a standalone script
  replicating the exact formula (all 6 test cases correct, zero
  cross-axis talk) since this sandbox can't reach a real device or even
  a synthetic orientation event. **Not yet verified on a real phone —
  see What's Next.** This session shared a working directory with the
  dev-panel re-sync session below, so both changes rode along inside
  that session's own `c69cb8a` commit automatically. See
  `docs/CHANGELOG.txt`'s matching 2026-09-28 (28th) entry.
- **FOLLOW-UP (2026-09-28): Dev panel re-sync from the canonical
  template + curve/range control migration.** Full re-sync of
  `src/devpanel/devPanel.js`/`src/style.css` from
  `.claude/TEMPLATE_DEV_PANEL.html` (Undo/Redo, locked groups, new
  Panel UI theme colors, click-to-edit slider bounds, header button
  reorganization, and the Saved Presets UI engine). Migrated all 12 of
  this project's own curve/range dev-panel fields (Reactive Arm
  Length, Responsive Wrist Splay, the 3 wrist-axis clamps, Responsive
  Arm Rotation at Base, Responsive Pose Tween, Phone Responsive
  Rotation) from HANDYSET's own hand-built widgets to the template's
  generic `type:'range-bar'`/`type:'curve-editor'` controls, then
  removed the now-dead widget code and the Mobile/Landscape mirroring
  mechanism those 3 fields used to need. Settings-file surgery wrapped
  the 5 saved curve values into the new `{points,method}` shape,
  verified via a full key-count diff (zero lost/extra). Raised via
  AskUserQuestion whether to also migrate the 5 list-pickers (Saved
  Poses/Cameras/Lighting/Toon/Tween) — HANDYSET's own hand-built
  versions already match the template's feature set against real
  saved user data, and migrating risked data loss for a modest gain
  (drag-reorder + native Undo/Redo); direct answer was to leave them
  as-is. Browser live-verification was explicitly skipped this round
  per direct instruction ("dont need to verify de v panel stuff" /
  "im goign to trust it works") — not independently confirmed working
  in a browser. See `docs/CHANGELOG.txt`'s matching 2026-09-28 (27th)
  entry.
- **FOLLOW-UP (2026-09-28): Hand Model checkbox repurpose + Sensors log
  improvements.** The HAND MODEL group's own convenience checkbox
  (previously a Phone Model On/Off duplicate) is now a genuine "Hand
  Model On/Off" toggle, driving `cfg.hideHands` inverted and kept in
  sync with Field Layout's own "Hide Hands" checkbox — the git-tracked
  settings file's row-level reference to the old id was renamed in
  place (verified via a row-key diff, zero lost). Sensors log (Debug)
  gained COPY/SAVE/CLEAR buttons (ported from devPanel.js's own Mouse
  Log pattern) and 3 per-sensor toggles (Log Accelerometer/Gyroscope/
  Compass). Fixed a real bug along the way: unchecking "Stream Sensor
  Data" used to wipe the whole log — it now only stops the interval.
  See `docs/CHANGELOG.txt`'s matching 2026-09-28 (26th) entry.
- **FOLLOW-UP (2026-09-27, same day, 2nd round): Model Scale
  correction.** The user re-exported all 3 phone models ~18-20x
  smaller (live-measured: ~0.07-0.16 world units at scale 1, down from
  ~1.3-2.65) — the old default (`phoneModelScale: 1`) and slider max
  (`5`) could no longer reach a visible size at all. Raised the
  default to `300` (measured live result: ~21x3x43 world units, a
  sensible fraction of the hand's own ~115x80x35) and the slider max
  to `2000`. Live-verified the phone now renders at a clearly visible,
  correctly-textured size by default. See `docs/CHANGELOG.txt`'s
  matching 2026-09-27 (25th) entry.
- **FOLLOW-UP (2026-09-27, same day): Phone Model corrections.** Added
  a 3rd model (`Iphone17MaxPro.glb`) and synced `PHONE_MODEL_OPTIONS`
  to the folder's real current contents (the user deleted 6 of the
  original 8 files and updated 2 others in place — the dropdown now
  lists exactly P5 Project 1 / Pixel 9A / iPhone 17 Max Pro). Added a
  convenience On/Off checkbox for the phone model directly in HAND
  MODEL, kept in sync with the PHONE MODEL group's own checkbox. Fixed
  2 real bugs the user found live on the deployed site: (1) PHONE
  MODEL was missing its own ROTATION subgroup, while an empty phantom
  "ROTATION" had appeared inside Pose — root cause was a literal
  `data-sid` name collision (Phone Model's "ROTATION" vs. Pose's
  pre-existing one), fixed by renaming to "PHONE ROTATION" in code and
  splitting the merged JSON entry back apart in the git-tracked
  settings file (verified via a full key-diff, zero lost, zero
  duplicate group keys). (2) Responsive Rotation was pivoting on a
  computed bounding-box centroid instead of the model's own true local
  origin — fixed by removing the centroid math entirely; the model now
  rotates purely around `(0,0,0)` in its own local space, verified via
  a 90° rotation leaving that position exactly unchanged. One
  pre-existing, unrelated issue was found and disclosed (not fixed,
  out of scope): `rebuildField()` can throw if a Field Layout slider's
  restore fires before the hand's own async model load resolves —
  self-recovered when observed, not yet reproduced under normal load.
  See `docs/CHANGELOG.txt`'s matching 2026-09-27 (24th) entry.
- **NEW (2026-09-27): Phone Model group** — loads a selectable
  smartphone GLB (`data/processed/SMARTPHONE MODELS/`) with On/Off, a
  Model picker, Scale, Offset (X/Y/Z), Rotation (X/Y/Z), and its own
  Responsive Rotation (RESPONSIVE BEHAVIOUR - PHONE > Responsive
  Rotation) driving 3 axes from one shared curve/range — Y/Z on both
  desktop and mobile (reusing `tiltMagnitude`/`tiltAngle`), X only on
  mobile (the device's own compass heading, a signal that doesn't
  exist for a mouse). A naming collision in the original spec (2
  groups both wanting "RESPONSIVE BEHAVIOUR - PHONE") was resolved via
  AskUserQuestion — the hand's own responsive group is "RESPONSIVE
  BEHAVIOUR - HAND". **Object Axes** (Debug group) ported from 3JS
  ENGINE — a multi-select picker showing a fat-line axes gizmo on any
  registered scene object (hands, the Phone Model). **HAND MODEL** — a
  new top-level group nesting Field Layout/Pose/Tween/RESPONSIVE
  BEHAVIOUR - HAND (renamed from Phone Tilt) in that order. The
  git-tracked `dev-panel-settings.json` was surgically restructured
  (not reset) to preserve every existing custom rename/reorder,
  verified via a before/after key-diff (zero lost entries) and
  re-applied against 3 newer remote Sync commits that landed
  mid-session. Live-verified end-to-end: models load correctly,
  Responsive Rotation confirmed via a real mousemove, Object Axes
  gizmo renders on both Hand 1 and Phone Model, Show-in-Mobile
  mirroring works for the new controls. See `docs/CHANGELOG.txt`'s
  matching 2026-09-27 (23rd) entry.
- **RESOLVED (2026-09-27): Phone Tilt's "Show in Mobile/Landscape"
  checkbox did nothing for its 3 curve/range widgets (Min/Max Rotation,
  Rotation Curve, Tween Curve) — checking it silently had no effect.**
  Root cause: those widgets sit on top of a hidden `type: 'text'`
  control, and devPanel.js's own generic per-device mirroring
  explicitly excludes `'text'`/`'number'` controls — a genuine,
  permanent scope limit of the shared template, confirmed by direct
  comparison, not a HANDYSET-specific lag. Built a HANDYSET-owned
  mirroring mechanism (shared value across Desktop/Mobile/Landscape,
  per direct user confirmation), polled via the existing
  `curveWidgetResyncs` array. A bug found during live verification
  (the group-lookup helper used, devPanel.js's own
  `findGroupContent()`, only matches a top-level group, not a nested
  subgroup — both target groups here are nested one level inside
  "Phone Tilt") was fixed with a HANDYSET-owned any-depth lookup.
  Live-verified: all 3 mirrors render correctly on both Mobile and
  Landscape, 3-way shared-value sync confirmed in both directions,
  unchecking one control's checkbox removes only that control's own
  mirror row. See `docs/CHANGELOG.txt`'s matching 2026-09-27 (22nd)
  entry.
- **RESOLVED (2026-09-27): Camera dev-panel sliders showed ~16-digit
  floats, felt jittery while dragging, and had no click-to-type.**
  Root cause of decimals/jitter: `syncCameraPanelFromLive()` runs every
  animate() frame, feeding the camera's raw float position into
  `syncValue()`, which displayed it unrounded and unconditionally
  overwrote `slider.value` even mid-drag. Fixed by rounding the display
  to 2 decimals and skipping the resync for a currently-focused slider.
  Click-to-type was found to already be PARTIALLY implemented in
  HANDYSET's own `devPanel.js`, but 2 versions behind the canonical
  `.claude/TEMPLATE_DEV_PANEL.html` (both real upstream fixes dated
  2026-09-24 there) — re-synced verbatim. Live-verified all 3. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (21st) entry.
- **RESOLVED (2026-09-27): Save/Sync never persisted any curve/range
  text control in the ENTIRE project (Reactive Arm Length, Responsive
  Wrist Splay, the 3 wrist-axis clamps, Responsive Arm Rotation at
  Base, Responsive Pose Tween) — a pre-existing, systemic gap, not
  something from this session's own new features.** `addRow()`
  excluded every `'text'`/`'number'` control from registration with
  devPanel.js's Save/Sync mechanism, even though that mechanism is
  fully type-agnostic and never needed the exclusion. Confirmed via
  the real git-tracked settings file: 7 genuine Save/Sync round-trips
  had NEVER once saved any of these fields. Fixed by removing the
  exclusion. Live-verified: a curve/range edit now survives Sync + a
  real reload. See `docs/CHANGELOG.txt`'s matching 2026-09-27 (20th)
  entry.
- **RESOLVED (2026-09-27): Pose Tween's finger poses froze (wrist kept
  responding, fingers didn't) — a direct side effect of the previous
  fix that re-applies Base Rotation's slider every frame.**
  `applyBaseArmRotation()`'s own finger re-bake was hardcoded to `cfg`,
  silently overwriting the tween's own finger blend right after it was
  correctly applied. Fixed by giving that function an explicit
  `poseValues` parameter and threading the tween's blended object
  through. Live-verified: finger bone now tracks the blend correctly
  at both ends. See `docs/CHANGELOG.txt`'s matching 2026-09-27 (19th)
  entry.

- **DONE (2026-09-27): Pose Tween now applies the live Whole-Hand
  Rotation X/Y/Z and Base Rotation X/Y/Z slider values to whatever
  pose is currently showing, instead of silently resetting them to
  the named poses' own saved fields (0 for every seeded pose) every
  frame.** Fixed in `applyResponsivePoseTweenFrame()` — overrides the
  blended pose's `modelRotX/Y/Z` with the live `cfg` values, and
  re-applies Base Rotation's current slider each frame when it isn't
  already reactive. Live-verified: rotation stays bit-for-bit
  identical across both ends of the tween. See `docs/CHANGELOG.txt`'s
  matching 2026-09-27 (18th) entry.

- **RESOLVED (2026-09-27): `armBaseDistanceT` (Wrist Splay/Base Arm
  Rotation/Pose Tween's shared distance metric) froze at a stale,
  unrelated value whenever the mouse was near the dev panel — the
  ground-plane raycast dead zone covers most of the upper screen,
  exactly where curve control points get dragged. This is what made
  Pose Tween look broken: "the curve graph does nothing," "even
  default gets shifted," "you're applying the target's rotation to
  everything" were all the SAME root cause.** Fixed by falling back to
  `tiltMagnitude` (always-live, no raycast dependency) on a raycast
  miss, so the metric never truly freezes. Palm Rotation's own
  freeze-on-miss behavior (a different, deliberately-requested choice)
  is untouched. Live-verified: pose now tracks smoothly with the mouse
  over the dev panel, and a curve-shape edit at a fixed mouse position
  now visibly changes the pose. See `docs/CHANGELOG.txt`'s matching
  2026-09-27 (17th) entry.
- **RESOLVED (2026-09-27): hand disappeared (collapsed to a tiny
  sliver) whenever Responsive Pose Tween and Responsive Arm Rotation
  at Base were both active — user's own hypothesis ("bug clash with
  the whole hand rotation at base slider") was exactly right.**
  `applyModelRootTransform()` (run every frame by Pose Tween) reset
  `h.clone.quaternion`/`position` without telling
  `applyBaseArmRotation()`'s own delta-tracker, so the 2 systems fought
  over the same transform using stale assumptions every frame. Fixed
  by invalidating that tracker (`h.lastBaseArmQuat = null`) inside
  `applyModelRootTransform()` itself. Reproduced the exact symptom
  first, then confirmed the fix resolves it with both features active
  simultaneously — see `docs/CHANGELOG.txt`'s matching 2026-09-27
  (16th) entry. **This fix alone was insufficient — see the entry
  directly above for the deeper root cause found on direct follow-up.**

- **DONE (2026-09-27): items 4-6 of the 6-part Palm Rotation request —
  Responsive Arm Rotation at Base, unified distance metric on
  Responsive Wrist Splay, Responsive Pose Tween.** New shared
  `armBaseDistanceT` metric (cursor-to-arm-base distance on desktop,
  phone-tilt % on mobile — deliberately different from the existing
  `tiltMagnitude`). Base Arm Rotation reuses `applyBaseArmRotation()`'s
  own curl-axis-safe delta-tracking; Pose Tween blends between
  `DEFAULT_POSE_NAME` and a picked target pose through the existing
  `applyPoseValuesToHand()` pipeline, specifically to avoid a 5th
  instance of this file's own recurring curl-axis bug class. Live-
  verified via direct finger-bone quaternion reads (not just
  screenshots): Base Arm Rotation's On/Off applies/reverts a measured
  exact delta; Pose Tween visibly and measurably blends between Fist
  and Big Open Palm by cursor distance. See `docs/CHANGELOG.txt`'s
  matching 2026-09-27 (15th) entry.
- **RESOLVED (2026-09-27): Palm Rotation depended on height and cursor
  distance when it shouldn't have; added a 2nd marker for the forearm
  base point.** `tiltOriginGround` now drops the forearm bone's world Y
  directly instead of sliding it along the camera's forward direction
  (which coupled the result to height/camera pitch); removed the
  `tiltMagnitude` scaling on Palm Rotation's angle entirely. New cyan
  `forearmBaseMarkerMesh`, sharing Show Target Marker's own checkbox.
  See `docs/CHANGELOG.txt`'s matching 2026-09-27 (14th) entry.
- **RESOLVED (2026-09-27): Saved Cameras (and all 5 list-pickers —
  Poses/Cameras/Lighting/Toon Shading/Tween Sequences) never actually
  persisted their Save/Overwrite/Rename/Delete/+Group/Import
  mutations.** Root cause: `buildListPicker()` called
  `saveDevPanelSettings()`, which only captures REGISTERED dev-panel
  controls — a raw items array has no such registration. Fixed with a
  dedicated localStorage + best-effort remote-sync persistence layer.
  Live-verified: Save/Delete on Saved Cameras survives a real page
  reload. See `docs/CHANGELOG.txt`'s matching 2026-09-27 (13th) entry.
- **DONE (2026-09-27): items 1-2 of the same 6-part request — Palm
  Rotation direction inverted + wrap-safe smoothing (11th entry);
  Whole-Hand-Rotation-at-Base curl-axis bug fixed, same class as 3
  prior fixes (12th entry).**

- **NEW (2026-09-27): Finger Gizmos (visual-only, confirmed with the
  user — no TransformControls/IK dragging).** Markers + 3 colored axis
  lines (X=red/Y=green/Z=blue) at every finger joint (15 per hand),
  with Gizmo Size/Color and Axis Line Length/Thickness sliders plus an
  On/Off checkbox. Ported the marker/tip-offset concept from HANDO's
  own real `setupFingerGizmos()` (read directly, not reconstructed) —
  the axis lines themselves are this project's own addition, not in
  HANDO's version. Live-verified: exact mesh counts (15+45), a
  screenshot showing correctly colored lines on top of the hand,
  slider-driven scale changes, and checkbox-driven visibility. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (10th) entry.

- **RESOLVED (2026-09-27): the Y=0 ground-plane dead-zone (raycast only
  hit the bottom ~third of the screen) — per direct instruction, a
  missed raycast now skips Palm Rotation's per-hand update entirely
  instead of computing a bogus angle from a stale point.** Live-
  verified: quaternion reads byte-identical while frozen in the dead
  zone, resumes correctly once back in the valid zone. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (9th) entry.
- **RESOLVED (2026-09-27): Show Target Marker checkbox had no actual
  mesh behind it since Phone Tilt was first built.** Added a small
  magenta sphere synced to `tiltTarget` every frame when enabled. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (8th) entry.

- **NEW (2026-09-27): Ground Plane dev-panel group (real visible slab,
  4 controls: On/Off, Height, Color, Scale) + a World Axes Gizmo
  checkbox in Debug.** Ground Height positions the slab's TOP face
  (not center); Ground Scale only affects X/Z (thickness is a fixed
  constant). Both live-verified: real checkbox clicks + `Box3`-measured
  world bounds. See `docs/CHANGELOG.txt`'s matching 2026-09-27 (7th)
  entry.

- **RESOLVED (2026-09-27, 6th pass): Palm rotation still didn't feel
  right on desktop — root cause was measuring the cursor's offset from
  SCREEN CENTER (arbitrary) instead of from the hand's own actual
  position.** Fixed per direct spec: the forearm base's live world
  position is projected onto the world Y=0 ground plane along the
  CAMERA's own forward direction, and the cursor is raycast onto that
  same ground plane — the rotation angle is measured directly between
  those two points. Live-verified: forearm anchor still holds (~7e-14
  noise), screen-center now correctly reads ~0deg. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (6th) entry.

- **RESOLVED (2026-09-27, 5th pass): Palm rotation snapped instantly to
  full strength on any nonzero cursor offset or device tilt, instead of
  scaling proportionally — fixed mouse "not aligned with cursor" feel
  and enabled the requested "more tilt = more rotation" mobile
  behavior in one change.** `computeRadialRollDeg()` is a pure `atan2`
  (direction only, magnitude-blind); a first attempt suspected the
  raycast/depth-plane math instead and was disproven live (reprojecting
  `tiltTarget` back through the camera showed it landing nowhere near
  the real cursor, even after "fixing" it — the plane's depth was never
  actually the issue, since both raycasts always shared one plane
  either way). Fixed by scaling the resulting angle by `tiltMagnitude`
  (already computed for both mouse and device-tilt input) in
  `animate()` — one change covers both input paths. Live-verified: near
  screen-center ~0deg, moderate offset ~-26deg, a corner ~-156deg —
  smooth, monotonic, correct direction at each point. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 (5th) entry.

- **RESOLVED (2026-09-27, 4th pass — supersedes the 3rd pass's own axis
  choice below, anchor logic unchanged): Palm Faces Cursor and Palm
  Face Rotation rotate around plain canonical UP (0,1,0), not a
  bone-measured "local Y" axis.** The 3rd pass's `armYAxisAligned`
  (the bone's raw local Y, transformed through its own quaternion then
  `alignQuat`) turned out to be a correct reading of the WRONG thing:
  direct measurement showed `rForearmBend`'s local AND world quaternion
  are both identity (~1e-8) — this rig keeps bones fully unrotated at
  bind pose, orientation baked into geometry instead — so "the bone's
  raw local Y" reduces to just `alignQuat` applied to canonical Y,
  which lands near ALIGNED -Z (confirmed identical to
  `wristCropNormalAligned`), not anywhere near Y in the aligned/
  rendering frame the rest of this file already uses. Fixed by using
  plain UP directly; `armYAxisAligned`'s measurement is removed. The
  forearm-base anchor/pivot logic (3rd pass) is untouched — this was
  purely an axis bug. Live-verified via direct quaternion/position
  comparison (a 90deg rotation matched an independently-computed
  quaternion exactly, forearm world position unchanged to ~1e-14) — a
  visual screenshot check was inconclusive due to this sandbox's own
  documented WebGL-canvas-readback unreliability, confirmed via direct
  pixel sampling rather than dismissed. See `docs/CHANGELOG.txt`'s
  matching 2026-09-27 (4th) entry.

- **RESOLVED (2026-09-27): Tracking Enabled itself caused the whole arm
  to rotate, even with Palm Rotation/Responsive Wrist Splay/Wrist Crop
  all off.** An earlier same-morning fix (Haiku session, `dd070b3`)
  moved `updateTiltTarget()` inside the input-check block but left the
  actual wrapper reorientation (`hands.forEach` lookAt+slerp) running
  unconditionally whenever tracking + input were present, independent
  of `cfg.palmFacesCursor` — the checkbox that's actually supposed to
  gate that rotation. Fixed by gating the reorientation on
  `cfg.palmFacesCursor` (data pipeline `updateTiltTarget()` still runs
  unconditionally, since Wrist Splay/Crop need live `tiltMagnitude`),
  and by adding an explicit `cfg.trackingEnabled` check to
  `computeArmLengthT()`/`computeResponsiveWristSplayDeg()` so Tracking
  Enabled is a true master gate for all 3 features and has no visible
  effect on its own. Live-verified via direct wrapper-quaternion
  before/after checks with real mouse input. See
  `docs/CHANGELOG.txt`'s matching 2026-09-27 entry.

- **RESOLVED (2026-09-26, 4th pass): finger/thumb splay was subtly off
  on poses with both curl AND splay active on the same joint (e.g.
  "Fist"'s index and thumb) — a rotation-ORDER bug, not an axis-math
  bug.** HANDY DANDIES' real `applyCurlToSkeleton()` applies splay/
  splay2 BEFORE curl; this project had curl first. Since
  `rotateOnTrueWorldAxis()` reads the bone's world quaternion fresh each
  call, applying curl first meant splay's own axis got computed relative
  to the already-curled joint instead of rest — an error proportional to
  how much curl was also active, exactly matching "not aggressively
  wrong, but not the pose I intended." Fixed by reordering to match
  HANDY DANDIES exactly (no new math, every individual rotation call was
  already correct). Live-verified: Fist's real index/thumb values
  produce well-formed unit quaternions and a natural, correctly-
  articulated closed fist. See `docs/CHANGELOG.txt`'s matching
  2026-09-26 (09:02-09:06 AM) entry.

- **RESOLVED (2026-09-26, 3rd pass): the same curl-axis-tracking bug
  class, this time on Whole-Hand Rotation (modelRotX/Y/Z) instead of the
  wrist -- 0.0deg (floating-point noise) drift across all 3 axes,
  individually and combined, both via a standalone quaternion-math
  script and live against the real running app.** Root cause:
  `applyCurl()`/`applyPoseValuesToHand()`/`applyReactiveWristSplayFrame()`
  all passed `alignQuat` (modelRot-excluded) as `applyCurlToSkeleton()`'s
  `baseQuat` -- a 2026-09-21 workaround for a double-counting bug that
  existed in `curlExcludeQuatForHand()` at the time (it used to also
  exclude `h.clone.quaternion`, which already contains `modelRotQuat`).
  Once the 2nd-pass fix below corrected `curlExcludeQuatForHand()` to
  exclude `wrapper.quaternion` alone, that workaround went stale and
  should have been reverted alongside it, but wasn't. Fixed by passing
  `h.currentBaseQuat` (which correctly bakes in `modelRotQuat`) at all 3
  real call sites, matching HANDY DANDIES' own real, working pattern
  (`cloneBaseQuat = alignQuat * wholeHandRotQuat`, wrapper alone
  excluded) confirmed by reading that file's source directly. See
  `docs/CHANGELOG.txt`'s matching 2026-09-26 (03:31-03:54 AM) entry.

- **RESOLVED (2026-09-26, 2nd pass): a real, separate residual bug found
  right after the fix below was declared complete -- Tip Twist's own
  code path, not the curl/splay system. Now genuinely fully fixed: a
  15-bone x 2-axis (Bend/Rotation) sweep is 0.0deg (floating-point noise)
  on every single measurement.** Root cause: `bone.rotateOnWorldAxis()`
  (three.js's own built-in) silently misinterprets its axis as the
  bone's PARENT's local frame once any ancestor has real rotation --
  only ever visible on `rThumb3` because "Fist" is the only saved pose
  with a nonzero `tipTwist*` value at all. Fixed by switching to the
  SAME `rotateOnTrueWorldAxis()` helper curl/splay already use (no
  exclude-quat needed here), ported verbatim from HANDY DANDIES' own
  real fix for this identical issue. See `docs/CHANGELOG.txt`'s matching
  2026-09-26 (01:40-01:46 AM) entry.

- **RESOLVED (2026-09-26): the curl-axis-tracks-wrist bug is genuinely,
  completely fixed -- 0.0deg measured drift across Wrist Splay/Bend/
  Rotation's own full ranges, on 3 different fingers, matching HANDO's
  own real deployment exactly.** The real root cause (found via direct
  algebra, cross-checked against HANDY DANDIES' own working call site):
  `curlExcludeQuatForHand()` incorrectly combined `baseQuat` into the
  quaternion `rotateOnTrueWorldAxis()` excludes from a bone's world
  orientation -- HANDY DANDIES' own equivalent passes the wrapper's
  rotation ALONE. That extra factor left a real, angle-dependent residual
  (a conjugation that doesn't cancel) instead of a clean cancellation --
  near-zero at small angles (why Wrist Splay's own +-30deg range looked
  "mostly fine"), huge at large ones (Wrist Bend's own +-90deg, Wrist
  Rotation's own +-180deg). Fixed by excluding only the wrapper, and
  reverting `computeCurlAxisRefQuat()` to its original, always-correct
  formula (it never needed changing -- it just needed the right
  exclude-quat next to it). 2 earlier same-day attempts at this exact fix
  (an ancestor-chain rest composition, then a HANDO-style live-parent-
  quaternion port) are both reverted -- neither was wrong in isolation,
  neither was actually the bug. See `docs/CHANGELOG.txt`'s 2026-09-26
  (2nd) entry for the full account, including why the HANDO comparison
  that found this had to control for HANDO's own Whole-Hand Rotation
  being off in the first naive test (a non-apples-to-apples comparison
  that briefly looked like it disproved the fix).

- **Reverted the 2026-09-25 `withLiveFieldsPreserved()` fix (2026-09-26)
  -- it had its own real regression.** It omitted a saved pose's own
  `wristSplay`/`modelRotX/Y/Z` unconditionally, which silently broke 2 of
  the 4 `SAVED_POSES` ("Big Open Palm (S)", "Fist - Bent Back") that are
  defined ENTIRELY by their own `wristSplay` value -- confirmed applying
  either produced a wrist quaternion byte-identical to its non-splayed
  sibling. A saved pose's wrist/rotation fields apply normally again; the
  original reactive-stacking problem already has its own correct fix
  (the Min/Max clamp sliders) sitting unused.

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

1. **Verify the 2026-09-28 Phone Model rotation-node fix, damping, and
   Phone Model Log on a real phone/browser.** None of this round's
   changes were independently browser-verified (per direct instruction
   to skip it) — confirm: the Object Axes gizmo now actually rotates
   with the phone model; the rotation feels smooth rather than jittery
   at the default `phoneRotationDamping` (`0.25`) — tune if it feels too
   laggy or still too jittery; and the new "Phone Model Log" entries
   look sensible (position/rotation values, correct interval, real
   timestamps) both on Desktop (mouse-driven) and on the real device.
2. **Verify the 2026-09-28 Phone Model Responsive Rotation axis remap
   on a real phone.** The mapping (forward tilt = +90 X, left tilt =
   +90 Z, compass turn = Y) was implemented per the W3C
   `deviceorientation` spec's beta/gamma sign convention, not measured
   against real hardware — this sandbox's `DeviceOrientationEvent.
   requestPermission()` auto-denies with no real gesture behind it, so
   not even a synthetic event reaches the handler. If any one axis
   looks backwards on a real device, that axis's sign needs flipping in
   `computePhoneCombinedQuat()` — see that function's own comment.
3. **Live-verify the 2026-09-28 dev panel re-sync in a real browser** —
   this round's changes (Undo/Redo, the new Panel UI theme colors, all
   12 migrated curve/range fields, the header button reorganization)
   were pushed without a browser verification pass, per direct
   instruction to skip it. Worth a pass next time the panel is opened:
   confirm the migrated curve-editor/range-bar widgets still drag/
   click-to-edit correctly and round-trip through Sync, and that
   nothing else regressed.
4. **Test Device Information on a real Pixel 9a + Chrome** (and ideally a
   real iPhone/Safari) — open `https://handy-set.vercel.app/?dev=1` ->
   DEV -> Debug -> Settings, check "Device Information". Confirm whether
   Chrome's `getHighEntropyValues()` actually returns `model: "Pixel 9a"`
   on real hardware (unverified — this environment has no physical
   device), and that the fallback path behaves sensibly on Safari.
5. Decide whether a single master kill-switch for all gyro-driven
   effects is wanted — Phone Tilt's own "Tracking Enabled" checkbox
   currently only gates whole-hand rotation, NOT Responsive Wrist Splay
   or Reactive Arm Length (each has its own separate toggle). Flagged to
   the user 2026-09-25, not yet built (not requested).
6. Find "Responsive Palm Rotation" — the user says this group exists in
   their own app, but an exhaustive search of the git-tracked
   dev-panel-settings.json found no trace of it anywhere. Likely needs
   the user to hit Sync from whichever device/browser shows it (so its
   real state reaches git), or a screenshot/more specific description.
7. Verify Phone Tilt gyroscope rotation specifically on the user's actual
   Pixel 9a — still unverified, no physical device available here (can be
   folded into the same real-device session as item 4 above).
8. ~~Decide on a visible default color scheme~~ — now moot for production:
   the startup-sync fix above means production correctly picks up the
   git-tracked gray background (`#bfbfbf`) instead of the all-white
   hardcoded default. Revisit only if the *hardcoded* literal defaults
   in `main.js` (the fallback when no git settings are reachable, e.g.
   `file://` or an offline API) still need their own deliberate tuning.
9. Port Pose Offset X/Y/Z to Handy Dandies' camera-relative resolution
   before any saved pose is given a nonzero offset value.
10. Tune default Camera/Lighting/Toon values to taste, now that Camera
   restore, the color/rim controls, and Set-as-Default persistence all
   actually work.

## Open questions / blockers

- **"Responsive Palm Rotation"** — see What's next #6. Not blocking other
  work, but unresolved.
