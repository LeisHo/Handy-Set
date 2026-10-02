import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { clone as cloneSkinnedSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { Line2 } from 'three/addons/lines/Line2.js'
import { LineGeometry } from 'three/addons/lines/LineGeometry.js'
import { LineMaterial } from 'three/addons/lines/LineMaterial.js'
import { detectDeviceInfo } from './deviceInfo.js'

// Timestamp helper for debug logs
function ts() { return '[' + new Date().toISOString() + ']' }

// On-demand rendering (2026-09-29). Direct request: "when Responsive
// Rotation is not turned on, make sure that the 3js isnt still rendering
// everyframe. In that case, only rerender when a setting has been
// modified." animate() (near the bottom of this file) keeps calling
// requestAnimationFrame/controls.update() every frame regardless (cheap,
// and controls.update()'s own 'change' event below is how OrbitControls
// damping's post-drag glide gets picked up) but SKIPS the expensive part
// (the whole per-frame pose/tilt/phone-model/recursive-render compute plus
// composer.render() itself) unless cfg.trackingEnabled is on (Responsive
// Rotation's own master gate -- Palm Rotation/Reactive Arm Length/Wrist
// Splay/Base Arm Rotation/Pose Tween/Phone Model Responsive Rotation all
// key off tiltMagnitude/armBaseDistanceT, which only ever changes while
// this is on) or `needsRender` has been flagged by something discrete:
// a dev-panel control (wireSlider/wireCheckbox/wireColor/wireTextInput/
// wireSelect below all call requestRender()), an OrbitControls 'change'
// event (drag/wheel/damping), a window resize, or a Sync/Reset/Undo/Redo
// restore (devPanel.js's applyFullDevPanelState() calls
// window.requestRender() directly as a safety net for any restore path
// that sets a control's value without dispatching a real input/change
// event). Recursive Render (cfg.screenRenderEnabled) is deliberately NOT
// included in the "always continuous" condition -- its own render-to-
// texture pipeline only ever reflects the CURRENT scene state, so with
// nothing else changing frame-to-frame its own output wouldn't change
// either; it still updates correctly on-demand via the same needsRender
// flag as everything else.
//
// CORRECTED 2026-09-30, direct follow-up: the first version above still
// called requestAnimationFrame(animate) unconditionally every browser
// frame even while shouldRender was false -- it skipped the expensive
// compute+render work but never stopped the RAF LOOP ITSELF, so the
// browser kept waking this tab up 60x/sec for nothing. animate() (below)
// now only re-schedules itself when a render is still needed; otherwise
// it lets the loop die (renderLoopRunning = false) and requestRender()
// is what restarts it -- a single guarded entry point so a flurry of
// rapid calls (e.g. a slider drag firing many 'input' events per second)
// never schedules more than one pending RAF at a time.
let needsRender = true
let renderLoopRunning = false
function requestRender() {
  needsRender = true
  if (!renderLoopRunning) startRenderLoop()
}
function startRenderLoop() {
  if (renderLoopRunning) return
  renderLoopRunning = true
  requestAnimationFrame(animate)
}
window.requestRender = requestRender

// Shared DRACOLoader, attached to every GLTFLoader instance (both the
// hand model and the Phone Model group's own loader). Found 2026-09-29
// on the real deployed site: P5_Project_1.glb (Phone Model's default
// selection) is Draco-compressed, and GLTFLoader throws
// "No DRACOLoader instance provided" for a Draco-compressed file with
// none attached -- confirmed live via the real console error, not
// guessed. A GLTFLoader with a DRACOLoader attached that never
// encounters Draco-compressed geometry (e.g. the hand model, currently
// not Draco-compressed) is unaffected -- safe to attach everywhere a
// GLTFLoader is created rather than only where it's known to be needed
// today, since a future re-export of any GLB could add compression.
const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

// Dev panel schema-version guard — runs synchronously, before devPanel.js
// (main.js loads first, see index.html's own script-order comment) ever
// reads its own localStorage. Bump HANDYSET_SETTINGS_SCHEMA_VERSION any
// time the dev-panel group/row STRUCTURE changes (a group renamed/split/
// merged, a control id changed) — a stale saved layout from before the
// change otherwise gets restored on top of the fresh code output, and
// since applySectionOrder() APPENDS an unmatched old group rather than
// replacing it, the result is literal duplicate groups/rows sitting next
// to the correct ones, some referencing ids that no longer correspond to
// any real control (unclickable, since nothing is wired to them). Found
// live this round: this exact symptom, caused by exactly this exact
// mechanism, after this session's own Pose-group restructure (Rotation/
// Thumb split, Pose Offset subgroup) — this guard exists specifically so
// it can't recur silently on the next structural change either. Bumping
// this simply clears the stale local save; it does not touch the
// separate git-tracked save (data/processed/dev-panel-settings.json,
// reset directly when this was first found).
//
// Bumped again 2026-09-29: direct report of duplicate "Hand Model" and
// "Phone Model" top-level groups (and Phone Model's own settings
// appearing missing) on a real desktop browser -- the live git-tracked
// settings file was checked directly and is clean (exactly one HAND
// MODEL / one PHONE MODEL entry each), so the stale layout could only
// be sitting in that browser's own localStorage, left over from before
// several un-bumped structural changes since 2026-09-27a (the
// 2026-09-28 curve/range widget migration removing the old hand-built
// text-control ids, and this same day's Item Selector/hiddenPhoneModelFile
// additions). This bump is the designed fix for exactly this symptom --
// it does not touch the git-tracked file, which never needed resetting.
//
// Bumped again, same day (2026-09-29b): RECURSIVE RENDER moved from a
// top-level group to a subgroup of PHONE MODEL > RESPONSIVE BEHAVIOUR -
// PHONE, per direct request -- another real group-nesting change since
// the 'a' bump above.
//
// Bumped again (2026-10-01): the per-axis Rotation/Displace curve-editor
// refactor removed 4 row ids (textPhoneResponsiveRotationRange/Curve,
// textPhoneResponsiveDisplaceRange/Curve) and replaced them with 18 new
// per-axis ones (textPhoneRotationRange/CurveX/Y/Z,
// textPhoneDisplaceRange/CurveX/Y/Z, sliderPhoneDisplaceX/Y/ZReferenceM)
// inside the SAME, unrenamed groups (Responsive Rotation / RESPONSIVE
// DISPLACE) -- a row-id change, not caught by the group-level examples
// above, but the same underlying risk this guard exists for. Missed at
// the time; caught after a direct report that other controls (the Mirror
// checkboxes) elsewhere in the dev panel appeared to have vanished --
// consistent with this exact symptom.
const HANDYSET_SETTINGS_SCHEMA_VERSION = '2026-10-01'
try {
  if (localStorage.getItem('handysetSettingsSchemaVersion') !== HANDYSET_SETTINGS_SCHEMA_VERSION) {
    localStorage.removeItem('devPanelSettings')
    localStorage.setItem('handysetSettingsSchemaVersion', HANDYSET_SETTINGS_SCHEMA_VERSION)
  }
} catch (e) { /* localStorage unavailable (private mode, etc.) -- nothing to guard */ }

const MODEL_URL = 'data/processed/HAND3D/Hand2.glb'
const loadingEl = document.getElementById('loading')

// Hand Model Selector -- direct request: "provide a hand model selector
// liek the phone and load in this geometry
// data/processed/HAND3D/HandiBonesB-IK.glb". Confirmed via direct GLB
// parsing (no browser needed) before building anything that the new file
// shares the EXACT SAME functional bone names as the default rig
// (rHand, rIndex1/2/3, rMid1/2/3, rForearmBend, etc.) -- the existing
// bone-name-based pose system (applyCurlToSkeleton/applyWristPoseToSkeleton/
// boneRestQuat) works unchanged once swapped; the new file just adds
// extra non-posable helper/IK-target nodes alongside the same skeleton.
// Deliberately narrower than Phone Model's own Item Selector (visually
// mirrors its clickable-list UI, per the request's own "like the phone" --
// see renderHandModelItemSelector()) -- no per-model settings capture and
// no Import GLB upload flow, since neither has a hand-model equivalent to
// port: a hand has no per-model tunables the way a phone has (Recursive
// Render/Screen settings), and nothing asked for uploading NEW hand
// models from the UI, only selecting between known ones.
const HAND_MODEL_OPTIONS = [
  { value: 'data/processed/HAND3D/Hand2.glb', text: 'Hand2 (Default)' },
  { value: 'data/processed/HAND3D/HandiBonesB-IK.glb', text: 'HandiBonesB-IK' }
]

// ---------------------------------------------------------------------
// Live tunable state (dev-panel-backed). Plain object, read/written
// directly by control event listeners further down.
// ---------------------------------------------------------------------
const cfg = {
  // Global overrides for Responsive Rotation/Displace -- added 2026-10-01,
  // direct request: "global on off switches for the responsive rotation
  // and the responsive displacement... I understand that they do overlap
  // with the individual checkboxes within the phone group, but this will
  // override that. That way, when I'm switching between phone models, I
  // don't have to keep turning them on and off individually." Lives in
  // the Debug group (not Phone Model), AND-combined with each feature's
  // own existing checkbox at every real gate -- the per-feature checkbox
  // keeps its own stored value untouched either way; this purely gates
  // whether that value can take effect. Default true (matches the
  // existing checkboxes being the only gate until this is turned off).
  responsiveRotationGlobalEnabled: true, responsiveDisplaceGlobalEnabled: true,
  // Field Layout — defaults to a single centered hand (1 row x 1 col);
  // per direct request, the full multi-hand field controls are ported
  // even though only 1x1 is used today, so more hands can be added later.
  fieldRows: 1, fieldCols: 1, rowSpacing: 9.5, columnSpacing: 14, handScale: 1.55,
  alternateRowOffset: -5.5, progressiveRowOffset: 0, useProgressiveOffset: false, hideHands: false,
  // Pose (finger/wrist/whole-hand — filled from POSE_KEY_DEFAULTS below)
  // Camera
  cameraX: 3.598517809628556, cameraY: 31.35475415298584, cameraZ: 60.28634317626074,
  cameraFov: 32, targetX: 3.5985178096286012, targetY: 31.35475415298582, targetZ: -314.71365682373926,
  cameraZoom: 60, lockCameraPan: false, lockCameraZoom: false, lockCameraRotate: false,
  cameraYaw: 0, cameraPitch: 0, cameraMaxExtentsEnabled: false,
  cropWristEnabled: true,
  // Phone Tilt (renamed from Cursor Tracking)
  // trackingEnabled is now a pure on/off gate for motion input; doesn't itself cause rotation
  trackingEnabled: true, trackingDamping: 1, targetDepthFactor: 0.6,
  showTargetMarker: false, palmFacesCursor: false,
  // Palm Face Rotation -- adds onto Palm Faces Cursor's own dynamic angle
  // (see animate()'s own comment), both rotating around Y (the aligned/
  // rendering frame's Y axis -- this rig's bones are unrotated at bind
  // pose, so that's what "the forearm's Y axis" actually is), anchored
  // at the forearm bone's own base position. Direct instruction:
  // "rotating the entire arm by the Y axis of the forearm bone...
  // anchored to the base point of the forearm bone... its a locaize
  // rotation" / "I want the Forearms Y axis to be the axis of rotation."
  palmFaceRotationOffset: 0,
  // Whole-Hand Rotation at Base (anchored at rForearmBend, using its own axes)
  baseRotationX: 0, baseRotationY: 0, baseRotationZ: 0,
  // Mirror -- reflects the hand model along each of its OWN local axes
  // (applied as a per-axis sign on h.clone.scale, so "the model's own X/Y/Z"
  // means exactly what it says -- the GLB's own bind-pose local axes, not
  // a world-space or camera-relative direction). A standalone model toggle,
  // not part of POSE_KEY_DEFAULTS/SAVED_POSES -- it's a structural display
  // setting (like Field Layout or Toon Shading), not an animatable pose
  // value, so it deliberately isn't captured/blended by Saved Poses or
  // Responsive Pose Tween. See rotateOnTrueWorldAxis()'s own comment for
  // why curl/splay/twist need a dedicated fix to stay anatomically correct
  // once any of these are on, and computeHandMirrorMatrix()'s/
  // applyModelRootTransform()'s comments for the visual side.
  handMirrorX: false, handMirrorY: false, handMirrorZ: false,
  // Hand Model Selector -- see HAND_MODEL_OPTIONS'/loadHandModel()'s own
  // comments. Defaults to MODEL_URL (the pre-existing hardcoded default)
  // so the very first, synchronous handLoader.load() call below has a
  // sensible value before any Sync/remote-settings restore has had a
  // chance to run (those resolve async, after this file's top-level code
  // has already executed) -- a user who previously selected a different
  // model sees a brief flash of the default on a fresh page load, then
  // the restore-triggered swap corrects it a moment later, same timing
  // trade-off this file's other restore-dependent settings already have.
  handModelFile: MODEL_URL,
  // Reactive Arm Length — ported from HANDY DANDIES (see docs/CHANGELOG.txt
  // for the porting account). HANDY DANDIES normalizes "distance" against
  // the live min/max distance across a whole FIELD of hands each frame —
  // a concept that doesn't exist for this project's single-hand (or small
  // field) case. Adapted to reuse `tiltMagnitude` (already computed every
  // frame by handleMouseMoveFallback/handleDeviceOrientation — how far
  // the cursor/tilt currently is from center, 0-1 normalized) as the
  // "distance" input to the curve instead — the natural equivalent for
  // this project's own tracking abstraction. Curve math, widget UI, and
  // every control (reactive on/off, min/max range, curve editor) are
  // otherwise a verbatim port.
  reactiveArmLengthEnabled: true,
  armLengthRange: '{"min":0,"max":85}',
  armLengthCurve: '{"points": [{"x": 0, "y": 1}, {"x": 0.148333740234375, "y": 0.6613540649414062}, {"x": 0.4100001017252604, "y": 0.31468760172526045}, {"x": 0.5316670735677084, "y": 0.2680206298828125}, {"x": 0.748333740234375, "y": 0.19468739827473958}, {"x": 1, "y": 0}], "method": "catmullrom"}',
  // Responsive Wrist Splay — RESTORED 2026-09-21 after direct instruction
  // ("Leave Responsive Wrist Splay") following an earlier removal this
  // same session that was based on a misidentification of a DIFFERENT
  // group ("Responsive Palm Rotation") the user asked to remove — see
  // docs/CHANGELOG.txt for the full account. Same porting/adaptation note
  // as Reactive Arm Length above (tiltMagnitude stands in for HANDY
  // DANDIES' per-field live distance range).
  wristSplayResponsiveEnabled: true, wristSplayDefault: 7, wristSplayReactiveEnabled: true,
  wristSplayRange: '{"min":5,"max":-71}',
  wristSplayCurve: '{"points": [{"x": 0, "y": 1}, {"x": 0.31833343505859374, "y": 0.6961458841959636}, {"x": 1, "y": 0.042812347412109375}], "method": "catmullrom"}',
  // Wrist axis clamps — direct request 2026-09-25, after diagnosing why
  // a saved pose's own Wrist Splay (e.g. -55) plus Responsive Wrist
  // Splay's own live contribution (e.g. -71 at rest) sum to an
  // anatomically-impossible total (-126) with no ceiling: pose value and
  // reactive value are each tuned independently and just get added, so
  // nothing stops the SUM from exceeding a sane range. These 3 ranges
  // clamp the FINAL combined angle actually applied to the wrist bone
  // for each axis (applyWristPoseToSkeleton()) — independent of how many
  // sources contributed to it (pose slider, reactive splay, any future
  // source). Defaults are each axis's own existing slider bounds (see
  // the Wrist subgroup below) — i.e. "off" (no additional restriction)
  // until the user narrows one down.
  wristRotationClampRange: '{"min":-360,"max":360}',
  wristBendClampRange: '{"min":-90,"max":90}',
  wristSplayClampRange: '{"min":-180,"max":180}',
  // Responsive Arm Rotation at Base -- direct request 2026-09-27: "add a
  // RESPONSIE ARM ROTATION AT BASE. The closer the cursor to the
  // hand/arm base point on the XZ plane, the further the whole arm
  // model will rotate on the arm's base x axis... On mobile, the
  // further the phone tilt, the further the arm rotates." A single
  // On/Off checkbox gates the WHOLE feature (no separate "reactive"
  // sub-toggle, unlike Reactive Arm Length/Responsive Wrist Splay
  // above -- the request's own control list is just checkbox + fine-
  // tune + range + curve). Reuses applyBaseArmRotation()'s own already
  // curl-axis-safe delta-tracking (baseRotationX above) -- the
  // reactive amount is added ON TOP of that slider's value every
  // frame, not a separate rotation system. Distance input is
  // armBaseDistanceT (see updateTiltTarget()'s own comment), NOT
  // tiltMagnitude -- a deliberately different metric per this same
  // request: cursor-to-arm-base distance on desktop (normalized
  // against the farthest reachable point in the browser), phone-tilt
  // percentage on mobile (identical to tiltMagnitude there already).
  baseArmRotationResponsiveEnabled: false, baseArmRotationFineTune: 0,
  baseArmRotationRange: '{"min":0,"max":30}',
  baseArmRotationCurve: '{"points": [{"x": 0, "y": 1}, {"x": 1, "y": 0}], "method": "catmullrom"}',
  // Responsive Pose Tween -- direct request 2026-09-27: "add a
  // 'Responsive Pose Tween' subgroup... As the cursor moves/ phone is
  // tilted, the hand will tween between the default pose and the
  // target pose." "Default pose" is read as DEFAULT_POSE_NAME (a
  // named pose, parallel to Target Pose also being a named pose,
  // rather than a live snapshot of whatever's currently posed) --
  // disclosed interpretation, see findSavedPoseByName()'s own comment.
  // Curve X is the SAME armBaseDistanceT/tiltMagnitude distance/tilt
  // metric as the 2 features above (0=near/no-tilt, 1=far/full-tilt),
  // Y is tween progress (0=Default pose, 1=Target pose) -- matching
  // every other curve widget in this file's own X=input/Y=output
  // convention; see applyResponsivePoseTweenFrame()'s own comment for
  // why this reading was chosen over the request's own literal "target
  // pose is 100 on the x axis" wording.
  poseTweenResponsiveEnabled: false, poseTweenTargetPoseName: '',
  poseTweenCurve: '{"points": [{"x": 0, "y": 0}, {"x": 1, "y": 1}], "method": "catmullrom"}',
  // Lighting
  keyAzimuth: 117, keyElevation: 56, keyTargetHeight: 71, keyIntensity: 6, keyColor: '#ffffff',
  ambientIntensity: 0, ambientSkyColor: '#ffffff', ambientGroundColor: '#3a2f2a',
  // Toon Shading
  toonSteps: 2, toonStepThreshold: 2.7, toonShadowFloor: 7, toonLightCeiling: 100, toonBaseTint: '#ffffff',
  textureInfluence: 0, toonTint: '#ffffff', rimIntensity: 0, rimPower: 0.5, rimColor: '#ffffff',
  outlineEnabled: false, outlineColor: '#000000', outlineThickness: 2, outlineStrength: 5, outlineGlow: 0,
  // Background
  bgColor: '#ffffff',
  // Tween
  tweenPoses: [], tweenT: 0, tweenFrameCount: 10, exportFramePrefix: 'tween',
  // Debug
  showGridHelper: false, showAxesHelper: false, showWireframe: false,
  worldAxesLength: 50, worldAxesThickness: 1,
  // Ground Plane
  groundPlaneEnabled: false, groundHeight: 0, groundColor: '#808080', groundScale: 200,
  // Finger Gizmos -- visual-only (no TransformControls/IK dragging, per
  // direct confirmation), ported conceptually from HANDO's own real
  // setupFingerGizmos()/marker-sync code (read directly, not
  // reconstructed). Axis Length/Thickness are this project's own
  // addition, not present in HANDO's version.
  fingerGizmosEnabled: false, fingerGizmoSize: 1, fingerGizmoColor: '#ffcc00',
  fingerGizmoAxisLength: 4, fingerGizmoAxisThickness: 0.3,
  sensorStreamEnabled: false, sensorIntervalMs: 200,
  // Per-sensor log toggles -- direct request 2026-09-28. Default all on,
  // matching the log line's pre-existing (always-all-3) behavior.
  sensorLogAccel: true, sensorLogGyro: true, sensorLogCompass: true,
  // Diagnostic field -- added 2026-09-30, direct real-device test found
  // Sensor Log's own "Accel" field (accelerationIncludingGravity) is a
  // DIFFERENT signal than what Responsive Displace actually consumes
  // (computePhoneLinearAccelDeviceLocal()'s own gravity-subtracted
  // value) -- this logs THAT exact computed value instead, so a future
  // test directly shows what's driving Displacement rather than the raw
  // gravity-included reading. Default on (unlike most opt-in log
  // toggles) since this is specifically for diagnosing Displace reports.
  sensorLogLinearAccel: true,
  // deviceorientation's beta/gamma (absolute tilt ANGLE, degrees) --
  // added 2026-09-28, distinct from Gyro's rotationRate alpha/beta/gamma
  // (angular VELOCITY) already logged above under the same greek-letter
  // names. Labeled "Orient" in the log line specifically so the two
  // never look like duplicates of each other.
  sensorLogOrientBeta: true, sensorLogOrientGamma: true,
  deviceInfoEnabled: false,
  // Phone Model -- direct request 2026-09-27: a loadable smartphone GLB,
  // positioned/scaled/rotated independently of the hand, with its own
  // phone-tilt-driven responsive rotation (see PHONE_MODEL_OPTIONS and
  // the Responsive Rotation section below for the full design).
  phoneModelEnabled: false,
  phoneModelFile: '',
  // CORRECTED 2026-09-29 (3rd pass, same day) -- after 2 earlier
  // attempts at an automatic per-model/scale-to-hand-length correction
  // (both reverted: "I don't want you to override my personal
  // settings"), then a plain default of 100 ("The hand is probably in
  // meters. So just scale up all my phones by 100, but set that as
  // default") -- the user then also asked for the slider's own range
  // to be a small 0.5-5, which can't display a default of 100 without
  // clamping. Final resolution, direct: "I wanted you to scale it up
  // to 100 but on the sliders that will read as one... 100 is one
  // now." PHONE_MODEL_SCALE_BASE (100, a plain constant, defined near
  // applyPhoneModelTransform()) is now ALWAYS multiplied in -- uniform
  // for every model, no per-model/automatic adjustment, matching the
  // "don't override my personal settings" instruction just as much as
  // the flat 100 did. cfg.phoneModelScale itself goes back to being a
  // small FINE-TUNE multiplier on top of that base (0.5-5 slider
  // range, default 1 = the 100 baseline, unchanged from what "set that
  // as default" established) -- so slider=1 means actual scale=100,
  // slider=5 means actual scale=500, etc.
  phoneModelScale: 1,
  phoneModelOffsetX: 0, phoneModelOffsetY: 0, phoneModelOffsetZ: 0,
  phoneModelRotX: 0, phoneModelRotY: 0, phoneModelRotZ: 0,
  // Responsive Behaviour - Phone > Responsive Rotation -- same 4-control
  // pattern as Responsive Arm Rotation at Base (On/Off, Fine-Tune,
  // Min/Max Range, Curve), see computePhoneResponsiveAxisDeg()'s own
  // comment for how these drive multiple axes from one shared mapping.
  phoneResponsiveRotationEnabled: false, phoneResponsiveRotationFineTune: 0,
  // Rotation Reset (double-tap/double-click anywhere) -- added
  // 2026-09-28, default off (opt-in, matches Responsive Rotation's own
  // default-off convention).
  phoneRotationResetEnabled: false,
  // Per-axis on/off + scale -- direct request 2026-09-28. Axis letters
  // match the WORLD axis each real motion drives (see
  // computePhoneCombinedQuat()'s own comment): X <- beta (up/down),
  // Y <- alpha/compass (spin), Z <- gamma (left/right).
  phoneAxisXEnabled: true, phoneAxisYEnabled: true, phoneAxisZEnabled: true,
  phoneRotationScaleX: 1, phoneRotationScaleY: 1, phoneRotationScaleZ: 1,
  // Rotation Mode -- direct request 2026-09-30: a selectable alternative
  // to the existing Gyro/Integrated system (unchanged, kept intact as
  // 'gyro'), added specifically to eliminate accumulated gyro-drift/
  // path-dependence ("if I move the phone through X, then Y, and return
  // it to its original orientation, the model should return to its
  // original orientation too"). 'absolute' reads the phone's fused
  // deviceorientation beta/gamma/alpha directly each frame (a pure,
  // memoryless function of the CURRENT reading, never integrated/
  // accumulated) -- see computePhoneAbsoluteOrientationQuat().
  phoneRotationMode: 'gyro', // 'gyro' | 'absolute'
  // Smooths the FINAL combined rotation quaternion toward its per-frame
  // target via slerp -- same semantic as cfg.trackingDamping (1=instant
  // snap, lower=smoother/slower) -- added 2026-09-28, direct report:
  // "the rotation motion is jittery and not smooth." Real device
  // beta/gamma/alpha readings carry natural high-frequency sensor noise;
  // this damps that out at the rotation level rather than the raw input.
  phoneRotationDamping: 0.25,
  // Responsive Behaviour - Phone > Responsive Displace -- added 2026-09-30,
  // direct request: "similar to the responsive rotation, we will now use
  // the accelerometer compass and fused datastreams to determine the
  // movement and acceleration of the phone... I want the onscreen phones
  // to move in the direction of my real phone... This will mirror the
  // Responsive Rotation group with pretty much the exact same kind of
  // setting inputs but for positional displacement instead of tilt
  // rotation," followed by "i also want the 2 calclation types, simialr
  // to rotation, one with acceleration, and i guess the other is the real
  // world position." Mirrors Responsive Rotation's control shape 1:1
  // (On/Off, a 2-mode selector, per-axis On/Off+Scale, Fine-Tune, Min/Max
  // Range, Curve, Damping) -- see integratePhoneDisplacement()'s own
  // comment for what the 2 modes actually compute and why, and
  // computePhoneResponsiveDisplacement()'s comment for the curve/range
  // mapping. X = left-right, Y = up-down, Z = perpendicular to the phone
  // face/depth (direct correction: the user's own first message said Y,
  // then corrected to Z) -- this also matches the W3C devicemotion
  // acceleration axis convention directly (x=left-right, y=up-down,
  // z=out-of-screen), so no axis reshuffling is needed the way Rotation's
  // own beta/gamma/alpha mapping has repeatedly needed (see that
  // feature's own extensive gotcha history) -- though still NOT verified
  // against a real device (standing project limitation), so a swapped or
  // inverted axis remains possible.
  phoneResponsiveDisplaceEnabled: false,
  phoneDisplaceMode: 'acceleration', // 'acceleration' (device-local frame, simple) | 'worldPosition' (rotated into world frame first, corrects for the phone's own rotation during a move)
  // Displace Reset -- added 2026-09-30, direct request: "add a
  // displacement reset checkbox. Similar to the rotation, a double tap
  // will place the phone back in its starting location." Independently
  // toggleable from checkboxPhoneRotationResetEnabled -- both still share
  // the ONE double-tap/double-click gesture (setupPhoneRotationResetGesture()),
  // not 2 separate gestures. See that function's own comment.
  phoneDisplaceResetEnabled: false,
  phoneDisplaceAxisXEnabled: true, phoneDisplaceAxisYEnabled: true, phoneDisplaceAxisZEnabled: true,
  phoneDisplaceScaleX: 1, phoneDisplaceScaleY: 1, phoneDisplaceScaleZ: 1,
  // Invert X/Y/Z -- added 2026-09-30, direct request: "provide me some ui
  // to flip axes. so i dont need to go through you to fix it." A negative
  // Scale value ALREADY flips an axis's direction (same convention as
  // Rotation's own scale sliders), but that's a non-obvious side effect
  // of a control that otherwise reads as a magnitude/intensity knob --
  // this is a dedicated, unambiguous "flip this axis" checkbox instead,
  // applied ON TOP of Scale (not a replacement for it) in
  // computePhoneDisplaceAxisUnits(). Scoped to Displace only for now
  // (the feature just built, and the one actually unverified against a
  // real device) -- the same checkbox could be added to Rotation's own
  // per-axis controls on request.
  phoneDisplaceInvertX: false, phoneDisplaceInvertY: false, phoneDisplaceInvertZ: false,
  // phoneResponsiveDisplaceFineTune REMOVED 2026-10-01, direct request
  // ("remove displace finetune... i dont need whatever it does") -- the
  // slider/control/formula term are all gone; a stale
  // sliderPhoneResponsiveDisplaceFineTune key may still linger in an
  // already-synced settings file, harmlessly ignored (no control reads
  // it anymore).
  // Same semantic as phoneRotationDamping (1=instant, lower=smoother) --
  // applied as a lerp on the final displacement vector, same role slerp
  // plays for rotation. NOTE: this does NOT control the internal leaky-
  // integrator's own 2 decay rates below -- those keep "smoothing"/
  // "drifting back to center" even at Damping=1. See
  // PHONE_DISPLACE_VELOCITY_DECAY_RATE_DEFAULT's own comment.
  phoneDisplaceDamping: 0.25,
  // Exposed as sliders 2026-10-01 (previously hardcoded constants) -- see
  // PHONE_DISPLACE_VELOCITY_DECAY_RATE_DEFAULT's own comment for the full
  // reasoning. Defaults match the prior hardcoded values exactly, so
  // nothing changes until these are retuned.
  phoneDisplaceVelDecayRate: 3.0, phoneDisplacePosDecayRate: 0.08,
  // Stationary gate -- added 2026-10-01, see integratePhoneDisplacement()'s
  // own comment for the full root-cause account (orientation-sensor
  // settling leaking into gravity subtraction, producing a slow drift a
  // constant-bias filter can't fully cancel). Default ON, 2.0 deg/s --
  // comfortably above the ~0 deg/s this project's own real "static" tests
  // show and comfortably below the 5-90 deg/s range its own real
  // deliberate-motion tests show.
  phoneDisplaceStationaryGateEnabled: true, phoneDisplaceStationaryGateDegPerSec: 2.0,
  // ZUPT upgrade -- added 2026-10-01, direct report with real device
  // data: persistent position drift while physically stationary, even
  // with phoneDisplacePosDecayRate manually set to 0 (no position
  // self-correction at all). Root cause, confirmed by tracing the real
  // code (not assumed from comments): the gate above only ever
  // SUPPRESSES new acceleration input when gyro is quiet -- it never
  // forces existing residual VELOCITY to zero, so any leftover velocity
  // from a brief gyro-threshold miss (real hand tremor, or any tick
  // where e.rotationRate is momentarily unavailable) keeps adding to
  // position every tick with nothing to correct it. These 2 new
  // controls turn the existing gate into a real Zero-Velocity-Update
  // (ZUPT, the standard INS/dead-reckoning technique): an acceleration-
  // magnitude criterion ALONGSIDE the existing gyro one (both required,
  // not either/or -- matching the direct spec: "gyro angular speed
  // below a threshold" AND "linear acceleration magnitude sufficiently
  // close to zero"), confirmed for this short dwell before actually
  // forcing velocity to exactly 0 (so one noisy quiet-looking sample
  // mid-motion can't trigger it). Default accel threshold (0.6 m/s^2)
  // sits comfortably above the ~0.2-0.4 m/s^2 noise ceiling observed in
  // this project's own real "stationary" test logs, comfortably below
  // real deliberate-motion readings (1-6+ m/s^2 in this project's own
  // logged tests). Dwell default (150ms) is a judgment call, not a
  // measurement -- short enough to feel instant, long enough to reject
  // one single noisy tick.
  phoneDisplaceZuptAccelThresholdMps2: 0.6, phoneDisplaceZuptDwellMs: 150,
  // Per-axis Min/Max Range + Curve + X Reference -- added 2026-10-01,
  // direct request ("Make me a displacement min max slider and a curved
  // editor for all 3 axes") then refined ("x to be recorded... displacement
  // distance, and y is output percentage.. that way i can filter out
  // small unintentional movements"). Replaces the old single SHARED
  // Range/Curve (phoneResponsiveDisplaceRange/Curve, removed -- its own
  // dev-panel UI row had already been lost in an unrelated cleanup pass
  // earlier this session, confirmed via grep before removing: no addRow()
  // anywhere still referenced it). X Reference replaces the old hardcoded
  // PHONE_DISPLACE_REFERENCE_METERS constant -- the real displacement
  // distance (meters) that reads as curve-X=1.0 (100%) -- now one
  // independently-tunable value per axis instead of one constant shared
  // by all 3. Default 0.35 matches the old shared constant exactly, so
  // nothing changes until these are retuned. See
  // computePhoneDisplaceAxisUnits()'s own comment for the full formula.
  phoneDisplaceRangeX: '{"min":0,"max":20}', phoneDisplaceCurveX: '{"points":[{"x":0,"y":0},{"x":1,"y":1}],"method":"monotone"}', phoneDisplaceXReferenceM: 0.35,
  phoneDisplaceRangeY: '{"min":0,"max":20}', phoneDisplaceCurveY: '{"points":[{"x":0,"y":0},{"x":1,"y":1}],"method":"monotone"}', phoneDisplaceYReferenceM: 0.35,
  phoneDisplaceRangeZ: '{"min":0,"max":20}', phoneDisplaceCurveZ: '{"points":[{"x":0,"y":0},{"x":1,"y":1}],"method":"monotone"}', phoneDisplaceZReferenceM: 0.35,
  // Virtual Screen / RECURSIVE RENDER -- direct request 2026-09-29:
  // render the app's own 3D scene onto the phone GLB's 'Screen Face'
  // mesh, recursion-capped (see renderVirtualScreen()'s own comment for
  // the mechanism) so the screen-showing-itself effect can never
  // actually recurse infinitely.
  screenRenderEnabled: false,
  screenRecursionLevels: 3,
  // Percent of the base 384x768 capture resolution -- direct request
  // 2026-09-29 for a quality/performance control, since a full N-pass
  // render every frame at full resolution is real GPU cost. 100 = base.
  screenRenderResolution: 100,
  // Texture transform controls -- direct request 2026-09-29: Scale
  // (uniform), Rotation, and independent X/Y Scale, applied to the
  // captured render's own UV mapping on the Screen Face mesh (not the
  // mesh's geometry) via THREE.Texture's built-in repeat/rotation/
  // center. "To Scale" (see below) computes X/Y Scale automatically and
  // locks their sliders, instead of the user tuning them by hand.
  screenTextureScale: 1, screenTextureRotation: 0,
  screenTextureOffsetX: 0, screenTextureOffsetY: 0,
  screenTextureOffsetXMobile: 0, screenTextureOffsetYMobile: 0,
  screenTextureOffsetXLandscape: 0, screenTextureOffsetYLandscape: 0,
  screenTextureScaleX: 1, screenTextureScaleY: 1,
  screenTextureScaleXMobile: 1, screenTextureScaleYMobile: 1,
  screenTextureScaleXLandscape: 1, screenTextureScaleYLandscape: 1,
  // Per-Level Scale (Min/Max + Curve) -- direct request 2026-09-29:
  // "provide a min max scale slider and a curve editor. The min max
  // will determine the min max scale of successive renders. The curve
  // editor will determine the xy relationship. X is the number of
  // recursive levels... Y is the scale applied to that render at that
  // level." Multiplies into the base Texture Scale (screenTextureScale
  // above) rather than replacing it -- see
  // computeScreenLevelScale()'s own comment. Default min=max=1 (no
  // per-level variation) so this is a no-op until deliberately tuned.
  screenLevelScaleRange: '{"min":1,"max":1}',
  screenLevelScaleCurve: '{"points":[{"x":0,"y":0},{"x":1,"y":1}],"method":"linear"}',
  // Emission Intensity -- direct report 2026-09-29: "When i use the
  // Pixel 9A model, the screen is very dim." phoneScreenRenderMaterial
  // is an unlit MeshBasicMaterial (its .map is the recursive render's
  // own captured texture) -- true .emissive/.emissiveIntensity don't
  // exist on that material type at all (that's a MeshStandard/Physical/
  // Lambert/Phong-only property), so this multiplies MeshBasicMaterial's
  // own .color instead, which has the same practical effect (brightens
  // the rendered texture, can exceed 1x since color multiplication isn't
  // clamped to the source texture's own captured brightness).
  screenEmissionIntensity: 1,
  // Mirror Alternating X/Y -- direct request 2026-09-29, replacing a
  // blind constant UV-mirror fix that a direct follow-up report
  // confirmed didn't actually resolve it: "im still getting the issue
  // o the render mirroring every other screen." See
  // applyScreenTextureTransform()'s own comment for the parity logic.
  screenMirrorAlternatingX: false, screenMirrorAlternatingY: false,
  // Mirror order/phase -- direct request 2026-09-29: "add 2 checkboxes,
  // 1 for each axis. It will determine the mirroring order. so if off,
  // it maybe 010101, when on it will be 101010 etc." Only meaningful
  // while the matching Alternating checkbox above is also on -- flips
  // which depths (odd vs even) are the mirrored ones.
  screenMirrorPhaseX: false, screenMirrorPhaseY: false,
  // "To Scale" -- direct report: "whenever my actual browser size is
  // different from the model mesh size, the rendered image gets scaled
  // incorrectly." CORRECTED 2026-09-29, direct clarification: "When i
  // said To Scale, i meant that regardless of my browser dimensions
  // and the displayed model's screen dimensions, the rendered images
  // will always be correctly scaled in terms of X to Y." The original
  // fix only corrected for camera-aspect vs. the render target's own
  // FIXED buffer aspect (SCREEN_RENDER_BASE_WIDTH/HEIGHT) -- it never
  // accounted for each phone model's own real screen shape at all,
  // which is what was still visibly stretching the result. When on,
  // X/Y Scale are computed each frame from the LIVE camera aspect vs.
  // each model's own real screen UV aspect (phoneScreenUvAspect -- see
  // applyScreenTextureTransform()) instead of the slider values, and
  // those 2 sliders are locked (disabled) in the dev panel.
  screenToScaleEnabled: false,
  // Per-axis Min/Max Range + Curve -- added 2026-10-01, direct request
  // ("Make me a displacement min max slider and a curved editor for all
  // 3 axes. Do the same for the rotation"). Replaces the old single
  // SHARED phoneResponsiveRotationRange/Curve (one magnitude, evaluated
  // from the COMBINED radial tilt distance, then split proportionally
  // between X/Y by direction cosine) with 3 genuinely independent
  // curves -- X (beta/up-down) evaluated from ny directly, Y (gamma/
  // left-right) from nx, Z (spin) from nx too (its own separate
  // mechanism, unchanged). No per-axis "Reference" slider the way
  // Displace needed one -- unlike Displace's raw METERS (no natural
  // 0-1 range), Rotation's raw nx/ny are already normalized tilt
  // values (0-1, from cursor-distance/tiltMagnitude), so the curve's
  // own X axis already reads directly as "how far tilted," matching
  // the X="recorded... rotation" half of the clarification.
  //
  // CORRECTED 2026-10-01, direct request: "make the input form 0
  // upwards. if i set it to 30, assume it means -30 to 30. Set default
  // to 90." `min` is effectively always 0 now (the range-bar's own
  // track no longer offers negative values -- see its UI row's own
  // trackMin, renderPhoneModelGroup()) -- a single degree value the
  // user sets as `max` is understood as the SYMMETRIC output ceiling
  // in both directions, which the existing magnitude-then-sign formula
  // (computePhoneResponsiveAxisDeg()) already produces: `max` is the
  // largest magnitude the curve can output, applied with
  // Math.sign(rawComponent) -- so max=30 already meant "-30 to 30" in
  // effect even before this correction; what changed is the UI no
  // longer lets `min` go negative (which was never a meaningful degree
  // value anyway) and the default moved from 30 to 90. Curve-editor X
  // (0-1, raw tilt magnitude) is unaffected by this change -- it
  // already applies identically regardless of tilt direction, which is
  // what "the same applies to the curve editor, so X applies to both"
  // confirms, not a new behavior to build.
  phoneRotationRangeX: '{"min":0,"max":90}', phoneRotationCurveX: '{"points":[{"x":0,"y":0},{"x":1,"y":1}],"method":"catmullrom"}',
  phoneRotationRangeY: '{"min":0,"max":90}', phoneRotationCurveY: '{"points":[{"x":0,"y":0},{"x":1,"y":1}],"method":"catmullrom"}',
  phoneRotationRangeZ: '{"min":0,"max":90}', phoneRotationCurveZ: '{"points":[{"x":0,"y":0},{"x":1,"y":1}],"method":"catmullrom"}',
  // Debug > Object Axes -- ported from 3JS ENGINE's own feature (see that
  // project's src/main.js, "World Axes / Object Axes visualization").
  objectAxesEnabled: false, objectAxesRenderInFront: false,
  objectAxesThickness: 2, objectAxesLength: 40
}

// ---------------------------------------------------------------------
// Saved presets — seeded from the caller's own exported data.
// ---------------------------------------------------------------------
const SAVED_POSES = [
  {"name":"Big Open Palm","thumbCurl":0,"thumbSplay":-48,"thumbSplay2":-8,"curlBiasThumb":0,"baseOnlyCurlThumb":-61,"midOnlyCurlThumb":0,"tipOnlyCurlThumb":0,"tipTwistThumb":0,"curlIndex":0,"splayIndex":-68,"splayIndex2":0,"curlBiasIndex":0,"baseOnlyCurlIndex":0,"midOnlyCurlIndex":-5,"tipOnlyCurlIndex":0,"tipTwistIndex":0,"curlMiddle":0,"splayMiddle":-6,"splayMiddle2":0,"curlBiasMiddle":0,"baseOnlyCurlMiddle":0,"midOnlyCurlMiddle":-5,"tipOnlyCurlMiddle":0,"tipTwistMiddle":0,"curlRing":0,"splayRing":-34,"splayRing2":0,"curlBiasRing":0,"baseOnlyCurlRing":0,"midOnlyCurlRing":-5,"tipOnlyCurlRing":0,"tipTwistRing":0,"curlPinky":0,"splayPinky":86,"splayPinky2":0,"curlBiasPinky":0,"baseOnlyCurlPinky":0,"midOnlyCurlPinky":-5,"tipOnlyCurlPinky":0,"tipTwistPinky":0,"wristBend":0,"wristSplay":0,"modelRotX":0,"modelRotY":0,"modelRotZ":0,"hideWrist":78,"poseOffsetX":0,"poseOffsetY":0,"poseOffsetZ":0,"poseScale":1},
  {"name":"Big Open Palm (S)","thumbCurl":0,"thumbSplay":-48,"thumbSplay2":-8,"curlBiasThumb":0,"baseOnlyCurlThumb":-61,"midOnlyCurlThumb":0,"tipOnlyCurlThumb":0,"tipTwistThumb":0,"curlIndex":0,"splayIndex":-68,"splayIndex2":0,"curlBiasIndex":0,"baseOnlyCurlIndex":0,"midOnlyCurlIndex":-5,"tipOnlyCurlIndex":0,"tipTwistIndex":0,"curlMiddle":0,"splayMiddle":-6,"splayMiddle2":0,"curlBiasMiddle":0,"baseOnlyCurlMiddle":0,"midOnlyCurlMiddle":-5,"tipOnlyCurlMiddle":0,"tipTwistMiddle":0,"curlRing":0,"splayRing":-34,"splayRing2":0,"curlBiasRing":0,"baseOnlyCurlRing":0,"midOnlyCurlRing":-5,"tipOnlyCurlRing":0,"tipTwistRing":0,"curlPinky":0,"splayPinky":86,"splayPinky2":0,"curlBiasPinky":0,"baseOnlyCurlPinky":0,"midOnlyCurlPinky":-5,"tipOnlyCurlPinky":0,"tipTwistPinky":0,"wristBend":0,"wristSplay":-55,"modelRotX":0,"modelRotY":0,"modelRotZ":0,"hideWrist":78,"poseOffsetX":0,"poseOffsetY":0,"poseOffsetZ":0,"poseScale":1},
  {"name":"Fist","thumbCurl":75,"thumbSplay":42,"thumbSplay2":13,"curlBiasThumb":32,"baseOnlyCurlThumb":-23,"midOnlyCurlThumb":-8,"tipOnlyCurlThumb":20,"tipTwistThumb":46,"curlIndex":90,"splayIndex":18,"splayIndex2":0,"curlBiasIndex":-8,"baseOnlyCurlIndex":6,"midOnlyCurlIndex":0,"tipOnlyCurlIndex":-1,"tipTwistIndex":0,"curlMiddle":92,"splayMiddle":-15,"splayMiddle2":0,"curlBiasMiddle":0,"baseOnlyCurlMiddle":-4,"midOnlyCurlMiddle":0,"tipOnlyCurlMiddle":-1,"tipTwistMiddle":0,"curlRing":98,"splayRing":40,"splayRing2":0,"curlBiasRing":0,"baseOnlyCurlRing":-15,"midOnlyCurlRing":0,"tipOnlyCurlRing":6,"tipTwistRing":0,"curlPinky":88,"splayPinky":-90,"splayPinky2":25,"curlBiasPinky":0,"baseOnlyCurlPinky":0,"midOnlyCurlPinky":0,"tipOnlyCurlPinky":15,"tipTwistPinky":0,"wristBend":0,"wristSplay":0,"modelRotX":0,"modelRotY":0,"modelRotZ":0,"hideWrist":78,"poseOffsetX":0,"poseOffsetY":0,"poseOffsetZ":0,"poseScale":1},
  {"name":"Fist - Bent Back","thumbCurl":75,"thumbSplay":42,"thumbSplay2":13,"curlBiasThumb":32,"baseOnlyCurlThumb":-23,"midOnlyCurlThumb":-8,"tipOnlyCurlThumb":20,"tipTwistThumb":46,"curlIndex":90,"splayIndex":18,"splayIndex2":0,"curlBiasIndex":-8,"baseOnlyCurlIndex":6,"midOnlyCurlIndex":0,"tipOnlyCurlIndex":-1,"tipTwistIndex":0,"curlMiddle":92,"splayMiddle":-15,"splayMiddle2":0,"curlBiasMiddle":0,"baseOnlyCurlMiddle":-4,"midOnlyCurlMiddle":0,"tipOnlyCurlMiddle":-1,"tipTwistMiddle":0,"curlRing":98,"splayRing":40,"splayRing2":0,"curlBiasRing":0,"baseOnlyCurlRing":-15,"midOnlyCurlRing":0,"tipOnlyCurlRing":6,"tipTwistRing":0,"curlPinky":88,"splayPinky":-90,"splayPinky2":25,"curlBiasPinky":0,"baseOnlyCurlPinky":0,"midOnlyCurlPinky":0,"tipOnlyCurlPinky":15,"tipTwistPinky":0,"wristBend":0,"wristSplay":-50,"modelRotX":0,"modelRotY":0,"modelRotZ":0,"hideWrist":78,"poseOffsetX":0,"poseOffsetY":0,"poseOffsetZ":0,"poseScale":1}
]
// FRONTOS's own "tz" was -314.71 (every other entry here shares the same
// -1.789 target) -- confirmed as bad seed data, not a real distinct
// target: harmless under the OLD applyCameraPreset() (which only ever
// used tx/ty/tz to derive a DIRECTION, discarding the actual magnitude),
// but produced a badly-framed close-up view once applyCameraPreset() was
// fixed to restore the literal saved transform (2026-09-21) -- FRONTOS is
// also DEFAULT_CAMERA_NAME, so this was visible on every fresh page load.
// Corrected to match every other camera's shared target point.
const SAVED_CAMERAS = [
  {"name":"Front-Straightened","x":-0.6588710648813576,"y":21.03987225085262,"z":61.163231799331065,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32},
  {"name":"Top","x":2.66896914517113,"y":97.11147444693532,"z":7.815146933748445,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32},
  {"name":"Right","x":65.88319083347677,"y":41.967250857145764,"z":-5.881337000872083,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32},
  {"name":"Left","x":65.88319083347677,"y":41.967250857145764,"z":-5.881337000872083,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32},
  {"name":"Front","x":3.5526427374650176,"y":36.76541698494362,"z":62.37681969375567,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32},
  {"name":"Behind","x":-2.105471271806241,"y":41.54324641652082,"z":-65.39766111787976,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32},
  {"name":"FRONTOS","x":3.598517809628556,"y":31.35475415298584,"z":60.28634317626074,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32}
]
const SAVED_LIGHTING = [
  {"name":"FLABOVE","keyAzimuth":147,"keyElevation":66,"keyTargetHeight":54,"keyIntensity":6,"keyColor":"#ffffff","ambientIntensity":0,"ambientSkyColor":"#ffffff","ambientGroundColor":"#3a2f2a"},
  {"name":"2 Tone - FlatBehind","keyAzimuth":71,"keyElevation":7,"keyTargetHeight":100,"keyIntensity":6,"keyColor":"#ffffff","ambientIntensity":0,"ambientSkyColor":"#ffffff","ambientGroundColor":"#3a2f2a"},
  {"name":"2 Tone - Flabove","keyAzimuth":117,"keyElevation":56,"keyTargetHeight":71,"keyIntensity":6,"keyColor":"#ffffff","ambientIntensity":0,"ambientSkyColor":"#ffffff","ambientGroundColor":"#3a2f2a"},
  {"name":"2 Tone - SidePink","keyAzimuth":439,"keyElevation":-3,"keyTargetHeight":-18,"keyIntensity":6,"keyColor":"#ffffff","ambientIntensity":0,"ambientSkyColor":"#ffffff","ambientGroundColor":"#3a2f2a"},
  {"name":"2 Tone - SideThub","keyAzimuth":138,"keyElevation":69,"keyTargetHeight":79,"keyIntensity":6,"keyColor":"#ffffff","ambientIntensity":0,"ambientSkyColor":"#ffffff","ambientGroundColor":"#3a2f2a"},
  {"name":"2 Tone - Flabbehind","keyAzimuth":114,"keyElevation":76,"keyTargetHeight":-100,"keyIntensity":6,"keyColor":"#ffffff","ambientIntensity":0,"ambientSkyColor":"#ffffff","ambientGroundColor":"#3a2f2a"},
  {"name":"behind thumb drag","keyAzimuth":60,"keyElevation":38,"keyTargetHeight":106,"keyIntensity":6,"keyColor":"#ffffff","ambientIntensity":0,"ambientSkyColor":"#ffffff","ambientGroundColor":"#3a2f2a"}
]
const SAVED_TWEEN_SEQUENCES = []
const SAVED_TOON = []
const DEFAULT_POSE_NAME = 'Fist'
const DEFAULT_CAMERA_NAME = 'FRONTOS'
const DEFAULT_LIGHTING_NAME = 'FLABOVE'

// Restore any locally-saved list-picker edits (Saved Poses/Cameras/
// Lighting/Toon Shading/Tween Sequences) over the hardcoded seed data
// above, synchronously, before anything else in this module reads these
// arrays -- see persistListPickerItems()/loadListPickerItemsFromLocalStorage()
// (defined further down, but function declarations are hoisted within
// this module's scope so calling them here is safe) for the full account
// of the bug this fixes. Remote (git-synced) restore happens separately,
// asynchronously, alongside the other loadFieldDefaultIfSaved() calls.
loadListPickerItemsFromLocalStorage('poses', SAVED_POSES)
loadListPickerItemsFromLocalStorage('cameras', SAVED_CAMERAS)
loadListPickerItemsFromLocalStorage('lighting', SAVED_LIGHTING)
loadListPickerItemsFromLocalStorage('toon', SAVED_TOON)
loadListPickerItemsFromLocalStorage('tweenSequences', SAVED_TWEEN_SEQUENCES)

// ---------------------------------------------------------------------
// Finger rig constants — ported verbatim from HANDY DANDIES (same GLB
// asset/rig; see that project's CLAUDE.md for the sign/axis history).
// ---------------------------------------------------------------------
const WORLD_X_AXIS = new THREE.Vector3(1, 0, 0)
const WORLD_Y_AXIS = new THREE.Vector3(0, 1, 0)
const WORLD_Z_AXIS = new THREE.Vector3(0, 0, 1)
const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky']
const FINGER_JOINTS = {
  thumb: ['rThumb1', 'rThumb2', 'rThumb3'], index: ['rIndex1', 'rIndex2', 'rIndex3'],
  middle: ['rMid1', 'rMid2', 'rMid3'], ring: ['rRing1', 'rRing2', 'rRing3'], pinky: ['rPinky1', 'rPinky2', 'rPinky3']
}
const FINGER_MAX_DEG = { thumb: [45, 55, 45], index: [90, 100, 70], middle: [90, 100, 70], ring: [90, 100, 70], pinky: [90, 100, 70] }
const FINGER_SIGN = { thumb: -1, index: 1, middle: 1, ring: 1, pinky: 1 }
const FINGER_CURL_AXIS = { thumb: WORLD_Y_AXIS, index: WORLD_X_AXIS, middle: WORLD_X_AXIS, ring: WORLD_X_AXIS, pinky: WORLD_X_AXIS }
const FINGER_SPLAY_AXIS = { thumb: WORLD_Z_AXIS, index: WORLD_Z_AXIS, middle: WORLD_Z_AXIS, ring: WORLD_Z_AXIS, pinky: WORLD_Z_AXIS }
const FINGER_SPLAY_SIGN = { thumb: 1, index: 1, middle: 1, ring: -1, pinky: 1 }
const FINGER_SPLAY_MAX_DEG = { thumb: 45, index: 30, middle: 30, ring: 30, pinky: 30 }
const FINGER_SPLAY_JOINT_INDEX = { thumb: 1, index: 0, middle: 0, ring: 0, pinky: 0 }
const FINGER_SPLAY2_JOINT_INDEX = { thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 }
const FINGER_SPLAY2_AXIS = { thumb: WORLD_X_AXIS, index: WORLD_Z_AXIS, middle: WORLD_Z_AXIS, ring: WORLD_Z_AXIS, pinky: WORLD_Z_AXIS }
const FINGER_SPLAY2_MAX_DEG = { thumb: 90, index: 30, middle: 30, ring: 30, pinky: 30 }
const FINGER_SPLAY2_SIGN = { thumb: 1, index: 1, middle: 1, ring: -1, pinky: 1 }
const FINGER_SPLAY2_KEY = { thumb: 'thumbSplay2', index: 'splayIndex2', middle: 'splayMiddle2', ring: 'splayRing2', pinky: 'splayPinky2' }
const FINGER_CURL_KEY = { thumb: 'thumbCurl', index: 'curlIndex', middle: 'curlMiddle', ring: 'curlRing', pinky: 'curlPinky' }
const FINGER_SPLAY_KEY = { thumb: 'thumbSplay', index: 'splayIndex', middle: 'splayMiddle', ring: 'splayRing', pinky: 'splayPinky' }
const FINGER_CURL_BIAS_KEY = { thumb: 'curlBiasThumb', index: 'curlBiasIndex', middle: 'curlBiasMiddle', ring: 'curlBiasRing', pinky: 'curlBiasPinky' }
const FINGER_TIP_TWIST_KEY = { thumb: 'tipTwistThumb', index: 'tipTwistIndex', middle: 'tipTwistMiddle', ring: 'tipTwistRing', pinky: 'tipTwistPinky' }
const FINGER_BASE_ONLY_CURL_KEY = { thumb: 'baseOnlyCurlThumb', index: 'baseOnlyCurlIndex', middle: 'baseOnlyCurlMiddle', ring: 'baseOnlyCurlRing', pinky: 'baseOnlyCurlPinky' }
const FINGER_TIP_ONLY_CURL_KEY = { thumb: 'tipOnlyCurlThumb', index: 'tipOnlyCurlIndex', middle: 'tipOnlyCurlMiddle', ring: 'tipOnlyCurlRing', pinky: 'tipOnlyCurlPinky' }
const FINGER_MID_ONLY_CURL_KEY = { thumb: 'midOnlyCurlThumb', index: 'midOnlyCurlIndex', middle: 'midOnlyCurlMiddle', ring: 'midOnlyCurlRing', pinky: 'midOnlyCurlPinky' }
const FINGER_TIP_TWIST_MAX_DEG = 90

// =======================================================================
// Finger Gizmos -- VISUAL ONLY (confirmed with the user: markers + axis
// lines at every joint, no TransformControls/click-to-drag/CCD-IK).
// Ported conceptually from HANDO's own real setupFingerGizmos()/
// updateJointMarker()/getFingerTipWorldPosition() (read directly from
// J:\CLAUDE\PROJECTS\HANDO\src\main.js, not reconstructed) -- same
// per-joint marker + tip-offset-for-the-last-joint approach, minus the
// TransformControls/IK machinery HANDO also has. Axis Length/Thickness
// sliders are this project's own addition, not present in HANDO's
// version, per direct request ("also provide 3 lines depicting the 3
// axes at points that have them... a slider... for the length... a
// slider to control the thickness").
// -----------------------------------------------------------------------
const FINGER_GIZMO_TIP_LENGTH_FACTOR = 0.6 // matches HANDO's own constant
const fingerGizmoTipLocalOffset = {} // per finger name, computed once (bone rest lengths are shared across every hand -- same model)
const _gizmoTipWorldPos = new THREE.Vector3()
const _gizmoBoneWorldQuat = new THREE.Quaternion()
const _gizmoAxisDir = new THREE.Vector3()
const _gizmoAxisMid = new THREE.Vector3()
const GIZMO_AXIS_COLORS = { x: 0xff0000, y: 0x00ff00, z: 0x0000ff } // three.js's own gizmo convention, matching HANDO's own comment
const fingerGizmoMarkerGeo = new THREE.SphereGeometry(1, 12, 12)
// Unit cylinder along its own local Y, radius 1 -- scaled per-instance to
// (thickness, length, thickness) and rotated so local Y aligns with the
// target world axis direction.
const fingerGizmoAxisGeo = new THREE.CylinderGeometry(1, 1, 1, 8)

function jointKey(finger, jointIndex) { return `${finger}#${jointIndex}` }
function isTipJoint(finger, jointIndex) { return jointIndex === FINGER_JOINTS[finger].length - 1 }

// Called once, after the model loads -- bone REST lengths are identical
// across every hand (all clones of the same model), so this is computed
// globally, not per-hand.
function computeFingerGizmoTipOffsets(skeleton) {
  FINGER_NAMES.forEach((name) => {
    const joints = FINGER_JOINTS[name]
    const lastBone = skeleton.getBoneByName(joints[joints.length - 1])
    if (!lastBone) return
    fingerGizmoTipLocalOffset[name] = new THREE.Vector3(0, lastBone.position.length() * FINGER_GIZMO_TIP_LENGTH_FACTOR, 0)
  })
}
function getFingerGizmoTipWorldPosition(skeleton, name, target) {
  const joints = FINGER_JOINTS[name]
  const lastBone = skeleton.getBoneByName(joints[joints.length - 1])
  return target.copy(fingerGizmoTipLocalOffset[name] || new THREE.Vector3()).applyMatrix4(lastBone.matrixWorld)
}

// Builds the 15 markers + 45 axis-line cylinders for ONE hand, stored
// directly on that hand's own entry (mirrors how clipPlane/
// currentBaseQuat etc. are already stored per-hand) -- added to `scene`
// directly (like HANDO's own markers), NOT parented under h.wrapper/
// h.clone, so their own transform is set purely from each bone's live
// matrixWorld each frame with no double-transformation risk.
function setupFingerGizmosForHand(handEntry) {
  handEntry.gizmoMarkers = {}
  handEntry.gizmoAxisLines = {}
  FINGER_NAMES.forEach((finger) => {
    FINGER_JOINTS[finger].forEach((_, jointIndex) => {
      const marker = new THREE.Mesh(fingerGizmoMarkerGeo, new THREE.MeshBasicMaterial({ color: cfg.fingerGizmoColor, depthTest: false, transparent: true, opacity: 0.9 }))
      marker.renderOrder = 999
      marker.visible = false
      scene.add(marker)
      handEntry.gizmoMarkers[jointKey(finger, jointIndex)] = marker

      const axes = {}
      ;['x', 'y', 'z'].forEach((axis) => {
        const line = new THREE.Mesh(fingerGizmoAxisGeo, new THREE.MeshBasicMaterial({ color: GIZMO_AXIS_COLORS[axis], depthTest: false, transparent: true, opacity: 0.9 }))
        line.renderOrder = 999
        line.visible = false
        scene.add(line)
        axes[axis] = line
      })
      handEntry.gizmoAxisLines[jointKey(finger, jointIndex)] = axes
    })
  })
}
// Removes one hand's own gizmo meshes from the scene -- called from
// rebuildField() before the old `hands` array is discarded, since these
// meshes are NOT parented under h.wrapper (removing the wrapper alone
// would leak them into the scene forever otherwise).
function teardownFingerGizmosForHand(handEntry) {
  if (handEntry.gizmoMarkers) Object.values(handEntry.gizmoMarkers).forEach((m) => scene.remove(m))
  if (handEntry.gizmoAxisLines) Object.values(handEntry.gizmoAxisLines).forEach((axes) => Object.values(axes).forEach((m) => scene.remove(m)))
}

const _gizmoWorldAxisX = new THREE.Vector3(), _gizmoWorldAxisY = new THREE.Vector3(), _gizmoWorldAxisZ = new THREE.Vector3()
const _gizmoAlignQuat = new THREE.Quaternion()
const _gizmoUnitY = new THREE.Vector3(0, 1, 0)
function updateFingerGizmoJoint(handEntry, finger, jointIndex) {
  const marker = handEntry.gizmoMarkers[jointKey(finger, jointIndex)]
  const axes = handEntry.gizmoAxisLines[jointKey(finger, jointIndex)]
  const bone = handEntry.skinnedMesh.skeleton.getBoneByName(FINGER_JOINTS[finger][jointIndex])
  if (!bone) return
  if (isTipJoint(finger, jointIndex)) marker.position.copy(getFingerGizmoTipWorldPosition(handEntry.skinnedMesh.skeleton, finger, _gizmoTipWorldPos))
  else marker.position.setFromMatrixPosition(bone.matrixWorld)
  bone.getWorldQuaternion(_gizmoBoneWorldQuat)
  marker.quaternion.copy(_gizmoBoneWorldQuat)
  marker.scale.setScalar(cfg.fingerGizmoSize)
  marker.material.color.set(cfg.fingerGizmoColor)

  _gizmoWorldAxisX.set(1, 0, 0).applyQuaternion(_gizmoBoneWorldQuat)
  _gizmoWorldAxisY.set(0, 1, 0).applyQuaternion(_gizmoBoneWorldQuat)
  _gizmoWorldAxisZ.set(0, 0, 1).applyQuaternion(_gizmoBoneWorldQuat)
  const dirs = { x: _gizmoWorldAxisX, y: _gizmoWorldAxisY, z: _gizmoWorldAxisZ }
  ;['x', 'y', 'z'].forEach((axisName) => {
    const line = axes[axisName]
    const dir = dirs[axisName]
    // The cylinder extends FROM the joint outward along `dir` -- its own
    // local Y (the geometry's default axis) is rotated to align with
    // `dir`, and its center is offset by half the length so its BASE
    // (not center) sits at the joint.
    _gizmoAlignQuat.setFromUnitVectors(_gizmoUnitY, dir)
    line.quaternion.copy(_gizmoAlignQuat)
    line.position.copy(marker.position).addScaledVector(dir, cfg.fingerGizmoAxisLength / 2)
    line.scale.set(cfg.fingerGizmoAxisThickness, cfg.fingerGizmoAxisLength, cfg.fingerGizmoAxisThickness)
  })
}
function updateAllFingerGizmos() {
  if (!cfg.fingerGizmosEnabled) return
  hands.forEach((h) => {
    if (!h.gizmoMarkers) return
    FINGER_NAMES.forEach((finger) => FINGER_JOINTS[finger].forEach((_, i) => updateFingerGizmoJoint(h, finger, i)))
  })
}
function setFingerGizmosVisible(v) {
  hands.forEach((h) => {
    if (h.gizmoMarkers) Object.values(h.gizmoMarkers).forEach((m) => { m.visible = v })
    if (h.gizmoAxisLines) Object.values(h.gizmoAxisLines).forEach((axes) => Object.values(axes).forEach((m) => { m.visible = v }))
  })
  if (v) updateAllFingerGizmos()
}

const POSE_KEY_DEFAULTS = {}
FINGER_NAMES.forEach((f) => {
  POSE_KEY_DEFAULTS[FINGER_CURL_KEY[f]] = 0; POSE_KEY_DEFAULTS[FINGER_SPLAY_KEY[f]] = 0
  POSE_KEY_DEFAULTS[FINGER_SPLAY2_KEY[f]] = 0; POSE_KEY_DEFAULTS[FINGER_CURL_BIAS_KEY[f]] = 0
  POSE_KEY_DEFAULTS[FINGER_BASE_ONLY_CURL_KEY[f]] = 0; POSE_KEY_DEFAULTS[FINGER_MID_ONLY_CURL_KEY[f]] = 0
  POSE_KEY_DEFAULTS[FINGER_TIP_ONLY_CURL_KEY[f]] = 0; POSE_KEY_DEFAULTS[FINGER_TIP_TWIST_KEY[f]] = 0
})
Object.assign(POSE_KEY_DEFAULTS, {
  wristBend: 0, wristSplay: 0, wristRotation: 0, modelRotX: 0, modelRotY: 0, modelRotZ: 0,
  baseRotationX: 0, baseRotationY: 0, baseRotationZ: 0,
  hideWrist: 0, poseOffsetX: 0, poseOffsetY: 0, poseOffsetZ: 0, poseScale: 1
})
const POSE_PRESET_KEYS = Object.keys(POSE_KEY_DEFAULTS)
const CAMERA_PRESET_KEYS = ['cameraX', 'cameraY', 'cameraZ', 'cameraFov']
const LIGHTING_PRESET_KEYS = ['keyAzimuth', 'keyElevation', 'keyTargetHeight', 'keyIntensity', 'keyColor', 'ambientIntensity', 'ambientSkyColor', 'ambientGroundColor']

const FIST_POSE_INITIAL = SAVED_POSES.find((p) => p.name === DEFAULT_POSE_NAME) || SAVED_POSES[0]
Object.assign(cfg, POSE_KEY_DEFAULTS, FIST_POSE_INITIAL)

// rotateOnTrueWorldAxis — converts a rotation around a WORLD axis into the
// correct LOCAL delta for `bone`, exact for any existing local rotation.
// `excludeQuat`, when given, is factored out of the bone's world quaternion
// first (needed so a curl/splay axis stays anatomically fixed relative to
// the hand's own canonical pose, not wherever `wrapper` currently faces).
// Ported verbatim from HANDY DANDIES.
const _worldToLocalQuat = new THREE.Quaternion()
const _excludeQuatInv = new THREE.Quaternion()
const _localAxis = new THREE.Vector3()
// getBoneWorldQuaternionRobust -- added 2026-10-01 for the Mirror feature
// (handMirrorX/Y/Z). `bone.getWorldQuaternion()` internally calls
// `Matrix4.decompose()`, which -- whenever any ancestor's scale has a
// negative determinant (exactly what a mirror's per-axis sign flip on
// `h.clone.scale` produces) -- cannot represent the matrix's rotation as a
// pure quaternion, so it silently injects a SPURIOUS extra rotation to
// resolve the ambiguity (always negating the X-scale component
// specifically; a well-documented three.js quirk, also hit and fixed the
// same way by HANDO's own real 2nd-Hand mirror feature, read directly
// before implementing this). Using that corrupted "world quaternion" to
// convert FINGER_CURL_AXIS/SPLAY/SPLAY2 (fixed, canonical WORLD-space
// constants) into a bone's local frame would produce an essentially
// ARBITRARY local axis once mirrored -- not a sensible mirrored pose, a
// genuinely wrong one.
//
// Fixed by never going through matrixWorld/decompose for this at all: a
// LOCAL quaternion (an object's own rotation relative to its immediate
// parent) is a property of that one object alone and is NEVER affected by
// what scale sits anywhere in its ancestor chain. Composing every
// ancestor's LOCAL quaternion by hand, from the outermost ancestor down to
// `bone`, gives the mathematically correct world rotation unconditionally
// -- mirrored or not -- and is PROVABLY IDENTICAL to the plain
// `getWorldQuaternion()` result whenever no ancestor has non-uniform/
// negative scale (every case before this feature existed), so this is a
// zero-behavior-change replacement when no mirror is active. Verified via
// a standalone script before shipping -- see this file's own CHANGELOG
// entry for the exact test cases (curl/splay/twist drift with mirror off,
// and anatomical-correctness checks with each mirror axis on).
//
// Wrist Bend/Splay/Rotation (applyWristPoseToSkeleton(), bone.rotateX/Z/Y)
// and Tip Twist's segmentDirection() (getWorldPosition(), never
// getWorldQuaternion()) do NOT need this fix: wrist pose never references
// any fixed WORLD-space axis constant at all (it's pure local-axis
// rotation, already mirror-safe by construction), and getWorldPosition()'s
// own decompose() isn't subject to the same quirk (only rotation
// extraction is). Scoped to this one function, which is the ONLY place in
// the pose pipeline that converts a canonical world-space constant through
// a bone's actual (possibly-mirrored) world orientation.
const _worldQuatChain = []
function getBoneWorldQuaternionRobust(bone, target) {
  let n = 0
  let obj = bone
  while (obj) { _worldQuatChain[n++] = obj; obj = obj.parent }
  target.identity()
  for (let i = n - 1; i >= 0; i--) target.multiply(_worldQuatChain[i].quaternion)
  return target
}
function rotateOnTrueWorldAxis(bone, worldAxis, angle, excludeQuat) {
  getBoneWorldQuaternionRobust(bone, _worldToLocalQuat)
  if (excludeQuat) _worldToLocalQuat.premultiply(_excludeQuatInv.copy(excludeQuat).invert())
  _worldToLocalQuat.invert()
  _localAxis.copy(worldAxis).applyQuaternion(_worldToLocalQuat).normalize()
  bone.rotateOnAxis(_localAxis, angle)
}
function curlBiasWeight(jointIndex, jointCount, bias) {
  const p = jointIndex / (jointCount - 1)
  return 1 - bias * (2 * p - 1)
}
const _segFromPos = new THREE.Vector3()
const _segToPos = new THREE.Vector3()
const _segDir = new THREE.Vector3()
function segmentDirection(fromBone, toBone) {
  fromBone.getWorldPosition(_segFromPos); toBone.getWorldPosition(_segToPos)
  return _segDir.subVectors(_segToPos, _segFromPos).normalize()
}

// ---------------------------------------------------------------------
// Scene state populated once the GLB's bind pose is measured.
// ---------------------------------------------------------------------
let alignQuat = new THREE.Quaternion()
let handLengthRaw = 1
const boneRestQuat = {}
let wristPosRaw = new THREE.Vector3()
let forearmPosRaw = new THREE.Vector3()
let wristCropNormalAligned = null
const modelRotationPivot = new THREE.Vector3()
const sceneState = { fieldRadius: 10 }
let toonMaterial = null
let outlineMaterial = null
let modelRoot = null
let hands = [] // [{ wrapper, clone, skinnedMesh, outlineMesh, currentBaseQuat, clipPlane, row, col }, ...]
let hand = null // hands[0] — the "primary" hand: pose-editing reference frame, camera targeting, wireframe/tint toggles

function computeBaseScale() { return (8 / handLengthRaw) * cfg.handScale }

// ---------------------------------------------------------------------
// Reactive Arm Length + Responsive Wrist Splay — curve math, ported
// verbatim from HANDY DANDIES (see cfg's own declaration comment for the
// single-hand distance-input adaptation). `armLengthRangeParsed`/etc are
// parsed once (parse*Config(), called from each control's own onChange
// and once at startup) rather than JSON.parse'd every frame.
// ---------------------------------------------------------------------
let armLengthRangeParsed = { min: 0, max: 85 }
let armLengthCurveParsed = [{ x: 0, y: 1 }, { x: 1, y: 0 }]
let armLengthCurveMethod = 'catmullrom'
let wristSplayRangeParsed = { min: 5, max: -71 }
let wristSplayCurveParsed = [{ x: 0, y: 1 }, { x: 1, y: 0 }]
let wristSplayCurveMethod = 'catmullrom'
// Wrist axis clamps (safety ceiling on the FINAL combined angle, not a
// reactive curve's own range) — see cfg's own declaration comment.
let wristRotationClampParsed = { min: -360, max: 360 }
let wristBendClampParsed = { min: -90, max: 90 }
let wristSplayClampParsed = { min: -180, max: 180 }
const curveWidgetResyncs = []

// REMOVED 2026-09-28 -- catmullRomY/cubicBezier1D/bezierSegmentY/
// evaluateReactiveCurve (the hand-built curve math backing this file's
// own retired buildReactiveCurveWidget(), just below) are dead code now
// that all 12 curve/range fields are migrated to devPanel.js's own
// generic type:'curve-editor'/'range-bar' controls, which use their own
// window.evaluateCurveEditorPoints() instead (see each field's own
// "MIGRATED 2026-09-28" comment).
function parseArmLengthConfig() {
  try { armLengthRangeParsed = JSON.parse(cfg.armLengthRange) } catch (e) { /* keep last-good value */ }
  try { const parsed = JSON.parse(cfg.armLengthCurve); armLengthCurveParsed = (parsed.points || parsed).slice().sort((a, b) => a.x - b.x); armLengthCurveMethod = parsed.method || 'catmullrom' } catch (e) { /* keep last-good value */ }
}
function parseWristSplayConfig() {
  try { wristSplayRangeParsed = JSON.parse(cfg.wristSplayRange) } catch (e) { /* keep last-good value */ }
  try { const parsed = JSON.parse(cfg.wristSplayCurve); wristSplayCurveParsed = (parsed.points || parsed).slice().sort((a, b) => a.x - b.x); wristSplayCurveMethod = parsed.method || 'catmullrom' } catch (e) { /* keep last-good value */ }
}
function parseWristClampConfig() {
  try { wristRotationClampParsed = JSON.parse(cfg.wristRotationClampRange) } catch (e) { /* keep last-good value */ }
  try { wristBendClampParsed = JSON.parse(cfg.wristBendClampRange) } catch (e) { /* keep last-good value */ }
  try { wristSplayClampParsed = JSON.parse(cfg.wristSplayClampRange) } catch (e) { /* keep last-good value */ }
}
// A clamp range's own min/max handles can end up in either order (same
// as wristSplayRangeParsed/armLengthRangeParsed above, which are LERP
// endpoints, not true min<=max bounds) — normalize before clamping,
// since THREE.MathUtils.clamp() assumes min<=max and silently misbehaves
// otherwise.
function clampToRange(value, range) {
  const lo = Math.min(range.min, range.max), hi = Math.max(range.min, range.max)
  return THREE.MathUtils.clamp(value, lo, hi)
}
// Returns a 0-1 crop fraction (0 = full arm, 1 = fully cropped at wrist).
// `distanceT` is `tiltMagnitude` (0-1) — see cfg's own comment.
function computeArmLengthT(distanceT) {
  // Tracking Enabled is a master gate for this feature too (see the
  // matching note in animate()) -- Wrist Crop's own reactive amount must
  // not respond to tiltMagnitude when tracking itself is off.
  if (!cfg.trackingEnabled) return 0
  if (!cfg.cropWristEnabled) return 0
  if (!cfg.reactiveArmLengthEnabled) return cfg.hideWrist / 100
  const curveY = THREE.MathUtils.clamp(window.evaluateCurveEditorPoints(armLengthCurveParsed, distanceT, armLengthCurveMethod), 0, 1)
  const minT = armLengthRangeParsed.min / 100, maxT = armLengthRangeParsed.max / 100
  return minT + (maxT - minT) * curveY
}
// Returns the EXTRA wrist-splay rotation (degrees) on top of cfg.wristSplay.
function computeResponsiveWristSplayDeg(distanceT) {
  // Tracking Enabled is a master gate for this feature too (see the
  // matching note in animate()) -- Responsive Wrist Splay's own extra
  // splay must not respond to (or hold a stale) tiltMagnitude-driven
  // value when tracking itself is off.
  if (!cfg.trackingEnabled) return 0
  if (!cfg.wristSplayResponsiveEnabled) return 0
  if (!cfg.wristSplayReactiveEnabled) return cfg.wristSplayDefault
  const curveY = THREE.MathUtils.clamp(window.evaluateCurveEditorPoints(wristSplayCurveParsed, distanceT, wristSplayCurveMethod), 0, 1)
  const { min, max } = wristSplayRangeParsed
  return min + (max - min) * curveY
}
// Responsive Arm Rotation at Base -- see cfg's own declaration comment.
let baseArmRotationRangeParsed = { min: 0, max: 30 }
let baseArmRotationCurveParsed = [{ x: 0, y: 1 }, { x: 1, y: 0 }]
let baseArmRotationCurveMethod = 'catmullrom'
function parseBaseArmRotationConfig() {
  try { baseArmRotationRangeParsed = JSON.parse(cfg.baseArmRotationRange) } catch (e) { /* keep last-good value */ }
  try { const parsed = JSON.parse(cfg.baseArmRotationCurve); baseArmRotationCurveParsed = (parsed.points || parsed).slice().sort((a, b) => a.x - b.x); baseArmRotationCurveMethod = parsed.method || 'catmullrom' } catch (e) { /* keep last-good value */ }
}
// Returns the EXTRA rotation (degrees) to add onto cfg.baseRotationX --
// unlike computeArmLengthT/computeResponsiveWristSplayDeg above, a
// single On/Off checkbox gates the WHOLE feature here (no separate
// "reactive" sub-toggle or "default value when not reactive" -- see
// cfg's own comment for why), so baseArmRotationFineTune only has any
// effect while the feature itself is on.
function computeResponsiveBaseArmRotationDeg(distanceT) {
  if (!cfg.trackingEnabled) return 0
  if (!cfg.baseArmRotationResponsiveEnabled) return 0
  const curveY = THREE.MathUtils.clamp(window.evaluateCurveEditorPoints(baseArmRotationCurveParsed, distanceT, baseArmRotationCurveMethod), 0, 1)
  const { min, max } = baseArmRotationRangeParsed
  return min + (max - min) * curveY + (cfg.baseArmRotationFineTune || 0)
}
// Responsive Pose Tween -- see cfg's own declaration comment.
let poseTweenCurveParsed = [{ x: 0, y: 0 }, { x: 1, y: 1 }]
let poseTweenCurveMethod = 'catmullrom'
function parsePoseTweenConfig() {
  try { const parsed = JSON.parse(cfg.poseTweenCurve); poseTweenCurveParsed = (parsed.points || parsed).slice().sort((a, b) => a.x - b.x); poseTweenCurveMethod = parsed.method || 'catmullrom' } catch (e) { /* keep last-good value */ }
}
// Looks up a SAVED_POSES entry by name -- used by Responsive Pose
// Tween's Default (DEFAULT_POSE_NAME) and Target (cfg.poseTweenTargetPoseName)
// endpoints. "Default pose" reads as a NAMED pose (DEFAULT_POSE_NAME,
// parallel to Target Pose also being named) rather than a live snapshot
// of whatever's currently posed when the feature is turned on -- a
// disclosed interpretation choice: the request's own wording ("tween
// between the default pose and the target pose... the target pose is
// 100, and default is 0") reads naturally as 2 named endpoints, and a
// named default avoids needing a separate "snapshot captured at some
// arbitrary moment" mechanism this file doesn't otherwise have.
function findSavedPoseByName(name) {
  return SAVED_POSES.find((p) => p.name === name) || null
}

// Combined exclude-quaternion for applyCurlToSkeleton()'s own
// rotateOnTrueWorldAxis() calls — found live 2026-09-21, same round as
// the alignQuat-vs-h.currentBaseQuat fix above: fixing computeCurlAxisRefQuat()
// alone (making the curl AXIS direction itself modelRot-independent) was
// NOT sufficient. rotateOnTrueWorldAxis() separately reads
// `bone.getWorldQuaternion()` (the FULL wrapper*clone*bone-chain world
// orientation) and only ever excluded `wrapperQuat` from it — `h.clone`'s
// own modelRot rotation was still baked into THAT conversion, so even a
// correctly modelRot-independent `curlAxis` got converted into a
// modelRot-DEPENDENT local bone rotation. Both leaks needed fixing
// together (confirmed live: fixing only the first one left the bug just
// as visible, if not more so). `wrapperQuat` * `h.clone.quaternion`
// (matching the SAME composition order the scene graph actually uses —
// wrapper is clone's own parent) is what every applyCurlToSkeleton() call
// site now passes instead of `h.wrapper.quaternion` alone.
// CORRECTED 2026-09-26 -- this used to also multiply in `h.clone.quaternion`
// (baseQuat), which is WRONG and is the real root cause of "wrist moves,
// fingers point the wrong direction" (confirmed via direct algebra, cross-
// checked against HANDY DANDIES' own real, working equivalent call site --
// `applyCurlToSkeleton(fingerName, hand.skinnedMesh.skeleton, cloneBaseQuat,
// hand.wrapper.quaternion)` -- which passes `hand.wrapper.quaternion` ALONE,
// never combined with baseQuat).
//
// Why the combined version breaks: `rotateOnTrueWorldAxis()` reads a bone's
// TRUE world quaternion and divides out `excludeQuat` (this function's
// return value) BEFORE inverting to get a local axis. `computeCurlAxisRefQuat()`
// separately computes `axisRefQuat = baseQuat * Q * R^-1` (Q = wrist's
// current local quat, R = its rest local quat). For these 2 to correctly
// cancel down to a clean, wrist-orientation-INDEPENDENT local axis (the
// entire point of this mechanism -- verified algebraically, and confirmed
// live on HANDO at 0deg drift even with a substantial Whole-Hand Rotation
// active), `excludeQuat` must contain EXACTLY what needs to cancel against
// axisRefQuat's own leading `baseQuat` term, no more: just the WRAPPER.
// Including `h.clone.quaternion` (baseQuat) a 2nd time here means baseQuat
// gets divided out of the bone's true world quat EARLY (before the wrist's
// own rotation Q enters the expression), while axisRefQuat's OWN baseQuat
// term is still sitting there waiting to cancel against something -- by
// the time the 2 composed quaternions are multiplied together, baseQuat
// ends up sandwiched as `Q^-1 * baseQuat * Q` instead of cancelling
// cleanly, which is a real, nonzero residual (a conjugation, not identity)
// whenever baseQuat and Q don't happen to share an axis -- and grows with
// how far Q is from identity, exactly matching the observed "small error
// on Splay (+-30deg), huge error on Bend (+-90deg)" signature. Confirmed
// via direct comparison against HANDO's real deployment (same "Fist" pose,
// same rig, same rest quaternions, byte-identical Q at Bend=90) showing
// ~0deg drift there vs ~100+deg here under the buggy combined-exclude
// version.
const _curlExcludeQuat = new THREE.Quaternion()
function curlExcludeQuatForHand(h) {
  return _curlExcludeQuat.copy(h.wrapper.quaternion)
}
// applyCurlToSkeleton — ported verbatim from HANDY DANDIES.
const _curlAxisScratch = new THREE.Vector3()
const _splayAxisScratch = new THREE.Vector3()
const _splay2AxisScratch = new THREE.Vector3()
// Wrist-aware curl/splay axis reference — ported verbatim from HANDY
// DANDIES' own real applyCurlToSkeleton() (its docs/CHANGELOG.txt,
// 2026-09-14/15 entries document the full multi-round debugging saga
// this exact formula survived) after a direct report that Saved Poses
// with a nonzero wristBend/wristSplay still render wrong even after the
// wrist-rotation-method fix. Root cause: the curl/splay axis used only
// `baseQuat` (the whole-hand's PRE-wrist orientation) as its reference —
// but every finger's base joint is a descendant of the wrist bone
// (`rHand`), so anatomically the curl/splay axis needs to rotate WITH
// the wrist too (closing a fist still closes toward your own palm no
// matter how your wrist is bent). Using a wrist-independent axis means
// curl/splay increasingly "misses" the real rotated palm the further the
// wrist moves from wherever a pose's values were tuned by eye — exactly
// "some poses work [wristBend=wristSplay=0], some are still messed up
// [nonzero]".
//
// The naive fix (conjugate by the wrist bone's FULL world quat) was
// tried and rejected by HANDY DANDIES' own history: it passes every
// relative-to-wrist invariance test (self-consistent) but collapses to
// IDENTITY at delta=identity (wristBend=wristSplay=0 exactly), silently
// DISCARDING baseQuat and breaking the poses that were supposedly fine.
// The correct fix conjugates only the wrist's LOCAL delta-from-rest by
// its own rest quaternion, composed onto baseQuat:
// `baseQuat * wristRest * delta * wristRest^-1`, delta =
// `wristRest^-1 * wristBone.quaternion` — this correctly reduces to
// exactly `baseQuat` when delta=I (matching the no-wrist-bone fallback
// below) while still rotating the axis to track real wrist bend/splay
// otherwise. Requires applyWristPoseToSkeleton() to have already run
// this call (Handyset's own applyPoseValuesToHand() already orders wrist
// before fingers, matching HANDY DANDIES' own documented ordering
// requirement).
const _curlWristDeltaScratch = new THREE.Quaternion()
const _curlWristRestInvScratch = new THREE.Quaternion()
const _curlAxisRefQuat = new THREE.Quaternion()
// CORRECTED 2026-09-26 (2nd round, reverted) -- briefly replaced with a
// `P_now * Q * R^-1` formula (P_now = the wrist's own PARENT's LIVE WORLD
// quaternion, ported from HANDO's own 3x-corrected real source) after
// diffing against HANDO directly. That formula is not wrong in isolation
// -- HANDO's own deployment proves it works, at 0deg measured drift, even
// under a substantial Whole-Hand Rotation -- but it was the WRONG fix for
// THIS file's actual bug. Reverted because the real, root cause turned
// out to be one level up: `curlExcludeQuatForHand()` was incorrectly
// bundling `baseQuat` into what `rotateOnTrueWorldAxis()` excludes from a
// bone's true world quaternion (see that function's own corrected
// comment for the full algebraic account, cross-checked against HANDY
// DANDIES' own real call site, which never combined the two). With that
// fixed, THIS formula -- the plain, original one below -- is exactly
// correct as-is; no change needed here once the exclude-quat itself is
// right. Live-verified after both fixes landed together: ~0deg drift
// across Wrist Splay/Bend/Rotation's own full ranges, matching HANDO.
function computeCurlAxisRefQuat(skeleton, baseQuat) {
  const wristBoneForAxis = skeleton.getBoneByName('rHand')
  const wristRestForAxis = boneRestQuat.rHand
  if (!wristBoneForAxis || !wristRestForAxis) return baseQuat
  const delta = _curlWristDeltaScratch.copy(wristRestForAxis).invert().multiply(wristBoneForAxis.quaternion)
  return _curlAxisRefQuat.copy(baseQuat).multiply(wristRestForAxis).multiply(delta).multiply(_curlWristRestInvScratch.copy(wristRestForAxis).invert())
}
function applyCurlToSkeleton(fingerName, skeleton, baseQuat, wrapperQuat, values) {
  const joints = FINGER_JOINTS[fingerName]
  const maxDegs = FINGER_MAX_DEG[fingerName]
  const sign = FINGER_SIGN[fingerName]
  const curlDeg = values[FINGER_CURL_KEY[fingerName]] || 0
  const splayDeg = values[FINGER_SPLAY_KEY[fingerName]] || 0
  const splay2Deg = values[FINGER_SPLAY2_KEY[fingerName]] || 0
  const bias = (values[FINGER_CURL_BIAS_KEY[fingerName]] || 0) / 100
  const baseOnly = values[FINGER_BASE_ONLY_CURL_KEY[fingerName]] || 0
  const midOnly = values[FINGER_MID_ONLY_CURL_KEY[fingerName]] || 0
  const tipOnly = values[FINGER_TIP_ONLY_CURL_KEY[fingerName]] || 0
  const tipTwist = values[FINGER_TIP_TWIST_KEY[fingerName]] || 0
  const axisRefQuat = computeCurlAxisRefQuat(skeleton, baseQuat)
  const curlAxis = _curlAxisScratch.copy(FINGER_CURL_AXIS[fingerName]).applyQuaternion(axisRefQuat)
  const splayAxis = _splayAxisScratch.copy(FINGER_SPLAY_AXIS[fingerName]).applyQuaternion(axisRefQuat)
  const splay2Axis = _splay2AxisScratch.copy(FINGER_SPLAY2_AXIS[fingerName]).applyQuaternion(axisRefQuat)

  joints.forEach((boneName, i) => {
    const bone = skeleton.getBoneByName(boneName)
    if (!bone) return
    const rest = boneRestQuat[boneName]
    if (rest) bone.quaternion.copy(rest)

    // ORDER CORRECTED 2026-09-26 -- splay/splay2 now apply BEFORE curl,
    // matching HANDY DANDIES' real source exactly (this project's own
    // version had curl first, splay/splay2 after -- found by reading
    // HANDY DANDIES' real applyCurlToSkeleton() directly after a direct
    // report: "the finger splays arent showing correctly... not
    // aggressively wrong, but not the pose i intended"). This matters
    // because rotateOnTrueWorldAxis() re-reads the bone's CURRENT
    // getWorldQuaternion() fresh on every call -- so whichever rotation
    // runs first sees the bone still at rest, but every rotation AFTER
    // it sees the PREVIOUS rotation already baked into the bone's local
    // quaternion, and its own world-axis-to-local conversion gets
    // conjugated by that prior rotation's inverse. With curl applied
    // first (this project's old order), splay's own axis was being
    // computed relative to the CURLED joint instead of REST -- a real,
    // measurable error that scales with how much curl is also active on
    // that same joint, which is exactly why it looked "not aggressively
    // wrong" (a secondary/coupling effect) rather than obviously broken.
    if (i === FINGER_SPLAY_JOINT_INDEX[fingerName]) {
      const splayAngle = THREE.MathUtils.degToRad((splayDeg / 100) * FINGER_SPLAY_MAX_DEG[fingerName] * FINGER_SPLAY_SIGN[fingerName])
      rotateOnTrueWorldAxis(bone, splayAxis, splayAngle, wrapperQuat)
    }
    if (i === FINGER_SPLAY2_JOINT_INDEX[fingerName]) {
      const splay2Angle = THREE.MathUtils.degToRad((splay2Deg / 100) * FINGER_SPLAY2_MAX_DEG[fingerName] * FINGER_SPLAY2_SIGN[fingerName])
      rotateOnTrueWorldAxis(bone, splay2Axis, splay2Angle, wrapperQuat)
    }
    const weight = curlBiasWeight(i, joints.length, bias)
    const curlAngle = THREE.MathUtils.degToRad((curlDeg / 100) * maxDegs[i] * weight * sign)
    rotateOnTrueWorldAxis(bone, curlAxis, curlAngle, wrapperQuat)

    if (i === 0 && baseOnly) rotateOnTrueWorldAxis(bone, curlAxis, THREE.MathUtils.degToRad((baseOnly / 100) * maxDegs[0] * sign), wrapperQuat)
    if (i === 1 && midOnly) rotateOnTrueWorldAxis(bone, curlAxis, THREE.MathUtils.degToRad((midOnly / 100) * maxDegs[1] * sign), wrapperQuat)
    if (i === joints.length - 1 && tipOnly) rotateOnTrueWorldAxis(bone, curlAxis, THREE.MathUtils.degToRad((tipOnly / 100) * maxDegs[i] * sign), wrapperQuat)
    // CORRECTED 2026-09-26 -- used `bone.rotateOnWorldAxis()` (three.js's
    // own built-in), which is NOT actually a true-world-space rotation
    // once the bone's parent chain carries any real rotation -- it treats
    // the given axis as already expressed in the bone's PARENT's local
    // frame, a well-known three.js naming trap. `twistAxis` (from
    // segmentDirection(), below) IS a genuine world-space direction
    // (derived from 2 bones' real current world positions), so it needs
    // the SAME robust conversion `rotateOnTrueWorldAxis()` already gives
    // curl/splay -- just WITHOUT an exclude-quat, since this axis is
    // already correct as true world space and has nothing to exclude
    // (unlike FINGER_CURL_AXIS, a canonical pose-relative constant that
    // DOES need wrapper excluded). Ported verbatim from HANDY DANDIES'
    // own real fix for this exact issue (its own `rotateOnTrueWorldAxis`
    // comment documents the identical trap on the identical rig). Found
    // via direct report: "Fist" pose (tipTwistThumb:46, the only nonzero
    // tipTwist value in that pose) showed ~31-53deg drift on rThumb3
    // specifically under Wrist Bend/Rotation, while every other joint on
    // every other finger measured ~0deg -- isolating this to Tip Twist's
    // own separate code path, not the curl/splay system this session's
    // earlier fix already corrected.
    if (i === joints.length - 1 && tipTwist) {
      const prevBone = skeleton.getBoneByName(joints[i - 1])
      if (prevBone) {
        const twistAxis = segmentDirection(prevBone, bone)
        rotateOnTrueWorldAxis(bone, twistAxis, THREE.MathUtils.degToRad((tipTwist / 100) * FINGER_TIP_TWIST_MAX_DEG))
      }
    }
  })
}
// CORRECTED 2026-09-26 (3rd round) -- REVERTED the 2026-09-21 fix
// described below. Direct report: "the same issue is occurring but with
// Whole Hand rotation. All 3 axes" -- the exact curl-axis-tracking bug
// class this session already root-caused and fixed for the WRIST, now
// showing up for Whole-Hand Rotation instead.
//
// The 2026-09-21 reasoning below was correct that passing full
// `h.currentBaseQuat` caused real drift -- but wrong about WHY, and
// picked the wrong fix. At that time, `curlExcludeQuatForHand()` still
// had the (not-yet-discovered) bug this session's earlier round fixed:
// it excluded `wrapper.quaternion * clone.quaternion`, and
// `clone.quaternion` ALSO contains modelRotQuat (via
// `computeBaseQuatFromValues()`). With baseQuat=h.currentBaseQuat (bakes
// in modelRotQuat) AND exclude=wrapper*clone (ALSO bakes in modelRotQuat
// a 2nd time), modelRotQuat was double-counted -- the exact same
// double-counting bug class as the wrist one, just for a different
// transform. Switching baseQuat to `alignQuat` (modelRot-excluded) was a
// workaround for that double-counting, not a real fix, and it was never
// revisited once `curlExcludeQuatForHand()` was corrected to exclude
// `wrapper.quaternion` ALONE (see that function's own comment) -- which
// removed the double-counting on the EXCLUDE side, but left this
// call site still avoiding modelRotQuat on the BASEQUAT side, an
// asymmetry that itself produces drift (confirmed below).
//
// Verified via a standalone quaternion-math script (mirroring
// rotateOnTrueWorldAxis()/computeCurlAxisRefQuat() exactly, no browser
// needed) before touching this file: with the CURRENT code
// (baseQuat=alignQuat), a finger bone's local orientation drifts
// 12.4-71.3deg across 5 test cases (each axis individually, all 3
// combined, and the degenerate wristBend=wristSplay=0 case) purely from
// changing modelRotX/Y/Z, with wrist/curl/splay held fixed. Switching
// baseQuat to `h.currentBaseQuat` (which correctly bakes in modelRotQuat,
// matching `curlExcludeQuatForHand()`'s now-correct wrapper-alone
// exclude) measured 0.0000deg drift on every one of the same 5 cases --
// this exactly matches HANDY DANDIES' own real, working call site
// (`applyCurlToSkeleton(fingerName, hand.skinnedMesh.skeleton,
// cloneBaseQuat, hand.wrapper.quaternion)`, where `cloneBaseQuat =
// alignQuat.copy().multiply(wholeHandRotQuat)` -- i.e. baseQuat there
// ALSO bakes in Whole-Hand Rotation), confirmed by reading that file's
// own source directly rather than assuming. `h.currentBaseQuat` is
// guaranteed fresh at every call site below: `applyPoseValuesToHand()`
// sets it (line ~670) immediately before calling `applyCurlToSkeleton`
// for every finger on the same hand.
function applyCurl(fingerName) {
  hands.forEach((h) => applyCurlToSkeleton(fingerName, h.skinnedMesh.skeleton, h.currentBaseQuat, curlExcludeQuatForHand(h), cfg))
}

// Wrist bend/splay/rotation — same rotateOnTrueWorldAxis mechanism as the
// finger system above (not preserved verbatim from HANDY DANDIES since
// that function's body wasn't available to port from; axis choices here
// mirror the finger convention — bend around world X, splay around world
// Z, twist/rotation around the hand's own pointing axis — worth a visual
// sanity check against a source-of-truth build if the direction feels off).
// Ported verbatim from HANDY DANDIES' own real applyWristPoseToSkeleton()
// (grepped from its source, not reconstructed) after a direct report that
// Saved Poses render differently than in Hando/Handy Dandies, with the
// user specifically flagging "position and rotation axes/origin/anchor
// (local/global)" as the thing to get right. The ORIGINAL version here
// used rotateOnTrueWorldAxis() for all 3 wrist axes -- each rotation
// converts a FIXED WORLD-space axis into the bone's current local frame
// before rotating, so the 3 rotations don't compose the way a normal
// Euler sequence does. HANDY DANDIES' real function instead uses plain
// bone.rotateX/rotateZ/rotateY -- three.js's own LOCAL-axis rotation,
// genuinely sequential (rotateZ spins around the bone's already-bent-by-X
// local Z axis, not the original world Z). These 2 approaches only agree
// when angles are small/near-zero on the other axes -- for any real
// combined bend+splay+rotation pose, they diverge, which is exactly what
// "shows up differently" describes. Axis-letter assignment (X=bend,
// Z=splay, Y=rotation/twist) was already correct; only the rotation
// METHOD was wrong.
// `extraSplayDeg` (default 0) is Responsive Wrist Splay's own live
// contribution, added onto values.wristSplay before the rotateZ call.
// REVERTED 2026-09-25 (same day as the decoupling attempt above this
// comment used to describe) -- fully decoupling Responsive Wrist Splay
// from rendering also silently killed its live function everywhere,
// not just for saved poses, which the user did not want ("all phone
// tilt function died"). The correct scope, per direct correction: Wrist
// Splay and Whole-Hand-Rotation stay fully live/reactive as before;
// what a SAVED POSE contributes is what's restricted instead -- see
// applyPosePreset()'s and the Tween pose-apply path's own comments for
// the actual fix (both now omit wristSplay/modelRotX/Y/Z from what a
// saved pose overwrites, leaving whatever's currently live untouched).
function applyWristPoseToSkeleton(skeleton, values, extraSplayDeg = 0) {
  const bone = skeleton.getBoneByName('rHand')
  if (!bone) return
  const rest = boneRestQuat.rHand
  if (rest) bone.quaternion.copy(rest)
  // Clamp is a safety ceiling on the FINAL combined angle (pose value +
  // reactive extraSplayDeg, summed then clamped) -- see
  // wristSplayClampRange's own cfg comment.
  const bendDeg = clampToRange(values.wristBend || 0, wristBendClampParsed)
  const splayDeg = clampToRange((values.wristSplay || 0) + extraSplayDeg, wristSplayClampParsed)
  const rotationDeg = clampToRange(values.wristRotation || 0, wristRotationClampParsed)
  bone.rotateX(THREE.MathUtils.degToRad(bendDeg))
  bone.rotateZ(THREE.MathUtils.degToRad(splayDeg))
  bone.rotateY(THREE.MathUtils.degToRad(rotationDeg))
}

function computeBaseQuatFromValues(values) {
  return alignQuat.clone().multiply(new THREE.Quaternion().setFromEuler(
    new THREE.Euler(THREE.MathUtils.degToRad(values.modelRotX || 0), THREE.MathUtils.degToRad(values.modelRotY || 0), THREE.MathUtils.degToRad(values.modelRotZ || 0))
  ))
}

// CORRECTED 2026-09-21 — real bug found after a direct report ("the Whole
// Hand rotation sliders, all 3, dont rotate the hand correctly"), per
// direct instruction to check HANDO's own real implementation. The old
// version of this function computed `h.currentBaseQuat` (via
// computeBaseQuatFromValues(), which DOES correctly fold in modelRotX/Y/Z)
// but only ever used it as a reference axis for finger-curl math — it was
// NEVER applied to `h.clone.quaternion`, the object that actually holds
// the hand's rendered geometry. `h.clone.quaternion` was set exactly ONCE,
// at hand creation (rebuildField(), `clone.quaternion.copy(alignQuat)`),
// and never touched again — so the 3 Whole-Hand Rotation sliders had NO
// visible effect on the rendered hand whatsoever, only a subtle secondary
// effect on finger-curl axis orientation.
//
// Fixed by actually applying the computed quaternion to `h.clone`, AND by
// porting HANDO's own real pivot mechanism (its docs/CHANGELOG.txt,
// 2026-09-11, documents this exact bug class: rotating around the
// object's own unrelated local origin instead of the palm) — HANDO
// pivots `modelRoot` around `modelRotationPivot` (palm center: the
// midpoint of the wrist bone and the middle finger's own base joint) by
// recomputing `modelRoot.position` every time rotation/scale changes so
// that fixed local point renders at the same spot regardless of the
// current rotation: `position = pivot - rotation*(scale*pivot)`. Applied
// here at HANDYSET's own `h.clone` level (HANDYSET has an EXTRA outer
// `h.wrapper` layer HANDO doesn't — Phone Tilt's own rotation — so this
// pivot math keeps the palm fixed within `h.wrapper`'s own frame, exactly
// analogous to HANDO keeping it fixed within `scene`'s frame). Pose
// Offset X/Y/Z is added AFTERWARD as a plain additive translation on top,
// matching HANDO's own function structure exactly.
const _rotatedScaledPivot = new THREE.Vector3()
// Mirror -- the per-axis sign baked into h.clone.scale alongside the
// existing uniform scale, added 2026-10-01. This is applied in h.clone's
// own LOCAL frame (the Object3D TRS composition's S acts on local child
// coordinates before R/T), so "mirror along the model's own X/Y/Z" means
// exactly the GLB's own bind-pose local axes, with no anchor-translation
// needed the way HANDO's hand2 mirror needed (that one reflects through a
// WORLD-space point shared between 2 independently-positioned hands; this
// one is a single hand's own local-origin reflection, structurally
// simpler). `_mirrorScaleVec.multiply` generalizes the pre-existing
// `pivot.multiplyScalar(scale)` pivot-preserving step to a per-axis
// vector -- component-wise multiply is exactly what the real S matrix
// does to a local point before R is applied, so this correctly keeps
// modelRotationPivot visually fixed in h.wrapper's frame regardless of
// which axes are mirrored, the same guarantee the uniform-scale-only
// version already gave for scale/rotation alone.
const _mirrorScaleVec = new THREE.Vector3()
function applyModelRootTransform(h, poseValues) {
  h.clone.quaternion.copy(h.currentBaseQuat)
  const scale = computeBaseScale() * (poseValues.poseScale ?? 1)
  _mirrorScaleVec.set(cfg.handMirrorX ? -scale : scale, cfg.handMirrorY ? -scale : scale, cfg.handMirrorZ ? -scale : scale)
  h.clone.scale.copy(_mirrorScaleVec)
  _rotatedScaledPivot.copy(modelRotationPivot).multiply(_mirrorScaleVec).applyQuaternion(h.clone.quaternion)
  h.clone.position.copy(modelRotationPivot).sub(_rotatedScaledPivot)
  h.clone.position.x += poseValues.poseOffsetX || 0
  h.clone.position.y += poseValues.poseOffsetY || 0
  h.clone.position.z += poseValues.poseOffsetZ || 0
  // Invalidate applyBaseArmRotation()'s own delta-tracker -- FIXED
  // 2026-09-27, direct report: "when i set responsive pose tween, the
  // hand disappears. im pretty sure its some bug clash with... whole
  // hand rotation at base." Root cause: this function unconditionally
  // OVERWRITES h.clone.quaternion/position from h.currentBaseQuat
  // every time it runs -- including every frame while Responsive Pose
  // Tween is active (via applyPoseValuesToHand()). It never told
  // applyBaseArmRotation() this happened, so that function's own
  // `h.lastBaseArmQuat` (its "what I last applied" delta-tracking
  // reference) went stale the instant this function ran again --
  // computing a DELTA relative to a rotation that no longer actually
  // exists in h.clone.quaternion. With Responsive Arm Rotation at Base
  // ALSO reactive (running every frame right after this one), the 2
  // systems fought over the same transform every single frame: this
  // function resets to the plain pose baseline, the other applies only
  // the (now-meaningless) incremental delta on top -- live-confirmed
  // via a screen-space bounding-box projection that the hand's actual
  // rendered position scattered far outside the viewport (the camera
  // ending up effectively inside/beside the misplaced geometry), not a
  // NaN/zero-scale case -- explaining "disappears" without any single
  // number (scale, position, individual bone quaternions) looking
  // obviously wrong in isolation. Fixed by resetting
  // `h.lastBaseArmQuat` to null here, so the NEXT applyBaseArmRotation()
  // call (same frame, since animate() runs it right after the Pose
  // Tween/Wrist Splay branch) treats the just-reset transform as its
  // new baseline and applies its full rotation as ONE clean delta from
  // identity, instead of a stale, no-longer-meaningful one. This also
  // fixes the same latent clash for the non-reactive case (a plain
  // Pose slider touch, or a saved-pose "Use") after Base Rotation X/Y/Z
  // had been set -- that combination silently discarded the base
  // rotation too, just without the frame-repeated compounding that
  // made the reactive case visually catastrophic.
  h.lastBaseArmQuat = null
}

// Single entry point: apply a full pose-values object to every hand in
// the field. Used directly by Pose-group sliders, saved-pose "Use", and
// Tween — same cfg applied uniformly to all hands (matching HANDY
// DANDIES' own design: one shared pose, N independent field positions).
function applyPoseValuesToHand(poseValues) {
  // armBaseDistanceT, not tiltMagnitude -- direct request 2026-09-27 to
  // unify Responsive Wrist Splay's own distance input with the new
  // Responsive Arm Rotation at Base feature (cursor-to-arm-base
  // distance on desktop, phone-tilt percentage on mobile -- see
  // armBaseDistanceT's own top-of-file comment). Reactive Arm Length
  // (computeArmLengthT) is untouched, it still reads tiltMagnitude.
  const extraSplay = computeResponsiveWristSplayDeg(armBaseDistanceT)
  hands.forEach((h) => {
    h.currentBaseQuat.copy(computeBaseQuatFromValues(poseValues))
    applyModelRootTransform(h, poseValues)
    applyWristPoseToSkeleton(h.skinnedMesh.skeleton, poseValues, extraSplay)
    // h.currentBaseQuat + curlExcludeQuatForHand(h) — see applyCurl()'s
    // own comment (2026-09-26, 3rd round) for why alignQuat was wrong here.
    FINGER_NAMES.forEach((name) => applyCurlToSkeleton(name, h.skinnedMesh.skeleton, h.currentBaseQuat, curlExcludeQuatForHand(h), poseValues))
  })
  cfg.hideWrist = poseValues.hideWrist || 0
  updateWristCrop()
}
// Per-frame refresh for Responsive Wrist Splay's live/reactive mode —
// ported concept from HANDY DANDIES' own "idle repose" (see
// docs/CHANGELOG.txt): applyPoseValuesToHand() above only bakes a wrist
// splay value once, at pose-apply time, so it goes stale the moment
// tiltMagnitude changes afterward unless reapplied every frame. Finger
// curl is re-baked alongside the wrist for the same reason HANDY DANDIES
// documents — every finger's base joint is a descendant of the wrist
// bone, so its curl axis depends on the wrist's current orientation.
// Only runs when reactive mode is genuinely live (master AND reactive
// both on) — a static wristSplayDefault value doesn't need per-frame
// reapplication, it's already baked in by the call above.
function applyReactiveWristSplayFrame() {
  if (!cfg.wristSplayResponsiveEnabled || !cfg.wristSplayReactiveEnabled) return
  // armBaseDistanceT -- see applyPoseValuesToHand()'s own comment above.
  const extraSplay = computeResponsiveWristSplayDeg(armBaseDistanceT)
  hands.forEach((h) => {
    applyWristPoseToSkeleton(h.skinnedMesh.skeleton, cfg, extraSplay)
    // h.currentBaseQuat + curlExcludeQuatForHand(h) — see applyCurl()'s
    // own comment (2026-09-26, 3rd round) for why alignQuat was wrong here.
    FINGER_NAMES.forEach((name) => applyCurlToSkeleton(name, h.skinnedMesh.skeleton, h.currentBaseQuat, curlExcludeQuatForHand(h), cfg))
  })
}
// Per-frame refresh for Responsive Arm Rotation at Base -- same
// reasoning as applyReactiveWristSplayFrame() above, except
// applyBaseArmRotation()'s OWN delta-tracking already makes a per-frame
// call cheap/safe on its own (a no-op once desiredQuat stops changing
// frame to frame), so this is just "always pass the current reactive
// amount" rather than a full re-bake.
function applyResponsiveBaseArmRotationFrame(poseValues = cfg) {
  if (!cfg.trackingEnabled || !cfg.baseArmRotationResponsiveEnabled) return
  applyBaseArmRotation(computeResponsiveBaseArmRotationDeg(armBaseDistanceT), poseValues)
}
// Per-frame refresh for Responsive Pose Tween -- blends EVERY numeric
// pose field between the Default pose (DEFAULT_POSE_NAME) and the
// user-chosen Target pose (cfg.poseTweenTargetPoseName), by the
// curve's own Y output (0=Default, 1=Target) driven by the same
// armBaseDistanceT/tiltMagnitude distance metric as the 2 features
// above. This function's ONLY job is producing a lerped pose-values
// object -- the actual application goes through the EXISTING
// applyPoseValuesToHand() pipeline (the same one sliders/Saved-Poses-
// Use/Tween-playback already use), specifically so it inherits that
// pipeline's already-correct baseQuat/curl-exclude-quat pairing rather
// than risking a 5th instance of this file's own recurring curl-axis
// bug class by writing new bone-rotation code. Non-numeric/absent
// fields (e.g. a field only one of the 2 poses happens to define) fall
// back to whichever endpoint is closer, never NaN.
function applyResponsivePoseTweenFrame() {
  if (!cfg.trackingEnabled || !cfg.poseTweenResponsiveEnabled) return
  const defaultPose = findSavedPoseByName(DEFAULT_POSE_NAME)
  const targetPose = findSavedPoseByName(cfg.poseTweenTargetPoseName)
  if (!defaultPose || !targetPose) return
  const curveY = THREE.MathUtils.clamp(window.evaluateCurveEditorPoints(poseTweenCurveParsed, armBaseDistanceT, poseTweenCurveMethod), 0, 1)
  const blended = {}
  Object.keys(defaultPose).forEach((k) => {
    if (k === 'name' || k === 'group') return
    const a = defaultPose[k], b = targetPose[k]
    blended[k] = (typeof a === 'number' && typeof b === 'number') ? THREE.MathUtils.lerp(a, b, curveY) : (curveY < 0.5 ? a : b)
  })
  // Whole-Hand Rotation X/Y/Z -- direct request 2026-09-27: "for the
  // settings i set in Whole hand rotation at base, and rotation, apply
  // those to whatever pose i set as the target pose." Use the LIVE
  // slider values (cfg.modelRotX/Y/Z), not whatever's baked into the 2
  // named poses' own saved fields -- every SAVED_POSES entry has these
  // at 0, so blending them would always discard the user's own live
  // rotation tuning back to 0, every frame, for as long as Pose Tween
  // stays on.
  blended.modelRotX = cfg.modelRotX
  blended.modelRotY = cfg.modelRotY
  blended.modelRotZ = cfg.modelRotZ
  applyPoseValuesToHand(blended)
  // Base Rotation X/Y/Z (applied via a SEPARATE function/pivot --
  // rForearmBend, not modelRotationPivot -- so it can't just be folded
  // into `blended` above the way modelRotX/Y/Z was). The call just
  // above (applyPoseValuesToHand -> applyModelRootTransform) already
  // invalidates applyBaseArmRotation()'s own delta-tracker every time
  // it runs (see that function's own comment, 2026-09-27) -- which
  // stops the 2 systems from fighting, but does NOT by itself keep the
  // PLAIN (non-reactive) Base Rotation sliders' effect applied each
  // frame, since nothing was re-triggering applyBaseArmRotation() after
  // the reset in that case. Re-apply here so it stays live throughout
  // the tween -- passing `blended`, NOT the default `cfg`, so its own
  // internal finger re-bake (see applyBaseArmRotation()'s own comment,
  // 2026-09-27, 2nd correction) doesn't silently overwrite the finger
  // blend this function just applied above. Handles BOTH the plain and
  // reactive Base Rotation cases itself now -- animate() no longer
  // calls applyResponsiveBaseArmRotationFrame() a 2nd time when Pose
  // Tween is active (see that call site's own comment), since it would
  // only ever have used `cfg` too.
  if (cfg.baseArmRotationResponsiveEnabled) {
    applyResponsiveBaseArmRotationFrame(blended)
  } else {
    applyBaseArmRotation(0, blended)
  }
}

// Base arm rotation — applied at h.clone level when slider changes, not every frame.
// Rotates around rForearmBend using its own axes. Stores last applied state to
// avoid accumulation: only applies the DELTA since last call.
//
// FIXED 2026-09-27, direct report: "The whole hand rotation at base is
// suffering the same rotatin axis messing with Fiigner poses as before."
// Root cause, same bug class as the 3 earlier curl-axis fixes documented
// below in this file (Whole-Hand Rotation modelRotX/Y/Z, wrist bend/
// splay/rotation): this function mutates `h.clone.quaternion` DIRECTLY
// via its own delta-tracking, completely bypassing `h.currentBaseQuat`
// (the `baseQuat` every applyCurlToSkeleton() call actually uses as its
// finger-curl axis reference). The two silently diverged the moment a
// Base Rotation slider was touched -- `h.clone.quaternion` included it,
// `h.currentBaseQuat` never did, so every finger's curl/splay axis kept
// being computed as if the arm hadn't rotated at all. Fixed by applying
// the EXACT SAME deltaQuat to `h.currentBaseQuat` that gets applied to
// `h.clone.quaternion`, keeping them permanently in sync regardless of
// call order -- matching the established "baseQuat must bake in every
// whole-hand-level rotation" rule this file has already learned 3 times.
// Disclosed, not silently ignored: this does NOT unify Base Rotation's
// own pivot (rForearmBend's world position, re-read live each call) with
// Whole-Hand Rotation's own pivot (modelRotationPivot, the palm center)
// into one combined formula -- if `applyModelRootTransform()` runs AFTER
// this function (e.g. a modelRot/pose slider touched after Base
// Rotation), it recomputes `h.clone.position` from ONLY the palm-center
// pivot, which can visually shift where Base Rotation's own pivot ends
// up. Not the bug that was reported (curl axis, now fixed); flagged as
// a known follow-up if position drift is ever reported when BOTH
// rotation systems are combined.
// `extraX` (default 0, degrees) -- added 2026-09-27 for Responsive Arm
// Rotation at Base: the reactive contribution is added onto
// cfg.baseRotationX every frame while that feature is on (see
// applyResponsiveBaseArmRotationFrame() below), reusing this function's
// own already-curl-axis-safe delta-tracking rather than a 2nd rotation
// system. A plain slider drag (wireSlider below) calls this with no
// extraX, exactly as before.
// `poseValues` (default `cfg`) -- added 2026-09-27, direct report: "the
// responsive pose tween doesnt dissappera anhymore. but the pose isnt
// chanigng. the wrist data does. but fingers odnt." Root cause: this
// function's own finger re-bake (below) was HARDCODED to `cfg` --
// correct for its normal call sites (a plain slider touch, or the
// reactive-per-frame call, both of which genuinely want the LIVE
// slider/cfg values) but wrong when called from WITHIN Responsive Pose
// Tween's own per-frame apply: that context already computed a
// BLENDED pose-values object and applied it correctly via
// applyPoseValuesToHand() -- calling this function right after,
// re-baking every finger from `cfg` instead of that same blended
// object, silently overwrote the just-applied finger blend back to
// whatever cfg's own (unrelated, un-tweened) slider values happened to
// be. Wrist bone rotation is untouched by this function (only
// finger curl/splay lives here), which is exactly why wrist visibly
// responded to the tween while fingers stayed frozen.
function applyBaseArmRotation(extraX = 0, poseValues = cfg) {
  hands.forEach((h) => {
    const baseBone = h.skinnedMesh.skeleton.getBoneByName('rForearmBend')
    if (!baseBone) return

    const baseWorldPos = new THREE.Vector3()
    baseBone.getWorldPosition(baseWorldPos)

    // Desired rotation from current slider values, in the bone's LOCAL axes
    const rotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), (cfg.baseRotationX + extraX) * Math.PI / 180)
    const rotY = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cfg.baseRotationY * Math.PI / 180)
    const rotZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), cfg.baseRotationZ * Math.PI / 180)

    const desiredQuat = new THREE.Quaternion()
    desiredQuat.multiplyQuaternions(rotX, rotY).multiply(rotZ)

    // Only apply the DELTA: desired / lastApplied (so we don't compound)
    if (!h.lastBaseArmQuat) h.lastBaseArmQuat = new THREE.Quaternion()
    const deltaQuat = desiredQuat.clone().multiply(h.lastBaseArmQuat.clone().invert())

    // Apply delta to position and quaternion
    const offset = h.clone.position.clone().sub(baseWorldPos)
    offset.applyQuaternion(deltaQuat)
    h.clone.position.copy(baseWorldPos).add(offset)

    h.clone.quaternion.multiplyQuaternions(deltaQuat, h.clone.quaternion)
    h.currentBaseQuat.multiplyQuaternions(deltaQuat, h.currentBaseQuat) // keep the curl-axis reference in sync -- see this function's own comment above
    h.lastBaseArmQuat.copy(desiredQuat)
    // Re-bake finger curl/splay immediately using the now-updated
    // baseQuat -- otherwise the actual bone quaternions stay stale
    // (computed from the OLD axis reference) until something ELSE
    // happens to re-trigger applyCurlToSkeleton (e.g. a reactive wrist
    // splay frame, or the next finger-curl slider touch), leaving a
    // visibly wrong pose in the meantime. Matches the exact call
    // pattern applyReactiveWristSplayFrame() already uses.
    FINGER_NAMES.forEach((name) => applyCurlToSkeleton(name, h.skinnedMesh.skeleton, h.currentBaseQuat, curlExcludeQuatForHand(h), poseValues))
  })
}

// Wrist crop — one clipping plane PER HAND (each hand faces a different
// direction once Phone Tilt rotates it, so each needs its own plane).
// RECOMPUTED EVERY FRAME via skinnedMesh.onBeforeRender (wired in
// rebuildField()) from LIVE bone world positions — necessary so the plane
// tracks Phone Tilt/Whole-Hand Rotation correctly frame to frame (ported
// reasoning from HANDY DANDIES' own identical onBeforeRender wiring).
//
// REWRITTEN 2026-09-21 (3rd round, same day) — the prior 2 rounds this
// session both got the geometry wrong in different ways (first: a static
// bind-pose axis that didn't track live rotation at all; second: switched
// to a wrist->fingertip axis that tracks wrist BEND, which the user
// directly identified as wrong — "the cropping plane doesn't seem like
// the right rotation, it should be the plane perpendicular to the axis of
// the first bone, the arm bone" — and separately reported the crop was
// removing the HAND instead of the ARM, and that 0%/100% were inverted).
// Ported EXACTLY from HANDO's own real `updateWristClipPlane()` this
// round (a background research agent extracted it verbatim; not
// reconstructed) instead of guessing again:
//   farBone = rForearmBend, nearBone = rHand (the actual "first"/arm
//   bone and the wrist bone — a FIXED anatomical relationship; neither
//   bone's own WORLD POSITION moves due to the wrist's own local
//   rotation, so this axis is correctly wrist-bend-invariant, matching
//   the user's own explicit spec).
//   dir = (nearPos - farPos).normalized() — points from the arm TOWARD
//   the wrist/hand (NOT negated — HANDO's own code uses this direction
//   as the plane normal directly). Three.js clipping keeps the side the
//   normal points into and clips the opposite side, so this plane keeps
//   the HAND side and clips the ARM side — the direction the user
//   reported as backwards is fixed by removing the `.negate()` the prior
//   2 rounds both had.
//   t = hideWrist/100 (or the Reactive Arm Length curve's own output),
//   NOT clamped to [0,1] — HANDO's own slider has no lockRange, so a
//   typed value past 100 pushes the clip point past the wrist bone and
//   into the hand itself, exactly matching the user's own "setting it to
//   200 should do something" expectation.
//   clipPoint = farPos + dir * armToWristDist * t — t=0 -> exactly
//   farPos (the arm bone; HANDO's own comment confirms this coincides
//   with the mesh's real lower bound for this same rig, so 0% = no crop
//   at all) -> t=1 -> exactly nearPos (the wrist bone; 100% = the entire
//   forearm cropped away, hand fully intact).
const _clipFarPos = new THREE.Vector3()
const _clipNearPos = new THREE.Vector3()
const _clipDir = new THREE.Vector3()
const _clipPoint = new THREE.Vector3()
function updateWristClipPlaneForHand(h) {
  if (!cfg.cropWristEnabled) {
    h.skinnedMesh.material.clippingPlanes = []
    return
  }
  const farBone = h.skinnedMesh.skeleton.getBoneByName('rForearmBend')
  const nearBone = h.skinnedMesh.skeleton.getBoneByName('rHand')
  if (!farBone || !nearBone) {
    h.skinnedMesh.material.clippingPlanes = []
    return
  }
  if (!h.clipPlane) h.clipPlane = new THREE.Plane()
  // Was `if (!h.clipPlane) { ...; material.clippingPlanes = [h.clipPlane] }`
  // — real bug, found live 2026-09-21: the disable branch above clears
  // `material.clippingPlanes` to a fresh `[]` but never clears
  // `h.clipPlane` itself, so once crop was ever toggled off and back on,
  // this guard's `if (!h.clipPlane)` stayed false forever and the plane
  // was never re-attached to the material. Unconditionally reassigning
  // here (cheap, a plain array set, and now happening every frame
  // anyway) makes this immune to that history regardless of how many
  // times crop has been toggled off/on before.
  h.skinnedMesh.material.clippingPlanes = [h.clipPlane]
  farBone.getWorldPosition(_clipFarPos)
  nearBone.getWorldPosition(_clipNearPos)
  _clipDir.subVectors(_clipNearPos, _clipFarPos).normalize()
  const armToWristDist = _clipFarPos.distanceTo(_clipNearPos)
  // Reactive Arm Length — see computeArmLengthT()'s own comment; falls
  // back to the plain cfg.hideWrist/100 static value when Reactive is
  // off. Deliberately NOT clamped — see this function's own top comment.
  const t = computeArmLengthT(tiltMagnitude)
  _clipPoint.copy(_clipFarPos).addScaledVector(_clipDir, armToWristDist * t)
  h.clipPlane.setFromNormalAndCoplanarPoint(_clipDir, _clipPoint)
}
// Kept as the explicit multi-hand entry point for UI triggers (slider/
// checkbox/pose-apply) — still useful for an immediate update the same
// frame a setting changes, even though onBeforeRender (above) now also
// keeps every hand's plane correct every frame regardless.
function updateWristCrop() {
  hands.forEach((h) => updateWristClipPlaneForHand(h))
}

// =======================================================================
// Renderer / scene / camera / lights
// =======================================================================
const canvas = document.getElementById('c')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.localClippingEnabled = true
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))

const scene = new THREE.Scene()
scene.background = new THREE.Color(cfg.bgColor)

const camera = new THREE.PerspectiveCamera(cfg.cameraFov, window.innerWidth / window.innerHeight, 0.1, 2000)
camera.position.set(cfg.cameraX, cfg.cameraY, cfg.cameraZ)

const controls = new OrbitControls(camera, renderer.domElement)
controls.target.set(cfg.targetX, cfg.targetY, cfg.targetZ)
controls.enableDamping = true
controls.update()
// Fires on every drag/wheel interaction AND every damping glide frame
// after a drag release -- the standard three.js on-demand-rendering hook
// (see the requestRender()/needsRender comment up top).
controls.addEventListener('change', () => requestRender())

const composer = new EffectComposer(renderer)
composer.addPass(new RenderPass(scene, camera))
const outlinePass = new OutlinePass(new THREE.Vector2(window.innerWidth, window.innerHeight), scene, camera)
outlinePass.edgeColor = new THREE.Color(cfg.outlineColor)
outlinePass.edgeThickness = cfg.outlineThickness
outlinePass.edgeStrength = cfg.outlineStrength
outlinePass.edgeGlow = cfg.outlineGlow
outlinePass.enabled = cfg.outlineEnabled
composer.addPass(outlinePass)
composer.addPass(new OutputPass())

const hemiLight = new THREE.HemisphereLight(cfg.ambientSkyColor, cfg.ambientGroundColor, cfg.ambientIntensity)
scene.add(hemiLight)
const keyLight = new THREE.DirectionalLight(cfg.keyColor, cfg.keyIntensity)
scene.add(keyLight)
scene.add(keyLight.target)

function updateKeyLightPosition() {
  const r = sceneState.fieldRadius * 3
  const az = THREE.MathUtils.degToRad(cfg.keyAzimuth)
  const el = THREE.MathUtils.degToRad(cfg.keyElevation)
  keyLight.position.set(r * Math.cos(el) * Math.cos(az), r * Math.sin(el), r * Math.cos(el) * Math.sin(az))
  keyLight.target.position.set(0, (cfg.keyTargetHeight / 100) * sceneState.fieldRadius, 0)
  keyLight.target.updateMatrixWorld()
}
updateKeyLightPosition()

const gridHelper = new THREE.GridHelper(40, 40)
gridHelper.visible = cfg.showGridHelper
scene.add(gridHelper)

// World Axes -- Fat Lines visualization (same engine as Object Axes, so thickness is actually visible)
let worldAxesGroup = null
function createWorldAxesVisualization(length, thicknessPx) {
  const group = new THREE.Group()
  group.name = 'WorldAxesVisualization'
  AXES_DIRS.forEach((dir, i) => {
    const geometry = new LineGeometry()
    geometry.setPositions([0, 0, 0, dir[0] * length, dir[1] * length, dir[2] * length])
    const material = new LineMaterial({ color: AXES_COLORS[i], linewidth: thicknessPx })
    material.resolution.set(renderer.domElement.width || 1, renderer.domElement.height || 1)
    fatAxesLineMaterials.push(material)
    group.add(new Line2(geometry, material))
  })
  return group
}
function updateWorldAxes() {
  if (worldAxesGroup && worldAxesGroup.parent) scene.remove(worldAxesGroup)
  if (cfg.showAxesHelper) {
    worldAxesGroup = createWorldAxesVisualization(cfg.worldAxesLength, cfg.worldAxesThickness)
    scene.add(worldAxesGroup)
  }
}
updateWorldAxes()

// Target Marker -- shows where Palm Faces Cursor is actually tracking to
// (tiltTarget, the cursor's own ground-plane hit -- see updateTiltTarget()'s
// own comment). The checkboxShowTargetMarker control has existed since
// this project's own Phone Tilt group was first built, but was never
// wired to a real mesh (confirmed: wireCheckbox() only ever set the cfg
// flag) -- direct report 2026-09-27: "check th show target marker
// checkbox. i cant see the marker." Position synced every frame in
// animate() (only meaningful once updateTiltTarget() has run at least
// once with real input).
const targetMarkerMesh = new THREE.Mesh(
  new THREE.SphereGeometry(2, 16, 16),
  new THREE.MeshBasicMaterial({ color: '#ff00ff', depthTest: false, transparent: true, opacity: 0.85 })
)
targetMarkerMesh.renderOrder = 999
targetMarkerMesh.visible = cfg.showTargetMarker
scene.add(targetMarkerMesh)

// Forearm Base Marker -- direct request 2026-09-27, same checkbox as the
// target marker above ("when i turn on show target marker, also show a
// marker for where the forearm base point is which we are using to
// measure the degree of rotation"): a 2nd marker, distinct color, showing
// tiltOriginGround (Point A of the Palm Rotation angle measurement --
// see updateTiltTarget()'s own comment for Point A/Point B). Shares
// checkboxShowTargetMarker's visibility with targetMarkerMesh rather than
// getting its own control, since the user asked for it as an addition to
// that existing checkbox, not a separate toggle.
const forearmBaseMarkerMesh = new THREE.Mesh(
  new THREE.SphereGeometry(2, 16, 16),
  new THREE.MeshBasicMaterial({ color: '#00ffff', depthTest: false, transparent: true, opacity: 0.85 })
)
forearmBaseMarkerMesh.renderOrder = 999
forearmBaseMarkerMesh.visible = cfg.showTargetMarker
scene.add(forearmBaseMarkerMesh)

// Ground Plane -- a real, visible slab (not the invisible math plane Palm
// Rotation's own cursor-tracking raycasts onto -- see updateTiltTarget()'s
// own comment; unrelated, this one is purely a scene decoration). Fixed,
// non-user-adjustable thickness per direct instruction ("Scale just means
// horizontal dimensions, not the thikcness"); Ground Height positions the
// slab's TOP surface, not its center ("Top plane of the ground will be
// the datum line for the ground height").
const GROUND_PLANE_THICKNESS = 1
const groundPlaneMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, GROUND_PLANE_THICKNESS, 1),
  new THREE.MeshStandardMaterial({ color: cfg.groundColor })
)
groundPlaneMesh.visible = cfg.groundPlaneEnabled
scene.add(groundPlaneMesh)
function updateGroundPlane() {
  groundPlaneMesh.visible = cfg.groundPlaneEnabled
  groundPlaneMesh.scale.set(cfg.groundScale, 1, cfg.groundScale)
  groundPlaneMesh.position.y = cfg.groundHeight - GROUND_PLANE_THICKNESS / 2
  groundPlaneMesh.material.color.set(cfg.groundColor)
}
updateGroundPlane()

// Toon material + gradient map (simplified from HANDY DANDIES' own version
// — this project re-derives a standard step-gradient rather than porting
// its exact rim-light shader injection, which wasn't available to extract).
// Ported verbatim from HANDY DANDIES' own makeGradientTexture() (RGBA,
// steps/shadowFloor/lightCeiling/threshold as explicit params, lerp-based
// — replaces this project's own earlier re-derived version, which used a
// different Red-channel/step-floor formula that only approximated the
// same visual intent).
function makeGradientTexture(steps, shadowFloor, lightCeiling, threshold) {
  const size = Math.max(2, Math.round(steps))
  const data = new Uint8Array(size * 4)
  for (let i = 0; i < size; i++) {
    const t = size <= 1 ? 1 : i / (size - 1)
    const biased = Math.pow(t, threshold)
    const v = Math.round(THREE.MathUtils.clamp(THREE.MathUtils.lerp(shadowFloor, lightCeiling, biased), 0, 100) / 100 * 255)
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.needsUpdate = true
  return tex
}
function rebuildGradientMap() {
  const tex = makeGradientTexture(cfg.toonSteps, cfg.toonShadowFloor, cfg.toonLightCeiling, cfg.toonStepThreshold)
  hands.forEach((h) => { h.skinnedMesh.material.gradientMap = tex; h.skinnedMesh.material.needsUpdate = true })
}
// Ported verbatim from HANDY DANDIES' own toonShaderUniformsList/
// setToonUniform() — every hand's own cloned toon material pushes its
// live shader.uniforms object here (from createToonMaterial()'s own
// onBeforeCompile, below) the first time it actually compiles, so a
// rim/texture-tint slider can reach every hand's own uniform set even
// though `material.clone()` does NOT re-run onBeforeCompile (clones
// share the compiled program but need their OWN uniforms entry pushed
// separately — handled in rebuildField() below).
const toonShaderUniformsList = []
function setToonUniform(name, value) {
  toonShaderUniformsList.forEach((u) => { if (u[name]) u[name].value = value })
}
// Ported verbatim from HANDY DANDIES' own createToonMaterial() — the
// rim-light + texture/duotone-tint GLSL injection this project's first
// build deliberately skipped (documented "known simplification" at the
// time, since the extraction pass that built this project didn't have
// the actual shader source to port faithfully). Re-extracted directly
// from HANDY DANDIES' own main.js this round, not reconstructed.
function createToonMaterial(map) {
  const material = new THREE.MeshToonMaterial({
    map,
    color: new THREE.Color(cfg.toonBaseTint),
    gradientMap: makeGradientTexture(cfg.toonSteps, cfg.toonShadowFloor, cfg.toonLightCeiling, cfg.toonStepThreshold),
    clippingPlanes: []
  })
  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: new THREE.Color(cfg.rimColor) }
    shader.uniforms.rimIntensity = { value: cfg.rimIntensity }
    shader.uniforms.rimPower = { value: cfg.rimPower }
    shader.uniforms.textureInfluence = { value: cfg.textureInfluence / 100 }
    shader.uniforms.toonTint = { value: new THREE.Color(cfg.toonTint) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `varying vec3 vRimNormal;\nvarying vec3 vRimViewDir;\n#include <common>`)
      .replace('#include <project_vertex>', `#include <project_vertex>\nvRimNormal = normalize( normalMatrix * objectNormal );\nvRimViewDir = normalize( -mvPosition.xyz );`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `varying vec3 vRimNormal;\nvarying vec3 vRimViewDir;\nuniform vec3 rimColor;\nuniform float rimIntensity;\nuniform float rimPower;\nuniform float textureInfluence;\nuniform vec3 toonTint;\n#include <common>`)
      .replace('#include <map_fragment>', `#include <map_fragment>\nfloat toonLuma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );\nvec3 toonDuotone = mix( vec3( 0.0 ), toonTint, toonLuma );\ndiffuseColor.rgb = mix( toonTint, toonDuotone, textureInfluence );`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>\nfloat rimFactor = pow( 1.0 - max( dot( normalize( vRimNormal ), normalize( vRimViewDir ) ), 0.0 ), rimPower );\ngl_FragColor.rgb += rimColor * rimFactor * rimIntensity;`)
    toonShaderUniformsList.push(shader.uniforms)
  }
  return material
}

// =======================================================================
// Device motion ("Phone Tilt") + desktop cursor fallback
// =======================================================================
// CORRECTED 2026-09-21 — the desktop mouse path used to be reduced to the
// SAME normalized 0-1 magnitude/angle abstraction as real device tilt,
// mapping onto a FIXED-RADIUS circle around the hand regardless of true
// camera perspective. Direct report: "look at Palm Face Rotation cursor
// tracking in Handy Dandies — that implementation doesn't require extreme
// values or extreme cursor tilt/distance, why does ours?" Read Handy
// Dandies' own real `updateCursorTarget()` (main.js ~1934) — it doesn't
// use any normalized-magnitude abstraction at all for its cursor input;
// it raycasts the ACTUAL cursor position through the camera onto a
// world-space plane (`targetPlane`, z=0), so even a small mouse movement
// near screen center produces a proportionate, true-perspective target
// displacement. HANDYSET's own `tiltMagnitude` normalization divides by
// `maxDist` (half the smaller screen dimension), so a real screen edge is
// needed before the signal approaches its max — that mismatch, not a
// bug in the rotation math itself (confirmed correct many times over
// this session), is why cursor tracking felt like it needed extreme
// positions to produce a visible response.
//
// Fixed by porting Handy Dandies' raycaster approach verbatim for the
// MOUSE path specifically (bypassing tiltMagnitude/tiltAngle entirely —
// `updateTiltTarget()` now branches on `lastInputSource`). Real device
// orientation (gyroscope) has no on-screen cursor position to raycast
// from — a physical tilt angle, not a 2D point — so it keeps the
// normalized magnitude/angle -> circular-offset approach, which is the
// correct abstraction for that fundamentally different kind of input.
let tiltMagnitude = 0, tiltAngle = 0
// Desktop-only raw cursor pixel offset from screen center -- added
// 2026-10-01, direct request: "for desktop, for the rotation curve
// editors, make the right side on x axis the width of the browser/2. so
// it covers all cursor tracking basicallly." Deliberately SEPARATE from
// `tiltMagnitude` (which normalizes by `min(halfWidth, halfHeight)` --
// see handleMouseMoveFallback()'s own `maxDist`), not a replacement for
// it -- `tiltMagnitude` is shared by several OTHER features (Reactive
// Arm Length, Responsive Wrist Splay, Palm Rotation's own
// `armBaseDistanceT`-adjacent uses) that must keep their existing
// saturation behavior; changing that shared value would silently affect
// all of them, the exact cross-feature-coupling mistake this file's own
// `armBaseDistanceT` gotcha already warns against. Set in
// handleMouseMoveFallback() from the SAME dx/dy it already computes for
// tiltMagnitude -- see computeDesktopRotationNxNy()'s own comment for
// how this is actually consumed.
let desktopCursorDxPx = 0, desktopCursorDyPx = 0
// Phone Model Responsive Rotation on MOBILE -- REPLACED 2026-09-28,
// direct report: "when i tilt far... it jumps then rotates 180...
// diffretn for each axis... i want the rotation to continue forever."
//
// The PREVIOUS design (unwrapped beta/gamma/alpha ABSOLUTE angles,
// reconstructed into a quaternion from scratch every frame) has a
// fundamental, unfixable limitation for this exact ask: beta/gamma/
// alpha are EULER-DECOMPOSED absolute orientation angles, and Euler
// angles have a hard representational limit -- gamma physically CANNOT
// exceed +-90 degrees, because past that point the SAME real 3D
// orientation gets re-expressed through a DIFFERENT combination of
// beta/alpha instead (this is gimbal lock, and it's exactly why the
// symptom looked "different for each axis": beta spans -180..180,
// gamma only -90..90, alpha wraps at 360, each hitting its own limit
// differently). No amount of unwrapping fixes this, because the
// unwrapped VALUE still gets fed through a fresh axis-angle
// reconstruction every frame, and reconstructing "rotate 190 degrees
// around a fixed axis" from scratch is NOT the same 3D orientation
// path as "having genuinely rotated there via 190 degrees of
// continuous motion" once slerp-damping (or even just quaternion
// double-cover) gets involved -- past 180 degrees the shortest
// quaternion path back toward a fresh target starts going the OTHER
// way, producing the reported "jump then rotates 180."
//
// FIXED by integrating the RAW GYROSCOPE (devicemotion.rotationRate --
// TRUE angular velocity around the phone's own current axes, already
// visible in this project's own Sensors log as "Gyro a/b/y") onto a
// PERSISTENT, ACCUMULATING quaternion (phoneGyroQuat), via body-frame
// (right-multiply) composition each tick -- the same technique real
// AR/IMU orientation tracking uses. This has NO representational
// limit and NO gimbal lock, because it never reconstructs an absolute
// angle from scratch -- it only ever composes a tiny, always-valid
// incremental rotation onto whatever the current accumulated
// orientation already is. See integratePhoneGyroRotation()'s own
// comment for the full integration math. Desktop (mouse) is
// UNCHANGED -- a cursor position has no physical "spin past 180"
// concept, so the existing curve/range/fineTune system (driven by
// cursor distance, confirmed as desktop-only) still applies there.
let phoneGyroQuat = new THREE.Quaternion()
let phoneGyroLastTimestamp = null
const _phoneGyroTiltAxis = new THREE.Vector3()
const _phoneGyroTiltQuat = new THREE.Quaternion()
const _phoneGyroSpinQuat = new THREE.Quaternion()
// CORRECTED 2026-09-28 (same day as gyro integration shipped), direct
// report: "you crossed some wires. real world Z rotation now rotates
// the model around its Y. real world Y rotation now rotates the model
// around X. real world x rotation is now Z." Treated as a 3-way cyclic
// code-to-visual relabeling and fixed by relabeling the axis slots.
//
// SUPERSEDED the same day, 3rd round: a follow-up report using an
// UNAMBIGUOUS physical description ("Z axis sticks out perpendicular to
// the screen" = spin; "top/bottom edge oscillate" = pitch; the
// remaining motion = roll) showed pitch was ALREADY landing correctly
// wherever it was coded (no hidden code-to-visual scramble after all --
// the "3-way cycle" diagnosis above was based on a less precise earlier
// report and turned out to be an overcomplication). The TARGET mapping
// is simply the IDENTITY: pitch->X, roll->Y, spin->Z, no permutation at
// all. The real, narrower bug: `rotationRate.alpha` and
// `rotationRate.gamma` are CROSSED relative to what
// `deviceorientation`'s same-named fields would suggest -- `rr.alpha`
// is actually the ROLL rate, `rr.gamma` is actually the SPIN rate. Fixed
// in `integratePhoneGyroRotation()` by reading `rr.alpha` for roll and
// `rr.gamma` for spin (slots unchanged: pitch+roll combine into one
// axis-angle on X/Y, spin stays separate on Z) -- see that function's
// own `dPitchDeg`/`dRollDeg`/`dSpinDeg` variables, named for their
// PHYSICAL role rather than their raw property name specifically
// because the mismatch between "variable name" and "actual role" is
// what made this bug hard to track across 3 rounds.
const PHONE_GYRO_SPIN_LOCAL_AXIS = new THREE.Vector3(0, 0, 1)
let phoneNxBaseline = 0
let phoneNyBaseline = 0
let lastInputSource = 'device' // 'device' | 'mouse' — which path updateTiltTarget() should use this frame
const cursorNDC = new THREE.Vector2(0, 0)
const raycaster = new THREE.Raycaster()
// The mouse path's own measurement plane -- see updateTiltTarget()'s own
// comment for the full account. World Y=0 (the same horizontal plane
// hand.wrapper.position/h.basePosition already sit on for a default 1x1
// field). Replaces a prior vertical Z=0 "cursorTargetPlane" -- removed,
// no longer used by anything (the device-orientation branch never raycast
// at all, it only ever used a synthesized tiltTarget).
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const _forearmWorldPos = new THREE.Vector3()
const tiltOriginGround = new THREE.Vector3()
// Responsive Arm Rotation at Base / Responsive Wrist Splay's own shared
// distance metric -- direct request 2026-09-27, deliberately DIFFERENT
// from tiltMagnitude (screen-distance-from-CENTER): "The closer the
// cursor to the hand/arm base point on the XZ plane... For mobile, the
// further the phone tilt, the further the arm rotates... make the right
// side of the X axis (max distance) be set as the farthest distance from
// the arm base point to the edge of browser." On the mouse path this is
// the real world-space XZ distance from tiltOriginGround (the forearm
// base's own ground point, Point A) to tiltTarget (the cursor's own
// ground hit, Point B), normalized 0-1 against the farthest such
// distance reachable by ANY point in the browser window (the 4 screen
// corners' own ground hits -- computeMaxArmBaseGroundDistance() below).
// On the device-orientation path there's no cursor/ground geometry at
// all, so this is just tiltMagnitude directly, unchanged -- "the further
// the phone tilt" already IS what tiltMagnitude measures for that path.
let armBaseDistanceT = 0
const _cornerNDC = new THREE.Vector2()
const _cornerHit = new THREE.Vector3()
function computeMaxArmBaseGroundDistance() {
  const w = window.innerWidth, h = window.innerHeight
  let maxDist = 0
  ;[[0, 0], [w, 0], [0, h], [w, h]].forEach(([px, py]) => {
    _cornerNDC.set((px / w) * 2 - 1, -(py / h) * 2 + 1)
    raycaster.setFromCamera(_cornerNDC, camera)
    if (raycaster.ray.intersectPlane(groundPlane, _cornerHit)) {
      const d = Math.hypot(_cornerHit.x - tiltOriginGround.x, _cornerHit.z - tiltOriginGround.z)
      if (d > maxDist) maxDist = d
    }
  })
  return maxDist
}
let latestOrientation = null
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
// getRuntimeDeviceSuffix -- added 2026-10-01, direct report: "When I set
// settings to view in mobile. Such as texture x offset, the slide appears
// in mobile tab, but it does nothing. Behavior is still dictated by
// desktop tab." Root cause: applyScreenTextureTransform() (the actual
// RENDER-time code that applies screenTextureOffsetX/Y and
// screenTextureScaleX/Y to the live texture) picked its device suffix via
// getActiveDevPanelTab() -- a devPanel.js UI helper reporting which TAB
// is currently scrolled into view in the DEV PANEL EDITOR, not which
// device is actually running the app. wireDeviceSlider() (the control's
// own WRITE path, used while editing) correctly uses that same function
// -- that's the right signal for "which device's value am I currently
// editing" -- but applying it at RENDER time meant the live texture only
// ever picked up a Mobile/Landscape-suffixed value while someone happened
// to have the dev panel's own Mobile/Landscape tab scrolled into view;
// the rest of the time (panel closed, or sitting on the Desktop tab) it
// silently fell back to the Desktop-suffixed value regardless of what
// device was actually rendering. This function is the correct signal for
// render-time device selection: real isTouchDevice + live orientation
// (innerWidth > innerHeight = landscape), matching every other real
// device/orientation check in this file (Phone Tilt, Responsive Rotation,
// etc.) -- never the dev panel's own currently-open tab.
function getRuntimeDeviceSuffix() {
  if (!isTouchDevice) return ''
  return window.innerWidth > window.innerHeight ? 'Landscape' : 'Mobile'
}

function handleDeviceOrientation(e) {
  latestOrientation = e
  lastInputSource = 'device'
  const beta = THREE.MathUtils.clamp(e.beta || 0, -90, 90)   // front-back tilt
  const gamma = THREE.MathUtils.clamp(e.gamma || 0, -90, 90) // left-right tilt
  const maxTilt = 45
  const nx = THREE.MathUtils.clamp(gamma / maxTilt, -1, 1)
  const ny = THREE.MathUtils.clamp(beta / maxTilt, -1, 1)
  tiltMagnitude = Math.min(Math.hypot(nx, ny), 1)
  tiltAngle = Math.atan2(ny, nx)
  // Phone Model Responsive Rotation on MOBILE no longer reads beta/gamma/
  // alpha at all -- see integratePhoneGyroRotation() (driven by
  // devicemotion.rotationRate instead) and phoneGyroQuat's own
  // declaration comment for why.
}
// GUARD added 2026-09-28, direct report: "I tap, and for a split second
// i see the phone model out of orientation, then it flashes back...
// maybe its the phone tilt cursor tracking bugging it up... using both
// the phone tilt and the cursor tracking." Root cause: many mobile
// browsers fire a SYNTHETIC 'mousemove' (and click) as a touch-
// compatibility shim after a real touch event. Without this guard, a
// single tap briefly flipped lastInputSource to 'mouse' and computed
// Phone Model's rotation from the TAP'S SCREEN POSITION (via
// tiltMagnitude/tiltAngle) instead of the real device orientation --
// until the next real deviceorientation event reverted it a frame or
// two later, exactly matching the "flash then revert" symptom. This
// also explains the position-dependence ("tap right = clockwise, tap
// left = anticlockwise" -- that's literally Phone Model's desktop/
// cursor-distance formula reacting to the tap's own X position).
// MouseEvent.sourceCapabilities.firesTouchEvents (Chrome/Android --
// this project's actual target) is true ONLY for a synthetic mouse
// event generated from a touch interaction, never for a real mouse/
// trackpad move, even on a touch-capable laptop.
function handleMouseMoveFallback(e) {
  if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return
  lastInputSource = 'mouse'
  cursorNDC.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
  // tiltMagnitude/tiltAngle are ALSO still needed here — Reactive Arm
  // Length/Responsive Wrist Splay (computeArmLengthT/
  // computeResponsiveWristSplayDeg) read tiltMagnitude directly, not
  // cursorNDC/tiltTarget. Found live: removing this (leaving only
  // cursorNDC, on the assumption tiltTarget's own new raycast made
  // tiltMagnitude obsolete) left it permanently stuck at whatever it was
  // before mouse input took over (0 on a fresh load), pinning Reactive
  // Arm Length/Wrist Splay to a single fixed curve value regardless of real cursor
  // position and producing an unexpectedly aggressive, unchanging crop.
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2
  const dx = e.clientX - cx, dy = e.clientY - cy
  const maxDist = Math.min(cx, cy)
  tiltMagnitude = Math.min(Math.hypot(dx, dy) / maxDist, 1)
  tiltAngle = Math.atan2(-dy, dx)
  // Raw pixel offset, reused (not recomputed) for Rotation's own
  // width/2-normalized curve input -- see desktopCursorDxPx's own
  // declaration comment.
  desktopCursorDxPx = dx
  desktopCursorDyPx = dy
}
function attachMotionListeners() {
  window.addEventListener('deviceorientation', handleDeviceOrientation)
  if (typeof DeviceMotionEvent !== 'undefined') window.addEventListener('devicemotion', handleDeviceMotion)
}
// Both inputs are always attached, unconditionally — not gated behind an
// isTouchDevice guess. `isTouchDevice` (a 'ontouchstart' in window /
// maxTouchPoints check) is an unreliable proxy for "is this a phone": a
// touch-capable desktop/laptop would wrongly route into the
// gyroscope-only branch and get NO input at all (no deviceorientation
// events ever fire on a non-phone, even one with a touchscreen), which is
// exactly the bug a direct report caught ("on desktop it does nothing").
// mousemove is harmless to leave attached on a real phone too — touch
// interaction doesn't generate a continuous mousemove stream, so it just
// never fires there. Whichever input actually produces real events wins,
// per-device, without needing to correctly guess the device type first.
// Direct request (2026-09-21): "Remove the enable motion button. The on
// off of the cursor/tilt tracking should just be determined by the on/off
// checkboxes in Phone Tilt group." Android (the actual target device)
// never needed the button at all -- DeviceOrientationEvent.requestPermission
// doesn't exist there, so attachMotionListeners() already ran
// unconditionally on page load. The button only ever mattered for iOS's
// own gesture-gated permission API; now that gate is the Tracking Enabled
// checkbox itself (wireCheckbox('checkboxTrackingEnabled', ...) below), a
// real user click, instead of a dedicated button.
let motionPermissionRequested = false
function requestMotionPermissionIfNeeded() {
  if (typeof DeviceOrientationEvent === 'undefined') return
  const needsPermission = typeof DeviceOrientationEvent.requestPermission === 'function'
  if (!needsPermission) { attachMotionListeners(); return }
  if (motionPermissionRequested) return
  motionPermissionRequested = true
  DeviceOrientationEvent.requestPermission().then((state) => {
    if (state === 'granted') attachMotionListeners()
  }).catch(() => {})
  if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
    DeviceMotionEvent.requestPermission().catch(() => {})
  }
}
function initMotionInput() {
  window.addEventListener('mousemove', handleMouseMoveFallback)
  // Responsive Displace is now independent of Tracking Enabled (direct
  // answer: "Fully independent") -- requesting permission on EITHER
  // being on at load ensures Displace's own real devicemotion listener
  // is attached even when Tracking Enabled itself is off.
  if (cfg.trackingEnabled || cfg.phoneResponsiveDisplaceEnabled) requestMotionPermissionIfNeeded()
}
// Rotation Reset gesture -- direct request 2026-09-28: double-tap
// (mobile)/double-click (desktop) ANYWHERE on screen re-baselines Phone
// Model's responsive rotation (resetPhoneModelRotationBaseline()).
// Gated by cfg.phoneRotationResetEnabled so it never fires unless the
// user has explicitly turned it on. Excludes the dev panel itself (and
// its floating DEV toggle button) so double-clicking a dev-panel control
// doesn't also trigger a reset. Native `dblclick` covers Desktop; mobile
// browsers generally don't fire `dblclick` from a tap gesture, so touch
// double-taps are detected manually -- 2 touchend events within
// DOUBLE_TAP_MS of each other and within DOUBLE_TAP_MAX_DIST_PX of the
// same screen position (so 2 unrelated taps in different places never
// count as one double-tap).
const DOUBLE_TAP_MS = 350
const DOUBLE_TAP_MAX_DIST_PX = 40
let lastTapTime = 0
let lastTapX = 0
let lastTapY = 0
function isInsideDevPanel(target) {
  return !!(target && target.closest && (target.closest('#devPanel') || target.closest('.dev-toggle-btn')))
}
// CORRECTED 2026-09-28, direct report ("I think the 3js pan and zoom
// controls may be interfering" -- confirmed as a real, separate
// contributing cause alongside the synthetic-mousemove bug above):
// both listeners now use the CAPTURE phase. OrbitControls attaches its
// own pointer/touch handlers directly to the canvas and commonly calls
// stopPropagation() on them (standard practice, to stop the browser's
// own default touch/scroll gestures from also firing) -- a BUBBLE-phase
// listener on `window` (the original version) never sees an event once
// a descendant's bubble-phase handler stops it. A CAPTURE-phase listener
// on `window` always runs FIRST, top-down, strictly before the event
// even reaches the canvas or OrbitControls' own bubble-phase handler --
// so it can no longer be swallowed regardless of what OrbitControls
// does afterward.
// SPLIT 2026-09-30, direct request: "add a displacement reset checkbox.
// Similar to the rotation, a double tap will place the phone back in its
// starting location" -- Rotation Reset and Displace Reset are now
// independently toggleable, both still sharing the ONE double-tap/
// double-click gesture (not 2 separate gestures). The gesture fires if
// EITHER checkbox is on; each piece only actually resets if its OWN
// checkbox is checked.
function firePhoneResetGesture() {
  if (cfg.phoneRotationResetEnabled) resetPhoneRotationBaseline()
  if (cfg.phoneDisplaceResetEnabled) resetPhoneDisplaceBaseline()
}
function setupPhoneRotationResetGesture() {
  window.addEventListener('dblclick', (e) => {
    if ((!cfg.phoneRotationResetEnabled && !cfg.phoneDisplaceResetEnabled) || isInsideDevPanel(e.target)) return
    firePhoneResetGesture()
  }, { capture: true })
  window.addEventListener('touchend', (e) => {
    if ((!cfg.phoneRotationResetEnabled && !cfg.phoneDisplaceResetEnabled) || isInsideDevPanel(e.target)) return
    const touch = e.changedTouches && e.changedTouches[0]
    if (!touch) return
    const now = performance.now()
    const dx = touch.clientX - lastTapX, dy = touch.clientY - lastTapY
    if ((now - lastTapTime) < DOUBLE_TAP_MS && Math.hypot(dx, dy) < DOUBLE_TAP_MAX_DIST_PX) {
      firePhoneResetGesture()
      lastTapTime = 0 // consume -- a 3rd quick tap starts a fresh pair, not another double-tap
    } else {
      lastTapTime = now
      lastTapX = touch.clientX
      lastTapY = touch.clientY
    }
  }, { capture: true })
}

// =======================================================================
// Scene Object registry -- a minimal port of 3JS ENGINE's own
// registerSceneObject()/sceneObjectEntries (its src/main.js), scoped down
// to just what the Object Axes picker below needs (that project's own
// version also backs a full property Inspector this project doesn't
// have). Populated by rebuildField() (one entry per hand) and the Phone
// Model load/remove functions below (one entry for the phone).
// =======================================================================
const sceneObjectEntries = []
function registerSceneObject(id, label, object3d) {
  unregisterSceneObject(id) // idempotent -- re-registering replaces, never duplicates
  sceneObjectEntries.push({ id, label, object3d })
  if (typeof renderObjectAxesPicker === 'function') renderObjectAxesPicker()
}
function unregisterSceneObject(id) {
  if (typeof removeObjectAxesFor === 'function') removeObjectAxesFor(id) // detach/dispose before the entry disappears; the id STAYS in objectAxesEnabledIds
  const idx = sceneObjectEntries.findIndex((e) => e.id === id)
  if (idx >= 0) sceneObjectEntries.splice(idx, 1)
  if (typeof renderObjectAxesPicker === 'function') renderObjectAxesPicker()
}

// =======================================================================
// Object Axes (Debug group) -- ported from 3JS ENGINE's own
// "World Axes / Object Axes visualization" (its src/main.js), Object Axes
// half only (World Axes wasn't requested). Fat Line2/LineMaterial lines,
// not a bare THREE.AxesHelper -- a plain AxesHelper's LineBasicMaterial
// silently ignores `linewidth` on most platforms, so its own "Line
// Thickness" control would have no visible effect.
// =======================================================================
const AXES_DIRS = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
const AXES_COLORS = [0xff3333, 0x33ff33, 0x3388ff] // X/red, Y/green, Z/blue -- THREE.AxesHelper's own convention
const fatAxesLineMaterials = [] // every live LineMaterial -- resize handler below keeps their `resolution` current
function createFatAxesVisualization(length, thicknessPx) {
  const group = new THREE.Group()
  group.name = 'ObjectAxesVisualization'
  AXES_DIRS.forEach((dir, i) => {
    const geometry = new LineGeometry()
    geometry.setPositions([0, 0, 0, dir[0] * length, dir[1] * length, dir[2] * length])
    const material = new LineMaterial({ color: AXES_COLORS[i], linewidth: thicknessPx })
    material.resolution.set(renderer.domElement.width || 1, renderer.domElement.height || 1)
    fatAxesLineMaterials.push(material)
    group.add(new Line2(geometry, material))
  })
  return group
}
function disposeFatAxesVisualization(group) {
  group.children.forEach((line) => {
    const idx = fatAxesLineMaterials.indexOf(line.material)
    if (idx >= 0) fatAxesLineMaterials.splice(idx, 1)
    line.geometry.dispose()
    line.material.dispose()
  })
}
function rebuildFatAxesLength(group, length) {
  group.children.forEach((line, i) => {
    line.geometry.setPositions([0, 0, 0, AXES_DIRS[i][0] * length, AXES_DIRS[i][1] * length, AXES_DIRS[i][2] * length])
  })
}
function applyFatAxesRenderState(group, renderInFront, thicknessPx) {
  group.children.forEach((line) => {
    line.material.depthTest = !renderInFront
    line.renderOrder = renderInFront ? 999 : 0
    line.material.linewidth = thicknessPx
  })
}
// entryId -> the live THREE.Group parented to that entry's own object3d
// (inherits its local transform automatically -- no per-frame matrix math
// needed to keep the visualization following a moving/rotating object).
const objectAxesGroups = new Map()
const objectAxesEnabledIds = new Set()
function ensureObjectAxesFor(entryId) {
  const entry = sceneObjectEntries.find((e) => e.id === entryId)
  if (!entry) return
  let group = objectAxesGroups.get(entryId)
  if (group && group.parent !== entry.object3d) {
    if (group.parent) group.parent.remove(group)
    entry.object3d.add(group)
  } else if (!group) {
    group = createFatAxesVisualization(cfg.objectAxesLength, cfg.objectAxesThickness)
    entry.object3d.add(group)
    objectAxesGroups.set(entryId, group)
  }
  group.visible = cfg.objectAxesEnabled
  applyFatAxesRenderState(group, cfg.objectAxesRenderInFront, cfg.objectAxesThickness)
}
function removeObjectAxesFor(entryId) {
  const group = objectAxesGroups.get(entryId)
  if (!group) return
  if (group.parent) group.parent.remove(group)
  disposeFatAxesVisualization(group)
  objectAxesGroups.delete(entryId)
}
function renderObjectAxesPicker() {
  const listEl = document.getElementById('objectAxesPickerList')
  if (!listEl) return
  listEl.innerHTML = ''
  if (!sceneObjectEntries.length) {
    const empty = document.createElement('div')
    empty.className = 'dev-label'
    empty.textContent = '(no objects currently registered)'
    listEl.appendChild(empty)
    return
  }
  sceneObjectEntries.forEach((entry) => {
    const row = document.createElement('div')
    row.className = 'dev-lp-row'
    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = objectAxesEnabledIds.has(entry.id)
    cb.addEventListener('click', (e) => e.stopPropagation())
    cb.addEventListener('change', () => {
      if (cb.checked) { objectAxesEnabledIds.add(entry.id); ensureObjectAxesFor(entry.id) }
      else { objectAxesEnabledIds.delete(entry.id); removeObjectAxesFor(entry.id) }
    })
    row.appendChild(cb)
    const label = document.createElement('span')
    label.textContent = entry.label
    row.appendChild(label)
    listEl.appendChild(row)
  })
}

// =======================================================================
// Phone Model -- direct request 2026-09-27: a loadable smartphone GLB
// (data/processed/SMARTPHONE MODELS/*.glb), positioned/scaled/rotated
// independently of the hand, with its own phone-tilt-driven responsive
// rotation. "Anchor of rotation will be the centroid of the 3d geometry"
// -- uses the exact same rotate-about-arbitrary-point technique as
// applyModelRootTransform()'s own modelRotationPivot (see that function's
// comment for the formula's origin/derivation), just for this single
// unrigged model instead of a skinned hand.
//
// Filenames under SMARTPHONE MODELS/ contain literal spaces (e.g.
// "iphone 17_4.glb", "Pixel 9A.glb") -- encodeURI() at the GLTFLoader.load
// call site handles this; cfg.phoneModelFile itself stores the raw,
// human-readable relative path (so a Copy/Save dump of this setting stays
// readable), not a pre-encoded one.
// =======================================================================
// CORRECTED 2026-09-29: this used to be a hardcoded const array, kept in
// sync with data/processed/SMARTPHONE MODELS/'s real contents by hand
// (a real, recurring maintenance burden -- see the git history for how
// often it drifted). Now a mutable list populated at startup from
// data/processed/SMARTPHONE MODELS/manifest.json (loadPhoneModelManifest()
// below), with the Item Selector's own "Import GLB" feature able to add
// to it live. `.value`/`.text` shape kept identical to the old array so
// every existing PHONE_MODEL_OPTIONS-reading call site is unaffected.
const PHONE_MODEL_DIR = 'data/processed/SMARTPHONE MODELS'
const PHONE_MODEL_MANIFEST_ENDPOINT = '/api/upload-phone-model'
let PHONE_MODEL_OPTIONS = [
  { value: 'data/processed/SMARTPHONE MODELS/P5_Project_1.glb', text: 'P5 Project 1' },
  { value: 'data/processed/SMARTPHONE MODELS/Pixel 9A.glb', text: 'Pixel 9A' },
  { value: 'data/processed/SMARTPHONE MODELS/Iphone17MaxPro.glb', text: 'iPhone 17 Max Pro' },
  { value: 'data/processed/SMARTPHONE MODELS/Galaxy S2.glb', text: 'Galaxy S2' },
  { value: 'data/processed/SMARTPHONE MODELS/Motorola Razr.glb', text: 'Motorola Razr' },
  { value: 'data/processed/SMARTPHONE MODELS/Nothing2.glb', text: 'Nothing2' },
  { value: 'data/processed/SMARTPHONE MODELS/Samsung Galaxy S26.glb', text: 'Samsung Galaxy S26' },
  { value: 'data/processed/SMARTPHONE MODELS/iPhone 17 Max.glb', text: 'iPhone 17 Max' },
  { value: 'data/processed/SMARTPHONE MODELS/S4.glb', text: 'S4' }
] // hardcoded fallback, used only if BOTH the live manifest fetch (GitHub, via the API endpoint) AND the static same-origin manifest.json fail (e.g. fully offline)
// REMOVED 2026-09-29 -- a per-model `scale` field (manifest.json) plus
// an automatic scale-to-hand-length computation were both tried here
// the same day, in response to real reports that models were
// invisible/oversized. Direct correction from the user: "No, I don't
// want you to override my personal settings, but make by default
// scale to one and placed at world origin." Any per-model or automatic
// scale adjustment silently changes what a given cfg.phoneModelScale
// slider value actually renders as, which is exactly the kind of
// "override" that direct instruction rules out -- cfg.phoneModelScale
// is now the ONLY thing controlling scale, uniformly, for every model
// (see its own cfg declaration comment for the new default). If a
// future report says a specific model is oversized/undersized again,
// that's the user's own call to make via that one slider (or their own
// Blender export), not something this file should compensate for
// automatically behind the scenes.
function manifestModelsToOptions(models) {
  return (Array.isArray(models) ? models : [])
    .filter((m) => m && typeof m.file === 'string')
    .map((m) => ({ value: PHONE_MODEL_DIR + '/' + m.file, text: m.name || m.file }))
}
// Tries the LIVE manifest first (GitHub Contents API via our own
// endpoint -- reflects an import from moments ago, same reasoning
// save-settings.js's own GET already documents for settings), then the
// static same-origin file (whatever was live at the last Vercel
// deploy), then gives up and keeps the hardcoded fallback above.
// Re-renders the Item Selector's own list afterward if anything changed.
async function loadPhoneModelManifest() {
  try {
    const resp = await fetch(PHONE_MODEL_MANIFEST_ENDPOINT, { cache: 'no-store' })
    const body = await resp.json().catch(() => ({}))
    if (resp.ok && body.ok === true && body.manifest && Array.isArray(body.manifest.models) && body.manifest.models.length) {
      PHONE_MODEL_OPTIONS = manifestModelsToOptions(body.manifest.models)
      renderPhoneModelItemSelector()
      return
    }
  } catch (e) { /* fall through to the static file */ }
  try {
    const resp = await fetch(PHONE_MODEL_DIR + '/manifest.json', { cache: 'no-store' })
    if (resp.ok) {
      const manifest = await resp.json()
      if (manifest && Array.isArray(manifest.models) && manifest.models.length) {
        PHONE_MODEL_OPTIONS = manifestModelsToOptions(manifest.models)
        renderPhoneModelItemSelector()
      }
    }
  } catch (e) { /* keep the hardcoded fallback */ }
}
let phoneModelWrapper = null // THREE.Group at world origin + Offset sliders, added to `scene`
let phoneModelRaw = null // the loaded gltf.scene, child of phoneModelWrapper -- rotation/scale/pivot-compensated position
let phoneModelLoadToken = 0 // guards a stale async load callback from applying after a newer selection superseded it
// Virtual Screen (render-to-texture onto the phone's own 'Screen Face'
// mesh) -- see findPhoneScreenMeshes()/renderVirtualScreen() below.
// Arrays, not single values, since a multi-primitive glTF 'Screen Face'
// node loads as several separate THREE.Mesh children (see
// findPhoneScreenMeshes()'s own comment) -- phoneScreenOriginalMaterials
// is index-parallel to phoneScreenMeshes.
let phoneScreenMeshes = [] // the mesh(es) found inside phoneModelRaw, or [] if this model has none
let phoneScreenOriginalMaterials = [] // each mesh's own real glTF material -- restored whenever Screen Render is off or the model reloads
let phoneScreenUvCenter = { x: 0.5, y: 0.5 } // real UV midpoint of phoneScreenMeshes[0], recomputed on every model load -- see loadPhoneModel()'s own comment
let phoneScreenUvAspect = 1 // real UV width/height of phoneScreenMeshes[0]'s own screen area, recomputed on every model load -- see applyScreenTextureTransform()'s "To Scale" comment
let phoneScreenRenderMaterial = null // shared unlit MeshBasicMaterial driving the screen while Screen Render is on; only its .map is swapped per pass -- never disposed/recreated per model, so a model switch doesn't need to rebuild it
let phoneScreenWhiteMaterial = null // shared plain white MeshBasicMaterial, no .map -- shown ONLY on the deepest recursion pass (pass 0, the recursion floor), which has no captured image yet -- see renderVirtualScreen()'s own comment
let screenRenderTargets = null // [RT_A, RT_B], created once and reused -- ping-ponged across up to 10 recursion passes per frame (see renderVirtualScreen())

// Per-axis parsed state -- same {range, curve, method}-per-axis shape as
// phoneDisplaceAxisParsed (below), replacing the single shared
// phoneResponsiveRotationRangeParsed/CurveParsed/CurveMethod. Called from
// curveWidgetResyncs on a detected widget change AND once explicitly at
// dev-panel build time (matching Displace's own parser, not Rotation's
// prior behavior -- see that call site's own comment for why).
const phoneRotationAxisParsed = {
  X: { range: { min: 0, max: 90 }, curve: [{ x: 0, y: 0 }, { x: 1, y: 1 }], method: 'catmullrom' },
  Y: { range: { min: 0, max: 90 }, curve: [{ x: 0, y: 0 }, { x: 1, y: 1 }], method: 'catmullrom' },
  Z: { range: { min: 0, max: 90 }, curve: [{ x: 0, y: 0 }, { x: 1, y: 1 }], method: 'catmullrom' }
}
function parsePhoneResponsiveRotationConfig() {
  ;['X', 'Y', 'Z'].forEach((axis) => {
    const slot = phoneRotationAxisParsed[axis]
    try { slot.range = JSON.parse(cfg['phoneRotationRange' + axis]) } catch (e) { /* keep last-good value */ }
    try { const parsed = JSON.parse(cfg['phoneRotationCurve' + axis]); slot.curve = (parsed.points || parsed).slice().sort((a, b) => a.x - b.x); slot.method = parsed.method || 'catmullrom' } catch (e) { /* keep last-good value */ }
  })
}
// Responsive Displace -- same parse-on-change pattern as Rotation's own
// parser directly above. Called once explicitly at dev-panel build time
// too (renderPhoneModelGroup(), below), unlike Rotation's own parser --
// that one is ONLY ever invoked from its curveWidgetResyncs poll (on a
// detected VALUE CHANGE), never once at startup against a Sync-restored
// cfg value, which means a restored non-default range/curve silently
// doesn't reach phoneResponsiveRotationRangeParsed/CurveParsed until the
// user manually drags that widget at least once. Not touching Rotation's
// existing behavior (out of scope for this task), just not repeating the
// same gap in this new, otherwise-identical parser.
// Per-axis parsed state -- one {range, curve, method} triple per axis,
// keyed by axis letter so computePhoneDisplaceAxisUnits() (below) can
// look up the right one generically instead of 3 near-duplicate
// functions. parsePhoneResponsiveDisplaceConfig() re-parses all 3 at
// once (called both from curveWidgetResyncs, on a detected value change,
// AND once explicitly at dev-panel build time -- see that call site's
// own comment for why this matters for a Sync-restored non-default value).
const phoneDisplaceAxisParsed = {
  X: { range: { min: 0, max: 20 }, curve: [{ x: 0, y: 0 }, { x: 1, y: 1 }], method: 'monotone' },
  Y: { range: { min: 0, max: 20 }, curve: [{ x: 0, y: 0 }, { x: 1, y: 1 }], method: 'monotone' },
  Z: { range: { min: 0, max: 20 }, curve: [{ x: 0, y: 0 }, { x: 1, y: 1 }], method: 'monotone' }
}
function parsePhoneResponsiveDisplaceConfig() {
  ;['X', 'Y', 'Z'].forEach((axis) => {
    const slot = phoneDisplaceAxisParsed[axis]
    try { slot.range = JSON.parse(cfg['phoneDisplaceRange' + axis]) } catch (e) { /* keep last-good value */ }
    try { const parsed = JSON.parse(cfg['phoneDisplaceCurve' + axis]); slot.curve = (parsed.points || parsed).slice().sort((a, b) => a.x - b.x); slot.method = parsed.method || 'monotone' } catch (e) { /* keep last-good value */ }
  })
}
let screenLevelScaleRangeParsed = { min: 1, max: 1 }
let screenLevelScaleCurveParsed = [{ x: 0, y: 0 }, { x: 1, y: 1 }]
let screenLevelScaleCurveMethod = 'linear'
function parseScreenLevelScaleConfig() {
  try { screenLevelScaleRangeParsed = JSON.parse(cfg.screenLevelScaleRange) } catch (e) { /* keep last-good value */ }
  try { const parsed = JSON.parse(cfg.screenLevelScaleCurve); screenLevelScaleCurveParsed = (parsed.points || parsed).slice().sort((a, b) => a.x - b.x); screenLevelScaleCurveMethod = parsed.method || 'linear' } catch (e) { /* keep last-good value */ }
}
// Per-Level Scale -- direct request 2026-09-29, see cfg.screenLevelScaleRange's
// own comment. `depth` is the VIEWER-perceived nesting level (1 = the
// outermost/directly-visible render, up to `levels` = the deepest/innermost
// one) -- "Left edge is the first level" means depth=1 at curve-X=0, matching
// this file's own established depth terminology (see
// applyScreenTextureTransform()'s own leading comment on the mirror feature
// for why depth, not raw pass index, is the right axis to expose here too).
// Normalized so X always spans the CURRENT total level count exactly
// ("regardless of level amount"): depth=1 -> t=0, depth=levels -> t=1.
function computeScreenLevelScale(depth, levels) {
  const t = levels > 1 ? THREE.MathUtils.clamp((depth - 1) / (levels - 1), 0, 1) : 0
  const curveY = THREE.MathUtils.clamp(window.evaluateCurveEditorPoints(screenLevelScaleCurveParsed, t, screenLevelScaleCurveMethod), 0, 1)
  const { min, max } = screenLevelScaleRangeParsed
  return min + (max - min) * curveY
}
// Desktop-only curve/range mapping -- direct confirmation 2026-09-28: "i
// had it since on desktop, the phone model rotation was determined by
// distance of the cursor... in a no cursor scenario i have no use for
// it." Mobile does NOT call this at all any more (see
// computePhoneCombinedQuat()'s own comment) -- it's a direct,
// unthresholded passthrough instead. rawComponent is now that axis's
// OWN raw signed input (ny for X, -nx for Y, nx for Z -- see
// computePhoneCombinedQuat()'s desktop branch), evaluated through that
// axis's OWN curve/range (phoneRotationAxisParsed[axis]) -- CHANGED
// 2026-10-01 from a single shared curve evaluated at the COMBINED
// radial tilt distance then split proportionally by direction cosine.
// Genuinely independent per-axis curves now, matching Displace's own
// design (computePhoneDisplaceAxisUnits()).
//
// PROTECTED 2026-09-28 with a small deadzone, found necessary from a
// REAL live bug (at the time still shared with mobile): the user's own
// synced "Min/Max Rotation" range had drifted to {min:-57,max:45}, and
// with magnitude = min + (max-min)*curveY, a negative min means even
// near-zero input computes a magnitude around -57 -- multiplied by
// Math.sign(rawComponent), which flips unpredictably from noise on a
// value that should be ~0. Kept as a defensive floor even now that
// mobile no longer uses this path at all, since desktop's own cursor
// position can still sit very close to dead-center.
const PHONE_RESPONSIVE_DEADZONE = 0.02 // ~1deg-equivalent (0.02 * 45)
function computePhoneResponsiveAxisDeg(rawComponent, axis) {
  if (!cfg.trackingEnabled) return 0
  if (!cfg.responsiveRotationGlobalEnabled) return 0
  if (!cfg.phoneResponsiveRotationEnabled) return 0
  if (Math.abs(rawComponent) < PHONE_RESPONSIVE_DEADZONE) return 0
  const slot = phoneRotationAxisParsed[axis]
  const t = THREE.MathUtils.clamp(Math.abs(rawComponent), 0, 1)
  const curveY = THREE.MathUtils.clamp(window.evaluateCurveEditorPoints(slot.curve, t, slot.method), 0, 1)
  const { min, max } = slot.range
  // Clamped to >= 0, added 2026-10-01 -- same fix as
  // computePhoneDisplaceAxisUnits()'s own matching comment (a few lines
  // down), applied here defensively too since this function shares the
  // identical magnitude-then-sign formula and the same negative-min risk
  // this file's own 2026-09-27 PHONE_RESPONSIVE_DEADZONE comment already
  // flagged (a negative min giving ~-57 magnitude at near-zero input) --
  // that round only added a value deadzone, which relocates the jump to
  // the deadzone boundary rather than removing it. Not independently
  // confirmed broken for Rotation (the user has it switched off), but
  // the formula is identical and the fix is free.
  const magnitude = Math.max(0, min + (max - min) * curveY + (cfg.phoneResponsiveRotationFineTune || 0))
  return magnitude * Math.sign(rawComponent)
}
// Responsive Displace -- maps a leaky-integrated per-axis position
// (phoneDisplacePosX/Y/Z, in real METERS -- see applyPhoneDisplaceSample()/
// integratePhoneDisplacement()/updatePhoneDisplaceDesktopFrame() below)
// through the curve/range/fine-tune system into World Units (the same
// unit phoneModelOffsetX/Y/Z already use).
//
// CORRECTED 2026-09-30, direct clarification after this feature's first
// desktop implementation used the cursor's STATIC distance/angle from
// screen center (the same tiltMagnitude/tiltAngle signal Rotation's own
// desktop path reads): "that displacement isnt meant to be driven by
// phone tilt at all... its only meant to measure the movement in
// space... but of course yo still use tilt data to determine the
// directio nthe phone is oving [sic] ... but magnitude of tilt should
// not affect magnitude of displacement." Desktop now measures actual
// CURSOR MOVEMENT (frame-to-frame delta, see updatePhoneDisplaceDesktopFrame()),
// fed through the SAME leaky accel-like integrator mobile's real
// accelerometer uses -- both platforms write into the SAME
// phoneDisplacePosX/Y/Z state now, through the SAME normalization below,
// so this function no longer branches by platform at all. Tilt/
// orientation data is still legitimately used for DIRECTION in mobile's
// 'worldPosition' mode (rotating the raw acceleration vector into world
// frame before integrating) -- just never as a source of MAGNITUDE.
//
// A raw meters value has no natural 0-1 domain the way tilt magnitude or
// cursor distance has, so it's normalized against
// PHONE_DISPLACE_REFERENCE_METERS first -- an UNVERIFIED, disclosed
// judgment call (not a measurement, and now shared by desktop's own
// differently-scaled cursor-delta signal too, via
// PHONE_DISPLACE_DESKTOP_SENSITIVITY). If the response feels too
// weak/strong, these are the 2 constants to retune first.
//
// RAISED 0.25 -> 0.35, 2026-09-30, root-caused from 2 real controlled-test
// datasets (flat + tilted) showing output positions jumping erratically
// between near-max-positive and near-max-negative every ~500ms sample,
// while the logged LinearAccel driving them stayed consistently small
// (mostly under 1-2 m/s^2) -- i.e. the OUTPUT was saturating and flipping
// sign from noise, not responding proportionally to real motion. Traced
// to applyPhoneDisplaceSample()'s own leaky-integrator steady-state gain
// (1 / (VELOCITY_DECAY_RATE * POSITION_DECAY_RATE) = 4.17 meters per
// m/s^2 of SUSTAINED bias): a standalone script confirmed any constant
// bias as small as ~0.06 m/s^2 -- well within normal gravity-subtraction/
// sensor error -- alone saturates a 0.25m reference at steady state. See
// PHONE_DISPLACE_BIAS_TRACK_RATE below for the actual fix (a high-pass
// filter that removes this sustained bias before integration); the
// reference distance only needed to move up enough to comfortably fit a
// real deliberate push once that bias is no longer dominating (a
// standalone sim: a 2.5 m/s^2 push for 0.5s, on top of a lingering 0.1
// m/s^2 bias, reads ~0.35m peak after high-pass filtering).
const PHONE_DISPLACE_DEADZONE = 0.02 // same role as PHONE_RESPONSIVE_DEADZONE, own constant since it gates a METERS ratio, not a degrees-equivalent one
// axis: 'X'/'Y'/'Z' -- looks up that axis's own X Reference (replacing
// the old single shared PHONE_DISPLACE_REFERENCE_METERS) and its own
// Range/Curve (phoneDisplaceAxisParsed, populated by
// parsePhoneResponsiveDisplaceConfig()). xReference is the real
// displacement distance (meters) that reads as curve-X=1.0 -- small
// real movements/jitter stay well left on the curve, so Y (the curve's
// own output, 0-1 = 0-100%) can be shaped to read ~0% there, directly
// filtering out unintentional movement without a separate deadzone
// mechanism.
function computePhoneDisplaceAxisUnits(rawMeters, axisEnabled, axisScale, axisInverted, axis) {
  if (!cfg.responsiveDisplaceGlobalEnabled) return 0
  if (!cfg.phoneResponsiveDisplaceEnabled) return 0
  if (!axisEnabled) return 0
  const xReference = cfg['phoneDisplace' + axis + 'ReferenceM'] || 0.35
  const t = THREE.MathUtils.clamp(Math.abs(rawMeters) / xReference, 0, 1)
  if (t < PHONE_DISPLACE_DEADZONE) return 0
  const slot = phoneDisplaceAxisParsed[axis]
  const curveY = THREE.MathUtils.clamp(window.evaluateCurveEditorPoints(slot.curve, t, slot.method), 0, 1)
  const { min, max } = slot.range
  // Clamped to >= 0, added 2026-10-01 -- root cause of "I see the phone,
  // but the moment I move it jumps out of frame", confirmed from the
  // user's own actual synced Range: {min:-20, max:20}. `magnitude` here
  // is a MAGNITUDE, meant to be combined with Math.sign(rawMeters) below
  // to get a signed output -- but with a NEGATIVE min, magnitude is
  // already ~-20 the instant curveY is near 0 (true for every real
  // movement until the curve is nearly fully traversed), so the very
  // first motion that clears the deadzone above produces an immediate
  // ~20-unit, SIGN-INVERTED jump instead of a small, proportional one.
  // A natural, reasonable misconfiguration -- a user setting Min/Max
  // Range to {-20, 20} expecting a signed "-20 to +20" OUTPUT range has
  // no way to know this control is actually a magnitude-then-sign system
  // under the hood. Clamping the floor to 0 makes any negative min behave
  // as a (harmless) partial dead-band instead of an inverted snap, no
  // matter what the Range text field is ever set to. Rotation's own
  // identical formula (computePhoneResponsiveAxisDeg(), a few lines up)
  // has this exact same latent risk -- that function's own 2026-09-27
  // PHONE_RESPONSIVE_DEADZONE comment already names the "-57 at near-zero
  // input" case but only ever added a value deadzone, which moves WHERE
  // the jump happens (from literal 0 to the deadzone boundary) without
  // removing the jump itself -- fixed there too, same reasoning.
  const magnitude = Math.max(0, min + (max - min) * curveY)
  return magnitude * Math.sign(rawMeters) * axisScale * (axisInverted ? -1 : 1)
}
// TILT mode -- added 2026-10-01, direct report: "I move the phone
// forward and backward... I pause in between... once I stop, it drifts
// back to its default position without me telling it to." Root cause
// (see integratePhoneDisplacement()'s own comment): 'acceleration'/
// 'worldPosition' both DOUBLE-INTEGRATE real accelerometer data --
// stopping a push is itself a real, physical DECELERATION (an
// opposite-direction acceleration pulse), which cancels the velocity
// just built up. Once velocity returns to ~0, the integrator has no way
// to "remember" the user meant to stay displaced -- this is the
// fundamental, well-known drift limitation of accelerometer-only
// dead-reckoning, not a tunable decay-rate bug. Direct follow-up: "fix
// it. I want the virtual movement to mirror my real world movement and
// nothing else."
//
// Fixed with a 3rd mode that DOES NOT integrate anything: reads the
// phone's CURRENT orientation angle directly (mobile: deviceorientation
// beta/gamma; desktop: computeDesktopRotationNxNy()'s own memoryless
// cursor-offset, scaled to a comparable degree-like range) relative to a
// baseline captured at Displace Reset / mode-switch / enable time, and
// maps that straight to displacement with NO curve, NO range, NO
// reference distance, NO clamp -- the exact same "pure, memoryless
// function of the CURRENT reading" design Rotation's own 'absolute'
// mode already uses to eliminate ITS equivalent drift (see
// computePhoneAbsoluteOrientationQuat()'s own comment). Holding a tilt
// now holds an exact, unchanging displacement, forever, by construction
// -- there is no accumulated state left to drift.
//
// DISCLOSED LIMITATION, not silently cut: this only covers 2 of 3 axes.
// X (left-right) and Y (forward-back/up-down) are real, absolute,
// driftless ANGLES (gamma/beta). Z (depth -- toward/away from the
// phone's own face) has NO angle equivalent -- tilting a phone doesn't
// measure "pushing it closer to your face," only moving it does, which
// is exactly the kind of translation that can't be read without
// integration (and therefore without drift). Z outputs exactly 0 in
// Tilt mode rather than silently keeping the old, inconsistent drifting
// behavior on just that one axis -- flagged to the user before
// building, not discovered after.
let phoneDisplaceTiltBaselineX = 0, phoneDisplaceTiltBaselineY = 0
// Re-baselines Tilt mode to the phone's CURRENT reading -- called on
// Displace Reset (resetPhoneDisplaceBaseline()), on switching INTO Tilt
// mode (so the switch itself doesn't cause a jump from a stale/zero
// baseline), and once when Displace is first enabled while already in
// Tilt mode.
function resetPhoneDisplaceTiltBaseline() {
  if (lastInputSource === 'device' && latestOrientation) {
    phoneDisplaceTiltBaselineX = latestOrientation.gamma || 0
    phoneDisplaceTiltBaselineY = latestOrientation.beta || 0
  } else {
    const { nx, ny } = computeDesktopRotationNxNy()
    phoneDisplaceTiltBaselineX = nx * 45
    phoneDisplaceTiltBaselineY = ny * 45
  }
}
// Raw (unscaled, unbaselined-subtraction-applied-here) current tilt
// reading -- degrees on mobile; desktop's dimensionless -1..1 cursor
// offset (computeDesktopRotationNxNy(), the SAME memoryless signal
// Rotation's own desktop branch uses) scaled by 45 so BOTH platforms
// land in a comparable, degree-like range for the Scale slider to tune.
function computePhoneDisplaceTiltRaw() {
  if (lastInputSource === 'device' && latestOrientation) {
    return { x: (latestOrientation.gamma || 0) - phoneDisplaceTiltBaselineX, y: (latestOrientation.beta || 0) - phoneDisplaceTiltBaselineY }
  }
  const { nx, ny } = computeDesktopRotationNxNy()
  return { x: nx * 45 - phoneDisplaceTiltBaselineX, y: ny * 45 - phoneDisplaceTiltBaselineY }
}
const _phoneDisplaceResultVec = new THREE.Vector3()
function computePhoneResponsiveDisplacement() {
  if (cfg.phoneDisplaceMode === 'tilt') {
    if (!cfg.responsiveDisplaceGlobalEnabled || !cfg.phoneResponsiveDisplaceEnabled) return _phoneDisplaceResultVec.set(0, 0, 0)
    const raw = computePhoneDisplaceTiltRaw()
    const x = cfg.phoneDisplaceAxisXEnabled ? raw.x * cfg.phoneDisplaceScaleX * (cfg.phoneDisplaceInvertX ? -1 : 1) : 0
    const y = cfg.phoneDisplaceAxisYEnabled ? raw.y * cfg.phoneDisplaceScaleY * (cfg.phoneDisplaceInvertY ? -1 : 1) : 0
    return _phoneDisplaceResultVec.set(x, y, 0) // Z always 0 in Tilt mode -- see this function's own leading comment
  }
  return _phoneDisplaceResultVec.set(
    computePhoneDisplaceAxisUnits(phoneDisplacePosX, cfg.phoneDisplaceAxisXEnabled, cfg.phoneDisplaceScaleX, cfg.phoneDisplaceInvertX, 'X'),
    computePhoneDisplaceAxisUnits(phoneDisplacePosY, cfg.phoneDisplaceAxisYEnabled, cfg.phoneDisplaceScaleY, cfg.phoneDisplaceInvertY, 'Y'),
    computePhoneDisplaceAxisUnits(phoneDisplacePosZ, cfg.phoneDisplaceAxisZEnabled, cfg.phoneDisplaceScaleZ, cfg.phoneDisplaceInvertZ, 'Z')
  )
}
const _phoneCombinedQuat = new THREE.Quaternion()
const _phoneManualQuat = new THREE.Quaternion()
const _phoneResponsiveQuat = new THREE.Quaternion()
// ABSOLUTE/ORIENTATION rotation mode -- added 2026-09-30, a selectable
// alternative to the existing Gyro/Integrated system (phoneGyroQuat/
// integratePhoneGyroRotation(), left completely unchanged below). Direct
// request: eliminate accumulated gyro-drift/path-dependence -- returning
// the real phone to its original orientation (via ANY path) must return
// the model to its original orientation too. A pure, memoryless function
// of the phone's CURRENT deviceorientation reading (never integrated or
// accumulated across frames) trivially guarantees this by construction:
// the same (alpha,beta,gamma) input always produces the same output
// quaternion, regardless of what path got there.
//
// Deliberately does NOT reuse the "combined axis-angle for beta+gamma,
// separate axis-angle for alpha" composition used elsewhere in this file
// (computePhoneCombinedQuat()'s desktop branch, integratePhoneGyroRotation())
// -- that technique was built for a 2-DOF cursor-position input with no
// genuine 3rd independent axis, and was verified (via a standalone script
// before shipping) to have a REAL discontinuity when beta approaches
// +-180 while gamma stays simultaneously nonzero: the combined axis
// vector's beta-derived component flips sign at the wrap while its
// gamma-derived component doesn't, producing a measured ~6 degree jump
// in that specific case -- small, but a genuine, avoidable artifact, not
// the "no 360 jump" guarantee this mode is specifically meant to provide.
//
// Uses the actual W3C deviceorientation rotation-matrix formula instead
// (alpha=Z, beta=X', gamma=Y'', intrinsic Z-X'-Y'' order) -- a direct,
// well-defined function of the 3 independent absolute angles, built
// entirely from sin/cos (periodic and continuous by construction, so ANY
// wraparound in the raw angle values -- beta crossing +-180, alpha
// crossing 0/360 -- produces a perfectly continuous quaternion, verified
// via the same standalone script: a real 0.2deg physical step across
// either wrap boundary produces exactly a 0.2deg change in the output
// quaternion, not a jump of any size).
const _phoneAbsoluteMatrix = new THREE.Matrix4()
const _phoneAbsoluteQuat = new THREE.Quaternion()
function computeDeviceOrientationQuat(alphaDeg, betaDeg, gammaDeg) {
  const a = THREE.MathUtils.degToRad(alphaDeg), b = THREE.MathUtils.degToRad(betaDeg), g = THREE.MathUtils.degToRad(gammaDeg)
  const cA = Math.cos(a), sA = Math.sin(a), cB = Math.cos(b), sB = Math.sin(b), cG = Math.cos(g), sG = Math.sin(g)
  _phoneAbsoluteMatrix.set(
    cA * cG - sA * sB * sG, -cB * sA, cA * sG + cG * sA * sB, 0,
    cG * sA + cA * sB * sG, cA * cB, sA * sG - cA * cG * sB, 0,
    -cB * sG, sB, cB * cG, 0,
    0, 0, 0, 1
  )
  return _phoneAbsoluteQuat.setFromRotationMatrix(_phoneAbsoluteMatrix)
}
// Axis controls (On/Off + Scale) apply the SAME as elsewhere in this
// file (X=beta, Y=gamma, Z=alpha/spin -- matching the established
// mapping computePhoneCombinedQuat()'s desktop branch already uses,
// per direct instruction to keep this baseline). Unlike Gyro mode,
// there is no curve/range/fine-tune step here -- that system maps a
// normalized 0-1 "how far tilted" magnitude to a min/max degree range,
// which is fundamentally incompatible with representing beta's real,
// unclamped +-180 range faithfully (clamping it to a magnitude of 1
// would discard exactly the information needed to test the wraparound
// at all). This matches the ALREADY-established mobile behavior anyway
// -- Gyro/Integrated mode itself never calls the curve/range system
// either (only the desktop cursor-position path does; see
// computePhoneResponsiveAxisDeg()'s own comment), so Absolute mode not
// using it either is consistent with existing behavior, not a new gap.
// Split out from computePhoneAbsoluteOrientationQuat() below (2026-09-30,
// see that function's own comment for why) so resetPhoneModelRotationBaseline()
// can capture the SAME raw quaternion (pre-baseline) to invert into a new
// baseline, without duplicating the alphaDeg/betaDeg/gammaDeg computation.
function computePhoneAbsoluteOrientationRawQuat(e) {
  const alphaDeg = cfg.phoneAxisZEnabled ? (e.alpha || 0) * cfg.phoneRotationScaleZ : 0
  const betaDeg = cfg.phoneAxisXEnabled ? (e.beta || 0) * cfg.phoneRotationScaleX : 0
  const gammaDeg = cfg.phoneAxisYEnabled ? (e.gamma || 0) * cfg.phoneRotationScaleY : 0
  return computeDeviceOrientationQuat(alphaDeg, betaDeg, gammaDeg) // returns the shared _phoneAbsoluteQuat instance
}
// Baseline for Absolute/Orientation mode -- added 2026-09-30, direct
// report: "the double tap to reset button doesn't seem to work" in this
// mode specifically ("in gyro it works, but in the new mode it doesn't").
// Root cause: unlike Gyro mode's phoneGyroQuat (a running accumulator
// resetPhoneModelRotationBaseline() already zeroes directly), Absolute
// mode is a PURE, MEMORYLESS function of the phone's raw current
// alpha/beta/gamma (see this function's own comment on why, and its
// deliberate lack of a curve/range step) -- there was nothing for a reset
// to affect at all, so double-tapping silently did nothing. Identity by
// default (no behavior change until the user actually resets), then set
// by resetPhoneModelRotationBaseline() to the INVERSE of whatever the raw
// absolute quaternion was at that instant, so THAT orientation becomes
// the model's new neutral/identity pose. This is still memoryless/drift-
// free going forward -- a fixed value captured ONCE at reset time, never
// accumulated frame-to-frame -- just relative to a re-centered reference
// instead of the device's raw (alpha=0,beta=0,gamma=0).
const _phoneAbsoluteBaselineInverse = new THREE.Quaternion()
const _phoneAbsoluteResultQuat = new THREE.Quaternion()
function computePhoneAbsoluteOrientationQuat(e) {
  const raw = computePhoneAbsoluteOrientationRawQuat(e)
  return _phoneAbsoluteResultQuat.copy(_phoneAbsoluteBaselineInverse).multiply(raw)
}
// REMOVED 2026-09-28 (9th round) -- PHONE_GYRO_OUTPUT_FIX_QUAT, an 8th-
// round output-conjugation constant. 3 rounds of reports (6th/7th/8th)
// proved no fixed code-level permutation/conjugation explains all of
// them together, so this was removed rather than replaced with a 4th
// guess -- see integratePhoneGyroRotation()'s own comment.
const _phoneTiltAxis = new THREE.Vector3()
const _phoneTiltQuat = new THREE.Quaternion()
const _phoneDesktopSpinQuat = new THREE.Quaternion() // desktop's own Y-axis (spin) contribution, composed separately -- see computePhoneCombinedQuat()
// CORRECTED 2026-09-28, direct report after real-device testing: "when i
// rotate my real phone around the Y axis, the phone model on screen
// rotates around the z axis. And vice versa as well" (with beta/up-down
// confirmed working correctly). Root cause: the real Blender model is
// authored Z-up (Z = sky when flat), but glTF/three.js is Y-up -- glTF
// exporters standardly bake in a Z-up -> Y-up conversion on export
// (a fixed rotation that leaves X alone but swaps Blender's Y and Z),
// so world-Y and world-Z in this file were ALREADY swapped relative to
// the Blender-described axes the 29th CHANGELOG entry's mapping assumed
// -- independent of anything in the rotation formula itself, which is why
// the sign/direction logic (verified against 4 real test movements in
// that same entry) was right but the WORLD AXIS each one landed on was
// not. Fixed by swapping which world axis gamma and alpha target: gamma
// (left-right tilt) now composes into the SAME combined axis-angle as
// beta (both are simultaneous "tilt" motions), on world Z instead of Y;
// alpha (compass/spin) now gets its own separate rotation around world Y
// instead of Z. Beta stays on world X, unchanged (confirmed working).
// (Desktop no longer has a compass/spin axis at all as of the gyro-
// integration switch below -- a mouse has no alpha equivalent, so the
// world-Y spin quaternion this note describes was removed along with
// it; only mobile's LOCAL-frame spin axis, PHONE_GYRO_SPIN_LOCAL_AXIS,
// remains.)
// SUPERSEDED 2026-09-28 (later same day) by the Blender-Z-up/glTF-Y-up
// world-axis swap described in the comment directly above this one --
// the paragraph below still correctly describes the SIGNAL-level mapping
// (which real-world motion means what, and each one's sign/inversion),
// just NOT which literal world-axis letter (X/Y/Z in this file's own
// code) each one currently lands on any more. Kept for the sign/
// direction reasoning, which is still accurate:
// - beta (up/down tilt), NOT inverted -- world X, unchanged.
// - gamma (left/right tilt), INVERTED (tilt left = positive, tilt
//   right = negative) -- world Z now (was Y before the swap above).
// - compass heading delta (the "leftover axis" -- spinning the phone
//   flat on its own face, the one motion beta/gamma can't represent) --
//   world Y now (was Z before the swap above).
//
// SUPERSEDED 2026-09-28 (later same day) -- MOBILE no longer uses
// beta/gamma/alpha absolute-angle passthrough at all; see phoneGyroQuat's
// own declaration comment for why (Euler/gimbal-lock representational
// limit) and integratePhoneGyroRotation() below for the replacement.
// DESKTOP is UNCHANGED and still described accurately below: cursor-
// DISTANCE-driven, through the curve/range/fineTune/deadzone system,
// confirmed desktop-only ("on desktop, phone model rotation was
// determined by distance of the cursor... in a no cursor scenario i
// have no use for it"). Both mobile (now gyro-integrated) and desktop
// still produce a signed (betaDeg, gammaDeg) pair in DEGREES for the
// tilt axes and compose them the same way: as ONE combined axis-angle
// rotation for beta+gamma (world X/Z on desktop; LOCAL X/Z body-frame on
// mobile -- see integratePhoneGyroRotation()), NOT a sequential Euler
// X-then-Z -- direct report 2026-09-28: "double tap or tap orients the
// phone differently each time... rarely the orientation i want." A
// sequential Euler composition rotates around the ORIGINAL X first,
// then around the ALREADY-TILTED frame's other axis -- for a compound
// tilt this introduces real, visible cross-axis error (roughly the
// product of the 2 angles in radians -- ~16deg of distortion for two
// simultaneous 30deg tilts, not negligible). A single axis-angle
// rotation, with the axis built from (betaDeg, 0, gammaDeg) and the
// angle from their combined magnitude, reduces to EXACTLY a pure X or
// pure Z rotation in each pure case (verified algebraically and via a
// standalone script) while smoothly blending compound tilts with no
// Euler cross-coupling, for ANY magnitude.
//
// NOT verified against a real device this session (no physical phone
// available in this sandbox) -- if any ONE axis's DIRECTION still comes
// out backwards, flip that axis's own sign at its own site (negate the
// beta-delta for X, negate the gamma-delta for Z, negate the alpha-delta
// for Y) rather than re-deriving the whole mapping.
// Desktop-only nx/ny for Rotation specifically -- added 2026-10-01, see
// desktopCursorDxPx's own declaration comment for why this is a
// SEPARATE computation from tiltMagnitude/tiltAngle, not a replacement.
// Normalizes by half the BROWSER WIDTH only (window.innerWidth/2), for
// both the horizontal AND vertical offset -- direct request: "make the
// right side on x axis the width of the browser/2. so it covers all
// cursor tracking basicallly." Sign conventions preserved exactly from
// the old tiltMagnitude*cos/sin reconstruction (verified algebraically:
// tiltMagnitude*cos(tiltAngle) reduces to dx/maxDist, tiltMagnitude*
// sin(tiltAngle) reduces to -dy/maxDist, when not saturated by
// tiltMagnitude's own circular clamp) -- only the denominator changed,
// from `min(halfWidth, halfHeight)` to `halfWidth` alone. A SINGLE
// shared function so `computePhoneCombinedQuat()`'s desktop branch and
// `resetPhoneRotationBaseline()`'s own baseline capture can never drift
// out of sync with each other -- exactly the "two code paths compute
// the same quantity differently" bug class this file has hit repeatedly
// elsewhere (see the Phone Model mobile-rotation-axis saga). No clamp
// here deliberately -- dx naturally ranges -halfWidth..+halfWidth within
// the viewport, so dx/halfWidth already lands in -1..+1 at the screen's
// own left/right edges with no clamp needed; the actual defensive clamp
// still happens downstream, in computePhoneCombinedQuat() itself, after
// the baseline is subtracted.
function computeDesktopRotationNxNy() {
  const halfWidth = (window.innerWidth || 1) / 2
  return { nx: desktopCursorDxPx / halfWidth, ny: -desktopCursorDyPx / halfWidth }
}
function computePhoneCombinedQuat() {
  _phoneManualQuat.setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(cfg.phoneModelRotX), THREE.MathUtils.degToRad(cfg.phoneModelRotY), THREE.MathUtils.degToRad(cfg.phoneModelRotZ), 'XYZ'
  ))
  if (lastInputSource === 'device' && latestOrientation) {
    // MOBILE -- Rotation Mode selector, added 2026-09-30. 'gyro' (the
    // ORIGINAL, UNCHANGED implementation) reads phoneGyroQuat, already
    // fully-integrated by integratePhoneGyroRotation() every devicemotion
    // tick (see below, completely untouched). 'absolute' instead reads
    // the phone's own fused deviceorientation reading directly, fresh,
    // every call -- see computePhoneAbsoluteOrientationQuat()'s own
    // comment for why this eliminates drift/path-dependence and how the
    // +-180/0-360 wraparounds are handled correctly.
    if (cfg.phoneRotationMode === 'absolute') {
      _phoneResponsiveQuat.copy(computePhoneAbsoluteOrientationQuat(latestOrientation))
    } else {
    // MOBILE (Gyro/Integrated): phoneGyroQuat is already the fully-
    // integrated, unbounded responsive rotation (see
    // integratePhoneGyroRotation(), which runs per devicemotion tick,
    // not per render frame) -- just read it. The 8th round's output-
    // permutation conjugation was REMOVED 2026-09-28 (9th round) -- see
    // integratePhoneGyroRotation()'s own comment for why (3 rounds of
    // reports proved no fixed code-level mapping fits, pointing at
    // inconsistent starting orientation between tests, not the axis
    // wiring itself).
    _phoneResponsiveQuat.copy(phoneGyroQuat)
    }
  } else if (cfg.trackingEnabled && cfg.phoneResponsiveRotationEnabled) {
    // DESKTOP: cursor-distance-driven, through the per-axis curve/range
    // system. CHANGED 2026-10-01: each axis now independently evaluates
    // its OWN raw signed component through its OWN curve
    // (computePhoneResponsiveAxisDeg(raw, axis)), replacing the old
    // "combine nx/ny into one radial magnitude, evaluate ONE shared
    // curve, split the result proportionally by direction cosine"
    // approach -- that always made a diagonal tilt's combined magnitude
    // track the SAME curve as a single-axis tilt of equal radial
    // distance, which isn't "3 independent axes." Sign conventions
    // preserved exactly from the old split (betaDeg's sign followed ny,
    // gammaDeg's followed -nx) so this is a pure independence change,
    // not a remapping -- computePhoneResponsiveAxisDeg() already
    // returns magnitude*sign(rawComponent), so passing ny/-nx directly
    // reproduces the old signs with no separate Math.sign() call needed.
    // CHANGED 2026-10-01: rawNx/rawNy now come from computeDesktopRotationNxNy()
    // (half-browser-WIDTH normalized), not tiltMagnitude*cos/sin
    // (min(halfWidth,halfHeight) normalized) -- see that function's own
    // comment.
    const { nx: rawNx, ny: rawNy } = computeDesktopRotationNxNy()
    const nx = THREE.MathUtils.clamp(rawNx - phoneNxBaseline, -1, 1)
    const ny = THREE.MathUtils.clamp(rawNy - phoneNyBaseline, -1, 1)
    // Per-axis on/off + scale -- direct request 2026-09-28. X gated here
    // directly. CORRECTED 2026-09-29, direct report from an isolated
    // one-checkbox-at-a-time desktop test ("the current what is labeled
    // as Z is Y, and vice versa"): the combined-tilt contribution
    // (gammaDeg, below) is gated by the Y checkbox/slider, and the
    // separate spin-around-UP contribution (the "Y axis (spin)" block
    // further down) is gated by the Z checkbox/slider -- SWAPPED from
    // the initial, un-tested guess (which had gammaDeg on Z and spin on
    // Y) to match what the user actually sees on screen. Mobile's own
    // per-axis gating is unaffected -- it lives inside
    // integratePhoneGyroRotation() instead, already independently
    // verified via the same isolated-checkbox method (see that
    // function's own 10th-round comment).
    let betaDeg = cfg.phoneAxisXEnabled ? computePhoneResponsiveAxisDeg(ny, 'X') * cfg.phoneRotationScaleX : 0
    let gammaDeg = cfg.phoneAxisYEnabled ? computePhoneResponsiveAxisDeg(-nx, 'Y') * cfg.phoneRotationScaleY : 0
    const combinedTiltDeg = Math.hypot(betaDeg, gammaDeg)
    if (combinedTiltDeg > 1e-6) {
      _phoneTiltAxis.set(betaDeg, 0, gammaDeg).normalize()
      _phoneTiltQuat.setFromAxisAngle(_phoneTiltAxis, THREE.MathUtils.degToRad(combinedTiltDeg))
    } else {
      _phoneTiltQuat.identity()
    }
    // Spin-around-UP contribution on desktop -- direct request
    // 2026-09-29 ("I was wrong [that desktop didn't need all 3 axes] --
    // make all 3 appliable, I will set it with the on/off"), gating
    // SWAPPED to the Z checkbox/slider per the correction above. Desktop
    // has no 3rd independent input channel the way a real gyroscope
    // does (beta/gamma/alpha are 3 separate physical readings; a 2D
    // cursor position is only 2 DOF), so this reuses the SAME
    // horizontal cursor offset (nx) that also, separately, drives the
    // combined-tilt contribution above -- through its OWN 'Z' curve now
    // (2026-10-01), not the shared one -- applied as its OWN rotation
    // around world Y and composed on top rather than folded into the
    // combined axis-angle, the same separate-mechanism pattern mobile's
    // own alpha/spin axis already uses.
    let alphaDeg = 0
    if (cfg.phoneAxisZEnabled) {
      alphaDeg = computePhoneResponsiveAxisDeg(nx, 'Z') * cfg.phoneRotationScaleZ
    }
    _phoneResponsiveQuat.copy(_phoneTiltQuat)
    if (Math.abs(alphaDeg) > 1e-6) {
      _phoneDesktopSpinQuat.setFromAxisAngle(UP, THREE.MathUtils.degToRad(alphaDeg))
      _phoneResponsiveQuat.multiply(_phoneDesktopSpinQuat)
    }
  } else {
    _phoneResponsiveQuat.identity()
  }
  return _phoneCombinedQuat.copy(_phoneManualQuat).multiply(_phoneResponsiveQuat)
}
// Gyroscope integration for MOBILE Responsive Rotation -- direct report
// 2026-09-28: "when i tilt far... it jumps then rotates 180... i want
// the rotation to continue forever." Called once per REAL devicemotion
// tick (not per render frame) from handleDeviceMotion(), since it needs
// the ACTUAL time delta between real gyroscope samples to integrate
// correctly (rotationRate is in deg/SECOND).
//
// rotationRate.beta/gamma/alpha are TRUE, INSTANTANEOUS angular
// velocities around the device's OWN CURRENT local X/Y/Z axes
// respectively (per the W3C spec -- same 3 physical axes
// deviceorientation's beta/gamma/alpha name, just velocity instead of
// absolute angle). Multiplying each by the elapsed time gives a TINY
// incremental rotation for this one tick; composing that onto
// phoneGyroQuat via RIGHT-multiply (`.multiply()`, not `.premultiply()`)
// applies it in the quaternion's OWN CURRENT LOCAL FRAME -- the standard
// way to integrate body-frame angular velocity into an accumulating
// orientation (used universally in IMU/AHRS tracking). This is what
// makes "spin continually around the phone's own X axis" work: each
// tick's increment is expressed relative to wherever the phone's local
// X axis CURRENTLY points (after all previous increments), not relative
// to a fixed world axis or an absolute angle reconstructed from scratch
// -- so there is no gimbal lock, no representational range limit, and
// no "jump then rotate 180," at any accumulated total angle.
//
// The combine-into-one-axis-angle technique for 2 of the 3 roles (and
// the separate-mechanism composition for the 3rd) is reused verbatim
// from the tilt logic above, just in the LOCAL/body frame (right-
// multiply) instead of the WORLD frame desktop uses -- same reasoning,
// avoids Euler cross-coupling for a compound multi-axis motion. See the
// 10th-round comment inside this function for which raw property and
// which slot each physical role actually uses -- it is NOT the
// beta=X/gamma=Y/alpha=Z-in-slot-order assumption this comment
// originally described.
function integratePhoneGyroRotation(e) {
  if (!cfg.trackingEnabled || !cfg.responsiveRotationGlobalEnabled || !cfg.phoneResponsiveRotationEnabled || !e.rotationRate) {
    phoneGyroLastTimestamp = null // clean restart, no big jump, whenever this resumes
    return
  }
  const now = performance.now()
  if (phoneGyroLastTimestamp !== null) {
    const dt = Math.min((now - phoneGyroLastTimestamp) / 1000, 0.1) // seconds; capped so a backgrounded tab can't integrate one huge jump on resume
    const rr = e.rotationRate
    // CORRECTED 2026-09-28 (10th round on this feature, same day) --
    // solved directly from 3 CLEAN, ISOLATED, one-checkbox-at-a-time
    // tests (each with the other 2 axes' checkboxes off, so only ONE of
    // the 3 variables below could be nonzero at all) -- by far the most
    // reliable data this feature has had, since it removes both the
    // combined-axis-angle's own cross-talk AND the previously-suspected
    // starting-orientation confound as variables. Results: with only the
    // X checkbox on (gating rr.beta), physical Y motion produced a
    // response, reading as model X. With only Y on (gating -rr.gamma),
    // physical Z motion produced a response, reading as model Z
    // (inverted sign). With only Z on (gating rr.alpha), physical X
    // motion produced a response, reading as model Y. This reveals TWO
    // independent scrambles that were previously conflated: (1) which
    // RAW rotationRate property actually correlates with which PHYSICAL
    // axis (beta<->Y, gamma<->Z, alpha<->X -- none of beta/gamma/alpha
    // means what its W3C-spec-standard letter would suggest), and (2)
    // which CODE SLOT reads as which VISUAL letter (the combined axis-
    // angle's own x-component reads correctly as X, but its y-component
    // reads as Z, and the separate single-axis mechanism reads as Y).
    // Solved for both simultaneously below, rather than patching one at
    // a time as prior rounds did: physical X needs alpha routed into the
    // x-component (the one slot that reads correctly), physical Z needs
    // gamma routed into the y-component (which reads as Z), and physical
    // Y needs beta routed into the separate mechanism (which reads as
    // Y). Variables are named for the PHYSICAL role directly
    // (dRoleXDeg/dRoleYDeg/dRoleZDeg) rather than pitch/roll/spin, since
    // that naming baked in an unverified beta=pitch/gamma=roll/alpha=spin
    // assumption that turned out to be wrong. Gamma's existing negation
    // is REMOVED (test 2 reported "inverted" despite already being
    // negated, so removing it is the direct fix) -- beta and alpha's
    // signs are unverified in their NEW slots (mechanism changes have
    // affected sign before) and may need one more round if reported
    // backwards.
    const dRoleXDeg = (cfg.phoneAxisXEnabled ? (rr.alpha || 0) * cfg.phoneRotationScaleX : 0) * dt
    const dRoleYDeg = (cfg.phoneAxisYEnabled ? -(rr.beta || 0) * cfg.phoneRotationScaleY : 0) * dt // negated 2026-09-28 (11th round) -- direct report: Y was inverted; letter/slot already confirmed correct via isolated testing, so only the sign needed fixing
    const dRoleZDeg = (cfg.phoneAxisZEnabled ? (rr.gamma || 0) * cfg.phoneRotationScaleZ : 0) * dt
    const combinedTiltDeg = Math.hypot(dRoleXDeg, dRoleZDeg)
    if (combinedTiltDeg > 1e-8) {
      _phoneGyroTiltAxis.set(dRoleXDeg, dRoleZDeg, 0).normalize()
      _phoneGyroTiltQuat.setFromAxisAngle(_phoneGyroTiltAxis, THREE.MathUtils.degToRad(combinedTiltDeg))
      phoneGyroQuat.multiply(_phoneGyroTiltQuat)
    }
    if (Math.abs(dRoleYDeg) > 1e-8) {
      _phoneGyroSpinQuat.setFromAxisAngle(PHONE_GYRO_SPIN_LOCAL_AXIS, THREE.MathUtils.degToRad(dRoleYDeg))
      phoneGyroQuat.multiply(_phoneGyroSpinQuat)
    }
    phoneGyroQuat.normalize() // guard against floating-point drift accumulating over a long session
  }
  phoneGyroLastTimestamp = now
}
// Responsive Displace integration -- added 2026-09-30, direct request:
// "we will now use the accelerometer compass and fused datastreams to
// determine the movement and acceleration of the phone... I want the
// onscreen phones to move in the direction of my real phone," then "i
// also want the 2 calclation types, simialr to rotation, one with
// acceleration, and i guess the other is the real world position."
//
// Unlike Rotation (which integrates an ANGULAR VELOCITY into an
// orientation that is inherently bounded -- a quaternion always
// represents SOME valid rotation, it can't "run away"), integrating
// LINEAR acceleration into a position is a textbook-unbounded problem:
// any small, constant sensor bias integrates into an ever-growing
// velocity, and that into an ever-growing position -- real IMU/AHRS
// systems handle this with additional sensors (GPS, visual odometry) this
// project has no access to. The standard mitigation without those is a
// LEAKY integrator at both stages (exponential decay toward zero,
// PHONE_DISPLACE_VELOCITY_DECAY_RATE / PHONE_DISPLACE_POSITION_DECAY_RATE
// below) -- this guarantees the tracked position can never drift away
// permanently, at the cost of a genuine, disclosed trade-off: a
// SUSTAINED hold (e.g. "move the phone closer to your face and keep it
// there") will feel correct for the first several seconds, then slowly
// re-center over roughly 1/POSITION_DECAY_RATE seconds even though the
// real phone hasn't moved back. This is not a bug to "fix" -- it's the
// same fundamental limitation every consumer-grade accelerometer-only
// position tracker has, just made explicit and tunable rather than
// either pretending it's perfect or leaving it to drift into nonsense.
//
// The 2 modes only differ in WHICH FRAME the raw acceleration vector is
// integrated in, mirroring Rotation's own Gyro-vs-Absolute split in
// spirit (simple/local vs frame-corrected):
//   'acceleration' -- integrates e.acceleration directly in the DEVICE'S
//     OWN LOCAL frame, exactly like Gyro/Integrated rotation mode does
//     for rotationRate. Simple, but -- also like Gyro mode's own
//     documented limitation -- doesn't correct for the device's own
//     rotation happening DURING the move (e.g. tilting the phone while
//     also pushing it forward mixes some of that push into whichever
//     local axis currently faces that direction, not a fixed world
//     direction).
//   'worldPosition' -- rotates the raw acceleration vector into WORLD
//     frame first (via computeDeviceOrientationQuat(), the SAME function
//     Absolute/Orientation rotation mode already uses, applied to the
//     CURRENT deviceorientation reading) before integrating, so
//     translation is tracked correctly in a fixed frame regardless of
//     how the phone rotates mid-movement -- the more physically-correct
//     of the 2, matching the "real world position" naming.
// Both share the exact same leaky double-integration math and decay
// constants below -- only the frame the raw vector is expressed in
// differs.
// CORRECTED 2026-10-01 -- these were hardcoded constants until a direct
// report ("theres also damping even though i didnt set any... sometimes I
// feel like the phone is tring to drift back into default starting
// position"). Root cause: cfg.phoneDisplaceDamping only smooths the FINAL
// output vector once per frame -- it has no effect on these 2 decay rates
// at all, which govern the internal leaky-integrator's own built-in
// "forgetting" behavior. Position's own decay in particular (0.08 1/s,
// ~8.7s half-life) is slow enough that any disturbance -- including
// ordinary ambient sensor noise with the phone just sitting still --
// keeps visibly influencing the displayed position for several seconds
// afterward, which is almost certainly what read as unwanted smoothing/
// drift-to-center independent of the Damping slider, and also explains
// the reported reversal overshoot (residual position from the first
// move hasn't cleared by the time a second, opposite move begins).
// Converted from fixed constants to cfg-backed values (defaults UNCHANGED
// from the prior hardcoded numbers, so nothing changes until retuned) so
// these can be exposed as dev-panel sliders -- a standalone replay against
// real logged data couldn't be trusted to prescribe an exact replacement
// number here (the Sensor Log samples at ~200ms while the real integrator
// runs on the much-faster actual devicemotion event stream, so a replay
// at the logged rate under-counts real integration steps and doesn't
// reproduce real measured magnitudes) -- better to let these be tuned
// live against the real device the same way Damping already is.
const PHONE_DISPLACE_VELOCITY_DECAY_RATE_DEFAULT = 3.0 // 1/seconds -- velocity's own contribution roughly halves every ~0.23s, fast enough that jittery sensor noise doesn't keep accumulating
const PHONE_DISPLACE_POSITION_DECAY_RATE_DEFAULT = 0.08 // 1/seconds -- position roughly halves every ~8.7s, slow enough that a normal few-second hold/demo feels sustained
// Bias high-pass filter -- added 2026-09-30, the real root cause behind
// "x axis keeps drifting and sometimes jumps" / "y and z... works
// sometimes, but other times... goes too far", confirmed against 2 real
// controlled-test datasets (flat + tilted) and a standalone simulation
// (see PHONE_DISPLACE_REFERENCE_METERS's own comment for the numbers).
// This leaky integrator's steady-state gain from a CONSTANT acceleration
// bias to position is 1/(VELOCITY_DECAY_RATE*POSITION_DECAY_RATE) =
// ~4.17 m per m/s^2 -- large enough that ordinary residual bias from
// imperfect gravity subtraction (device orientation lag/noise) or plain
// sensor calibration error, never fully zero on real hardware, was
// enough on its own to saturate the output and leave Math.sign() of a
// near-zero, noisy quantity as the only thing visibly changing --
// exactly the observed "random-looking jump between extremes" symptom,
// independent of any real movement. Fixed with a standard slow-tracking
// high-pass filter: an exponential moving average of the raw linear
// acceleration (PHONE_DISPLACE_BIAS_TRACK_RATE, ~2.5s time constant --
// slow enough that a real deliberate push, ~0.3-0.5s, mostly passes
// through un-absorbed, fast enough to track slowly-varying sensor/
// orientation bias) is subtracted from the raw signal before it ever
// reaches applyPhoneDisplaceSample(). Verified via a standalone script:
// suppresses a sustained 0.1 m/s^2 bias from a steady-state 0.230m down
// to 0.047m, while a real 2.5 m/s^2/0.5s push on top of that same bias
// still peaks at 0.351m -- clearly distinguishable from the suppressed
// baseline. Applied in integratePhoneDisplacement() only (mobile's real
// accelerometer path) -- desktop's cursor-delta "impulse" in
// updatePhoneDisplaceDesktopFrame() has no equivalent sensor-bias
// problem (a cursor position has no analogous calibration error) and is
// left untouched.
const PHONE_DISPLACE_BIAS_TRACK_RATE = 0.4 // 1/seconds, ~2.5s time constant
let phoneDisplaceBiasX = 0, phoneDisplaceBiasY = 0, phoneDisplaceBiasZ = 0
let phoneDisplaceVelX = 0, phoneDisplaceVelY = 0, phoneDisplaceVelZ = 0
let phoneDisplacePosX = 0, phoneDisplacePosY = 0, phoneDisplacePosZ = 0
let phoneDisplaceLastTimestamp = null
// ZUPT dwell state -- added 2026-10-01, see cfg.phoneDisplaceZuptAccelThresholdMps2's
// own declaration comment. phoneDisplaceZuptDwellStart is the
// performance.now() timestamp the gate first went quiet (both gyro AND
// accel below threshold); null whenever not currently in a candidate
// quiet window. phoneDisplaceZuptActive is true once that window has
// held for the full dwell duration (velocity is being force-held at
// exactly 0 this tick) -- exposed on window.__debug below as the
// existing diagnostic surface for this value, rather than building a
// separate inspection system.
let phoneDisplaceZuptDwellStart = null
let phoneDisplaceZuptActive = false
const _phoneDisplaceWorldVec = new THREE.Vector3()
// Shared leaky accel->velocity->position integrator -- one real
// devicemotion sample (MOBILE) or one desktop cursor-delta "impulse"
// (see updatePhoneDisplaceDesktopFrame() below) both funnel through this
// SAME function, so both platforms write into the exact same
// phoneDisplacePosX/Y/Z state and get read back identically by
// computePhoneResponsiveDisplacement().
function applyPhoneDisplaceSample(ax, ay, az, dt) {
  const velDecay = Math.exp(-(cfg.phoneDisplaceVelDecayRate ?? PHONE_DISPLACE_VELOCITY_DECAY_RATE_DEFAULT) * dt)
  const posDecay = Math.exp(-(cfg.phoneDisplacePosDecayRate ?? PHONE_DISPLACE_POSITION_DECAY_RATE_DEFAULT) * dt)
  phoneDisplaceVelX = phoneDisplaceVelX * velDecay + ax * dt
  phoneDisplaceVelY = phoneDisplaceVelY * velDecay + ay * dt
  phoneDisplaceVelZ = phoneDisplaceVelZ * velDecay + az * dt
  phoneDisplacePosX = phoneDisplacePosX * posDecay + phoneDisplaceVelX * dt
  phoneDisplacePosY = phoneDisplacePosY * posDecay + phoneDisplaceVelY * dt
  phoneDisplacePosZ = phoneDisplacePosZ * posDecay + phoneDisplaceVelZ * dt
}
// MOBILE -- real accelerometer, event-driven (per devicemotion tick, its
// own accurate dt from real sample timestamps). CORRECTED 2026-09-30:
// cfg.trackingEnabled removed from the gate -- direct answer to "should
// Responsive Displace require Tracking Enabled... or work
// independently": "Fully independent." Only cfg.phoneResponsiveDisplaceEnabled
// gates this now; see initMotionInput()/the Displace On/Off checkbox's
// own wiring for how motion permission gets requested independently of
// Tracking Enabled too.
// Raw per-axis noise floor + outlier clamp -- added 2026-09-30, direct
// reports: "the x axis movement... keeps drifting and sometimes jumps"
// and (for Y/Z, both Displace Modes) "it is reacting, but it seems
// buggy... works sometimes, but other times its delayed, sometimes it
// goes too far." Applied to the RAW e.acceleration reading, before any
// rotation -- the noise/outliers originate in the raw sensor's own
// per-axis readings, not in an abstract post-rotation "world frame"
// concept. DEADZONE filters small persistent sensor noise/bias that
// would otherwise slowly integrate into a nonzero steady-state offset
// (drift, since a leaky integrator settles to a fixed nonzero position
// under a CONSTANT small bias, it doesn't cancel to exactly zero -- see
// applyPhoneDisplaceSample()'s own comment). CLAMP caps any single
// anomalous reading (a real sensor glitch, or a large dt after a stalled
// tick producing an oversized ax*dt term) from producing one outsized
// velocity kick that visibly overshoots before decaying back. Both are
// UNVERIFIED judgment calls (not measurements) -- retune first if
// legitimate gentle/vigorous movement gets over- or under-filtered.
const PHONE_DISPLACE_RAW_DEADZONE_MPS2 = 0.05
const PHONE_DISPLACE_RAW_CLAMP_MPS2 = 15
function filterPhoneDisplaceRawComponent(v) {
  if (Math.abs(v) < PHONE_DISPLACE_RAW_DEADZONE_MPS2) return 0
  return THREE.MathUtils.clamp(v, -PHONE_DISPLACE_RAW_CLAMP_MPS2, PHONE_DISPLACE_RAW_CLAMP_MPS2)
}
// Gravity subtraction -- added 2026-09-30 (2nd round, after a real
// controlled single-axis test: reset, move one direction, reset, repeat
// per axis). Cross-referencing that test's own Sensor Log against this
// function's own data source found a real gap: Sensor Log logs
// `accelerationIncludingGravity` (the raw accelerometer, gravity and
// all), while this function was reading `e.acceleration` (the browser's
// OWN pre-filtered, gravity-EXCLUDED "linear acceleration") -- two
// genuinely different signals. The test data showed accelerationIncludingGravity
// was rich, continuous, and clearly reliable throughout (e.g. a ~9-10
// m/s^2 swing tracking a real reorientation), while e.acceleration had
// never actually been directly observed/logged at all this whole time.
// e.acceleration's own gravity-exclusion is device/browser-dependent and
// can be null or low-quality on some hardware -- a strong, if
// circumstantial, explanation for every reported symptom (drift from a
// noisy/intermittent signal, jumps on the rare valid-but-noisy samples).
// Switched to computing linear acceleration ourselves from
// accelerationIncludingGravity (more universally available) minus a
// gravity vector computed from the device's own current orientation --
// the standard AHRS/IMU technique, robust by construction regardless of
// a given browser's own sensor-fusion quality.
//
// computeDeviceOrientationQuat() transforms device-local coordinates
// into this same world/reference frame (verified via its own matrix:
// identity at alpha=beta=gamma=0, i.e. flat/screen-up, where device-
// local Z maps directly to world Z -- so "up" = +world-Z there, and
// world gravity is (0,0,-9.80665)). Gravity in the device's CURRENT
// local frame = that world vector rotated by the INVERSE of the same
// orientation quaternion. An accelerometer at rest reads the REACTION
// force (+g opposing gravity's pull, not gravity itself), so true linear
// acceleration is accelerationIncludingGravity PLUS this (negatively-
// signed) gravity vector -- canceling to ~0 at rest. Verified via a
// standalone script against 2 known real-world orientations (flat
// screen-up, and held vertically upright facing the user) before
// shipping: both reduce to ~0 linear acceleration at rest, as expected.
const PHONE_GRAVITY_WORLD = new THREE.Vector3(0, 0, -9.80665)
const _phoneGravityDeviceLocal = new THREE.Vector3()
const _phoneOrientationQuatScratch = new THREE.Quaternion()
// Shared by integratePhoneDisplacement() below and the Sensors log's own
// "Log Linear Accel (No Gravity)" diagnostic field -- returns RAW,
// un-swapped device-local linear acceleration in the standard W3C x/y/z
// slots (same slots the existing "Accel" log field already uses for
// accelerationIncludingGravity, so the 2 can be visually compared
// directly), or null if neither data source is usable this tick.
const _phoneLinearAccelResult = { x: 0, y: 0, z: 0 }
function computePhoneLinearAccelDeviceLocal(e) {
  if (e.accelerationIncludingGravity && latestOrientation) {
    const q = computeDeviceOrientationQuat(latestOrientation.alpha || 0, latestOrientation.beta || 0, latestOrientation.gamma || 0)
    // Copy q into a scratch quaternion before inverting -- q IS the
    // shared _phoneAbsoluteQuat instance computeDeviceOrientationQuat()
    // always returns, and callers that also need it UN-inverted (the
    // 'worldPosition' rotation step) must not have it mutated here.
    _phoneGravityDeviceLocal.copy(PHONE_GRAVITY_WORLD).applyQuaternion(_phoneOrientationQuatScratch.copy(q).invert())
    _phoneLinearAccelResult.x = (e.accelerationIncludingGravity.x || 0) + _phoneGravityDeviceLocal.x
    _phoneLinearAccelResult.y = (e.accelerationIncludingGravity.y || 0) + _phoneGravityDeviceLocal.y
    _phoneLinearAccelResult.z = (e.accelerationIncludingGravity.z || 0) + _phoneGravityDeviceLocal.z
    return _phoneLinearAccelResult
  } else if (e.acceleration) {
    // Fallback -- no orientation reading available yet (can't compute a
    // gravity vector), but the browser's own gravity-excluded field
    // happens to be available: use it directly.
    _phoneLinearAccelResult.x = e.acceleration.x || 0
    _phoneLinearAccelResult.y = e.acceleration.y || 0
    _phoneLinearAccelResult.z = e.acceleration.z || 0
    return _phoneLinearAccelResult
  }
  return null
}
function integratePhoneDisplacement(e) {
  if (!cfg.responsiveDisplaceGlobalEnabled || !cfg.phoneResponsiveDisplaceEnabled) {
    phoneDisplaceLastTimestamp = null // clean restart, no big jump, whenever this resumes -- same convention as integratePhoneGyroRotation's own phoneGyroLastTimestamp
    return
  }
  // TILT mode reads orientation directly every frame (computePhoneResponsiveDisplacement())
  // -- it never touches the old integrator state (phoneDisplaceVelX/Y/Z,
  // phoneDisplacePosX/Y/Z) at all, so there's nothing for this function to
  // do. Still update the timestamp so a later mode switch back to
  // 'acceleration'/'worldPosition'/'freeze' doesn't see a stale
  // phoneDisplaceLastTimestamp and compute one huge dt on its first tick.
  if (cfg.phoneDisplaceMode === 'tilt') { phoneDisplaceLastTimestamp = performance.now(); return }
  const now = performance.now()
  if (phoneDisplaceLastTimestamp !== null) {
    // CORRECTED 2026-09-30 (1st round): this used to also bail out
    // (resetting phoneDisplaceLastTimestamp, exactly like the disabled
    // case) whenever a usable acceleration reading was momentarily
    // unavailable -- a real, known intermittent behavior on some
    // devices/browsers (occasional null readings, not just "off"). That
    // reset FROZE velocity/position completely (no decay applied at
    // all, since the function returned before reaching
    // applyPhoneDisplaceSample) for the gap's real duration, THEN
    // discarded that whole elapsed interval once a valid reading
    // resumed -- exactly the "sometimes delayed, sometimes overshoots"
    // pattern reported. Now an unusable-reading tick still advances
    // time and still runs the leaky decay (ax/ay/az simply read 0 --
    // "no push this instant", not "nothing happened") via the SAME
    // dt-capped math below, instead of stopping early.
    const dt = Math.min((now - phoneDisplaceLastTimestamp) / 1000, 0.05) // seconds; tightened 0.1 -> 0.05 (1st round) so a stalled/irregular tick's worst-case single-step size is halved
    let ax = 0, ay = 0, az = 0
    let isStationary = false // set true below when the Stationary Gate fires -- read by 'freeze' mode further down
    // CORRECTED 2026-09-30 (2nd round, after a real controlled test):
    // switched from e.acceleration (the browser's own gravity-excluded
    // "linear acceleration") to computePhoneLinearAccelDeviceLocal()'s
    // manual gravity subtraction -- see that function's own comment for
    // the full reasoning (Sensor Log's own accelerationIncludingGravity
    // data was rich/continuous/reliable throughout a real test, while
    // e.acceleration had never actually been directly observed/logged at
    // all; its own gravity-exclusion quality is device/browser-dependent).
    const linear = computePhoneLinearAccelDeviceLocal(e)
    if (linear) {
      // Y/Z SWAPPED 2026-09-30 (1st round), direct report: "for
      // displacement switch the input outputs for y and z axis" --
      // whatever previously fed the Y output (raw accel.y) now feeds Z,
      // and vice versa. Swapped at the raw-reading stage, before the
      // optional world-frame rotation below, matching every other real-
      // device axis correction in this file. The Y/Z Axis Displace
      // checkboxes/scale/invert controls and their labels are UNCHANGED
      // -- only which raw reading reaches each one. UNVERIFIED whether
      // this swap is still correct now that the underlying data SOURCE
      // has changed (gravity-included + manual subtraction, vs. the
      // browser's own pre-filtered field) -- the raw axis IDENTITY
      // (x/y/z) is the same W3C convention either way, but if Y/Z still
      // look wrong after this round's fix, re-test fresh rather than
      // assuming this swap is still the right one.
      //
      // Bias high-pass -- added 2026-09-30, see PHONE_DISPLACE_BIAS_TRACK_RATE's
      // own declaration comment for the full root-cause account. Tracks
      // and removes each axis's own slow-moving bias BEFORE the Y/Z swap
      // and the raw deadzone/clamp filter below -- the bias tracker needs
      // the full, un-clipped raw signal to accurately follow slow drift,
      // and bias is a property of each RAW sensor axis, not of the
      // display-mapped slot it ends up feeding.
      phoneDisplaceBiasX += (linear.x - phoneDisplaceBiasX) * PHONE_DISPLACE_BIAS_TRACK_RATE * dt
      phoneDisplaceBiasY += (linear.y - phoneDisplaceBiasY) * PHONE_DISPLACE_BIAS_TRACK_RATE * dt
      phoneDisplaceBiasZ += (linear.z - phoneDisplaceBiasZ) * PHONE_DISPLACE_BIAS_TRACK_RATE * dt
      ax = filterPhoneDisplaceRawComponent(linear.x - phoneDisplaceBiasX)
      ay = filterPhoneDisplaceRawComponent(linear.z - phoneDisplaceBiasZ)
      az = filterPhoneDisplaceRawComponent(linear.y - phoneDisplaceBiasY)
      // Stationary gate -- added 2026-10-01, direct report + real data:
      // "And there is still drift when phone is static." The pasted log
      // showed a MONOTONIC, non-random climb (never changing sign) in
      // LinearAccel while raw accelerationIncludingGravity stayed exactly
      // constant (x/y/z frozen) -- the only thing changing was Orient
      // β/γ, drifting smoothly by 0.5-1.4deg over ~8s. Root cause: the
      // device's own orientation estimate was still settling (compass/
      // gyro sensor fusion), and since gravity subtraction
      // (computePhoneLinearAccelDeviceLocal) depends on that orientation,
      // a slowly-DRIFTING (not constant) orientation produces a slowly-
      // drifting "linear acceleration" residual that the bias high-pass
      // filter (tuned to cancel roughly-CONSTANT bias) can never fully
      // catch up to -- it's always chasing a moving target. Verified via
      // a standalone replay of the real data: gating integration on near-
      // zero gyroscope rotation rate (the real device's own Gyro α/β/γ
      // read ~0.00 throughout this entire "static" test) reduces the
      // predicted drift from a peak of 0.063m to exactly 0.000m, while
      // every one of this project's own real deliberate-motion tests this
      // session showed Gyro values in the 5-90deg/s range during actual
      // movement -- comfortably clear of a low gating threshold, so this
      // should not suppress real intentional motion. Gated AFTER the bias
      // filter update above (not before) so bias tracking keeps learning
      // normally during stationary periods -- if anything, a still phone
      // is the CLEANEST signal to learn true bias from; only the final
      // ax/ay/az fed to the position integrator is forced to zero.
      if (cfg.phoneDisplaceStationaryGateEnabled && e.rotationRate) {
        const gyroMag = Math.hypot(e.rotationRate.alpha || 0, e.rotationRate.beta || 0, e.rotationRate.gamma || 0)
        // ZUPT upgrade -- added 2026-10-01, see cfg.phoneDisplaceZuptAccelThresholdMps2's
        // own declaration comment for the full root-cause account. The
        // gyro check alone only ever suppressed NEW acceleration input;
        // it never corrected EXISTING residual velocity, which is what
        // actually caused the reported drift (any leftover velocity from
        // a brief gyro-threshold miss kept adding to position every
        // tick, with nothing to pull it back once phoneDisplacePosDecayRate
        // is 0). Now requires BOTH gyro AND accel-magnitude to read quiet
        // (matching the direct spec exactly -- not either/or), and a
        // short dwell before treating that as CONFIDENT enough to force
        // velocity to exactly 0 (a real Zero-Velocity-Update) rather
        // than just continuing to let it decay asymptotically. accelMag
        // is measured from the ALREADY bias-corrected, deadzone-filtered
        // ax/ay/az (no new sensor read needed) -- the accel threshold
        // (0.6 m/s^2 default) sits well above the small 0.05 per-axis
        // deadzone, so using the filtered values here doesn't
        // meaningfully change the comparison.
        const accelMag = Math.hypot(ax, ay, az)
        isStationary = gyroMag < cfg.phoneDisplaceStationaryGateDegPerSec && accelMag < cfg.phoneDisplaceZuptAccelThresholdMps2
        if (isStationary) {
          ax = 0; ay = 0; az = 0
          if (phoneDisplaceZuptDwellStart === null) phoneDisplaceZuptDwellStart = now
          // CONFIDENT stationary -- held below BOTH thresholds for the
          // full dwell window. Force velocity to EXACTLY 0 here (not
          // just via the normal exp() decay in applyPhoneDisplaceSample(),
          // which only ever approaches 0 asymptotically) -- this is the
          // actual ZUPT: with velocity hard-zeroed and ax/ay/az already
          // 0 above, applyPhoneDisplaceSample() below computes
          // `pos = pos*posDecay + 0*dt = pos*posDecay`, which with the
          // EXISTING phoneDisplacePosDecayRate left untouched (0 for
          // this test, or whatever the user has it set to otherwise)
          // means position is held EXACTLY where it is -- a legitimate
          // zero-velocity update, not a position reset.
          phoneDisplaceZuptActive = (now - phoneDisplaceZuptDwellStart) >= cfg.phoneDisplaceZuptDwellMs
          if (phoneDisplaceZuptActive) { phoneDisplaceVelX = 0; phoneDisplaceVelY = 0; phoneDisplaceVelZ = 0 }
        } else {
          phoneDisplaceZuptDwellStart = null // real motion resumed -- dwell must re-accumulate from scratch next time
          phoneDisplaceZuptActive = false
        }
      } else {
        phoneDisplaceZuptDwellStart = null
        phoneDisplaceZuptActive = false
      }
      if (cfg.phoneDisplaceMode === 'worldPosition' && latestOrientation) {
        const q = computeDeviceOrientationQuat(latestOrientation.alpha || 0, latestOrientation.beta || 0, latestOrientation.gamma || 0)
        _phoneDisplaceWorldVec.set(ax, ay, az).applyQuaternion(q)
        ax = _phoneDisplaceWorldVec.x; ay = _phoneDisplaceWorldVec.y; az = _phoneDisplaceWorldVec.z
      }
    }
    // FREEZE mode -- added 2026-10-01, direct request: "once I stop
    // moving it, hold the position until I deliberately do something
    // new." Unlike 'acceleration'/'worldPosition' (which zero ax/ay/az
    // above but still call applyPhoneDisplaceSample() every tick -- and
    // that function ALWAYS applies its own leaky decay, zero input or
    // not, which is exactly what pulls position back toward 0 over
    // time), this skips calling applyPhoneDisplaceSample() ENTIRELY
    // once the stationary gate says "not moving" -- no decay runs at
    // all, so velocity/position hold EXACTLY where they are, with zero
    // drift, until real motion resumes.
    //
    // DISCLOSED LIMITATION, confirmed against a real logged test before
    // shipping (not assumed): a push's own DECELERATION is itself real,
    // gyro-correlated motion (stopping a phone you just pushed often
    // involves a small wrist wobble) that can keep gyroMag ABOVE the
    // stationary threshold for the first several ticks after the push
    // ends -- meaning most of the velocity-cancellation from that
    // deceleration can already happen BEFORE this gate ever triggers.
    // This mode freezes whatever is left at that point; it does not
    // retroactively undo cancellation that already occurred while the
    // gate still read "moving." Requires cfg.phoneDisplaceStationaryGateEnabled
    // to be on (the gate IS the freeze trigger) -- with it off,
    // isStationary never becomes true and this mode behaves identically
    // to 'acceleration'.
    if (cfg.phoneDisplaceMode === 'freeze' && isStationary) {
      phoneDisplaceLastTimestamp = now
      return
    }
    applyPhoneDisplaceSample(ax, ay, az, dt)
  }
  phoneDisplaceLastTimestamp = now
}
// DESKTOP -- added 2026-09-30, direct clarification: "that displacement
// isnt meant to be driven by phone tilt at all... its only meant to
// measure the movement in space... magnitude of tilt should not affect
// magnitude of displacement." Replaces this feature's first desktop
// attempt, which read the cursor's STATIC distance from screen center
// (tiltMagnitude/tiltAngle, the same signal Rotation's own desktop path
// legitimately uses for ITS purpose) -- that conflated "how far tilted"
// with "how much displacement," exactly what was corrected. This instead
// samples the cursor's actual FRAME-TO-FRAME MOVEMENT (a real "how much
// did it just move" delta), fed as an acceleration-like impulse into the
// SAME applyPhoneDisplaceSample() leaky integrator mobile's real
// accelerometer uses.
//
// Deliberately sampled once per RENDER FRAME (called from
// updatePhoneModelFrame()), not once per mousemove event -- mousemove
// only fires while the cursor is actually moving, so an event-driven
// design would leave phoneDisplaceVelX/Y stuck at their last nonzero
// value (never decaying) the instant the cursor stops, since decay only
// ever applies alongside a new sample. Sampling every render frame
// means a stationary cursor naturally produces a zero delta next frame,
// letting the SAME leaky decay pull velocity/position back down
// correctly with no separate "cursor went idle" detection needed.
//
// Only 2 axes ever carry real cursor movement -- a 2D cursor has no
// natural 3rd axis to measure "movement" along. (Originally Y stood in
// for depth-perpendicular-to-face with Z always 0; after the 2026-09-30
// Y/Z swap below, it's Z that carries the cursor's vertical movement and
// Y that's always 0 -- see that swap's own comment.) The unused axis
// stays mobile-only, where a real depth reading exists. This is a
// deliberate scope narrowing (not silently dropped): direction on
// desktop is just whichever way the cursor is actually moving, no tilt/
// orientation lookup needed the way mobile's 'worldPosition' mode needs
// one.
let phoneDisplaceDesktopLastNdcX = null, phoneDisplaceDesktopLastNdcY = null
let phoneDisplaceDesktopLastFrameTime = null
// Cursor NDC delta has no natural physical unit (unlike mobile's real
// m/s^2 accelerometer reading) -- this brings a normal, moderate cursor
// drag into a comparable response range through the SAME leaky pipeline
// and PHONE_DISPLACE_REFERENCE_METERS curve mapping. A judgment call, not
// a measurement -- retune first if the desktop feel is too weak/strong
// relative to mobile.
const PHONE_DISPLACE_DESKTOP_SENSITIVITY = 8
const PHONE_DISPLACE_DESKTOP_STILL_NDC_DEADZONE = 0.0005 // below this frame-to-frame NDC delta, the cursor counts as "not moving" for 'freeze' mode's own stationary check
function updatePhoneDisplaceDesktopFrame() {
  if (lastInputSource !== 'mouse' || !cfg.responsiveDisplaceGlobalEnabled || !cfg.phoneResponsiveDisplaceEnabled) {
    phoneDisplaceDesktopLastNdcX = null
    phoneDisplaceDesktopLastFrameTime = null
    return
  }
  // TILT mode reads the cursor's CURRENT offset directly every frame
  // (computeDesktopRotationNxNy(), via computePhoneResponsiveDisplacement())
  // -- it never touches the old frame-to-frame-delta integrator state
  // this function drives, so there's nothing for it to do. See
  // integratePhoneDisplacement()'s own matching skip for the mobile side.
  if (cfg.phoneDisplaceMode === 'tilt') {
    phoneDisplaceDesktopLastNdcX = cursorNDC.x
    phoneDisplaceDesktopLastNdcY = cursorNDC.y
    phoneDisplaceDesktopLastFrameTime = performance.now()
    return
  }
  const now = performance.now()
  if (phoneDisplaceDesktopLastNdcX === null) {
    phoneDisplaceDesktopLastNdcX = cursorNDC.x
    phoneDisplaceDesktopLastNdcY = cursorNDC.y
    phoneDisplaceDesktopLastFrameTime = now
    return
  }
  const dt = Math.min((now - phoneDisplaceDesktopLastFrameTime) / 1000, 0.1)
  phoneDisplaceDesktopLastFrameTime = now
  if (dt <= 0) return
  const dNdcX = cursorNDC.x - phoneDisplaceDesktopLastNdcX
  const dNdcY = cursorNDC.y - phoneDisplaceDesktopLastNdcY
  phoneDisplaceDesktopLastNdcX = cursorNDC.x
  phoneDisplaceDesktopLastNdcY = cursorNDC.y
  // FREEZE mode, desktop equivalent of the mobile gyro-based stationary
  // gate -- see integratePhoneDisplacement()'s own 'freeze' comment for
  // the full reasoning (same mechanism: skip applyPhoneDisplaceSample()
  // entirely rather than just feeding it a zero, so its own leaky decay
  // never runs either). "Not moving" here means the cursor's own
  // frame-to-frame delta is effectively zero.
  if (cfg.phoneDisplaceMode === 'freeze' && Math.hypot(dNdcX, dNdcY) < PHONE_DISPLACE_DESKTOP_STILL_NDC_DEADZONE) return
  // Y/Z SWAPPED 2026-09-30, same report/reasoning as integratePhoneDisplacement()'s
  // own matching fix (mobile) -- applied here too for consistency across
  // both platforms. Vertical cursor movement now feeds the Z slot
  // (3rd arg) instead of Y (2nd arg, now always 0 -- desktop still has
  // no independent 3rd input channel, same limitation this function's
  // own header comment already documents).
  applyPhoneDisplaceSample((dNdcX / dt) * PHONE_DISPLACE_DESKTOP_SENSITIVITY, 0, (dNdcY / dt) * PHONE_DISPLACE_DESKTOP_SENSITIVITY, dt)
}
// Rotation Reset -- direct request 2026-09-28: a double-tap(mobile)/
// double-click(desktop) anywhere on screen (gated by a new "Rotation
// Reset On/Off" checkbox) re-baselines the phone model's RESPONSIVE
// rotation to identity at that exact instant, so "the phone model's own
// XYZ axis matches world XYZ" from then on. Does NOT touch the manual
// phoneModelRotX/Y/Z sliders -- those are a deliberate, separate offset
// on top, not part of "my real phone's orientation." SIMPLIFIED
// 2026-09-28 along with the gyro-integration switch -- mobile's own
// reset was just "zero the accumulator" at that point, since there was no
// separate baseline to manage. CORRECTED 2026-09-30: no longer true --
// Absolute/Orientation mode (added the same day as this correction) is a
// separate, memoryless rotation path with its own baseline
// (_phoneAbsoluteBaselineInverse) that this function must ALSO update, or
// double-tap silently does nothing while that mode is selected -- see
// that variable's own declaration comment for the full account.
// Despite its name (kept to avoid a mechanical rename across every call
// site -- wireCheckbox('checkboxTrackingEnabled', ...),
// wireSelect('selectPhoneRotationMode', ...),
// wireCheckbox('checkboxPhoneResponsiveRotationEnabled', ...), and (via
// resetPhoneRotationBaseline()) the double-tap/double-click gesture.
// SPLIT 2026-09-30 (direct request: "add a displacement reset checkbox
// ... a double tap will place the phone back in its starting location")
// into resetPhoneRotationBaseline() + resetPhoneDisplaceBaseline() below,
// so the double-tap gesture can fire either one independently based on
// its OWN "Reset On/Off" checkbox (checkboxPhoneRotationResetEnabled /
// checkboxPhoneDisplaceResetEnabled) -- see
// setupPhoneRotationResetGesture()'s own comment. This function stays as
// a thin "reset everything" wrapper, UNCHANGED for the "on-enable"
// call sites above (toggling Rotation on, or switching Rotation Mode,
// still resets both pieces unconditionally, exactly as before this
// split -- those call sites never checked either Reset-On/Off checkbox
// to begin with, only the gesture did).
function resetPhoneModelRotationBaseline() {
  resetPhoneRotationBaseline()
  resetPhoneDisplaceBaseline()
}
function resetPhoneRotationBaseline() {
  phoneGyroQuat.identity()
  // Absolute/Orientation mode -- added 2026-09-30, see
  // _phoneAbsoluteBaselineInverse's own declaration comment for the full
  // account of why this was missing. Only meaningful with a real
  // orientation reading on hand; a no-op (leaves the existing baseline in
  // place) if reset is triggered before mobile has ever received one.
  if (lastInputSource === 'device' && latestOrientation) {
    _phoneAbsoluteBaselineInverse.copy(computePhoneAbsoluteOrientationRawQuat(latestOrientation)).invert()
  }
  // Desktop: baseline captured in the RAW (pre-final-clamp) domain -- a
  // post-clamp baseline would saturate near the cursor-distance ceiling
  // the same way the old mobile path once did near a physical clamp
  // boundary. CHANGED 2026-10-01: via computeDesktopRotationNxNy(), the
  // SAME helper computePhoneCombinedQuat()'s own desktop branch now
  // uses -- kept as one shared function specifically so this baseline
  // capture can never drift out of sync with the live formula (see that
  // function's own comment).
  const rawNxNy = computeDesktopRotationNxNy()
  phoneNxBaseline = rawNxNy.nx
  phoneNyBaseline = rawNxNy.ny
  // Direct request 2026-09-30: "When I do double tap to reset. Make it
  // instant instead of tweened and affected by damping." Everything
  // above only resets the UNDERLYING state (phoneGyroQuat, the absolute
  // baseline, the desktop nx/ny baseline) -- applyPhoneModelTransform()'s
  // own per-frame slerp(..., cfg.phoneRotationDamping) would otherwise
  // still ease the VISIBLE quaternion toward that new target gradually,
  // over several damped frames, rather than snapping there immediately.
  // Bypasses that entirely by writing the new target straight onto the
  // live quaternion right now. computePhoneCombinedQuat() is a pure
  // function of current state (just reset above), so this correctly
  // reflects "manual rotation (phoneModelRotX/Y/Z) unchanged, responsive
  // rotation now neutral" -- calling it again a moment later from the
  // normal per-frame path is harmless (same deterministic read).
  if (phoneModelWrapper) phoneModelWrapper.quaternion.copy(computePhoneCombinedQuat())
}
// Responsive Displace -- zero both integration stages, not just
// position, or a nonzero leftover velocity would immediately start
// rebuilding a position again on the very next sample (real devicemotion
// tick on mobile, or the next render frame's cursor-delta sample on
// desktop -- both platforms share this same state, see
// applyPhoneDisplaceSample()'s own comment). No separate desktop
// baseline needed (unlike Rotation's own phoneNxBaseline/phoneNyBaseline)
// -- Displace's desktop path measures cursor MOVEMENT, not a static
// position relative to some reference point, so zeroing position/
// velocity directly already means "back to starting location."
function resetPhoneDisplaceBaseline() {
  phoneDisplaceVelX = phoneDisplaceVelY = phoneDisplaceVelZ = 0
  phoneDisplacePosX = phoneDisplacePosY = phoneDisplacePosZ = 0
  // CORRECTED 2026-10-01 -- the 2026-09-30 reasoning directly below (kept
  // for history) was wrong. Direct report, real device test: "On reset or
  // startup, I see it immediately start to drift." Root cause: zeroing the
  // bias tracker on every reset throws away a valid, still-relevant
  // estimate of the device's current sensor/orientation bias -- that bias
  // has NOTHING to do with "where the user wants zero position to be"
  // (what THIS reset is actually for), it's an ongoing physical property
  // of the device's current orientation/calibration that doesn't change
  // just because the user tapped reset. Zeroing it forces the ~2.5s
  // (PHONE_DISPLACE_BIAS_TRACK_RATE) high-pass filter to re-learn from
  // scratch after every single reset, and during that re-learning window
  // the real, still-present bias leaks through almost unfiltered -- this
  // IS the reported "drift immediately after reset," confirmed via a
  // standalone replay of the real logged data (persisting bias measurably
  // reduces the post-reset climb vs. re-zeroing it). Bias now persists
  // across a Displace Reset; only velocity/position (the user's actual
  // "back to starting location" intent) reset to 0 here.
  //
  // Prior (2026-09-30) reasoning, now superseded: "a stale bias estimate
  // from before the reset isn't wrong exactly... but zeroing it gives the
  // high-pass filter a clean start matching 'back to starting location'"
  // -- this conflated 2 different concepts (zero POSITION vs. zero BIAS)
  // that don't actually need to move together.
  // Direct request 2026-09-30: "make it instant instead of tweened and
  // affected by damping" -- same fix as resetPhoneRotationBaseline()'s
  // own matching change. applyPhoneModelTransform()'s own per-frame
  // lerp(..., cfg.phoneDisplaceDamping) would otherwise ease the
  // DISPLAYED offset toward 0 gradually; snap it there directly instead
  // of waiting for the next several damped frames to catch up.
  _phoneDisplaceCurrentVec.set(0, 0, 0)
  // Always re-baseline Tilt mode too, unconditionally, regardless of
  // which mode is actually active right now -- same "update every
  // baseline every time, never branch on which pipeline is currently
  // selected" discipline this file already applies to Rotation's own
  // reset (see resetPhoneModelRotationBaseline()'s own established
  // gotcha: branching on the active mode/input-source here has
  // previously caused a reset to silently re-baseline the WRONG,
  // inactive pipeline). Harmless no-op cost when Tilt isn't selected.
  resetPhoneDisplaceTiltBaseline()
}
// CORRECTED 2026-09-27, direct report: "responsive phone rotation
// should be anchored by the phone models OWN geoemtr origin... its
// currently rotating around some world origin." The original version
// pivoted on a COMPUTED bounding-box centroid (phoneModelCentroidLocal,
// via Box3().setFromObject()) -- a reasonable-sounding approximation,
// but not what was asked for, and not guaranteed to land anywhere near
// the model's own authored pivot (a GLB's local (0,0,0) is whatever
// point the artist chose, e.g. the back face or a corner -- it doesn't
// have to coincide with the mesh's geometric bounding-box center at
// all). Fixed by pivoting on the model's own true local origin instead
// -- `phoneModelRaw.position` stays (0,0,0) always, so the model rotates
// purely around its own geometry origin.
//
// CORRECTED 2026-09-28, direct report: "it's object axes (turned on in
// debug group) does no rotate with it... The entire model instance
// should be rotating, not just the geometry." Object Axes
// (ensureObjectAxesFor()) parents its gizmo group directly onto
// `entry.object3d` -- which for Phone Model is `phoneModelWrapper` (see
// registerSceneObject('phoneModel', ..., phoneModelWrapper) below) -- and
// relies on ordinary THREE.js parent-child inheritance to follow the
// object's own local transform. The rotation was being written to
// `phoneModelRaw.quaternion` (the CHILD) while the wrapper's own
// quaternion was never touched, so the gizmo -- parented to the wrapper --
// never rotated at all, even though the visible mesh (a grandchild of the
// wrapper) rotated correctly. Fixed by moving the quaternion write to
// `phoneModelWrapper` itself. This does NOT change the pivot point or the
// 2026-09-27 fix above: `phoneModelRaw.position` is still (0,0,0)
// relative to the wrapper, so rotating the wrapper around its own origin
// produces the exact same world-space rotation as rotating the child did
// -- the mesh's own visible motion is unchanged, only the gizmo now
// tracks it. Scale deliberately STAYS on `phoneModelRaw`, not the
// wrapper, so Object Axes' gizmo lines keep a fixed visual size
// regardless of Phone Model Scale (the same reason Finger Gizmos don't
// scale with the hand).
// A plain, ALWAYS-applied constant -- direct instruction 2026-09-29:
// "The hand is probably in meters. So just scale up all my phones by
// 100, but set that as default... on the sliders that will read as
// one... 100 is one now." Uniform for every model (no per-model/
// automatic adjustment, matching the user's own "don't override my
// personal settings" instruction from earlier the same round) --
// cfg.phoneModelScale is the small, user-facing fine-tune multiplier
// on top of this fixed base (0.5-5 slider range, default 1).
const PHONE_MODEL_SCALE_BASE = 100
// Responsive Displace's own damped/smoothed contribution -- persists
// across frames (module-level, like phoneGyroQuat) so cfg.phoneDisplaceDamping
// can lerp it smoothly toward computePhoneResponsiveDisplacement()'s own
// per-frame target, the same role cfg.phoneRotationDamping's slerp plays
// for the rotation quaternion 2 lines below.
const _phoneDisplaceTargetVec = new THREE.Vector3()
const _phoneDisplaceCurrentVec = new THREE.Vector3()
function applyPhoneModelTransform() {
  if (!phoneModelRaw || !phoneModelWrapper) return
  _phoneDisplaceTargetVec.copy(computePhoneResponsiveDisplacement())
  _phoneDisplaceCurrentVec.lerp(_phoneDisplaceTargetVec, cfg.phoneDisplaceDamping)
  phoneModelWrapper.position.set(
    cfg.phoneModelOffsetX + _phoneDisplaceCurrentVec.x,
    cfg.phoneModelOffsetY + _phoneDisplaceCurrentVec.y,
    cfg.phoneModelOffsetZ + _phoneDisplaceCurrentVec.z
  )
  phoneModelWrapper.quaternion.slerp(computePhoneCombinedQuat(), cfg.phoneRotationDamping)
  phoneModelRaw.scale.setScalar(PHONE_MODEL_SCALE_BASE * cfg.phoneModelScale)
  phoneModelRaw.quaternion.identity()
  phoneModelRaw.position.set(0, 0, 0)
}
function ensurePhoneModelWrapper() {
  if (!phoneModelWrapper) {
    phoneModelWrapper = new THREE.Group()
    phoneModelWrapper.name = 'PhoneModelWrapper'
    scene.add(phoneModelWrapper)
    registerSceneObject('phoneModel', 'Phone Model', phoneModelWrapper)
  }
  return phoneModelWrapper
}
function disposePhoneModelRaw() {
  if (!phoneModelRaw) return
  // The generic material-disposal traversal below would dispose whatever
  // texture is CURRENTLY on each phoneScreenMeshes[i].material -- if
  // that's our own reusable phoneScreenRenderMaterial, its .map is a
  // render target's texture, not a real glTF asset, and disposing it
  // would break the render target for every model loaded afterward.
  // Swap each mesh back to its own real original material first so only
  // that gets disposed, same as every other mesh. Also checks
  // phoneScreenWhiteMaterial (added 2026-09-29, the recursion-floor
  // placeholder) for the same reason -- it has no .map to break, but
  // disposing the shared material OBJECT itself would leave the next
  // model reusing an already-disposed material, since the variable
  // holding it is never nulled out on disposal.
  phoneScreenMeshes.forEach((mesh, i) => {
    if (mesh.material === phoneScreenRenderMaterial || mesh.material === phoneScreenWhiteMaterial) mesh.material = phoneScreenOriginalMaterials[i]
  })
  phoneModelWrapper.remove(phoneModelRaw)
  phoneModelRaw.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach((m) => { Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose() }); m.dispose() })
    }
  })
  phoneModelRaw = null
  phoneScreenMeshes = []
  phoneScreenOriginalMaterials = []
}
// Finds the mesh(es) representing the phone's screen (Virtual Screen
// render-to-texture target), by the name 'Screen Face' -- case/
// whitespace-tolerant since glTF export can alter exact capitalization.
// Returns an ARRAY (usually 0 or 1 entries, but see the multi-primitive
// case below) rather than a single mesh -- CORRECTED 2026-09-29 (2nd
// round), after this project's earlier single-mesh version still missed
// a real case, found by reading the actual bundled GLTFLoader.js source
// directly (not guessed): a glTF "mesh" with MULTIPLE primitives (e.g.
// P5 Project 1's own 'Screen Face' node, which has 2: a 'Display'
// primitive and a 'backcam' primitive) is NOT loaded as one THREE.Mesh
// -- GLTFLoader's own loadMesh() creates one THREE.Mesh per primitive
// and wraps them in a `new Group()` when there's more than one
// (`if (meshes.length === 1) return meshes[0]; const group = new
// Group(); ...`); the NODE's own name (here, 'Screen Face') then gets
// applied to whichever object ends up representing the node --
// `_loadNodeShallow()`'s own `node.name = nodeName` line runs on
// `objects[0]` directly when there's exactly one child object (so a
// SINGLE-primitive node's resulting Mesh correctly ends up named
// 'Screen Face', matched by pass 1 below with no special-casing needed)
// but on the NEWLY-CREATED GROUP WRAPPER when there's more than one
// child (a MULTI-primitive node) -- so for a multi-primitive 'Screen
// Face' node, NEITHER child Mesh is itself named 'Screen Face' at all;
// only their non-Mesh parent Group is. A plain `obj.isMesh &&
// obj.name === ...` search (this function's original version) can
// never find these children. Pass 1 below fixes this by walking each
// mesh's own ANCESTOR CHAIN (not just its own name) up to `root`,
// covering both cases uniformly -- a matching ancestor's name (whether
// that ancestor IS the mesh itself, for the single-primitive case, or a
// Group 2+ levels up, for the multi-primitive case) qualifies the mesh.
// Pass 2 (material-name fallback, for a mesh whose own node/ancestor
// chain isn't named 'Screen Face' at all but whose MATERIAL is --
// e.g. one primitive of a larger, differently-named combined mesh) is
// unchanged from the 1st round's fix. Returns an empty array if a model
// genuinely has no screen target (not every phone model is guaranteed
// to have one).
function findPhoneScreenMeshes(root) {
  // normalizeName() added 2026-09-29, direct report: "the recurrsive
  // rendering isnt working for hte Nothing2 model" (a real, separate
  // bug from the meshopt-decoder one -- confirmed live via
  // window.__debug.phoneModelRaw: the LOADED mesh name is
  // "Screen_Face" (underscore), even though the raw GLB JSON's own
  // node name is "Screen Face" (space) -- something in the load
  // pipeline sanitizes the name, and the exact-match check missed it
  // entirely. Collapsing underscores/dots to spaces (then collapsing
  // repeated whitespace) makes "Screen_Face", "Screen.Face", and
  // "Screen  Face" all match "Screen Face" the same as case already
  // does, extending this project's own "be flexible with
  // capitalization" rule to separator characters too.
  function normalizeName(name) {
    return name.trim().toLowerCase().replace(/[_.]+/g, ' ').replace(/\s+/g, ' ')
  }
  function nameMatches(obj) {
    return typeof obj.name === 'string' && normalizeName(obj.name) === 'screen face'
  }
  const pass1 = []
  root.traverse((obj) => {
    if (!obj.isMesh) return
    for (let node = obj; node && node !== root.parent; node = node.parent) {
      if (nameMatches(node)) { pass1.push(obj); break }
    }
  })
  if (pass1.length) return pass1
  const pass2 = []
  root.traverse((obj) => {
    if (obj.isMesh && obj.material && typeof obj.material.name === 'string' && normalizeName(obj.material.name) === 'screen face') pass2.push(obj)
  })
  return pass2
}
// Measures the Screen Face mesh's REAL physical width:height ratio from
// its actual geometry, instead of assuming a UV bounding box's aspect
// reflects real-world shape (see loadPhoneModel()'s own comment for why
// that assumption was wrong -- UV islands are commonly packed into a
// texture atlas without preserving proportions). For each triangle,
// solves the 2x2 linear system relating a UV-space edge pair to its
// corresponding world-space edge pair, giving the world-space distance
// covered by one unit of U and one unit of V at that triangle; averages
// this (UV-area-weighted, so tiny/degenerate triangles don't dominate)
// across the whole mesh, then scales by the mesh's actual UV range
// (uvW/uvH, passed in -- already computed by the caller) to get the
// real physical width:height ratio. Returns null if the mesh has no
// index/position/uv data usable for this, or if every triangle turned
// out UV-degenerate (caller falls back to the plain UV-bounding-box
// ratio in that case).
function computeScreenGeometryUvAspect(mesh, uvW, uvH) {
  const geo = mesh?.geometry
  const posAttr = geo?.attributes?.position
  const uvAttr = geo?.attributes?.uv
  if (!posAttr || !uvAttr || uvW <= 0 || uvH <= 0) return null
  const index = geo.index
  const triCount = Math.floor((index ? index.count : posAttr.count) / 3)
  if (!triCount) return null
  let worldPerUSum = 0, worldPerVSum = 0, weightSum = 0
  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3()
  const dp1 = new THREE.Vector3(), dp2 = new THREE.Vector3()
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
    const du1 = uvAttr.getX(i1) - uvAttr.getX(i0), dv1 = uvAttr.getY(i1) - uvAttr.getY(i0)
    const du2 = uvAttr.getX(i2) - uvAttr.getX(i0), dv2 = uvAttr.getY(i2) - uvAttr.getY(i0)
    const det = du1 * dv2 - du2 * dv1
    if (Math.abs(det) < 1e-9) continue // UV-degenerate triangle (zero UV area) -- skip
    p0.fromBufferAttribute(posAttr, i0); p1.fromBufferAttribute(posAttr, i1); p2.fromBufferAttribute(posAttr, i2)
    dp1.subVectors(p1, p0); dp2.subVectors(p2, p0)
    const invDet = 1 / det
    // [worldPerU | worldPerV] = [dp1 | dp2] * inverse([[du1,dv1],[du2,dv2]])
    const worldPerULen = Math.hypot(
      dp1.x * dv2 * invDet - dp2.x * dv1 * invDet,
      dp1.y * dv2 * invDet - dp2.y * dv1 * invDet,
      dp1.z * dv2 * invDet - dp2.z * dv1 * invDet
    )
    const worldPerVLen = Math.hypot(
      dp2.x * du1 * invDet - dp1.x * du2 * invDet,
      dp2.y * du1 * invDet - dp1.y * du2 * invDet,
      dp2.z * du1 * invDet - dp1.z * du2 * invDet
    )
    const uvArea = Math.abs(det) / 2
    worldPerUSum += worldPerULen * uvArea
    worldPerVSum += worldPerVLen * uvArea
    weightSum += uvArea
  }
  if (weightSum === 0 || worldPerVSum === 0) return null
  const realWidth = (worldPerUSum / weightSum) * uvW
  const realHeight = (worldPerVSum / weightSum) * uvH
  return realHeight > 0 ? realWidth / realHeight : null
}
function loadPhoneModel(relativePath) {
  if (!relativePath) return
  const token = ++phoneModelLoadToken
  ensurePhoneModelWrapper()
  const phoneLoader = new GLTFLoader()
  phoneLoader.setDRACOLoader(dracoLoader)
  // Nothing2.glb requires BOTH KHR_draco_mesh_compression AND
  // EXT_meshopt_compression (confirmed via its own extensionsRequired,
  // parsed directly from the raw GLB) -- direct report: "the recurrsive
  // rendering isnt working for hte Nothing2 model." Without a
  // MeshoptDecoder registered, GLTFLoader fails to load the whole
  // model, not just its Screen Face mesh.
  phoneLoader.setMeshoptDecoder(MeshoptDecoder)
  phoneLoader.load(encodeURI(relativePath), (gltf) => {
    if (token !== phoneModelLoadToken) return // superseded by a newer selection/reload before this one finished
    disposePhoneModelRaw()
    phoneModelRaw = gltf.scene
    phoneModelWrapper.add(phoneModelRaw)
    phoneScreenMeshes = findPhoneScreenMeshes(phoneModelRaw)
    phoneScreenOriginalMaterials = phoneScreenMeshes.map((m) => m.material)
    // frustumCulled = false -- direct report 2026-09-29: "iphone max
    // pro 3d model screen is invisible. im lookin through it. its not
    // a rotaiton issue." Confirmed live: setting frustumCulled=false on
    // the mesh made the screen render immediately. Same bug class
    // already fixed for the hand's own SkinnedMesh elsewhere in this
    // file -- three.js's default frustum check uses a bounding sphere
    // computed once from the mesh's own raw LOCAL geometry, which
    // doesn't account for the whole model's Offset/Scale/Rotation
    // transforms (phoneModelWrapper/phoneModelRaw) shifting it far
    // from where that local-space sphere assumes it sits in world
    // space -- three.js then incorrectly concludes the mesh is outside
    // the camera frustum and skips rendering it entirely, which reads
    // exactly as "looking through it" (nothing drawn there at all, so
    // whatever's behind shows through). Applies to every model, not
    // just iPhone 17 Max Pro -- this mesh's own local geometry/pivot
    // is what determines whether the bug is visible for a given
    // Scale/Offset combination, so a model that happens to look fine
    // today isn't guaranteed to stay that way if its own transform
    // values change.
    phoneScreenMeshes.forEach((m) => { m.frustumCulled = false })
    // Real per-mesh UV center, NOT hardcoded (0.5, 0.5) -- direct
    // request 2026-09-29: "i want you to put the scale and mirror
    // origin on the center of te SCREEN FACE mesh." A hardcoded 0.5,0.5
    // assumes every model's Screen Face UV island is perfectly centered
    // in the full [0,1] texture space -- even Pixel 9A, whose UV range
    // measures very close to [0,1] (min ~0.008/0.006, max ~0.989/0.995),
    // has a REAL midpoint of (0.498, 0.500), not exactly (0.5, 0.5).
    // That small a pivot error is invisible at shallow recursion depth,
    // but Recursive Render feeds each pass's own output back in as the
    // NEXT pass's input -- a pivot error compounds/amplifies through
    // repeated recursive scale+mirror, which is a coherent explanation
    // for the exact reported pattern ("1st/2nd good, 3rd+ wrong") and
    // for why different models (each with their own real, ungauranteed
    // UV centering) showed inconsistent results. Computed once here,
    // from phoneScreenMeshes[0]'s own real UV attribute (the
    // representative mesh when there's more than one primitive) --
    // falls back to (0.5, 0.5) only if the mesh has no UV data at all.
    phoneScreenUvCenter = { x: 0.5, y: 0.5 }
    phoneScreenUvAspect = 1
    const uvAttr = phoneScreenMeshes[0]?.geometry?.attributes?.uv
    if (uvAttr && uvAttr.count) {
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
      for (let i = 0; i < uvAttr.count; i++) {
        const u = uvAttr.getX(i), v = uvAttr.getY(i)
        if (u < minU) minU = u
        if (u > maxU) maxU = u
        if (v < minV) minV = v
        if (v > maxV) maxV = v
      }
      phoneScreenUvCenter = { x: (minU + maxU) / 2, y: (minV + maxV) / 2 }
      // Real per-model screen aspect ratio, CORRECTED 2026-09-29 (2nd
      // round) -- direct report: "To Scale" was still visibly wrong on
      // EVERY device, EVERY model, right after a refresh, with no code
      // change to the formula itself. Live console diagnostic
      // (window.__mirrorDebug) on 2 real models showed
      // phoneScreenUvAspect computing 0.99 and 0.999 -- nearly perfectly
      // SQUARE for a real phone screen (physically implausible, should
      // be roughly 0.4-0.5, much taller than wide). Root cause: a UV
      // BOUNDING BOX's own aspect ratio does NOT necessarily reflect the
      // mesh's real physical shape at all -- UV islands are commonly
      // packed into a texture atlas without preserving real-world
      // proportions, which is clearly what's happening on these assets.
      // The uW/uvH bounding-box approach below is replaced with a
      // proper measurement: for each triangle, solve for the WORLD-SPACE
      // distance covered by one unit of U and one unit of V (a 2x2
      // linear solve per triangle, UV-area-weighted across the mesh),
      // then combine with the mesh's actual UV range to get the real
      // physical width:height ratio -- this is correct regardless of
      // whether the UV unwrap preserves proportions or not, since it
      // measures the REAL geometry directly instead of assuming UV
      // shape mirrors world shape.
      const uvW = maxU - minU, uvH = maxV - minV
      const measuredAspect = computeScreenGeometryUvAspect(phoneScreenMeshes[0], uvW, uvH)
      if (measuredAspect) phoneScreenUvAspect = measuredAspect
      else if (uvW > 0 && uvH > 0) phoneScreenUvAspect = uvW / uvH // fallback if geometry measurement fails
    }
    if (!phoneScreenMeshes.length) console.warn(ts() + ' Phone model has no "Screen Face" mesh -- Virtual Screen render will have no effect:', relativePath)
    applyPhoneModelTransform()
    // On-demand rendering (2026-09-29) -- a model swap is triggered from
    // the Item Selector's own plain <div> rows (no input/change event,
    // not one of wireSlider/wireCheckbox/etc) and finishes asynchronously
    // regardless of trigger source, so this async completion is the one
    // chokepoint that reliably covers every path a load can start from.
    requestRender()
  }, undefined, (err) => { console.error(ts() + ' Phone model failed to load:', relativePath, err) })
}
function removePhoneModel() {
  phoneModelLoadToken++ // invalidate any in-flight load
  disposePhoneModelRaw()
  if (phoneModelWrapper) {
    unregisterSceneObject('phoneModel')
    scene.remove(phoneModelWrapper)
    phoneModelWrapper = null
  }
}
function setPhoneModelEnabled(enabled) {
  cfg.phoneModelEnabled = enabled
  if (enabled) {
    if (cfg.phoneModelFile) loadPhoneModel(cfg.phoneModelFile)
  } else {
    removePhoneModel()
  }
  const cb = document.getElementById('checkboxPhoneModelEnabled')
  if (cb) cb.checked = cfg.phoneModelEnabled
}
// 2 checkboxes both drive cfg.hideHands, in OPPOSITE sense -- "Hide
// Hands" (Field Layout) is checked when hidden; "Hand Model On/Off"
// (directly in HAND MODEL, per direct request 2026-09-28 -- this row
// used to be a Phone Model duplicate, repurposed) is checked when
// VISIBLE. Both need to stay in sync regardless of which one was
// actually clicked.
function syncHandModelEnabledCheckboxes() {
  const hideCb = document.getElementById('checkboxHideHands')
  const enabledCb = document.getElementById('checkboxHandModelEnabled')
  if (hideCb) hideCb.checked = cfg.hideHands
  if (enabledCb) enabledCb.checked = !cfg.hideHands
}
// Called every animate() frame (unconditionally within !isPaused, same as
// updateAllFingerGizmos()) -- Responsive Rotation depends on live
// tiltMagnitude/tiltAngle (desktop) or phoneGyroQuat (mobile, updated
// independently per real devicemotion tick), so the transform needs
// recomputing every frame while the phone model is loaded, not just on a
// dev-panel control's own input event.
function updatePhoneModelFrame() {
  if (!cfg.phoneModelEnabled || !phoneModelRaw) return
  updatePhoneDisplaceDesktopFrame() // per-frame cursor-delta sampling (desktop only, no-ops on mobile) -- see its own comment for why this must run every frame, not per mousemove event
  applyPhoneModelTransform()
}

// =======================================================================
// Virtual Screen -- render the app's own live 3D scene onto the phone
// GLB's 'Screen Face' mesh, direct request 2026-09-29.
//
// Recursion is bounded, not infinite, by construction: the screen shows
// a snapshot of the scene rendered on a PRIOR pass, not a live view of
// itself. Each frame runs `cfg.screenRecursionLevels` (1-10) sequential
// off-screen passes, ping-ponging between 2 render targets:
//   pass 0 (the floor): the screen mesh is hidden entirely, so this
//     capture has NO screen-in-screen at all -- the recursion's base case.
//   pass i>0: the screen mesh is shown, textured with pass (i-1)'s own
//     capture -- so it displays "the scene, with the screen showing what
//     the scene looked like one level up."
// After the loop, the LAST pass's capture becomes the screen's texture
// for the real, visible frame the user actually sees (composer.render(),
// called right after this in animate()) -- so on screen the user sees
// `levels` total layers of nesting (level 1 = a plain flat view, no
// recursion visible at all, since pass 0's own capture has the screen
// hidden). No THREE.WebGLRenderer.render() call ever reads a render
// target it is currently writing to, so this can never loop forever
// regardless of how high `levels` is set -- it's a fixed number of
// sequential passes per frame, not a live feedback loop.
const SCREEN_RENDER_BASE_WIDTH = 384
const SCREEN_RENDER_BASE_HEIGHT = 768
// Lazily (re)creates the 2 ping-pong render targets at the CURRENT
// Render Resolution (%) -- disposes and rebuilds only when the
// resolution has actually changed since the last call, so dragging the
// slider doesn't thrash allocations every frame but does take effect
// within one frame of release.
function ensureScreenRenderTargets() {
  const pct = THREE.MathUtils.clamp(cfg.screenRenderResolution || 100, 10, 200) / 100
  const w = Math.max(1, Math.round(SCREEN_RENDER_BASE_WIDTH * pct))
  const h = Math.max(1, Math.round(SCREEN_RENDER_BASE_HEIGHT * pct))
  if (screenRenderTargets && screenRenderTargets[0].width === w && screenRenderTargets[0].height === h) return screenRenderTargets
  if (screenRenderTargets) screenRenderTargets.forEach((rt) => rt.dispose())
  screenRenderTargets = [0, 1].map(() => {
    const rt = new THREE.WebGLRenderTarget(w, h)
    rt.texture.colorSpace = THREE.SRGBColorSpace
    return rt
  })
  return screenRenderTargets
}
function resetPhoneScreenMaterial() {
  phoneScreenMeshes.forEach((mesh, i) => {
    if (phoneScreenOriginalMaterials[i]) mesh.material = phoneScreenOriginalMaterials[i]
    mesh.visible = true
  })
}
function setScreenRenderEnabled(enabled) {
  cfg.screenRenderEnabled = enabled
  if (!enabled) resetPhoneScreenMaterial()
}
// Applies Scale/Rotation/X-Y-Scale to the render texture's own UV
// transform (THREE.Texture's built-in offset/repeat/rotation/center --
// this is a texture-space transform, not a geometry change, so it
// doesn't touch the mesh itself). `center` is set to (0.5,0.5) so
// rotation/scale pivot around the middle of the mapped face, not a
// corner -- the intuitive default for "rotate/scale the screen image."
// Larger Scale/X-Scale/Y-Scale values make the image appear BIGGER
// (zoomed in) -- since THREE.Texture.repeat smaller-than-1 zooms IN
// (shows less of the image across the same UV area), the slider values
// are inverted (1/value) when assigned to .repeat.
//
// "To Scale" mode (cfg.screenToScaleEnabled) computes X/Y Scale
// automatically instead of reading the sliders -- see cfg's own
// screenToScaleEnabled comment for the root-cause reasoning. NOT
// independently browser-verified (this session's own standing
// limitation) -- if the correction direction comes out backwards on the
// real device, swap `camAspect / targetAspect` for its reciprocal here,
// the rest of the reasoning (that SOME correction is needed at all,
// and that it should track camera.aspect live) should still hold.
// CORRECTED 2026-09-29, direct report: "every other rendered image is
// mirrored left to right. So the 1st image rendered on the phone model
// is flipped, the 2nd one in that is not, etc." Confirmed via
// AskUserQuestion that this reproduces even at Recursion Levels=2 (the
// simplest possible case, one nested level) -- which rules out a bug
// that only emerges from repeated compounding across many passes, and
// points somewhere else: this function itself is called with IDENTICAL
// cfg values on every single pass (nothing here varies by pass index),
// so it cannot by itself be the source of a difference between
// generations. The only thing that genuinely differs between pass 0
// (screen hidden, a "clean" capture with the Screen Face mesh never
// actually rendered/textured at all) and every later pass (screen
// VISIBLE, its own geometry sampled with a texture for the first time)
// is that the Screen Face mesh's OWN UV winding only ever enters the
// picture starting from pass 1 onward. A SINGLE, CONSTANT horizontal
// UV-mirror baked into that one mesh (a common glTF/Blender export
// quirk on a mirrored/duplicated part) explains the reported pattern
// exactly: applying a mirror once per recursion level is mathematically
// identical to two facing mirrors -- level 1 (1 application) reads
// flipped, level 2 (2 applications, nested one level deeper) reads
// flipped-of-a-flip = back to normal, level 3 flipped again, etc.
// `-1 *` below cancels that single per-application mirror at its
// source, which fixes every level uniformly rather than needing a
// per-level correction.
//
// SUPERSEDED 2026-09-29, direct report: "im still getting the issue o
// the render mirroring every other screen." The blind constant `-1 *`
// above evidently did NOT fix it (this session's own standing
// limitation -- never independently verified against the real
// device/mesh, and this is now the 2nd report confirming it wasn't
// enough). Rather than guess a 3rd theory cold (this project's own
// documented failure pattern on this exact bug class -- see the Phone
// Model mobile-rotation-axis saga elsewhere in this file for how badly
// that goes when repeated), REPLACED with 2 direct user-facing
// checkboxes (Mirror Alternating X/Y) so the user can toggle exactly
// what's needed per model, instead of a hardcoded guess. Registered
// per-model (PHONE_MODEL_PER_MODEL_CONTROL_IDS) since this may
// genuinely vary by each model's own mesh/export.
//
// CORRECTED, same day: the parity direction was originally counted
// from `passIndex` alone (odd i = mirrored), which mirrors relative to
// the RENDER LOOP's own internal pass order -- not what was actually
// asked for. Direct clarification: "it should mirror the first render
// first. then the 3rd etc. So the render on the actual geometry Screen
// Face should be mirrored" -- i.e. depth counted from the VIEWER's own
// perspective, where depth 1 is the texture painted directly on the
// real Screen Face mesh (the outermost, most-immediately-visible
// layer), depth 2 is the first reflection nested inside that, etc.
//
// REWRITTEN 2026-09-29 (per-depth approach abandoned) -- direct
// insight: "i suspect that it may have to do with the alternating
// order recursively applying instead of just applying globally...
// for each rendered image, its applying another layer of mirror
// alternating... so depending on my mirror order, sometimes the
// multiple mirroring will overlap." Correct: this function is called
// once per recursion pass, and each pass's transform doesn't just set
// THAT depth's own appearance in isolation -- it flips the ENTIRE
// image being captured, including whatever nested content from
// earlier passes is already embedded inside it. So depth d's real
// perceived mirror state is the PRODUCT of every pass's flip from the
// outermost display down to d, not a value that can be picked
// independently per depth (picking per-depth values, as the previous
// version did, fights this compounding instead of using it -- hence
// "sometimes the multiple mirroring will overlap"). The fix: stop
// computing a depth/passIndex-dependent value entirely. Loop calls
// (embedding one pass's capture into the next) all use the SAME
// constant flip when Alternating is checked; the alternation by depth
// then falls out automatically from compounding one more constant
// flip per nesting step -- no depth math needed. The FINAL display
// call (the one real call not followed by further embedding) gets its
// own, separately-chosen constant flip, controlled by the new Order
// checkbox -- since that call's flip multiplies EVERY depth
// uniformly (it flips the whole final image, nested content and
// all), it alone determines the whole chain's starting phase:
// Order off -> depth 1 unmirrored, Order on -> depth 1 mirrored, with
// every deeper depth alternating cleanly from there via compounding.
function applyScreenTextureTransform(texture, isFinalDisplay, depth, levels) {
  if (!texture) return
  // getRuntimeDeviceSuffix(), NOT getActiveDevPanelTab() -- see that
  // function's own comment. This is RENDER-time value selection (which
  // device's tuned value should actually apply to the live texture),
  // not an editing-UI concern.
  const deviceSuffix = getRuntimeDeviceSuffix()
  let scaleX = cfg['screenTextureScaleX' + deviceSuffix] || 1
  let scaleY = cfg['screenTextureScaleY' + deviceSuffix] || 1
  if (cfg.screenToScaleEnabled) {
    // CORRECTED 2026-09-29, direct report: "the render still looks
    // stretched in one of the axes... regardless of my browser
    // dimensions and the displayed model's screen dimensions, the
    // rendered images will always be correctly scaled in terms of X
    // to Y." The old formula (camAspect / the render target's own
    // FIXED 384:768 buffer aspect) only corrected for ONE of the 2
    // real stretch sources -- it never accounted for each phone
    // model's own actual screen shape at all (the buffer aspect is a
    // single hardcoded constant, same for every model). Working the
    // full chain through algebraically (camera capture -> fixed
    // buffer -> mesh's own UV shape), the buffer's own aspect cancels
    // out completely -- only the camera's aspect and the mesh's real
    // screen aspect should matter for the final result. Using
    // phoneScreenUvAspect (real per-model UV width/height, computed
    // once at load time -- see loadPhoneModel()'s own comment)
    // directly in place of the fixed buffer aspect.
    const camAspect = camera.aspect || phoneScreenUvAspect
    scaleX = camAspect / phoneScreenUvAspect
    scaleY = 1
    // TEMPORARY diagnostic, 2026-09-29 -- direct report: desktop now
    // shows the same "narrow" distortion mobile did, on every model,
    // after a refresh -- with no code change to this formula since it
    // last looked correct on desktop. Reuses the same window.__mirrorDebug
    // flag already used to debug the mirror investigation (the user
    // already knows how to set it), so the real live camAspect/
    // phoneScreenUvAspect/scaleX/repeat.x values show up in the console
    // instead of needing a separate window.__debug lookup. Remove once
    // this is resolved.
    if (window.__mirrorDebug) console.log(ts() + ' [toScaleDebug] camAspect=' + camAspect + ' phoneScreenUvAspect=' + phoneScreenUvAspect + ' scaleX=' + scaleX + ' repeat.x=' + (1 / ((cfg.screenTextureScale || 1) * scaleX)))
  }
  // Per-Level Scale, added 2026-09-29 -- multiplies the base Texture
  // Scale by a per-depth factor from the Min/Max + Curve controls (see
  // computeScreenLevelScale()'s own comment for the depth/curve
  // reasoning). `depth`/`levels` are only passed at the 2 real call
  // sites in renderVirtualScreen() -- default to a no-op (depth=1) if
  // ever called without them.
  const overall = (cfg.screenTextureScale || 1) * computeScreenLevelScale(depth || 1, levels || 1)
  // MIRROR ORDER/PHASE, REWRITTEN 2026-09-29 (no depth/passIndex math
  // at all now -- see this function's own leading comment for the
  // full reasoning). `isFinalDisplay` is the only thing distinguishing
  // the two call sites: a LOOP call (embedding one pass's capture into
  // the next) always uses the SAME constant flip when Alternating is
  // checked, letting the depth-by-depth alternation emerge purely
  // from compounding through nesting; the FINAL display call (the one
  // call not followed by further embedding, since it flips the whole
  // outermost image -- everything nested inside it included) gets its
  // own separately-chosen constant, picked by the Order checkbox, and
  // that single choice is what sets the whole chain's starting phase.
  // CORRECTED 2026-09-29, direct request ("your mirror defaults ot
  // 010101, can you flip that. so it defaults to 101010 when mirror
  // order is not checked"): Order OFF -> depth 1 MIRRORED (1010...),
  // Order ON -> depth 1 unmirrored (0101...) -- the opposite of the
  // first cut above.
  const mirrorX = !cfg.screenMirrorAlternatingX ? 1 : (isFinalDisplay ? (cfg.screenMirrorPhaseX ? 1 : -1) : -1)
  const mirrorY = !cfg.screenMirrorAlternatingY ? 1 : (isFinalDisplay ? (cfg.screenMirrorPhaseY ? 1 : -1) : -1)
  // TEMPORARY diagnostic, 2026-09-29 -- direct report "it didint
  // work" after 2 failed theories (constant flip, texture-matrix
  // timing). Logs the real computed mirror per call so the actual
  // runtime sequence can be read from the console instead of guessed
  // a 4th time. Remove once this is resolved.
  if (window.__mirrorDebug) console.log(ts() + ' [mirrorDebug] isFinalDisplay=' + isFinalDisplay + ' mirrorX=' + mirrorX + ' mirrorY=' + mirrorY)
  texture.center.set(phoneScreenUvCenter.x, phoneScreenUvCenter.y)
  texture.repeat.set(mirrorX / (overall * scaleX), mirrorY / (overall * scaleY))
  texture.rotation = THREE.MathUtils.degToRad(cfg.screenTextureRotation || 0)
  texture.offset.set(cfg['screenTextureOffsetX' + deviceSuffix] || 0, cfg['screenTextureOffsetY' + deviceSuffix] || 0)
  // CORRECTED 2026-09-29 (2nd round), direct report "it didint work"
  // after the updateMatrix() fix (kept below) shipped and was tested
  // live. Live console instrumentation on Pixel 9A (8 levels, Mirror X
  // on) PROVED the JS-side parity/mirror computation is mathematically
  // correct -1,1,-1,1,-1,1,-1,-1 on every single pass, every frame,
  // consistently -- ruling out the formula and this function's own
  // math entirely. The remaining explanation is a well-known three.js
  // pitfall: `texture.needsUpdate = true` (removed here) and
  // `material.needsUpdate = true` (removed in renderVirtualScreen()
  // below) both signal "this needs a full shader/texture
  // upload PIPELINE refresh", not "just re-read my current uniform
  // values" -- routine, since a changed `.map` reference or `.matrix`
  // is already picked up automatically by three.js's own per-draw-call
  // uniform sync, with NO flag needed. Forcing `needsUpdate` on EVERY
  // one of up to 10 passes, MULTIPLE TIMES PER FRAME, asks for a much
  // heavier recompile/re-upload cycle than the situation calls for --
  // in some browsers shader program compilation can be deferred/
  // pipelined by the driver, so a backlog of unnecessary recompile
  // requests queuing up within one frame is a plausible, well-
  // supported explanation for "the first couple of passes look right,
  // then it gets stuck wrong" (early requests complete in time, later
  // ones in the same frame don't catch up before the frame is
  // displayed). texture.updateMatrix() (kept below) is still correct
  // and harmless -- it's what actually keeps `.matrix` synchronous;
  // the bug was specifically the 2 `needsUpdate` flags requesting far
  // more work than a routine per-pass texture/uniform change needs.
  texture.updateMatrix()
}
function renderVirtualScreen() {
  if (!cfg.screenRenderEnabled || !cfg.phoneModelEnabled || !phoneScreenMeshes.length) return
  const targets = ensureScreenRenderTargets()
  // CORRECTED 2026-09-29 -- hard cap raised 10 -> 30, direct request:
  // "I think its capped at 10... move the cap to 30." The slider's own
  // UI min/max (still 1-10, see sliderScreenRecursionLevels's own
  // addRow) is left alone per direct instruction -- this only widens
  // the actual clamp so a value typed via click-to-type (e.g. 15) isn't
  // silently capped back down to 10.
  const levels = THREE.MathUtils.clamp(Math.round(cfg.screenRecursionLevels || 1), 1, 30)
  if (!phoneScreenRenderMaterial) phoneScreenRenderMaterial = new THREE.MeshBasicMaterial()
  if (!phoneScreenWhiteMaterial) phoneScreenWhiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff })
  phoneScreenRenderMaterial.color.setScalar(cfg.screenEmissionIntensity ?? 1)
  for (let i = 0; i < levels; i++) {
    if (i === 0) {
      // CORRECTED 2026-09-29, direct report: "for the last screen face
      // which will not have a rendered image, default the material to
      // white. It is currently showing up as invisible when no render
      // is applied." Pass 0 is the recursion floor -- it's captured
      // with nothing on the phone screen yet, since there's no prior
      // pass's texture to show. Hiding the mesh entirely (the old
      // behavior) left the deepest nested screen looking like a hole;
      // showing it with a plain white material instead reads as a
      // blank/lit screen, matching what an OFF or not-yet-rendered
      // real phone screen actually looks like.
      phoneScreenMeshes.forEach((mesh) => { mesh.visible = true; mesh.material = phoneScreenWhiteMaterial })
    } else {
      phoneScreenRenderMaterial.map = targets[(i - 1) % 2].texture
      // REWRITTEN 2026-09-29 -- superseding an earlier passIndex-based
      // fix for a duplicate-depth bug (see git history), itself
      // superseded once the whole depth/passIndex model was dropped
      // (see applyScreenTextureTransform()'s own leading comment). A
      // LOOP call always embeds one pass's capture into the next, so
      // it's never the final display -- pass isFinalDisplay=false.
      // depth = levels-i+1, added 2026-09-29 for Per-Level Scale (see
      // computeScreenLevelScale()'s own comment) -- verified by hand:
      // for levels=4, i=1..3 gives depth=4,3,2 (the final display below
      // covers depth=1), matching every depth exactly once, same
      // derivation already verified for the earlier depth-duplication fix.
      applyScreenTextureTransform(phoneScreenRenderMaterial.map, false, levels - i + 1, levels)
      phoneScreenMeshes.forEach((mesh) => { mesh.visible = true; mesh.material = phoneScreenRenderMaterial })
    }
    renderer.setRenderTarget(targets[i % 2])
    renderer.render(scene, camera)
  }
  phoneScreenRenderMaterial.map = targets[(levels - 1) % 2].texture
  // This is the one call not followed by further embedding -- it
  // flips the whole outermost image, everything nested inside it
  // included -- so isFinalDisplay=true (see the leading comment).
  // depth=1 (the outermost/first level) -- see the loop call site above.
  applyScreenTextureTransform(phoneScreenRenderMaterial.map, true, 1, levels)
  phoneScreenMeshes.forEach((mesh) => { mesh.visible = true; mesh.material = phoneScreenRenderMaterial })
  renderer.setRenderTarget(null)
}

const tiltTarget = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
// Ported from HANDY DANDIES' own real computeRadialRollDeg() -- REINSTATED
// 2026-09-27 (3rd round on this feature) after a direct correction that
// Palm Faces Cursor/Palm Face Rotation are ONE combined single-axis
// rotation (around the forearm bone's own Y axis, anchored at its base --
// see animate()'s own comment), not a full 3D lookAt with this formula
// unused. dx/dy measured in world space (X right, Y up) -- deliberately
// NOT projected through the camera to screen/NDC space, matching HANDY
// DANDIES' own reasoning (see its own source comment): the world-space
// XY plane is what "left/right/above/below the cursor" means here too.
function computeRadialRollDeg(handPos, targetPos) {
  // dx negated 2026-09-27, direct report: "When my cursor moves more to
  // the left, the hand rotates to the right" (the opposite of intended).
  // Flips left/right response only -- dy (the other axis) untouched.
  const dx = -(handPos.x - targetPos.x), dy = handPos.y - targetPos.y
  return THREE.MathUtils.radToDeg(Math.atan2(dx, -dy))
}
// Angle-domain smoothing, applied to Palm Rotation's own baseDeg BEFORE
// it becomes a quaternion -- separate from (and in addition to)
// cfg.trackingDamping's own quaternion-level slerp. Added 2026-09-27,
// direct report: "when i move the cursor fully around the hand... the
// hand suddenly jumps to rotate in the other direction... Make it
// smooth." Investigated first, not guessed: a synthetic sweep of
// computeRadialRollDeg() through its own atan2 wrap (+180/-180) proved
// the raw angle-to-quaternion-to-slerp pipeline is ALREADY correctly
// continuous there (THREE.Quaternion.slerp takes the shortest path
// through the double-cover regardless of the numeric jump in the
// input degrees, confirmed at both damping=1 and damping=0.15 via
// direct angleTo() measurement -- no spike). The real source is almost
// certainly the dead-zone freeze (see updateTiltTarget()'s own
// comment): tiltTargetValid can hold the angle frozen for a while, and
// resuming from a frozen state straight into cfg.trackingDamping (1 by
// default -- an instant, unsmoothed snap) produces a real, visible
// jump the moment the raycast starts hitting again, especially since a
// user's own circular cursor sweep crosses the dead-zone boundary
// twice. This smooths the ANGLE itself (not just the quaternion) via
// exponential interpolation that always takes the shortest wrapped
// path (never sweeping the "long way around" through 180°), so a
// resume-from-frozen eases in over a few frames instead of teleporting
// -- independent of whatever cfg.trackingDamping is set to.
let smoothedBaseDeg = null // null = "not yet initialized", snaps once on first real value
function smoothAngleDeg(targetDeg, rateDeg = 18) {
  if (smoothedBaseDeg === null) { smoothedBaseDeg = targetDeg; return smoothedBaseDeg }
  let delta = ((targetDeg - smoothedBaseDeg + 180) % 360 + 360) % 360 - 180 // shortest signed delta, wrapped to (-180, 180]
  const step = THREE.MathUtils.clamp(delta, -rateDeg, rateDeg) // fixed max degrees/frame, not a percentage -- so a huge post-freeze jump eases in over several frames instead of one damping-scaled (but still instant-feeling) leap
  smoothedBaseDeg += step
  return smoothedBaseDeg
}
// See this section's own top comment: mouse input raycasts the true
// cursor position (ported from Handy Dandies' real updateCursorTarget()),
// device-orientation input keeps the normalized magnitude/angle circular
// offset — the correct abstraction for a physical tilt angle that has no
// on-screen position to raycast from.
//
// CORRECTED same round — a straight port of Handy Dandies' own plane-
// intersection (raw absolute world-space hit point, used directly as the
// target) made the hand vanish even for a near-center cursor. Root cause,
// confirmed live: HANDYSET's saved camera is framed so its own AIM POINT
// (`controls.target`) sits at world Y≈33 (matching FRONTOS's own saved
// ty≈33.57) — the model's visible geometry, after scale/pivot, sits up
// there even though the hand's own logical anchor (`h.wrapper.position`)
// is exactly (0,0,0). A screen-center cursor raycasts to ≈(2.3, 33.5, 0)
// (confirmed directly, matching controls.target almost exactly) — using
// that RAW absolute hit as the lookAt target (from an eye at (0,0,0))
// produces a wildly steep, mostly-vertical direction for what should be
// a neutral, dead-center cursor. Handy Dandies doesn't hit this because
// its hands are laid out across a field whose own coordinate range
// already roughly matches its raycast plane; HANDYSET's single hand at
// pure origin does not share that assumption.
//
// Fixed by using the OFFSET from a screen-CENTER raycast, not the raw
// absolute hit — screen-center cursor -> zero offset -> neutral gaze
// (hand faces the camera, exactly like the old normalized-magnitude
// approach's `tiltMagnitude=0` case), and cursor movement adds a
// proportionate world-space delta on top of the hand's own true
// position, matching Handy Dandies' actual sensitivity (a true
// perspective raycast, not a fixed-radius normalized circle) without
// depending on the hand's own position matching the camera's aim point.
const _tiltRaycastHit = new THREE.Vector3()
// True whenever the mouse path's own cursor-ray actually hit groundPlane
// this frame -- direct instruction 2026-09-27, after finding the Y=0
// plane only intersects the bottom ~third of the screen with this
// project's default camera framing (it looks level-to-upward, not down):
// "When the raycasting never hits the Y=0, just let the rotation not
// trigger. this is only a desktop issue since mobile uses tilt." Read by
// animate() to skip the WHOLE per-frame rotation update for the mouse
// path (not just freeze tiltTarget) when false, so a miss never mixes a
// stale tiltTarget with a fresh tiltOriginGround into a bogus angle.
// Device-orientation always has real input (no raycast), so it's left
// permanently true and never consulted for that path.
let tiltTargetValid = true
function updateTiltTarget() {
  if (lastInputSource === 'mouse') {
    // REWRITTEN 2026-09-27 (6th round on this feature), direct spec: "I
    // guess I didnt give you a point to measre from. Use the base point of
    // the forearm bone. then project that perpendicular to the camera on
    // to the ground plane. then use that point and the projected cursor
    // point to measure the rotation angle." Every earlier round measured
    // the cursor's offset from screen CENTER (an arbitrary reference with
    // no relationship to where the hand actually is), then bolted that
    // offset onto hand.wrapper.position afterward -- never actually
    // measuring "cursor relative to the hand" as ONE consistent
    // operation. This round measures both the hand and the cursor as
    // points on the SAME ground plane and takes the angle directly
    // between them.
    //
    // Point A (tiltOriginGround): the rForearmBend bone's own LIVE world
    // position (already kept fixed/anchored by the pivot math in
    // animate() -- see that block's own comment -- so this is stable
    // frame to frame regardless of the rotation being computed from it).
    //
    // CORRECTED 2026-09-27 (7th round) -- direct instruction: "Height
    // should not matter to responsive palm rotation since its purely an
    // XZ plane angle measurement." The 6th round's own camera-forward
    // ray-slide (sliding the forearm's world position along the CAMERA's
    // optical axis until it reached Y=0) made the resulting X/Z landing
    // point depend on the forearm's height AND the camera's own
    // pitch/yaw -- exactly the height-coupling this instruction rules
    // out, since a taller/shorter forearm position (or a repositioned
    // camera) would slide the point sideways before the angle was ever
    // computed. This is now a plain drop of the Y coordinate -- the
    // forearm's own X/Z, unchanged by height or by the camera -- matching
    // computeRadialRollDeg()'s own {x, y-aliased-to-z} shape, which
    // already only ever reads X/Z from both points (see that function's
    // own comment). No camera-ray math needed at all.
    const forearmBone = hand.skinnedMesh.skeleton.getBoneByName('rForearmBend')
    if (forearmBone) {
      forearmBone.getWorldPosition(_forearmWorldPos)
      tiltOriginGround.set(_forearmWorldPos.x, 0, _forearmWorldPos.z)
    }
    // Point B (tiltTarget, reused): the cursor's own raycast through the
    // camera, hitting that SAME ground plane -- the existing, already-
    // correct technique, just now landing on Y=0 instead of the old
    // vertical Z=0 plane.
    raycaster.setFromCamera(cursorNDC, camera)
    const haveHit = raycaster.ray.intersectPlane(groundPlane, _tiltRaycastHit)
    tiltTargetValid = haveHit
    if (haveHit) {
      tiltTarget.copy(_tiltRaycastHit)
      // armBaseDistanceT -- see this variable's own top-of-file comment.
      const distRaw = Math.hypot(tiltTarget.x - tiltOriginGround.x, tiltTarget.z - tiltOriginGround.z)
      const maxDist = computeMaxArmBaseGroundDistance()
      armBaseDistanceT = maxDist > 1e-6 ? THREE.MathUtils.clamp(distRaw / maxDist, 0, 1) : 0
    } else {
      // CORRECTED 2026-09-27 -- this used to leave armBaseDistanceT
      // completely untouched on a miss (freezing it, same as tiltTarget
      // itself), matching Palm Rotation's own deliberate "just don't
      // trigger" dead-zone behavior. Direct reports made clear that's
      // the wrong call for the 3 FEATURES that consume this metric
      // (Wrist Splay, Base Arm Rotation, Pose Tween): "messing wit the
      // Curve graph does noting" / "even the default position hand
      // gets shifted" / "maybe you are applying the target pose's
      // rotation to everything." Root cause, confirmed live (2 state
      // reads minutes apart, with real interaction in between, came
      // back BIT-IDENTICAL): the ground-plane raycast only hits the
      // bottom ~third of the screen (this project's own documented,
      // camera-framing-dependent dead zone) -- any cursor position
      // near the dev panel (exactly where you'd be dragging curve
      // control points) misses it, silently freezing armBaseDistanceT
      // at whatever unrelated value it last happened to hold. For Palm
      // Rotation (a single rotation staying wherever it was) that's a
      // reasonable, deliberately-chosen fallback; for these 3 features
      // -- especially Pose Tween, a full-pose swap -- a frozen,
      // arbitrary, LEFTOVER blend amount looks like "stuck on the
      // target pose" or "the curve doesn't do anything," depending on
      // what it happened to freeze at. Fixed by falling back to
      // tiltMagnitude (screen-distance-from-center -- always live, no
      // raycast/dead-zone dependency at all, the same metric Reactive
      // Arm Length already uses) whenever the ground-plane raycast
      // misses, so armBaseDistanceT never truly freezes -- it's a
      // worse (less physically-grounded) approximation than the real
      // arm-base-distance measurement, but a live, responsive
      // approximation beats a frozen, arbitrary one for these 3
      // features. tiltTarget/tiltTargetValid (Palm Rotation's own
      // inputs) are untouched by this -- that feature's freeze-on-miss
      // behavior was explicitly requested and stays exactly as-is.
      armBaseDistanceT = tiltMagnitude
    }
  } else {
    tiltTargetValid = true // device-orientation always has real input, never raycast-gated
    const maxOffset = sceneState.fieldRadius * 1.2
    tiltTarget.set(tiltMagnitude * maxOffset * Math.cos(tiltAngle), tiltMagnitude * maxOffset * Math.sin(tiltAngle), sceneState.fieldRadius * cfg.targetDepthFactor)
    armBaseDistanceT = tiltMagnitude
  }
}

// =======================================================================
// Field build — a rows x cols grid of hands (defaults to 1x1, a single
// centered hand). Grid math (alternate-row brick stagger vs. progressive-
// row stagger) is a best-effort reconstruction of HANDY DANDIES' own
// relayoutField() — its exact source wasn't available to extract, only a
// paraphrased description ("alternate-row brick stagger vs. progressive-
// row stagger") — worth a visual sanity check against a real HANDY
// DANDIES build once fieldRows/fieldCols are actually raised above 1.
// =======================================================================
function rebuildField() {
  // Guard added 2026-09-29: previously DISCLOSED but unfixed
  // ("Cannot read properties of null (reading 'clone')" inside
  // SkeletonUtils.clone(), observed once during a synthetic settings
  // injection) -- now confirmed, via the real deployed site's own
  // console, to reproduce on EVERY normal page load (multiple times):
  // loadRemoteSettingsOnStartup()'s applyFullDevPanelState() restores
  // Field Layout sliders (fieldRows/fieldCols/etc.), each dispatching a
  // real 'input' event that triggers this function, well before the
  // hand's own async GLTFLoader.load() callback has set `modelRoot`.
  // Safe to just no-op here: that same callback calls rebuildField()
  // itself immediately after setting modelRoot (see its own
  // "modelRoot = root; rebuildField()" lines below), so a premature
  // call is always followed by a real one once the model is ready --
  // nothing is lost by skipping it.
  if (!modelRoot) return
  hands.forEach((h, i) => {
    if (h.wrapper.parent) h.wrapper.parent.remove(h.wrapper)
    teardownFingerGizmosForHand(h) // NOT parented under h.wrapper -- must be removed separately or they leak into the scene
    unregisterSceneObject('hand-' + i) // Object Axes registry -- see that section's own comment
  })
  hands = []
  const rows = Math.max(1, Math.round(cfg.fieldRows))
  const cols = Math.max(1, Math.round(cfg.fieldCols))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wrapper = new THREE.Group()
      // SkeletonUtils.clone(), NOT modelRoot.clone(true) -- root cause found
      // live 2026-09-21 (Whole Hand Rotation investigation): a plain
      // Object3D.clone(true) clones the Bone objects as part of the scene
      // graph, but SkinnedMesh.copy() does NOT rebind skeleton.bones to
      // those new bone objects -- confirmed via direct uuid comparison
      // (skeleton.getBoneByName('rIndex1').uuid !== the bone of the same
      // name found by walking DOWN from the clone itself; the skeleton's
      // own bones' root ancestor was a completely different, disconnected
      // "Scene" object with no parent, never reachable from `clone` at
      // all). This meant every bone read via `skeleton.getBoneByName()`
      // (used everywhere: wrist bend, curl, splay) was never actually a
      // descendant of `clone`, so rotating `clone` (Whole Hand Rotation
      // X/Y/Z) never affected those bones' world orientation at all --
      // explaining both the reported bug ("sliders seem to control finger
      // splay") and why 2 earlier rounds of curl-axis-exclusion fixes
      // (alignQuat, curlExcludeQuatForHand) could not work: they were
      // built on the false premise that bones lived inside `clone`.
      // SkeletonUtils.clone() is three.js's own documented fix for
      // exactly this case -- it clones the hierarchy AND rebinds every
      // SkinnedMesh's skeleton.bones to the corresponding new bone
      // objects.
      const clone = cloneSkinnedSkeleton(modelRoot)
      clone.quaternion.copy(alignQuat)
      clone.scale.setScalar(computeBaseScale())
      wrapper.add(clone)
      scene.add(wrapper)

      const skinnedMesh = findSkinnedMesh(clone)
      // Material.prototype.copy() (three.js src/materials/Material.js)
      // does NOT copy onBeforeCompile — confirmed by reading three.js's
      // own source after a real, reproduced bug: every color/rim-light
      // control in Toon Shading (toonTint, rimIntensity/rimColor/rimPower,
      // textureInfluence) had ZERO visual effect, live-verified via a
      // pure-red colorToonTint and a bright-green rimColor at
      // rimIntensity=3 producing no change at all, while material.color
      // (toonBaseTint, a normal MeshToonMaterial property that IS copied)
      // worked instantly. .clone() silently fell back to the inherited
      // no-op onBeforeCompile() stub on every hand's own material
      // instance, so the whole onBeforeCompile shader injection (diffuse
      // tint override + rim light) never ran on any rendered hand — only
      // ever on the one shared `toonMaterial` template object itself,
      // which nothing actually renders with. Re-attaching the function
      // explicitly after clone() is required every time.
      skinnedMesh.material = toonMaterial.clone()
      skinnedMesh.material.onBeforeCompile = toonMaterial.onBeforeCompile
      // three.js's default frustum-culling check uses `geometry.
      // boundingSphere` — computed ONCE from the raw, UNSKINNED bind-pose
      // vertex data, transformed by the mesh's current matrixWorld — it
      // never accounts for bone/skin deformation at all. This hand is
      // heavily re-posed (finger curls, wrist bend, Responsive Wrist
      // Splay) and its own container (`h.wrapper`) rotates continuously
      // via Phone Tilt/Palm Face Rotation, so the stale local bounding
      // sphere, once transformed by a substantially-rotated matrixWorld,
      // increasingly diverges from where the ACTUAL skinned geometry
      // ends up — three.js then incorrectly concludes the (very much
      // on-screen) mesh is outside the camera frustum and skips drawing
      // it entirely. Found live 2026-09-21: confirmed via an independent
      // WebGLRenderer instance (bypassing this app's own composer/outline
      // pipeline entirely) rendering 0 triangles with frustumCulled left
      // at its `true` default, vs 15,046 triangles with it forced false
      // — same scene, same camera, same pose, nothing else changed. This
      // was the real cause of the hand going fully invisible — previously
      // only reachable at extreme combined rotations (rare), but far more
      // reachable once cursor tracking became proportionate to normal
      // mouse movement instead of requiring extreme cursor positions (see
      // updateTiltTarget()'s own comment). Disabling culling per-mesh is
      // cheap and safe at this project's own hand-count scale (1 by
      // default, a modest Field Layout at most) — not worth chasing a
      // correct dynamically-updated bounding sphere for.
      skinnedMesh.frustumCulled = false

      // basePosition -- this hand's own field-grid placement (set by
      // relayoutField()), kept SEPARATE from h.wrapper.position itself
      // because animate()'s own Palm Face Rotation/Cursor Tracking now
      // overwrites h.wrapper.position every frame (to anchor the rotation
      // at the forearm base -- see that block's own comment) and needs
      // something to add the pivot offset ON TOP OF, not replace outright.
      const handEntry = { wrapper, clone, skinnedMesh, outlineMesh: null, currentBaseQuat: alignQuat.clone(), clipPlane: null, row: r, col: c, basePosition: new THREE.Vector3() }
      // Ported from HANDY DANDIES' own real onBeforeRender wiring — see
      // updateWristClipPlaneForHand()'s own declaration comment for why
      // this needs to run every frame, not just on UI triggers.
      skinnedMesh.onBeforeRender = () => updateWristClipPlaneForHand(handEntry)
      setupFingerGizmosForHand(handEntry)
      hands.push(handEntry)
      registerSceneObject('hand-' + (hands.length - 1), 'Hand ' + hands.length, wrapper) // Object Axes registry
    }
  }
  hand = hands[0]
  relayoutField()
  outlinePass.selectedObjects = hands.map((h) => h.clone)
  sceneState.fieldRadius = Math.max(handBoundsRadiusLocal * computeBaseScale(), 5)
  updateKeyLightPosition()
}
// Repositions existing hands without rebuilding them — called whenever
// spacing/offset/visibility settings change, so a pure layout tweak
// doesn't re-clone every hand's geometry/material.
function relayoutField() {
  const rows = Math.max(1, Math.round(cfg.fieldRows))
  const cols = Math.max(1, Math.round(cfg.fieldCols))
  const w = (cols - 1) * cfg.columnSpacing
  const hgt = (rows - 1) * cfg.rowSpacing
  hands.forEach((h) => {
    const rowOffsetX = cfg.useProgressiveOffset ? h.row * cfg.progressiveRowOffset : (h.row % 2 === 1 ? cfg.alternateRowOffset : 0)
    const x = h.col * cfg.columnSpacing - w / 2 + rowOffsetX
    const y = hgt / 2 - h.row * cfg.rowSpacing
    h.basePosition.set(x, y, 0)
    h.wrapper.position.set(x, y, 0)
    h.wrapper.visible = !cfg.hideHands
    // Routed through applyModelRootTransform() (2026-10-01, Mirror feature)
    // instead of a direct scale.setScalar() -- that bare uniform-scalar
    // version would silently clobber a mirrored hand's per-axis
    // handMirrorX/Y/Z scale back to unmirrored every time Field Layout
    // changes. Idempotent to re-call here: quaternion/position end up at
    // the exact same values they already had, since poseValues (cfg) and
    // h.currentBaseQuat haven't changed, only scale needed recomputing.
    applyModelRootTransform(h, cfg)
  })
}
function findSkinnedMesh(root) {
  let found = null
  root.traverse((o) => { if (o.isSkinnedMesh && !found) found = o })
  return found
}
let handBoundsRadiusLocal = 5
const handCenterLocal = new THREE.Vector3() // wrist->fingertip midpoint, raw bind-pose local space
// "Center" for camera targeting/framing — the wrist-to-fingertip midpoint,
// not the whole skinned mesh's bounding-sphere center (that measurement,
// taken before any wrist crop is applied, is dominated by the forearm/
// upper-arm chain that hideWrist crops away — using it put the target
// point well off the actually-visible hand; caught during initial live
// verification, screenshot showed nothing on screen). Cameras captured in
// HANDY DANDIES' own multi-hand field target wherever THAT project's hand
// happened to sit, not (0,0,0) — applyCameraPreset() retargets onto this
// point instead so every preset frames this project's single, centered
// hand (CLAUDE.md-request #3 takes priority over literal imported coords).
function getHandCenterWorld() {
  if (!hand) return new THREE.Vector3()
  hand.clone.updateMatrixWorld(true)
  return hand.clone.localToWorld(handCenterLocal.clone())
}

// =======================================================================
// Model load
// =======================================================================
// measureAndSetHandModel -- extracted 2026-10-01 (Hand Model Selector
// feature) from what used to be inline in handLoader.load()'s own
// callback below, so a model SWAP (loadHandModel(), further down) can
// re-run the exact same bind-pose measurement against a newly-loaded GLB
// without duplicating this logic. Does everything measurement/state-
// setting related (handLengthRaw, alignQuat, wristCropNormalAligned,
// forearmPosRaw, wristPosRaw, modelRotationPivot, handCenterLocal,
// handBoundsRadiusLocal, boneRestQuat, toonMaterial, modelRoot) but
// deliberately stops short of rebuildField()/applyDefaultSelections() --
// those differ between a first load (also needs saved defaults, motion
// init, starting the render loop) and a later swap (should re-pose with
// whatever the user currently has dialed in, not reset to defaults) --
// see loadHandModel()'s own comment for the swap side of this split.
function measureAndSetHandModel(root, skinned) {
  root.traverse((o) => { if (o.isMesh && o !== skinned) o.visible = false })
  root.updateMatrixWorld(true)
  computeFingerGizmoTipOffsets(skinned.skeleton) // bone rest lengths, shared across every hand clone

  const wristBone = skinned.skeleton.getBoneByName('rHand')
  const tipBone = skinned.skeleton.getBoneByName('rMid3')
  const wristPos = new THREE.Vector3(), tipPos = new THREE.Vector3()
  if (wristBone && tipBone) { wristBone.getWorldPosition(wristPos); tipBone.getWorldPosition(tipPos) }
  else tipPos.set(0, 1, 0)
  const pointDir = tipPos.clone().sub(wristPos)
  handLengthRaw = Math.max(pointDir.length(), 0.001)
  pointDir.normalize()
  alignQuat = new THREE.Quaternion().setFromUnitVectors(pointDir, new THREE.Vector3(0, 0, -1))

  const forearmBaseBone = skinned.skeleton.getBoneByName('rForearmBend')
  if (forearmBaseBone) {
    const forearmBasePos = new THREE.Vector3()
    forearmBaseBone.getWorldPosition(forearmBasePos)
    wristCropNormalAligned = wristPos.clone().sub(forearmBasePos).normalize().applyQuaternion(alignQuat)
    forearmPosRaw = forearmBasePos
    // ROOT CAUSE FOUND 2026-09-27 (4th round on this feature), direct
    // report: "you are rotating the hand around x or z axis. I want the
    // Forearms Y axis to be the axis of rotation." Measured
    // `forearmBaseBone.quaternion`/`getWorldQuaternion()` directly and
    // found BOTH are identity to ~1e-8 -- this rig keeps every bone
    // UNROTATED at bind pose (orientation is baked into the mesh
    // geometry/vertex positions instead, a common export convention).
    // That means the bone's RAW local Y axis, (0,1,0) transformed by its
    // own (trivial/identity) world quaternion then by `alignQuat`, is just
    // "`alignQuat` applied to canonical raw Y" -- which this alignment
    // happens to send to roughly ALIGNED -Z (confirmed: it's numerically
    // identical to `wristCropNormalAligned`, the bone's own LENGTH
    // direction). So "the bone's own local Y axis" and "Y in the aligned/
    // rendering frame everything else in this file uses (camera X/Y/Z,
    // modelRotY, etc.)" are two completely different vectors here, and
    // the previous round's `armYAxisAligned` measurement -- despite being
    // a mathematically correct reading of the bone's RAW-space Y -- was
    // answering the wrong question. Since the bone has no meaningful
    // local rotation to begin with, "the forearm's Y axis" can only
    // sensibly mean Y in the aligned frame, i.e. plain canonical (0,1,0)
    // -- see animate()'s own comment for where this is actually used.
  }
  wristPosRaw = wristPos.clone()
  // Whole-Hand Rotation's own pivot point — ported from HANDO's real
  // modelRotationPivot (direct request: "make the center of rotation the
  // center of the palm" — HANDO's own docs/CHANGELOG.txt, 2026-09-11,
  // documents the exact same bug this project had: rotating around the
  // object's own unrelated local origin instead). Midpoint of the wrist
  // bone (`rHand`) and the middle finger's own base joint (`rMid1`),
  // measured here — BEFORE rebuildField()/applyDefaultSelections() ever
  // pose the skeleton — matching HANDO's own second, later fix for this
  // exact mechanism (its pivot was originally captured AFTER default
  // posing had already bent the skeleton, silently measuring an
  // already-bent "rest" position instead of the true bind pose).
  // Stored in the SAME raw, pre-alignQuat local frame as wristPosRaw
  // (not rotated by alignQuat) — this is the frame h.clone's own TRS
  // (position/quaternion/scale) operates in.
  const midBaseBone = skinned.skeleton.getBoneByName('rMid1')
  if (midBaseBone) {
    const midBasePos = new THREE.Vector3()
    midBaseBone.getWorldPosition(midBasePos)
    modelRotationPivot.addVectors(wristPos, midBasePos).multiplyScalar(0.5)
  }

  handCenterLocal.copy(wristPos).lerp(tipPos, 0.5)
  handBoundsRadiusLocal = handLengthRaw * 0.65 // effective visible-hand radius for camera framing (wrist->fingertip based, not whole-mesh)

  skinned.skeleton.bones.forEach((bone) => { boneRestQuat[bone.name] = bone.quaternion.clone() })

  toonMaterial = createToonMaterial(skinned.material.map || null)
  modelRoot = root
}
const handLoader = new GLTFLoader()
handLoader.setDRACOLoader(dracoLoader)
handLoader.setMeshoptDecoder(MeshoptDecoder)
handLoader.load(cfg.handModelFile || MODEL_URL, async (gltf) => {
  const root = gltf.scene
  const skinned = findSkinnedMesh(root)
  if (!skinned) { loadingEl.textContent = 'No skinned mesh found in model.'; return }
  measureAndSetHandModel(root, skinned)

  rebuildField()
  applyDefaultSelections()
  // "Set as Default" overrides -- applied AFTER the hardcoded literal
  // defaults above, matching Hando's own boot order (its own
  // loadDefaultXIfSaved() calls run after the runtime objects they write
  // into exist, and intentionally override whatever the normal restore
  // already set). A fresh project with nothing ever set-as-default is a
  // silent no-op (loadFieldDefaultIfSaved only applies when the fetched
  // settings actually contain that field).
  await Promise.all([
    loadFieldDefaultIfSaved('defaultPose', applyPosePreset),
    loadFieldDefaultIfSaved('defaultCamera', applyCameraPreset),
    loadFieldDefaultIfSaved('defaultLighting', applyLightingPreset),
    loadFieldDefaultIfSaved('defaultToon', applyToonPreset)
  ])
  loadingEl.classList.add('hidden')
  initMotionInput()
  setupPhoneRotationResetGesture()
  renderLoopRunning = true // first frame runs synchronously here, not via RAF -- see startRenderLoop()'s own comment
  animate()
}, undefined, (err) => {
  console.error(ts() + ' Failed to load hand model', err)
  loadingEl.textContent = 'Failed to load hand model — see console.'
})

// disposeOldHandModelRoot -- same reasoning/pattern as disposePhoneModelRaw()
// (that function's own comment): the OLD modelRoot is the TEMPLATE object
// SkeletonUtils.clone() reads from in rebuildField(), never shared by
// reference with any live hand already in `hands[]` (each gets its own
// deep clone) -- safe to dispose its geometry/materials/textures outright
// once a new model has taken its place, with no risk to anything already
// on screen.
function disposeOldHandModelRoot(oldRoot) {
  if (!oldRoot) return
  oldRoot.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      mats.forEach((m) => { Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose() }); m.dispose() })
    }
  })
}
// Hand Model swap -- loads a DIFFERENT hand GLB after the initial one is
// already showing, re-measuring bind pose against the new skeleton
// (measureAndSetHandModel(), shared with the first-load path above) and
// rebuilding every hand instance from it, WITHOUT resetting the user's
// current pose/camera/lighting/toon settings -- applyPoseValuesToHand(cfg)
// at the end re-poses the newly-built hand(s) with whatever is currently
// dialed in, deliberately NOT applyDefaultSelections() (that's a first-
// load-only concern: loading the DEFAULT pose/camera/lighting, which would
// discard the user's current tuning on every model swap for no reason).
// Token-guarded the same way loadPhoneModel() is, in case 2 selections
// happen in quick succession before the first finishes loading.
let handModelLoadToken = 0
function loadHandModel(relativePath) {
  if (!relativePath) return
  const token = ++handModelLoadToken
  const swapLoader = new GLTFLoader()
  swapLoader.setDRACOLoader(dracoLoader)
  swapLoader.setMeshoptDecoder(MeshoptDecoder)
  swapLoader.load(encodeURI(relativePath), (gltf) => {
    if (token !== handModelLoadToken) return // superseded by a newer selection before this one finished
    const root = gltf.scene
    const skinned = findSkinnedMesh(root)
    if (!skinned) { console.error(ts() + ' Hand Model Selector: no skinned mesh found in', relativePath); return }
    const oldRoot = modelRoot
    measureAndSetHandModel(root, skinned)
    disposeOldHandModelRoot(oldRoot)
    rebuildField()
    applyPoseValuesToHand(cfg)
  }, undefined, (err) => {
    console.error(ts() + ' Hand Model Selector: failed to load', relativePath, err)
  })
}

// Retargets an imported camera preset onto our single centered hand.
// HANDY DANDIES' own saved cameras were captured against its much larger
// multi-hand field (default field radius ~138 world units vs. ours ~15-20)
// — preserving their raw offset distance verbatim puts the camera absurdly
// far from a single hand. Instead: keep each preset's VIEWING DIRECTION
// (what makes "Top"/"Right"/"Behind"/etc. visually distinct) and FOV, but
// recompute distance from the standard "fit a sphere in this FOV" formula
// (D = R / sin(FOV/2), +40% margin) so every preset frames this hand well
// regardless of the scene scale it was originally captured in.
// Syncs one control's own DOM display (slider position + its readout
// span, a color swatch, or a checkbox) from a live value — REQUIRED after
// any preset "Use"/default-load, or the panel keeps showing whatever was
// there before even though cfg and the actual rendered hand/scene both
// updated correctly underneath it. Missing this was a real, reproduced
// bug this round: clicking "Use" on a saved pose correctly changed the
// hand and cfg.thumbCurl/wristSplay/etc, but every Pose slider kept
// showing its PRE-click value and position — indistinguishable from "the
// saved pose didn't apply" even though it fully had.
function syncControlDom(id, value) {
  const el = document.getElementById(id)
  if (!el) return
  if (el.type === 'checkbox') { el.checked = !!value; return }
  el.value = value
  if (el.type === 'range') {
    const valEl = document.getElementById(id.replace(/^slider/, 'value'))
    if (valEl) valEl.textContent = value
  }
}
// Explicit (domId, cfgKey) pairs, matching exactly what each render*Group()
// function actually built — not derived programmatically, since this
// project's own id convention isn't 100% uniform (most controls are
// 'slider'+exactCfgKey, but a couple — sliderHideWrist, sliderPoseScale —
// use a hand-typed literal id with different casing than their cfg key)
// and a wrong guess here would silently sync the wrong element rather
// than erroring. Verified against renderPoseGroup()'s actual addRow()
// calls line-by-line before finalizing this list.
const POSE_ID_CASE_EXCEPTIONS = { hideWrist: 'sliderHideWrist', poseScale: 'sliderPoseScale' }
const POSE_SYNC_PAIRS = POSE_PRESET_KEYS.map((k) => [POSE_ID_CASE_EXCEPTIONS[k] || ('slider' + k), k])
const CAMERA_SYNC_PAIRS = [['sliderCameraX', 'cameraX'], ['sliderCameraY', 'cameraY'], ['sliderCameraZ', 'cameraZ'], ['sliderCameraFov', 'cameraFov'], ['sliderCameraZoom', 'cameraZoom'], ['sliderCameraYaw', 'cameraYaw'], ['sliderCameraPitch', 'cameraPitch']]
const LIGHTING_SYNC_PAIRS = [['sliderKeyAzimuth', 'keyAzimuth'], ['sliderKeyElevation', 'keyElevation'], ['sliderKeyTargetHeight', 'keyTargetHeight'], ['sliderKeyIntensity', 'keyIntensity'], ['colorKeyColor', 'keyColor'], ['sliderAmbientIntensity', 'ambientIntensity'], ['colorAmbientSkyColor', 'ambientSkyColor'], ['colorAmbientGroundColor', 'ambientGroundColor']]
const TOON_SYNC_PAIRS = [['sliderToonSteps', 'toonSteps'], ['sliderToonStepThreshold', 'toonStepThreshold'], ['sliderToonShadowFloor', 'toonShadowFloor'], ['sliderToonLightCeiling', 'toonLightCeiling'], ['colorToonBaseTint', 'toonBaseTint'], ['sliderTextureInfluence', 'textureInfluence'], ['colorToonTint', 'toonTint'], ['sliderRimIntensity', 'rimIntensity'], ['sliderRimPower', 'rimPower'], ['colorRimColor', 'rimColor']]
function syncPairsFromCfg(pairs) { pairs.forEach(([id, key]) => syncControlDom(id, cfg[key])) }
// `decimals` (default 2) -- direct report 2026-09-27 on the Camera
// group's sliders specifically: "why is it showing like 10 decimal
// points? ... it is jittery." Root cause of both: this function is
// called every single frame (via syncCameraPanelFromLive(), called
// from animate()) with the camera's own raw floating-point position --
// `vEl.textContent = value` displayed that full, unrounded float
// (e.g. "3.598517809628556"), and setting `el.value` on an ACTIVELY-
// DRAGGED slider every frame fights the user's own drag input,
// producing the reported jitter. Fixed 2 ways: (1) round the DISPLAYED
// text only (the underlying `el.value`/cfg value stays full-precision,
// unaffected -- this is purely cosmetic); (2) skip resyncing a slider
// the user is CURRENTLY interacting with (`document.activeElement`),
// so the per-frame live-camera resync never overwrites an in-progress
// drag -- it resumes the instant the user releases/moves focus away.
function syncValue(id, value, decimals = 2) {
  const el = document.getElementById(id)
  if (el) {
    if (document.activeElement === el) return
    const vEl = document.getElementById(id.replace(/^slider/, 'value'))
    if (document.activeElement === vEl) return
    el.value = value
    if (vEl) vEl.textContent = (typeof value === 'number' ? value.toFixed(decimals) : value)
  }
}
function syncCameraPanelFromLive() {
  const yp = getCameraYawPitch()
  syncValue('sliderCameraX', camera.position.x)
  syncValue('sliderCameraY', camera.position.y)
  syncValue('sliderCameraZ', camera.position.z)
  syncValue('sliderCameraYaw', yp.yaw)
  syncValue('sliderCameraPitch', yp.pitch)
  syncValue('sliderCameraFov', camera.fov)
  syncValue('sliderCameraZoom', camera.position.distanceTo(controls.target))
}

// Ported from HANDY DANDIES' own real applyCameraPreset() (verified by
// direct source read, not reconstructed) after a real, reproduced bug:
// this used to RECOMPUTE the camera's distance from a "fit a sphere to
// this FOV" formula, discarding the actual saved x/y/z/tx/ty/tz entirely
// and keeping only the direction — so Overwrite/Set-as-Default/Use all
// silently substituted an auto-framed distance for whatever the user had
// actually panned/zoomed to. HANDY DANDIES' own version does a plain
// literal restore with no recompute step at all — confirmed live this
// round: a right-click pan followed by Overwrite, refresh, then Use now
// reproduces the exact panned view instead of snapping to a recomputed
// distance from the current hand center.
function applyCameraPreset(item) {
  controls.target.set(item.tx, item.ty, item.tz)
  camera.position.set(item.x, item.y, item.z)
  camera.fov = item.fov
  camera.updateProjectionMatrix()
  controls.update()
  cfg.cameraZoom = item.zoom !== undefined ? item.zoom : camera.position.distanceTo(controls.target)
  Object.assign(cfg, { cameraX: camera.position.x, cameraY: camera.position.y, cameraZ: camera.position.z, cameraFov: camera.fov, targetX: controls.target.x, targetY: controls.target.y, targetZ: controls.target.z })
  syncCameraPanelFromLive()
  syncPairsFromCfg(CAMERA_SYNC_PAIRS)
}
function applyLightingPreset(item) {
  Object.assign(cfg, item)
  hemiLight.intensity = cfg.ambientIntensity
  hemiLight.color.set(cfg.ambientSkyColor)
  hemiLight.groundColor.set(cfg.ambientGroundColor)
  keyLight.intensity = cfg.keyIntensity
  keyLight.color.set(cfg.keyColor)
  updateKeyLightPosition()
  syncPairsFromCfg(LIGHTING_SYNC_PAIRS)
}
// Ported verbatim from HANDY DANDIES' own TOON_PRESET_KEYS/
// captureToonPreset()/useToonPreset() (itself ported field-for-field from
// Hando). Toon Shading has no single shared "apply" function the way
// Pose/Camera/Lighting do — each control's own onChange calls one of
// rebuildGradientMap()/setToonUniform()/a direct material.color.set(), so
// applyToonPreset() re-runs those same effects itself after writing cfg.
const TOON_PRESET_KEYS = [
  'toonSteps', 'toonStepThreshold', 'toonShadowFloor', 'toonLightCeiling',
  'toonBaseTint', 'textureInfluence', 'toonTint', 'rimIntensity', 'rimPower', 'rimColor'
]
function captureToonFromCfg() { const o = {}; TOON_PRESET_KEYS.forEach((k) => { o[k] = cfg[k] }); return o }
function applyToonPreset(item) {
  TOON_PRESET_KEYS.forEach((key) => { if (item[key] !== undefined) cfg[key] = item[key] })
  hands.forEach((h) => h.skinnedMesh.material.color.set(cfg.toonBaseTint))
  setToonUniform('textureInfluence', cfg.textureInfluence / 100)
  setToonUniform('toonTint', new THREE.Color(cfg.toonTint))
  setToonUniform('rimIntensity', cfg.rimIntensity)
  setToonUniform('rimPower', cfg.rimPower)
  setToonUniform('rimColor', new THREE.Color(cfg.rimColor))
  rebuildGradientMap()
  syncPairsFromCfg(TOON_SYNC_PAIRS)
}
// CORRECTED 2026-09-26 -- REVERTED. The 2026-09-25 fix directly above
// (kept here, struck through in spirit, for the same reason this file
// keeps every prior correction on record) omitted wristSplay/modelRotX/Y/Z
// from EVERY saved-pose application, unconditionally. Confirmed as its own
// real, separate bug via direct byte-level comparison: 2 of this
// project's 4 SAVED_POSES ("Big Open Palm (S)", "Fist - Bent Back") are
// defined ENTIRELY by their own wristSplay value (every other field is
// byte-identical to their non-splayed sibling) -- applying either one via
// "Use" produced a wrist-bone quaternion byte-IDENTICAL to its sibling,
// silently discarding the pose's own defining feature, not just blocking
// unwanted reactive drift. A saved pose's own wristSplay/modelRotX/Y/Z are
// exactly as real/load-bearing as its finger curls -- they should never
// have been treated as "live-only" fields. The ORIGINAL problem this was
// chasing (a saved pose's wristSplay summing with Responsive Wrist
// Splay's own live contribution past any sane limit, e.g. -55 + -71 =
// -126) already has the correctly-scoped fix sitting unused: the 3
// Min/Max clamp sliders added earlier the same day (wristSplayClampParsed
// etc., applied inside applyWristPoseToSkeleton() to the FINAL combined
// angle regardless of source) -- narrow those if reactive stacking is a
// problem again, rather than reintroducing a field-omission mechanism.
function withLiveFieldsPreserved(poseValues) {
  return poseValues
}
function applyPosePreset(item) {
  Object.assign(cfg, withLiveFieldsPreserved(item))
  applyPoseValuesToHand(cfg)
  syncPairsFromCfg(POSE_SYNC_PAIRS)
}
function applyDefaultSelections() {
  const pose = SAVED_POSES.find((p) => p.name === DEFAULT_POSE_NAME) || SAVED_POSES[0]
  const cam = SAVED_CAMERAS.find((c) => c.name === DEFAULT_CAMERA_NAME) || SAVED_CAMERAS[0]
  const light = SAVED_LIGHTING.find((l) => l.name === DEFAULT_LIGHTING_NAME) || SAVED_LIGHTING[0]
  applyPosePreset(pose)
  applyCameraPreset(cam)
  applyLightingPreset(light)
}


// =======================================================================
// Tween (ordered saved-pose list, manual 0-1 scrub — matches Hando's own
// UI exactly: no auto-play/Loop/Oscillate mechanism exists there, just a
// manual "Tween (0=First, 1=Last)" slider plus a one-shot PNG-sequence
// export. Replaces this project's own earlier auto-play "Run Tween"
// button, which Hando has no equivalent of.
// =======================================================================
function lerpPoseValues(a, b, t) {
  const out = {}
  POSE_PRESET_KEYS.forEach((k) => { out[k] = THREE.MathUtils.lerp(a[k] ?? 0, b[k] ?? 0, t) })
  return out
}
// A Hold entry — ported from Hando's own isHoldEntry()/resolveTweenSegments()
// concept: `{ type: 'hold', percent }` in the ordered tweenPoses array,
// distinguishable from a plain pose-name string. `percent` is relative to
// ONE normal pose-to-pose transition's own weight (not an absolute
// duration — there's no time axis here, tweenT is a manual 0-1 scrub).
function isHoldEntry(v) { return !!(v && typeof v === 'object' && v.type === 'hold') }
// Builds the ordered list of weighted segments between cfg.tweenPoses'
// real pose entries, holding at a Hold entry's own weight rather than
// interpolating through it.
function resolveTweenTimeline(entries) {
  const segments = []
  let cursorName = null
  entries.forEach((e) => {
    if (isHoldEntry(e)) {
      segments.push({ kind: 'hold', weight: Math.max(e.percent, 0) / 100, poseName: cursorName })
    } else if (typeof e === 'string' && e) {
      if (cursorName !== null) segments.push({ kind: 'transition', weight: 1, poseA: cursorName, poseB: e })
      cursorName = e
    }
  })
  if (!segments.length) return cursorName ? { segments: [{ kind: 'hold', weight: 1, poseName: cursorName }] } : null
  return { segments }
}
function applyTweenAtT(t) {
  const timeline = resolveTweenTimeline(cfg.tweenPoses)
  if (!timeline) return
  const totalWeight = timeline.segments.reduce((s, seg) => s + seg.weight, 0) || 1
  let remaining = THREE.MathUtils.clamp(t, 0, 1) * totalWeight
  for (let i = 0; i < timeline.segments.length; i++) {
    const seg = timeline.segments[i]
    const isLast = i === timeline.segments.length - 1
    if (remaining <= seg.weight || isLast) {
      if (seg.kind === 'hold') {
        const pose = SAVED_POSES.find((p) => p.name === seg.poseName)
        // withLiveFieldsPreserved() -- Tween playback is saved-pose data
        // too, same omission as applyPosePreset() (see its own comment).
        if (pose) applyPoseValuesToHand(withLiveFieldsPreserved(pose))
      } else {
        const a = SAVED_POSES.find((p) => p.name === seg.poseA)
        const b = SAVED_POSES.find((p) => p.name === seg.poseB)
        if (a && b) applyPoseValuesToHand(withLiveFieldsPreserved(lerpPoseValues(a, b, seg.weight > 0 ? THREE.MathUtils.clamp(remaining / seg.weight, 0, 1) : 1)))
      }
      return
    }
    remaining -= seg.weight
  }
}
// One-shot PNG-sequence export — samples cfg.tweenFrameCount frames evenly
// across the tween's 0-1 range, renders and downloads each, then restores
// tweenT to its pre-export value. Ported concept from Hando's own
// exportTweenSequence() (render-to-canvas + toDataURL + <a download>, the
// standard browser-native approach — Hando's exact implementation wasn't
// available to extract verbatim, this is a faithful from-scratch rebuild
// of the same behavior).
async function exportTweenSequence(btn) {
  const orig = btn.textContent
  const count = Math.max(1, Math.round(cfg.tweenFrameCount))
  const prefix = cfg.exportFramePrefix || 'tween'
  const priorT = cfg.tweenT
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0
    cfg.tweenT = t
    applyTweenAtT(t)
    composer.render()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const dataUrl = renderer.domElement.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `${prefix}_${String(i).padStart(3, '0')}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    btn.textContent = `Exporting ${i + 1}/${count}...`
    await new Promise((resolve) => setTimeout(resolve, 80))
  }
  cfg.tweenT = priorT
  applyTweenAtT(priorT)
  btn.textContent = orig
}

// =======================================================================
// Render loop
// =======================================================================
window.__debug = {
  camera, controls, cfg, scene, THREE,
  get hand() { return hand }, get hands() { return hands }, get sceneState() { return sceneState },
  get wristPosRaw() { return wristPosRaw }, get forearmPosRaw() { return forearmPosRaw },
  get wristCropNormalAligned() { return wristCropNormalAligned }, get alignQuat() { return alignQuat },
  get tiltTarget() { return tiltTarget }, get tiltOriginGround() { return tiltOriginGround },
  get handLengthRaw() { return handLengthRaw }, get handCenterLocal() { return handCenterLocal },
  get phoneModelRaw() { return phoneModelRaw }, get phoneModelWrapper() { return phoneModelWrapper },
  get phoneScreenMeshes() { return phoneScreenMeshes }, get screenRenderTargets() { return screenRenderTargets },
  get phoneScreenUvAspect() { return phoneScreenUvAspect }, get phoneScreenUvCenter() { return phoneScreenUvCenter },
  get sceneObjectEntries() { return sceneObjectEntries },
  get tiltMagnitude() { return tiltMagnitude }, get tiltAngle() { return tiltAngle },
  get phoneGyroQuat() { return phoneGyroQuat }, get lastInputSource() { return lastInputSource },
  get sensorLog() { return sensorLog },
  // ZUPT diagnostics -- added 2026-10-01, exposed here per direct
  // request ("expose it in the existing diagnostics rather than
  // creating a separate system") instead of a new logging mechanism.
  // phoneDisplaceZuptActive: true while velocity is currently being
  // force-held at exactly 0 (confidently stationary, past the dwell
  // window). phoneDisplacePosX/Y/Z and Vel are the integrator's own raw
  // state in METERS -- the same values computePhoneResponsiveDisplacement()
  // maps into on-screen world units.
  get phoneDisplaceZuptActive() { return phoneDisplaceZuptActive },
  get phoneDisplaceVel() { return { x: phoneDisplaceVelX, y: phoneDisplaceVelY, z: phoneDisplaceVelZ } },
  get phoneDisplacePos() { return { x: phoneDisplacePosX, y: phoneDisplacePosY, z: phoneDisplacePosZ } },
  get phoneDisplaceBias() { return { x: phoneDisplaceBiasX, y: phoneDisplaceBiasY, z: phoneDisplaceBiasZ } },
  getHandCenterWorld, updateWristCrop, computeBaseScale, pushSensorLog, restartSensorTimer
}

// window.innerWidth/innerHeight can read 0 at script-parse time in this
// sandbox (documented HANDY DANDIES gotcha, same rig/tooling) — constructing
// the renderer/composer/OutlinePass at 0x0 permanently zero-sizes every
// internal render target unless a later resize event happens to fire.
// Self-heal every frame instead of relying solely on that event.
function applyRendererSize(w, h) {
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  composer.setSize(w, h)
  outlinePass.resolution.set(w, h)
  fatAxesLineMaterials.forEach((m) => m.resolution.set(w, h)) // Object Axes -- LineMaterial computes screen-space width from this
}
window.addEventListener('resize', () => { applyRendererSize(window.innerWidth, window.innerHeight); requestRender() })

let isPaused = false

function animate() {
  if (renderer.getSize(new THREE.Vector2()).width !== window.innerWidth || renderer.getSize(new THREE.Vector2()).height !== window.innerHeight) {
    applyRendererSize(window.innerWidth, window.innerHeight)
    requestRender()
  }
  controls.update()
  syncCameraPanelFromLive()
  // On-demand rendering -- see the requestRender()/needsRender comment
  // near the top of this file. Responsive Rotation's own master gate
  // (cfg.trackingEnabled, with a real hand present) forces continuous
  // rendering, matching every frame's pre-existing gyro/mouse-tracking
  // behavior; otherwise the whole per-frame compute block AND
  // composer.render() itself are skipped until something discrete flags
  // needsRender. isPaused already freezes the SAME per-frame block for an
  // unrelated reason (the Debug-group Pause button) -- folded into this
  // same condition rather than checked twice. ADDED 2026-09-30:
  // cfg.phoneResponsiveDisplaceEnabled also forces continuous rendering,
  // independent of cfg.trackingEnabled (Displace is now its own
  // independent mechanic, per direct answer: "Fully independent") --
  // without this, updatePhoneDisplaceDesktopFrame()'s own per-frame
  // cursor-delta sampling (and mobile's per-frame visual read of the
  // leaky-integrated position) would silently stop running the moment
  // the render loop goes idle with Tracking Enabled off.
  const continuousRenderNeeded = !isPaused && ((cfg.trackingEnabled && hands.length > 0) || cfg.phoneResponsiveDisplaceEnabled)
  const shouldRender = continuousRenderNeeded || needsRender
  if (shouldRender) {
    needsRender = false
    renderOneFrame()
  }
  // CORRECTED 2026-09-30: the loop no longer just skips its expensive work
  // while idle -- it stops calling requestAnimationFrame entirely, so the
  // browser doesn't keep waking this tab up 60x/sec for nothing while
  // static. controls.update() above can synchronously re-flag needsRender
  // via OrbitControls' own 'change' event (damping still gliding this very
  // frame), which is why this check comes AFTER controls.update() rather
  // than trusting only continuousRenderNeeded. Any future interaction that
  // needs the loop running again goes through requestRender() (see its own
  // comment), which restarts the loop itself -- OrbitControls' own pointer/
  // wheel handlers already dispatch 'change' independent of this loop, so
  // a drag/zoom wakes the loop even while it's fully stopped.
  if (continuousRenderNeeded || needsRender) {
    requestAnimationFrame(animate)
  } else {
    renderLoopRunning = false
  }
}
function renderOneFrame() {
  if (!isPaused) {
    // Phone Tilt rotation (only when tracking is enabled)
    if (cfg.trackingEnabled && hands.length) {
      // updateTiltTarget() only needs to run once real input exists --
      // Responsive Wrist Splay/Wrist Crop read tiltMagnitude (set directly
      // by the mousemove/deviceorientation handlers, not by this call) so
      // they're unaffected either way; this only refreshes tiltTarget,
      // which nothing needs before Palm Faces Cursor's own angle below.
      if (latestOrientation !== null || lastInputSource === 'mouse') updateTiltTarget()
      if (cfg.showTargetMarker) { targetMarkerMesh.position.copy(tiltTarget); forearmBaseMarkerMesh.position.copy(tiltOriginGround) }
      // REWRITTEN 2026-09-27 (3rd round), direct correction: "i said palm
      // face rotation cursor tracking should be rotating the entire arm by
      // the Y axis of the forearm bone. the rotation should be anchored to
      // the base point of the forearm bone" / "its a locaize rotation."
      // Palm Faces Cursor and Palm Face Rotation are ONE combined,
      // LOCAL/localized single-axis rotation, not a full 3D lookAt (that
      // was this feature's 2nd-round mistake) and not a world-space roll
      // (its 2nd-round Palm Face Rotation axis was also wrong for the same
      // reason). Both angles are just added together, matching HANDY
      // DANDIES' own computeRollQuat() composition pattern:
      //   baseDeg  = Palm Faces Cursor's own dynamic angle (0 when off) --
      //              computeRadialRollDeg(), HANDY DANDIES' real formula,
      //              read directly from its source, not reconstructed.
      //   offsetDeg = the manual Palm Face Rotation slider, always additive.
      //   axis      = UP (0,1,0), i.e. Y in the ALIGNED/rendering frame --
      //               NOT the bone's RAW local Y transformed through its
      //               own quaternion (a 3rd-round attempt, `armYAxisAligned`,
      //               now removed). Direct correction: "you are rotating
      //               the hand around x or z axis. I want the Forearms Y
      //               axis." Root cause (see forearmBaseBone's own
      //               declaration comment near wristCropNormalAligned):
      //               this rig's bones are UNROTATED at bind pose (local
      //               quaternion ~identity), so "the bone's raw local Y"
      //               is really just `alignQuat` applied to canonical raw
      //               Y -- which lands on roughly ALIGNED -Z, not Y at
      //               all (confirmed: numerically identical to
      //               `wristCropNormalAligned`, the bone's own LENGTH
      //               direction). Plain UP is what "the forearm's Y axis"
      //               actually means once the bone's own rotation is
      //               accounted for (there isn't one).
      //   anchor    = the forearm base's OWN position, recomputed from
      //               h.clone's live transform every frame (its scale/
      //               quaternion/position all change as poses/model
      //               rotation are applied) via the SAME
      //               `pivot - rotation*pivot` technique
      //               applyModelRootTransform() already uses for
      //               modelRotationPivot, one level up (h.wrapper instead
      //               of h.clone). h.basePosition (the hand's own
      //               field-grid placement, set by relayoutField()) is
      //               added back in since this now overwrites
      //               h.wrapper.position outright rather than leaving it
      //               untouched.
      // REMOVED 2026-09-27 (7th round), direct instruction: "the distance
      // of the cursor to the hand should also have no effect on the
      // responsive palm rotation." The 5th round (see the removed
      // tiltMagnitude-scaling code this comment replaces) had scaled
      // baseDeg by tiltMagnitude specifically to fix "any nonzero offset
      // snaps to full rotation" -- but per this direct correction, Palm
      // Rotation is meant to be a pure direction/angle measurement with
      // no distance/magnitude component at all, full stop. baseDeg is now
      // exactly computeRadialRollDeg()'s own output (plus smoothing on
      // the mouse path), unscaled. Reactive Arm Length and Responsive
      // Wrist Splay still read tiltMagnitude directly for their own
      // curves -- this change is scoped to Palm Rotation's baseDeg only.
      // Mouse's own baseDeg reads the X/Z ground-plane points
      // (tiltOriginGround/tiltTarget, both on Y=0 -- see
      // updateTiltTarget()'s own comment) via computeRadialRollDeg()'s
      // existing {x,y} shape, with world Z aliased into the .y slot --
      // device-orientation keeps its own original X/Y computation
      // (h.wrapper.position/tiltTarget, unchanged) since it has no camera
      // ray to ground-project in the first place.
      const _originXZ = { x: tiltOriginGround.x, y: tiltOriginGround.z }
      const _targetXZ = { x: tiltTarget.x, y: tiltTarget.z }
      // Direct instruction 2026-09-27, after finding the Y=0 ground plane
      // only intersects the bottom ~third of the screen with this
      // project's default camera framing: "When the raycasting never hits
      // the Y=0, just let the rotation not trigger. this is only a
      // desktop issue since mobile uses tilt." A missed raycast this
      // frame skips the WHOLE per-hand update below (quaternion AND the
      // anchor/position recompute) rather than computing a bogus angle
      // from a stale tiltTarget mixed with a fresh tiltOriginGround --
      // the rotation simply stays exactly where it was. Device-
      // orientation is unaffected (tiltTargetValid is always true there).
      if (!(lastInputSource === 'mouse' && cfg.palmFacesCursor && !tiltTargetValid)) {
        hands.forEach((h) => {
          // Smoothing (smoothAngleDeg(), wrap-aware) applies to the mouse
          // path's own raw compass angle ONLY -- see that function's own
          // comment for why. Device-orientation keeps its own original,
          // unsmoothed computation -- it has no dead-zone/raycast-miss
          // concept to resume from. No tiltMagnitude scaling on either
          // path (removed 2026-09-27, 7th round -- see this block's own
          // comment above).
          const baseDeg = cfg.palmFacesCursor
            ? (lastInputSource === 'mouse'
                ? smoothAngleDeg(computeRadialRollDeg(_originXZ, _targetXZ))
                : computeRadialRollDeg(h.wrapper.position, tiltTarget))
            : 0
          const totalRad = THREE.MathUtils.degToRad(baseDeg + (cfg.palmFaceRotationOffset || 0))
          const axis = UP
          const desired = new THREE.Quaternion().setFromAxisAngle(axis, totalRad)
          h.wrapper.quaternion.slerp(desired, cfg.trackingDamping)

          // Reads h.clone.scale directly (2026-10-01, Mirror feature)
          // instead of recomputing a bare uniform scalar -- h.clone.scale
          // is a per-axis vector once handMirrorX/Y/Z is active
          // (applyModelRootTransform()), and a plain multiplyScalar() here
          // would silently ignore the mirror, drifting this anchor away
          // from the forearm bone's own true (mirrored) position.
          const pivotLocal = forearmPosRaw.clone().multiply(h.clone.scale).applyQuaternion(h.clone.quaternion).add(h.clone.position)
          const rotatedPivot = pivotLocal.clone().applyQuaternion(h.wrapper.quaternion)
          h.wrapper.position.copy(h.basePosition).add(pivotLocal).sub(rotatedPivot)
        })
      }
    }
    // Responsive Pose Tween fully re-bakes EVERY pose field each frame
    // (it's a whole-pose blend, not a single-field modifier), including
    // its own wristSplay -- running applyReactiveWristSplayFrame() on
    // top of it in the same frame would immediately overwrite that
    // blended wrist value with cfg.wristSplay (the Pose group's own
    // slider, untouched by the tween), undoing part of what the tween
    // just applied. Mutually exclusive per frame.
    //
    // applyResponsiveBaseArmRotationFrame() is now called from INSIDE
    // applyResponsivePoseTweenFrame() when Pose Tween is active (2026-
    // 09-27 -- see that function's own comment) rather than
    // unconditionally out here, so it can pass the tween's own blended
    // pose-values object through to applyBaseArmRotation()'s finger
    // re-bake instead of the default `cfg` -- calling it out here too
    // in that case would re-bake every finger from `cfg` a 2nd time,
    // right after the tween just correctly set them, silently
    // overwriting the blend back to the live (un-tweened) slider
    // values. Base Arm Rotation is a separate bone/axis from Wrist
    // Splay either way, so it's still safe alongside that branch.
    if (cfg.poseTweenResponsiveEnabled) {
      applyResponsivePoseTweenFrame()
    } else {
      applyReactiveWristSplayFrame()
      applyResponsiveBaseArmRotationFrame()
    }
    updateAllFingerGizmos()
    updatePhoneModelFrame()
    renderVirtualScreen()
  }
  curveWidgetResyncs.forEach((fn) => fn())
  composer.render()
}

// =======================================================================
// Sensor console (Debug group) — raw accelerometer/gyroscope/compass
// readout, opt-in streaming, silent on Desktop (no real sensors to show).
// =======================================================================
let latestMotion = null
function handleDeviceMotion(e) { latestMotion = e; integratePhoneGyroRotation(e); integratePhoneDisplacement(e) }
let sensorLogEl = null
let sensorTimer = null
// Plain array alongside the DOM (same convention as devPanel.js's own
// Mouse Log: mouseLog[] + mouseLogEl) -- Copy/Save read from this, not
// by scraping sensorLogEl.textContent, so a future format/DOM change
// doesn't need to be mirrored in 2 places.
let sensorLog = []
// Added 2026-09-30, direct request: "a pause and resume logs button."
// A single overlay flag covering all 3 Debug-group logs at once (Mouse
// Log, Sensors, Phone Model Log) -- separate from Sensors/Phone Model
// Log's own existing "Stream Sensor Data" checkbox (which stops their
// timers entirely); this just gates whether a new entry gets appended,
// so toggling it doesn't disturb the streaming checkbox's own state.
// Mouse Log's own pause state (devPanel.js, a classic script's bare
// global) is kept in sync via setMouseLogPaused() wherever this flag
// changes -- see toggleAllLogsPaused() below.
let allLogsPaused = false
function fmt(n) { return (typeof n === 'number' && !Number.isNaN(n)) ? n.toFixed(2) : '--' }
function pushSensorLog(text) {
  if (allLogsPaused) return
  const line = ts() + ' ' + text
  sensorLog.push(line)
  if (sensorLog.length > 200) sensorLog.shift()
  if (!sensorLogEl) return
  const lineEl = document.createElement('div')
  lineEl.textContent = line
  sensorLogEl.appendChild(lineEl)
  while (sensorLogEl.children.length > 200) sensorLogEl.removeChild(sensorLogEl.firstChild)
  sensorLogEl.scrollTop = sensorLogEl.scrollHeight
}
// CORRECTED 2026-09-28, direct report: "unchecking the Stream Sensor
// Data checkbox should not erase the log." The old version wiped
// sensorLogEl.innerHTML on every stop (including a plain uncheck) --
// this now only ever stops the interval; the log survives until the
// user explicitly hits Clear.
function restartSensorTimer() {
  clearInterval(sensorTimer)
  sensorTimer = null
  if (!cfg.sensorStreamEnabled || !isTouchDevice) return
  sensorTimer = setInterval(() => {
    // Per-sensor toggles -- direct request 2026-09-28: only the
    // checked sensors' own fields are included; if none are checked,
    // skip the tick entirely (no empty/blank log lines).
    const parts = []
    if (cfg.sensorLogAccel) {
      const accel = (latestMotion && latestMotion.accelerationIncludingGravity) || {}
      parts.push(`Accel x:${fmt(accel.x)} y:${fmt(accel.y)} z:${fmt(accel.z)}`)
    }
    if (cfg.sensorLogLinearAccel) {
      const linear = latestMotion ? computePhoneLinearAccelDeviceLocal(latestMotion) : null
      parts.push(linear ? `LinearAccel x:${fmt(linear.x)} y:${fmt(linear.y)} z:${fmt(linear.z)}` : 'LinearAccel (unavailable)')
    }
    if (cfg.sensorLogGyro) {
      const gyro = (latestMotion && latestMotion.rotationRate) || {}
      parts.push(`Gyro α:${fmt(gyro.alpha)} β:${fmt(gyro.beta)} γ:${fmt(gyro.gamma)}`)
    }
    if (cfg.sensorLogCompass) {
      const heading = latestOrientation ? latestOrientation.alpha : null
      parts.push(`Compass:${fmt(heading)}°`)
    }
    // Absolute orientation angle (deviceorientation.beta/gamma) -- NOT the
    // same numbers as Gyro's rotationRate alpha/beta/gamma above (that's
    // angular velocity); labeled "Orient" so the two never read as
    // duplicates despite sharing greek-letter names.
    if (cfg.sensorLogOrientBeta || cfg.sensorLogOrientGamma) {
      const bits = []
      if (cfg.sensorLogOrientBeta) bits.push(`β:${fmt(latestOrientation ? latestOrientation.beta : null)}°`)
      if (cfg.sensorLogOrientGamma) bits.push(`γ:${fmt(latestOrientation ? latestOrientation.gamma : null)}°`)
      parts.push(`Orient ${bits.join(' ')}`)
    }
    if (parts.length) pushSensorLog(parts.join('  |  '))
  }, cfg.sensorIntervalMs)
}
// Copy/Save/Clear -- direct request 2026-09-28, same pattern as
// devPanel.js's own Mouse Log (copyMouseLog/saveMouseLog/clearMouseLog):
// a flash-the-button-text copy confirmation, a plain Blob+<a download>
// .md export (works fine in a real dev session, not a sandboxed
// Artifact context), and an explicit-only clear.
function copySensorLog(btn) {
  const text = sensorLog.join('\n')
  const flash = (msg) => { const orig = btn.textContent; btn.textContent = msg; setTimeout(() => { btn.textContent = orig }, 900) }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => flash('Copied!')).catch(() => flash('Copy failed'))
  } else {
    flash('Copy failed')
  }
}
function saveSensorLog() {
  const md = '# Sensor Log\n\n' + sensorLog.map((line) => '- ' + line).join('\n') + '\n'
  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  a.href = url
  a.download = 'sensor-log-' + stamp + '.md'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
function clearSensorLog() {
  sensorLog = []
  if (sensorLogEl) sensorLogEl.innerHTML = ''
}

// =======================================================================
// Phone Model Log (Debug group) -- direct request 2026-09-28: log the
// Phone Model's own position/rotation, at the same rate as the Sensors
// log, with timestamps. Own timer (restartPhoneModelLogTimer(), started/
// stopped alongside the Sensors log's Stream checkbox and Interval
// slider) rather than piggybacking on restartSensorTimer()'s own timer --
// that function's outer guard bails entirely on non-touch devices (real
// sensors genuinely don't exist there), but Phone Model position/rotation
// is an ordinary scene-object property, not hardware-sensor data -- it
// updates from mouse input on Desktop too, via the exact same
// computePhoneCombinedQuat() pipeline, so gating it identically would
// silently disable it in this sandbox with no real device available.
// "Same rate" is satisfied by reading the same cfg.sensorIntervalMs and
// starting/stopping from the same cfg.sensorStreamEnabled checkbox.
// =======================================================================
let phoneModelLogEl = null
let phoneModelLogTimer = null
let phoneModelLog = []
function pushPhoneModelLog(text) {
  if (allLogsPaused) return
  const line = ts() + ' ' + text
  phoneModelLog.push(line)
  if (phoneModelLog.length > 200) phoneModelLog.shift()
  if (!phoneModelLogEl) return
  const div = document.createElement('div')
  div.textContent = line
  phoneModelLogEl.appendChild(div)
  while (phoneModelLogEl.children.length > 200) phoneModelLogEl.removeChild(phoneModelLogEl.firstChild)
  phoneModelLogEl.scrollTop = phoneModelLogEl.scrollHeight
}
const _phoneLogEuler = new THREE.Euler()
function restartPhoneModelLogTimer() {
  clearInterval(phoneModelLogTimer)
  phoneModelLogTimer = null
  if (!cfg.sensorStreamEnabled) return
  phoneModelLogTimer = setInterval(() => {
    if (!cfg.phoneModelEnabled || !phoneModelWrapper) return
    const p = phoneModelWrapper.position
    _phoneLogEuler.setFromQuaternion(phoneModelWrapper.quaternion, 'XYZ')
    const rx = THREE.MathUtils.radToDeg(_phoneLogEuler.x)
    const ry = THREE.MathUtils.radToDeg(_phoneLogEuler.y)
    const rz = THREE.MathUtils.radToDeg(_phoneLogEuler.z)
    pushPhoneModelLog(`Pos x:${fmt(p.x)} y:${fmt(p.y)} z:${fmt(p.z)}  |  Rot x:${fmt(rx)}° y:${fmt(ry)}° z:${fmt(rz)}°`)
  }, cfg.sensorIntervalMs)
}
function copyPhoneModelLog(btn) {
  const text = phoneModelLog.join('\n')
  const flash = (msg) => { const orig = btn.textContent; btn.textContent = msg; setTimeout(() => { btn.textContent = orig }, 900) }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => flash('Copied!')).catch(() => flash('Copy failed'))
  } else {
    flash('Copy failed')
  }
}
function savePhoneModelLog() {
  const md = '# Phone Model Log\n\n' + phoneModelLog.map((line) => '- ' + line).join('\n') + '\n'
  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  a.href = url
  a.download = 'phone-model-log-' + stamp + '.md'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
function clearPhoneModelLog() {
  phoneModelLog = []
  if (phoneModelLogEl) phoneModelLogEl.innerHTML = ''
}

// All-logs controls (Debug group) -- direct requests: "provide a clear
// all logs button and copy all logs button" / "and a pause and resume
// logs button." Span all 3 Debug-group logs -- Mouse Log (devPanel.js's
// own built-in log, reached as a bare global -- see addGroup()'s own
// comment on this reachability), Sensors, and Phone Model Log.
function clearAllLogs() {
  clearMouseLog()
  clearSensorLog()
  clearPhoneModelLog()
}
function copyAllLogsText(btn) {
  const text = '=== Mouse Log ===\n' + getMouseLogText() +
    '\n\n=== Sensor Log ===\n' + sensorLog.join('\n') +
    '\n\n=== Phone Model Log ===\n' + phoneModelLog.join('\n')
  const flash = (msg) => { const orig = btn.textContent; btn.textContent = msg; setTimeout(() => { btn.textContent = orig }, 900) }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => flash('Copied!')).catch(() => flash('Copy failed'))
  } else {
    flash('Copy failed')
  }
}
// Independent of each log's own streaming state (Stream Sensor Data
// checkbox, Mouse Log's own always-on click capture) -- a pure overlay
// that gates whether NEW entries get appended anywhere, without
// disturbing whatever each log's own control currently says. Mouse
// Log's own pause flag lives in devPanel.js (a separate script/scope),
// kept in sync via setMouseLogPaused() (also a bare global, per
// pushMouseLogEntry()'s own comment).
function toggleAllLogsPaused(btn) {
  allLogsPaused = !allLogsPaused
  setMouseLogPaused(allLogsPaused)
  btn.textContent = allLogsPaused ? 'RESUME LOGS' : 'PAUSE LOGS'
}

// =======================================================================
// Dev panel wiring — built against the real TEMPLATE_DEV_PANEL.html engine
// (devPanel.js, loaded as a classic script; its functions are reachable
// here as bare globals since both scripts share the page's top-level
// scope). Called once from devPanel.js's own ensureDevPanelBuilt() splice
// point, via window.renderHandysetDevGroups.
// =======================================================================
function addGroup(name) {
  /* eslint-disable-next-line no-undef */
  const el = createDevGroupElement(name, 'desktop')
  document.getElementById('desktopTabContent').appendChild(el)
  return el.querySelector(':scope > .dev-section-content')
}
function addSubgroup(parentContent, name) {
  const el = createDevGroupElement(name, 'desktop')
  parentContent.appendChild(el)
  return el.querySelector(':scope > .dev-section-content')
}
// Every control built via addRow() is collected here and registered with
// the engine (registerDevControlArray(), at the end of
// renderHandysetDevGroups() below) — REQUIRED, not optional: the "Show in
// Mobile/Landscape" checkbox's own row-creation logic
// (ensureDynamicTargetRow() in devPanel.js) looks the control up via
// findRegisteredControlById(), which only ever finds anything registered
// this way. Missed entirely on the first pass — every control appeared to
// work (toggled, cascaded correctly) because the CHECKBOX's own state is
// independent of the registry, but the actual mirrored Mobile/Landscape
// row was silently never created, since ensureDynamicTargetRow() bails
// out immediately (`if (!desktopCtrl) return existingId || null`) for an
// unregistered id, regardless of what the checkbox says.
const HANDYSET_CONTROLS = []
function addRow(content, ctrl) {
  // buildUniformControlRow() (devPanel.js) checks `ctrl.tab === 'desktop'`
  // to decide which per-row device checkbox to attach (visibility on
  // Desktop, independence on Mobile/Landscape) — every control built here
  // is a Desktop-tab control (addGroup()/addSubgroup() always pass
  // 'desktop'), so this must be set explicitly or the check silently
  // fails and every row gets the wrong ("Independent from Desktop")
  // checkbox instead. Missed on the first pass — every control literal
  // across every render*Group() function lacked this field.
  if (!ctrl.tab) ctrl.tab = 'desktop'
  const row = (ctrl.type === 'text' || ctrl.type === 'number') ? buildTextInputRow(ctrl) : buildUniformControlRow(ctrl)
  content.appendChild(row)
  // CORRECTED 2026-09-27, direct report: "sae button isnt saving my
  // phone tilt settings." Root cause: every 'text'/'number' control
  // (every curve/range JSON field in the file -- Reactive Arm Length,
  // Responsive Wrist Splay, the 3 wrist-axis clamps, Responsive Arm
  // Rotation at Base, Responsive Pose Tween) was excluded from
  // HANDYSET_CONTROLS here, meaning captureAllRegisteredControlValues()/
  // applyControlValues() (devPanel.js, JS-13) -- both fully generic,
  // `document.getElementById(ctrl.id)` + `.value`/`.checked`, neither
  // cares about `ctrl.type` at all -- never even saw these controls to
  // capture or restore them. Confirmed live: `textWristSplayRange`,
  // `textArmLengthRange`, `textBaseArmRotationCurve`,
  // `textPoseTweenCurve`, etc. were ALL absent from the real,
  // git-tracked `dev-panel-settings.json` after 7 real Save/Sync
  // round-trips. The original exclusion only needed to route these
  // rows to buildTextInputRow() instead of buildUniformControlRow()
  // (the actual DOM/row-builder choice, on the line above, untouched
  // by this fix) -- it never needed to also skip registration, since
  // registerDevControlArray() and its 2 consumers make no assumption
  // about which row-builder produced the element.
  HANDYSET_CONTROLS.push(ctrl)
  return row
}
function wireSlider(id, onInput) {
  const el = document.getElementById(id)
  if (!el) return
  el.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value)
    onInput(v)
    requestRender()
    const vEl = document.getElementById(id.replace(/^slider/, 'value'))
    if (vEl) vEl.textContent = v
  })
}
function wireDeviceSlider(id, cfgKey) {
  // For controls with device checkboxes, route to device-specific cfg values
  const el = document.getElementById(id)
  if (!el) return
  el.addEventListener('input', (e) => {
    const v = parseFloat(e.target.value)
    const activeTab = getActiveDevPanelTab()
    if (activeTab?.id === 'mobileTab') cfg[cfgKey + 'Mobile'] = v
    else if (activeTab?.id === 'landscapeTab') cfg[cfgKey + 'Landscape'] = v
    else cfg[cfgKey] = v
    requestRender()
    const vEl = document.getElementById(id.replace(/^slider/, 'value'))
    if (vEl) vEl.textContent = v
  })
}
// Bridges a "Show in Mobile/Landscape" slider's live Mobile/Landscape
// DOM value into cfg[cfgKey+'Mobile'/'Landscape'] -- added 2026-10-01,
// direct report: "texture x and y offset still doesnt wok on either
// tab. I have the cehckboxes checked" / "they work on desktop... just
// not mobile." Root cause, found by reading devPanel.js directly:
// wireDeviceSlider() above only ever attaches its 'input' listener to
// the DESKTOP element (`id`, unsuffixed) -- the Mobile/Landscape row is
// a SEPARATE element devPanel.js auto-creates on demand
// (ensureDynamicTargetRow()), with its own id
// (`sliderMobileScreenTextureOffsetX`, NOT
// `sliderScreenTextureOffsetXMobile` -- devPanel.js inserts the device
// name right after the type prefix, confirmed directly from its own
// resolveDevControlId() regex: `^(slider|color|select|checkbox)
// (Mobile|Landscape)(.+)$`). That cloned element only ever gets
// devPanel.js's own generic text-readout listener (buildSliderRow()) --
// when the row is "Independent from Desktop" (the whole point of a
// device-specific texture offset), the edited value is written ONLY
// into devPanel.js's own internal `devDeviceValues` store (see
// `onDevTargetControlEdited()`'s own independent branch) and NEVER
// reaches this project's `cfg` object at all -- confirmed by grepping
// devPanel.js for every `devDeviceValues` reference: none of them call
// back into any project-supplied callback. `cfg.screenTextureOffsetXMobile`
// (etc.) therefore stays frozen at its declared default (0) forever,
// regardless of what the Mobile slider is dragged to -- exactly the
// reported symptom.
//
// CORRECTED 2026-10-01, SAME DAY -- the first fix (a curveWidgetResyncs
// poll) correctly bridged the VALUE into cfg, but a direct follow-up
// report ("when i update mobile tab settings, othing happens, but if i
// save ad refresh, they show up. make it isntantneous") surfaced a
// 2nd, deeper issue: this project uses ON-DEMAND rendering (see
// requestRender()'s own top-of-file comment) -- the render loop fully
// STOPS once idle, and only requestRender() restarts it.
// curveWidgetResyncs itself only runs AS PART OF animate()'s own body,
// so once the loop goes idle (the normal state whenever nothing else is
// animating), the poll never gets scheduled again at all, no matter how
// long you wait -- dragging the Mobile slider alone never called
// requestRender(), so the change sat in the DOM, correctly detectable,
// but with nobody left to detect it. Save+refresh "worked" only because
// a page load naturally triggers several renders in a row (plenty of
// chances for the poll to catch up once), not because anything was
// actually fixed.
//
// Switched to EVENT DELEGATION instead of polling: one `document`-level
// 'input' listener per device (not per-element), checking `e.target.id`
// -- since `document` always exists, this needs no knowledge of
// whether the cloned element exists yet, survives it being removed/
// recreated (unchecking/rechecking "Show in Mobile/Landscape"), and
// fires on the REAL native 'input' event the slider already dispatches
// on every drag tick (confirmed bubbles by default, same as the
// synthetic events devPanel.js's own applyControlValues() dispatches
// with `{ bubbles: true }` for Sync/Reset/Undo restores -- both paths
// are covered by the same listener). Critically, this ALSO calls
// requestRender() directly in the handler, which a poll can never do
// for itself once the loop it depends on has already stopped.
function wireDeviceSliderMirror(desktopId, cfgKey) {
  ;['Mobile', 'Landscape'].forEach((device) => {
    const id = desktopId.replace(/^(slider|color|select|checkbox)/, '$1' + device)
    const fullCfgKey = cfgKey + device
    document.addEventListener('input', (e) => {
      if (!e.target || e.target.id !== id) return
      const v = parseFloat(e.target.value)
      if (Number.isNaN(v)) return
      cfg[fullCfgKey] = v
      requestRender()
    })
  })
}
function wireCheckbox(id, onChange) { const el = document.getElementById(id); if (el) el.addEventListener('change', (e) => { onChange(e.target.checked); requestRender() }) }
function wireColor(id, onChange) { const el = document.getElementById(id); if (el) el.addEventListener('input', (e) => { onChange(e.target.value); requestRender() }) }
function wireTextInput(id, onChange) { const el = document.getElementById(id); if (el) el.addEventListener('input', (e) => { onChange(e.target.value); requestRender() }) }
function wireSelect(id, onChange) { const el = document.getElementById(id); if (el) el.addEventListener('change', (e) => { onChange(e.target.value); requestRender() }) }

// REMOVED 2026-09-28 -- elLocal/commitTextControl/buildReactiveRangeWidget/
// buildReactiveCurveWidget (the hand-built dual-handle range bar and
// draggable-point SVG curve editor this project ported from HANDY
// DANDIES) are dead code now that all 12 curve/range fields (Reactive
// Arm Length, Responsive Wrist Splay, the 3 wrist-axis clamps,
// Responsive Arm Rotation at Base, Responsive Pose Tween, Phone
// Responsive Rotation) are migrated to devPanel.js's own generic
// type:'curve-editor'/'range-bar' controls (CLAUDE.md §12 template
// re-sync, 2026-09-28) -- see each field's own "MIGRATED 2026-09-28"
// comment for the replacement registration pattern.

// ---------------------------------------------------------------------
// Mobile/Landscape mirroring for the Phone Tilt group's own min/max
// range sliders and curve graphs -- direct report 2026-09-27: "when I
// check the show in mobile checkbox, the min max sliders and curve
// graphs aren't showing up in mobile." Root cause, confirmed by direct
// comparison against the real .claude/TEMPLATE_DEV_PANEL.html (not
// assumed): these widgets are built on top of a hidden `type: 'text'`
// control, and devPanel.js's own automatic per-device mirroring
// (ensureDynamicTargetRow()) explicitly excludes 'text'/'number'
// controls -- the shared template's own documented, permanent scope
// limit ("outside this system's scope for now"). The "Show in Mobile/
// Landscape" checkbox itself still exists (added by devPanel.js's own
// generic backfill pass, independent of this), so it can be checked --
// checking it just silently did nothing.
//
// Fixed with a SEPARATE, HANDYSET-owned mirroring mechanism, scoped to
// the 3 curve/range controls actually in the Phone Tilt group
// (Responsive Arm Rotation at Base's range+curve, Responsive Pose
// Tween's curve). Per direct confirmation (AskUserQuestion, 2026-09-27):
// the mirror is a SHARED-VALUE mirror -- Mobile/Landscape show the
// exact same widget, editing the SAME cfg field as Desktop -- NOT an
// independently-tunable per-device copy (none of these 3 fields have a
// per-device variant anywhere else in this file, so "independent"
// wouldn't mean anything real for them).
//
// REMOVED 2026-09-28 -- this whole Mobile/Landscape mirroring mechanism
// (formerly PHONE_TILT_MIRROR_WIDGETS/findNestedGroupContent/
// syncPhoneTiltWidgetMirrors) existed solely to hand-roll a "Show in
// Mobile/Landscape" equivalent for textBaseArmRotationRange/
// textBaseArmRotationCurve/textPoseTweenCurve, back when those 3 fields
// were plain type:'text' rows with no device-checkbox support of their
// own. All 3 (and every other curve/range field in this file) are now
// migrated to the template's generic type:'range-bar'/'curve-editor'
// controls (see each one's own "MIGRATED 2026-09-28" comment), which
// set ctrl.skipDeviceCheckbox = true internally -- these control types
// are desktop-only by design, the same precedent as Mouse Log (see the
// workspace CLAUDE.md's own §12f-1 gotcha note). Disclosed trade-off:
// these 3 fields (and every other migrated curve/range field) lose
// their prior Mobile/Landscape mirroring capability as a direct,
// deliberate consequence of adopting the template's generic engine --
// consistent with every other curve/range/list-picker control in the
// dev panel, none of which have ever had a device-specific variant.

// Labels match HANDY DANDIES' own DEV_GROUPS exactly (grepped from its
// main.js, not reconstructed) — including the thumb's own 2 irregular
// labels ("Thumb Tip Splay" / "Thumb 2nd Segment Curl" instead of the
// "2nd Segment Splay" / "Mid-Only Curl" pattern every other finger uses).
function addFingerSliders(content, finger) {
  const F = finger.charAt(0).toUpperCase() + finger.slice(1)
  const splay2Label = finger === 'thumb' ? `${F} Tip Splay (%)` : `${F} 2nd Segment Splay (%)`
  const midOnlyLabel = finger === 'thumb' ? `${F} 2nd Segment Curl (%)` : `${F} Mid-Only Curl (%)`
  const defs = [
    [FINGER_CURL_KEY[finger], `${F} Curl (%)`, -200, 200], [FINGER_SPLAY_KEY[finger], `${F} Splay (%)`, -200, 200],
    [FINGER_SPLAY2_KEY[finger], splay2Label, -200, 200], [FINGER_CURL_BIAS_KEY[finger], `${F} Curl Bias (Base <-> Tip) (%)`, -100, 100],
    [FINGER_BASE_ONLY_CURL_KEY[finger], `${F} Base-Only Curl (%)`, -200, 200], [FINGER_MID_ONLY_CURL_KEY[finger], midOnlyLabel, -200, 200],
    [FINGER_TIP_ONLY_CURL_KEY[finger], `${F} Tip-Only Curl (%)`, -200, 200], [FINGER_TIP_TWIST_KEY[finger], `${F} Tip Twist (%)`, -100, 100]
  ]
  defs.forEach(([key, label, mn, mx]) => {
    const id = 'slider' + key
    addRow(content, { id, label, type: 'slider', min: mn, max: mx, step: 1, value: cfg[key] })
    wireSlider(id, (v) => { cfg[key] = v; applyCurl(finger) })
  })
}

function capturePoseFromCfg() { const o = {}; POSE_PRESET_KEYS.forEach((k) => { o[k] = cfg[k] }); return o }
function captureCameraFromLive() { return { x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov, tx: controls.target.x, ty: controls.target.y, tz: controls.target.z, zoom: cfg.cameraZoom } }
function captureLightingFromLive() { const o = {}; LIGHTING_PRESET_KEYS.forEach((k) => { o[k] = cfg[k] }); return o }

// FIXED 2026-09-27, direct report: "double check the saed cameras. it
// doesnt seem to save still." Root cause, confirmed by directly
// inspecting localStorage after a real Save click: `buildListPicker()`
// only ever mutated its own `items` array IN MEMORY, then called
// `saveDevPanelSettings()` hoping it would persist -- but that
// (devPanel.js-owned) function only ever captures state from
// REGISTERED dev-panel controls (hidden inputs, sliders, etc.). A raw
// JS array like SAVED_CAMERAS has no such registration, so it was
// COMPLETELY INVISIBLE to Sync -- confirmed live: `devPanelSettings` in
// localStorage has no field for it at all, only the standard
// controls/layout/style keys. This silently affected ALL FIVE
// list-pickers built by this function (Saved Tween Sequences, Poses,
// Cameras, Lighting, Toon Shading), not just Cameras -- every
// Save/Overwrite/Rename/Delete/+Group/Import ever appeared to work
// (the in-memory array and its DOM list both updated) but reset back
// to the hardcoded seed data on every reload.
//
// Fixed with a dedicated persistence layer per list-picker, keyed by
// the new required `opts.storageKey`, following the EXACT pattern
// already proven for defaultPose/defaultCamera/defaultLighting/
// defaultToon (saveFieldAsDefault()/loadFieldDefaultIfSaved(), below):
// localStorage (always-on baseline, per CLAUDE.md §12l) plus an async
// GET-merge-POST to the same git-tracked settings endpoint when it's
// configured/reachable. persistListPickerItems() is called after every
// mutation (in addition to, not instead of, the existing
// saveDevPanelSettings() call); loadListPickerItemsFromLocalStorage()
// runs synchronously at module load (mirroring the schema-version
// guard at the top of this file) so every reference to the array
// (Tween's own SAVED_POSES read included) sees the restored data
// before anything else runs; loadListPickerItemsFromRemoteData() is
// called from loadRemoteSettingsOnStartup() (this file's own single
// shared startup GET), alongside the other loadFieldDefaultIfSaved()
// logic.
function persistListPickerItems(storageKey, items) {
  try { localStorage.setItem('handyset_listPicker_' + storageKey, JSON.stringify(items)) } catch (e) { /* localStorage unavailable -- remote save below is the fallback */ }
  ;(async () => {
    try {
      const getResp = await fetch(SAVE_SETTINGS_ENDPOINT, { cache: 'no-store' })
      const getBody = await getResp.json().catch(() => ({}))
      const base = (getResp.ok && getBody.ok === true && getBody.settings && typeof getBody.settings === 'object') ? getBody.settings : {}
      const merged = Object.assign({}, base, { ['listPicker_' + storageKey]: items })
      await fetch(SAVE_SETTINGS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Dev-Panel-Secret': DEV_PANEL_SAVE_SECRET },
        body: JSON.stringify(merged)
      })
    } catch (e) { /* offline/unreachable/not-yet-deployed -- localStorage above already covers the same-browser case */ }
  })()
}
// Synchronous, local-only restore -- called once per array, at module
// scope, so it runs before ANYTHING (including other code that captured
// a reference to the same array) reads it.
function loadListPickerItemsFromLocalStorage(storageKey, items) {
  try {
    const raw = localStorage.getItem('handyset_listPicker_' + storageKey)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length) { items.length = 0; items.push(...parsed) }
  } catch (e) { /* corrupt/unavailable -- keep the hardcoded seed data */ }
}
// Synchronous merge of an already-fetched remote list-picker array into
// the live `items` array -- called from loadRemoteSettingsOnStartup()
// (below), which does the single shared GET for every remote-restorable
// field (defaultPose/Camera/Lighting/Toon and now these 5 arrays) rather
// than this function performing its own separate fetch per list -- 5
// extra round-trips at startup for no benefit over the 1 already made.
function loadListPickerItemsFromRemoteData(remoteArr, items) {
  if (Array.isArray(remoteArr) && remoteArr.length) { items.length = 0; items.push(...remoteArr) }
}
// Full list-picker widget, ported to match HANDY DANDIES' own
// buildListPickerRow()/renderListPickerRows() (src/devpanel/devPanel.js
// there) as closely as practical in the time available: Save/Overwrite/
// Use/Rename/Delete/+Group buttons, optional Export Selected/Import
// (checkbox-per-item clipboard JSON, only on Saved Poses — matching HANDY
// DANDIES, where only its own savedPoses control has these 2 buttons),
// a scrollable item list with group headers. `items` is mutated IN
// PLACE (push/splice, never reassigned) so other code already holding a
// reference to the same array (e.g. Tween's own SAVED_POSES read) sees
// live updates without needing its own refresh call.
function buildListPicker(content, opts) {
  const container = document.createElement('div')
  container.className = 'dp-list-picker-row-container'
  const listEl = document.createElement('div')
  listEl.className = 'dp-list-picker'
  container.appendChild(listEl)

  function mkBtn(text) { const b = document.createElement('button'); b.type = 'button'; b.textContent = text; return b }
  const btnRow = document.createElement('div')
  btnRow.className = 'dev-buttons'
  const saveBtn = mkBtn('Save'), overwriteBtn = mkBtn('Overwrite'), useBtn = mkBtn('Use'), renameBtn = mkBtn('Rename'), deleteBtn = mkBtn('Delete'), groupBtn = mkBtn('+ Group')
  btnRow.append(saveBtn, overwriteBtn, useBtn, renameBtn, deleteBtn, groupBtn)
  container.appendChild(btnRow)
  let exportBtn = null, importBtn = null
  if (opts.exportable || opts.importable) {
    const btnRow2 = document.createElement('div')
    btnRow2.className = 'dev-buttons'
    if (opts.exportable) { exportBtn = mkBtn('Export Selected'); btnRow2.appendChild(exportBtn) }
    if (opts.importable) { importBtn = mkBtn('Import'); btnRow2.appendChild(importBtn) }
    container.appendChild(btnRow2)
  }
  content.appendChild(container)

  const items = opts.items
  const state = { selected: items.find((i) => i.name === opts.defaultName) || null, exportChecked: new Set() }

  function renderItem(it, parentEl) {
    const row = document.createElement('div')
    row.className = 'dp-list-picker-item'
    if (state.selected === it) row.classList.add('dp-list-picker-item-selected')
    if (opts.exportable) {
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.checked = state.exportChecked.has(it)
      cb.addEventListener('click', (e) => { e.stopPropagation(); if (cb.checked) state.exportChecked.add(it); else state.exportChecked.delete(it) })
      row.appendChild(cb)
    }
    const label = document.createElement('span')
    label.className = 'dp-list-picker-item-label'
    label.textContent = it.name
    row.appendChild(label)
    row.addEventListener('click', () => { state.selected = it; render() })
    parentEl.appendChild(row)
  }
  function render() {
    listEl.innerHTML = ''
    const groups = {}
    const ungrouped = []
    items.forEach((it) => { if (it.group) { (groups[it.group] = groups[it.group] || []).push(it) } else ungrouped.push(it) })
    ungrouped.forEach((it) => renderItem(it, listEl))
    Object.keys(groups).forEach((gname) => {
      const header = document.createElement('div')
      header.className = 'dp-list-picker-group-header'
      header.textContent = '▾ ' + gname
      listEl.appendChild(header)
      groups[gname].forEach((it) => renderItem(it, listEl))
    })
  }
  render()

  saveBtn.addEventListener('click', () => {
    const label = opts.itemLabel || 'Item'
    const name = prompt(label + ' name:', label + ' ' + (items.length + 1))
    if (!name) return
    const data = opts.captureCurrent ? opts.captureCurrent() : {}
    const existing = items.find((it) => it.name === name)
    if (existing) {
      if (!confirm(`"${name}" already exists. Overwrite it?`)) return
      Object.assign(existing, data, { name })
    } else {
      items.push(Object.assign({ name }, data))
    }
    render()
    // Persist the updated items array to localStorage + git via Sync
    if (typeof saveDevPanelSettings === 'function') {
      saveDevPanelSettings()
    }
    if (opts.storageKey) persistListPickerItems(opts.storageKey, items)
  })
  overwriteBtn.addEventListener('click', () => {
    if (!state.selected) return
    const data = opts.captureCurrent ? opts.captureCurrent() : {}
    Object.assign(state.selected, data, { name: state.selected.name })
    render()
    // Persist the updated items array to localStorage + git via Sync
    if (typeof saveDevPanelSettings === 'function') {
      saveDevPanelSettings()
    }
    if (opts.storageKey) persistListPickerItems(opts.storageKey, items)
  })
  // requestRender(): shared by all 5 list-pickers (Poses/Cameras/Lighting/
  // Toon Shading/Tween Sequences) via this one function -- opts.onUse()
  // applies the preset directly (applyPoseValuesToHand/applyCameraPreset/
  // etc), none of which go through wireSlider/wireCheckbox, so on-demand
  // rendering would otherwise never see this as a "setting modified".
  useBtn.addEventListener('click', () => { if (state.selected && opts.onUse) { opts.onUse(state.selected); requestRender() } })
  renameBtn.addEventListener('click', () => {
    if (!state.selected) return
    const name = prompt('Rename to:', state.selected.name)
    if (!name || name === state.selected.name) return
    state.selected.name = name
    render()
    if (typeof saveDevPanelSettings === 'function') saveDevPanelSettings()
    if (opts.storageKey) persistListPickerItems(opts.storageKey, items)
  })
  deleteBtn.addEventListener('click', () => {
    if (!state.selected) return
    const idx = items.indexOf(state.selected)
    if (idx >= 0) items.splice(idx, 1)
    state.selected = null
    render()
    if (typeof saveDevPanelSettings === 'function') saveDevPanelSettings()
    if (opts.storageKey) persistListPickerItems(opts.storageKey, items)
  })
  groupBtn.addEventListener('click', () => {
    if (!state.selected) { alert('Select an item first, then + Group.'); return }
    const gname = prompt('Group name:')
    if (!gname) return
    state.selected.group = gname
    render()
    if (typeof saveDevPanelSettings === 'function') saveDevPanelSettings()
    if (opts.storageKey) persistListPickerItems(opts.storageKey, items)
  })
  if (exportBtn) exportBtn.addEventListener('click', () => {
    const chosen = items.filter((it) => state.exportChecked.has(it))
    if (!chosen.length) { alert('Check at least one item to export.'); return }
    navigator.clipboard.writeText(JSON.stringify(chosen, null, 2)).then(() => alert('Copied ' + chosen.length + ' item(s) to clipboard.'))
  })
  if (importBtn) importBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = JSON.parse(text)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      arr.forEach((item) => {
        const existing = items.find((it) => it.name === item.name)
        if (existing) Object.assign(existing, item)
        else items.push(item)
      })
      render()
      if (typeof saveDevPanelSettings === 'function') saveDevPanelSettings()
      if (opts.storageKey) persistListPickerItems(opts.storageKey, items)
    } catch (e) { alert('Import failed: ' + e.message) }
  })
  return state
}
function renderPresetPicker(content, title, items, defaultName, applyFn, captureFn, opts) {
  const sub = addSubgroup(content, title)
  buildListPicker(sub, Object.assign({ items, defaultName, itemLabel: title.replace(/^Saved /, '').replace(/s$/, ''), captureCurrent: captureFn, onUse: applyFn }, opts || {}))
  // "Set as Default" — a sibling control AFTER the list-picker, not part
  // of it (matches Hando exactly: it's a separate `type: 'button'` DEV_GROUPS
  // entry, never one of buildListPickerRow's own buttons). Captures LIVE
  // current state (the same captureFn the list-picker's own Save button
  // uses), not whatever's merely selected in the list — "save what's
  // tuned right now as the default," per Hando's saveToonAsDefault() etc.
  // Omitted when opts.defaultFieldKey isn't passed (Tween Sequences has
  // no default mechanism in Hando either — confirmed by direct source
  // inspection, not assumed).
  if (opts && opts.defaultFieldKey) {
    const btnRow = document.createElement('div')
    btnRow.className = 'dev-buttons'
    const defaultBtn = document.createElement('button')
    defaultBtn.type = 'button'
    defaultBtn.textContent = 'Set as Default'
    btnRow.appendChild(defaultBtn)
    sub.appendChild(btnRow)
    defaultBtn.addEventListener('click', () => saveFieldAsDefault(opts.defaultFieldKey, captureFn, defaultBtn))
  }
}

function renderPoseGroup(content) {
  // ROTATION / THUMB split, and a dedicated Pose Offset subgroup: this
  // matches your OWN LIVE Handy Dandies panel's actual current layout
  // (grepped from data/processed/dev-panel-settings.json's `order` +
  // `textOverrides`), not the base code's original "Whole-Hand Rotation &
  // Thumb" bundle — you split ROTATION out from THUMB there yourself via
  // drag-and-drop, and that saved state is the real source of truth.
  const subRotation = addSubgroup(content, 'ROTATION')
  ;[['modelRotX', -180, 180, 'Whole-Hand Rotation X (Deg)'], ['modelRotY', -180, 180, 'Whole-Hand Rotation Y (Deg)'], ['modelRotZ', -180, 180, 'Whole-Hand Rotation Z (Deg)']].forEach(([k, mn, mx, label]) => {
    addRow(subRotation, { id: 'slider' + k, label, type: 'slider', min: mn, max: mx, step: 1, value: cfg[k] })
    wireSlider('slider' + k, (v) => { cfg[k] = v; applyPoseValuesToHand(cfg) })
  })

  // MIRROR -- direct request: 3 checkboxes mirroring the hand along each
  // of the MODEL'S OWN 3 axes (applied as a per-axis sign on h.clone.scale
  // -- see applyModelRootTransform()'s own comment). Each one re-applies
  // the full pose (applyPoseValuesToHand) rather than just
  // applyModelRootTransform alone, since curl/splay/twist's own axis math
  // (rotateOnTrueWorldAxis -> getBoneWorldQuaternionRobust) depends on
  // h.clone's CURRENT scale too -- a stale finger pose would otherwise sit
  // one frame behind the new mirror state.
  const subMirror = addSubgroup(content, 'MIRROR')
  ;[['handMirrorX', 'Mirror X'], ['handMirrorY', 'Mirror Y'], ['handMirrorZ', 'Mirror Z']].forEach(([k, label]) => {
    addRow(subMirror, { id: 'checkbox' + k, label, type: 'checkbox' })
    document.getElementById('checkbox' + k).checked = cfg[k]
    wireCheckbox('checkbox' + k, (v) => { cfg[k] = v; applyPoseValuesToHand(cfg) })
  })

  const subBaseRotation = addSubgroup(content, 'Whole-Hand Rotation at Base')
  ;[['baseRotationX', -180, 180, 'Base Rotation X (Deg)'], ['baseRotationY', -180, 180, 'Base Rotation Y (Deg)'], ['baseRotationZ', -180, 180, 'Base Rotation Z (Deg)']].forEach(([k, mn, mx, label]) => {
    addRow(subBaseRotation, { id: 'slider' + k, label, type: 'slider', min: mn, max: mx, step: 1, value: cfg[k] })
    wireSlider('slider' + k, (v) => { cfg[k] = v; applyBaseArmRotation() })
  })

  const subThumb = addSubgroup(content, 'THUMB')
  addFingerSliders(subThumb, 'thumb')

  const subWrist = addSubgroup(content, 'Wrist')
  ;[['wristRotation', -360, 360, 'Wrist Rotation (Deg)'], ['wristBend', -90, 90, 'Wrist Bend (Deg)'], ['wristSplay', -30, 30, 'Wrist Splay (Deg)']].forEach(([k, mn, mx, label]) => {
    addRow(subWrist, { id: 'slider' + k, label, type: 'slider', min: mn, max: mx, step: 1, value: cfg[k] })
    wireSlider('slider' + k, (v) => { cfg[k] = v; applyPoseValuesToHand(cfg) })
  })
  // Wrist axis clamps -- direct request 2026-09-25, after diagnosing why
  // a saved pose's own Wrist Splay plus Responsive Wrist Splay's live
  // contribution can sum past any anatomical limit (e.g. -55 + -71 =
  // -126) with nothing capping the total. Each clamps the FINAL combined
  // angle actually applied to that axis (applyWristPoseToSkeleton()),
  // not either contributing source alone.
  // MIGRATED 2026-09-28 to devPanel.js's own generic 'range-bar' control
  // type (CLAUDE.md §12r) -- same {min,max} JSON value format the old
  // HANDYSET-owned buildReactiveRangeWidget() already used, so the SAME
  // control id carries the existing saved value across with zero
  // transformation. cfg[key] is kept in sync via the same
  // curveWidgetResyncs polling pattern used elsewhere in this file
  // (the generic range-bar widget itself has no onExternalChange hook --
  // it just sets its own hidden input's value, on both a live drag AND a
  // Reset/Sync/Undo restore).
  ;[
    ['wristRotationClampRange', 'Min / Max Wrist Rotation (Deg)', -360, 360, parseWristClampConfig],
    ['wristBendClampRange', 'Min / Max Wrist Bend (Deg)', -90, 90, parseWristClampConfig],
    ['wristSplayClampRange', 'Min / Max Wrist Splay (Deg, Combined)', -180, 180, parseWristClampConfig]
  ].forEach(([key, label, trackMin, trackMax, parseFn]) => {
    let defaultValue = { min: trackMin, max: trackMax }
    try { defaultValue = JSON.parse(cfg[key]) } catch (e) { /* keep fallback */ }
    addRow(subWrist, { id: 'text' + key, label, type: 'range-bar', trackMin, trackMax, unit: '°', defaultValue })
    let lastSeen = document.getElementById('text' + key).value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('text' + key)
      if (!el || el.value === lastSeen) return
      lastSeen = el.value
      cfg[key] = el.value
      parseFn()
      applyPoseValuesToHand(cfg)
    })
  })
  // Reactive Arm Length -- ported from HANDY DANDIES (see cfg's own
  // declaration comment for the single-hand distance-input adaptation:
  // tiltMagnitude stands in for HANDY DANDIES' per-field live distance
  // range). "Default Arm Length" is the label HANDY DANDIES itself uses
  // for the non-reactive fallback slider.
  addRow(subWrist, { id: 'checkboxCropWristEnabled', label: 'Crop Wrist (Master On/Off)', type: 'checkbox' })
  document.getElementById('checkboxCropWristEnabled').checked = cfg.cropWristEnabled
  wireCheckbox('checkboxCropWristEnabled', (v) => { cfg.cropWristEnabled = v; updateWristCrop() })
  addRow(subWrist, { id: 'sliderHideWrist', label: 'Default Arm Length (Crop %, Reactive Off)', type: 'slider', min: 0, max: 100, step: 1, value: cfg.hideWrist })
  wireSlider('sliderHideWrist', (v) => { cfg.hideWrist = v; updateWristCrop() })
  addRow(subWrist, { id: 'checkboxReactiveArmLengthEnabled', label: 'Reactive Arm Length (By Cursor Distance)', type: 'checkbox' })
  document.getElementById('checkboxReactiveArmLengthEnabled').checked = cfg.reactiveArmLengthEnabled
  wireCheckbox('checkboxReactiveArmLengthEnabled', (v) => { cfg.reactiveArmLengthEnabled = v; updateWristCrop() })
  // MIGRATED 2026-09-28 to devPanel.js's own generic 'range-bar'/
  // 'curve-editor' control types (CLAUDE.md §12r) -- same ids preserve
  // the existing saved values (range: identical {min,max} format;
  // curve: existing array wrapped into {points,method:'catmullrom'} at
  // the cfg-default and settings-file level, matching HANDYSET's own
  // pre-existing Catmull-Rom evaluation exactly). cfg.armLength* is kept
  // in sync via curveWidgetResyncs polling (see the wrist-clamp loop
  // above for why -- these generic widgets have no onExternalChange hook).
  {
    let rangeDefault = { min: 0, max: 100 }
    try { rangeDefault = JSON.parse(cfg.armLengthRange) } catch (e) { /* keep fallback */ }
    addRow(subWrist, { id: 'textArmLengthRange', label: 'Min / Max Arm Length (Crop %)', type: 'range-bar', trackMin: 0, trackMax: 100, unit: '%', defaultValue: rangeDefault })
    let lastSeenRange = document.getElementById('textArmLengthRange').value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textArmLengthRange')
      if (!el || el.value === lastSeenRange) return
      lastSeenRange = el.value
      cfg.armLengthRange = el.value
      parseArmLengthConfig()
    })
    const curveParsed = JSON.parse(cfg.armLengthCurve)
    addRow(subWrist, { id: 'textArmLengthCurve', label: 'Length Scaling Curve (Distance -> Crop)', type: 'curve-editor', defaultPoints: curveParsed.points, defaultMethod: curveParsed.method, caption: 'X: Tilt/Cursor Distance From Center (0-1)  ·  Y: Crop (0=None, 1=Full)' })
    let lastSeenCurve = document.getElementById('textArmLengthCurve').value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textArmLengthCurve')
      if (!el || el.value === lastSeenCurve) return
      lastSeenCurve = el.value
      cfg.armLengthCurve = el.value
      parseArmLengthConfig()
    })
  }

  ;['index', 'middle', 'ring', 'pinky'].forEach((f) => {
    const sub = addSubgroup(content, f.charAt(0).toUpperCase() + f.slice(1))
    addFingerSliders(sub, f)
  })

  const subOffset = addSubgroup(content, 'Pose Offset')
  ;[['poseOffsetX', -20, 20, 'Pose Offset X (World Units)'], ['poseOffsetY', -20, 20, 'Pose Offset Y (World Units)'], ['poseOffsetZ', -20, 20, 'Pose Offset Z (World Units)']].forEach(([k, mn, mx, label]) => {
    addRow(subOffset, { id: 'slider' + k, label, type: 'slider', min: mn, max: mx, step: 0.1, value: cfg[k] })
    wireSlider('slider' + k, (v) => { cfg[k] = v; applyPoseValuesToHand(cfg) })
  })
  addRow(subOffset, { id: 'sliderPoseScale', label: 'Pose Scale (x)', type: 'slider', min: 0.1, max: 3, step: 0.05, value: cfg.poseScale })
  wireSlider('sliderPoseScale', (v) => { cfg.poseScale = v; applyPoseValuesToHand(cfg) })

  renderPresetPicker(content, 'Saved Poses', SAVED_POSES, DEFAULT_POSE_NAME, applyPosePreset, capturePoseFromCfg, { exportable: true, importable: true, defaultFieldKey: 'defaultPose', storageKey: 'poses' })
}

// Ported from HANDY DANDIES (its own top-level "Responsive Wrist Splay"
// group — same structure as Reactive Arm Length above, different unit
// (degrees) and application (adds onto cfg.wristSplay every frame while
// reactive, via applyReactiveWristSplayFrame() in animate() — see that
// function's own comment). Single-hand distance-input adaptation: see
// cfg's own declaration comment. RESTORED 2026-09-21 after direct
// instruction to leave this group in place.
function renderResponsiveWristSplayGroup(content) {
  addRow(content, { id: 'checkboxWristSplayResponsiveEnabled', label: 'Responsive Wrist Splay (Master On/Off)', type: 'checkbox' })
  document.getElementById('checkboxWristSplayResponsiveEnabled').checked = cfg.wristSplayResponsiveEnabled
  wireCheckbox('checkboxWristSplayResponsiveEnabled', (v) => { cfg.wristSplayResponsiveEnabled = v; applyPoseValuesToHand(cfg) })
  addRow(content, { id: 'sliderWristSplayDefault', label: 'Default Wrist Splay (Deg, Reactive Off)', type: 'slider', min: -180, max: 180, step: 1, value: cfg.wristSplayDefault })
  wireSlider('sliderWristSplayDefault', (v) => { cfg.wristSplayDefault = v; applyPoseValuesToHand(cfg) })
  addRow(content, { id: 'checkboxWristSplayReactiveEnabled', label: 'Reactive Wrist Splay (By Cursor Distance)', type: 'checkbox' })
  document.getElementById('checkboxWristSplayReactiveEnabled').checked = cfg.wristSplayReactiveEnabled
  wireCheckbox('checkboxWristSplayReactiveEnabled', (v) => { cfg.wristSplayReactiveEnabled = v; applyPoseValuesToHand(cfg) })
  // MIGRATED 2026-09-28 -- see Reactive Arm Length's own matching comment.
  {
    let rangeDefault = { min: -180, max: 180 }
    try { rangeDefault = JSON.parse(cfg.wristSplayRange) } catch (e) { /* keep fallback */ }
    addRow(content, { id: 'textWristSplayRange', label: 'Min / Max Wrist Splay (Deg)', type: 'range-bar', trackMin: -180, trackMax: 180, unit: '°', defaultValue: rangeDefault })
    let lastSeenRange = document.getElementById('textWristSplayRange').value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textWristSplayRange')
      if (!el || el.value === lastSeenRange) return
      lastSeenRange = el.value
      cfg.wristSplayRange = el.value
      parseWristSplayConfig()
    })
    const curveParsed = JSON.parse(cfg.wristSplayCurve)
    addRow(content, { id: 'textWristSplayCurve', label: 'Splay Scaling Curve (Distance -> Splay)', type: 'curve-editor', defaultPoints: curveParsed.points, defaultMethod: curveParsed.method, caption: 'X: Cursor Distance From Arm Base / Phone Tilt (0-1)  ·  Y: Splay Fraction (0=Min End, 1=Max End)' })
    let lastSeenCurve = document.getElementById('textWristSplayCurve').value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textWristSplayCurve')
      if (!el || el.value === lastSeenCurve) return
      lastSeenCurve = el.value
      cfg.wristSplayCurve = el.value
      parseWristSplayConfig()
    })
  }
}

function renderCameraGroup(content) {
  addRow(content, { id: 'sliderCameraX', label: 'Camera X Position (x)', type: 'slider', min: -500, max: 500, step: 0.5, value: cfg.cameraX })
  wireSlider('sliderCameraX', (v) => { cfg.cameraX = v; camera.position.x = v })
  addRow(content, { id: 'sliderCameraY', label: 'Camera Y Position (x)', type: 'slider', min: -500, max: 500, step: 0.5, value: cfg.cameraY })
  wireSlider('sliderCameraY', (v) => { cfg.cameraY = v; camera.position.y = v })
  addRow(content, { id: 'sliderCameraZ', label: 'Camera Z Position (x)', type: 'slider', min: -500, max: 500, step: 0.5, value: cfg.cameraZ })
  wireSlider('sliderCameraZ', (v) => { cfg.cameraZ = v; camera.position.z = v })
  addRow(content, { id: 'sliderCameraFov', label: 'Field Of View (Deg)', type: 'slider', min: 15, max: 90, step: 1, value: cfg.cameraFov })
  wireSlider('sliderCameraFov', (v) => { cfg.cameraFov = v; camera.fov = v; camera.updateProjectionMatrix() })
  addRow(content, { id: 'sliderCameraZoom', label: 'Zoom (Distance To Pan Target) (x)', type: 'slider', min: 1, max: 500, step: 0.5, value: cfg.cameraZoom })
  wireSlider('sliderCameraZoom', (v) => { cfg.cameraZoom = v; setCameraDistance(v) })
  addRow(content, { id: 'checkboxLockCameraPan', label: 'Lock Camera Pan', type: 'checkbox' })
  document.getElementById('checkboxLockCameraPan').checked = cfg.lockCameraPan
  wireCheckbox('checkboxLockCameraPan', (v) => { cfg.lockCameraPan = v; applyCameraLockState() })
  addRow(content, { id: 'checkboxLockCameraZoom', label: 'Lock Camera Zoom', type: 'checkbox' })
  document.getElementById('checkboxLockCameraZoom').checked = cfg.lockCameraZoom
  wireCheckbox('checkboxLockCameraZoom', (v) => { cfg.lockCameraZoom = v; applyCameraLockState() })
  addRow(content, { id: 'checkboxLockCameraRotate', label: 'Lock Camera Rotate', type: 'checkbox' })
  document.getElementById('checkboxLockCameraRotate').checked = cfg.lockCameraRotate
  wireCheckbox('checkboxLockCameraRotate', (v) => { cfg.lockCameraRotate = v; applyCameraLockState() })
  addRow(content, { id: 'sliderCameraYaw', label: 'Camera Yaw (Deg)', type: 'slider', min: -180, max: 180, step: 1, value: cfg.cameraYaw })
  wireSlider('sliderCameraYaw', (v) => { cfg.cameraYaw = v; setCameraYawPitch(cfg.cameraYaw, cfg.cameraPitch) })
  addRow(content, { id: 'sliderCameraPitch', label: 'Camera Pitch (Deg)', type: 'slider', min: -89, max: 89, step: 1, value: cfg.cameraPitch })
  wireSlider('sliderCameraPitch', (v) => { cfg.cameraPitch = v; setCameraYawPitch(cfg.cameraYaw, cfg.cameraPitch) })
  addRow(content, { id: 'checkboxCameraMaxExtentsEnabled', label: 'Set Default Camera As Max Extents', type: 'checkbox' })
  document.getElementById('checkboxCameraMaxExtentsEnabled').checked = cfg.cameraMaxExtentsEnabled
  wireCheckbox('checkboxCameraMaxExtentsEnabled', (v) => { cfg.cameraMaxExtentsEnabled = v; updateCameraMaxExtentsBound() })
  renderPresetPicker(content, 'Saved Cameras', SAVED_CAMERAS, DEFAULT_CAMERA_NAME, applyCameraPreset, captureCameraFromLive, { defaultFieldKey: 'defaultCamera', storageKey: 'cameras' })
  // Apply once at build time too -- previously only ran from the 3 lock
  // checkboxes' own wireCheckbox callbacks, so a RESTORED "locked" state
  // (e.g. from Sync) never actually disabled OrbitControls or the
  // sliders until the user re-toggled the checkbox.
  applyCameraLockState()
}
// Moves the camera along the existing camera->target line to a new
// distance, preserving viewing direction (ported concept from Handy
// Dandies' own setCameraDistance()).
function setCameraDistance(distance) {
  const dir = camera.position.clone().sub(controls.target)
  const len = dir.length()
  if (len < 1e-6) return
  dir.multiplyScalar(distance / len)
  camera.position.copy(controls.target).add(dir)
  controls.update()
}
// Direct request 2026-09-28: "When I lock pan, zoom, or rotate, lock
// the relevant sliders as well. Those 2 should be in sync. I guess FOV
// can just not be locked ever." Maps each OrbitControls lock to the
// sliders that control the same motion by another means: Pan -> the 3
// camera position sliders (X/Y/Z); Zoom -> the Zoom slider; Rotate ->
// Yaw/Pitch. FOV is deliberately never touched.
function setSliderLocked(id, locked) {
  const input = document.getElementById(id)
  if (!input) return
  input.disabled = locked
  const row = input.closest('.dev-row')
  if (row) row.classList.toggle('dev-row-locked', locked)
}
function applyCameraLockState() {
  controls.enablePan = !cfg.lockCameraPan
  controls.enableZoom = !cfg.lockCameraZoom
  controls.enableRotate = !cfg.lockCameraRotate
  ;['sliderCameraX', 'sliderCameraY', 'sliderCameraZ'].forEach((id) => setSliderLocked(id, cfg.lockCameraPan))
  setSliderLocked('sliderCameraZoom', cfg.lockCameraZoom)
  ;['sliderCameraYaw', 'sliderCameraPitch'].forEach((id) => setSliderLocked(id, cfg.lockCameraRotate))
}
// Extract yaw and pitch from camera direction (ported from HANDO)
// Yaw: rotation around Y axis, Pitch: rotation around X axis
//
// FIXED 2026-10-01, direct report: "my camera yaw and pitch sliders dont
// work. when i click and drag one the other gets affected." Root cause:
// `dir` here used `target - camera.position` (camera-to-target), but
// setCameraYawPitch() (below) places the camera via `target +
// dist*dir_set` -- which requires `dir_set` to mean target-to-camera, the
// OPPOSITE convention. Checked HANDO's own real source before fixing (per
// this project's standing rule) and found the IDENTICAL mismatch there
// too -- this isn't a porting error, it's a genuine latent bug in the
// shared original formula, apparently never caught because nothing in
// HANDO resyncs an idle slider from a live read-back every frame the way
// syncCameraPanelFromLive() does here.
//
// Verified algebraically: with the old `target - camera.position`
// convention, setting (yaw, pitch) and immediately reading it back via
// this function gives (yaw+180 mod 360, -pitch) -- a consistent, provable
// round-trip corruption, not just float noise. Since
// syncCameraPanelFromLive() calls this EVERY frame and resyncs whichever
// slider does NOT currently have focus, dragging Yaw (which calls
// setCameraYawPitch(newYaw, cfg.cameraPitch) -- cfg.cameraPitch itself
// never changes) immediately shows the corrupted NEGATED pitch on the
// Pitch slider every subsequent frame, even though the underlying
// cfg.cameraPitch was never touched -- exactly the reported symptom,
// and symmetrically for dragging Pitch affecting Yaw's display.
//
// Fixed by using `camera.position - target` (target-to-camera) instead,
// matching setCameraYawPitch()'s own placement convention exactly. Reduces
// the round-trip to a mathematical identity: re-verified algebraically
// (dirGet = normalize(camera.position - target) = normalize(dist*dirSet)
// = dirSet exactly, so pitchGet = pitch and yawGet = yaw with zero error).
function getCameraYawPitch() {
  const dir = camera.position.clone().sub(controls.target)
  const dist = dir.length() || 1
  dir.normalize()
  const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180 / Math.PI
  const yaw = Math.atan2(dir.x, dir.z) * 180 / Math.PI
  return { yaw, pitch, dist }
}

// Rotate by moving the camera (not target) to a point at current distance
// along the new yaw/pitch direction (ported from HANDO)
function setCameraYawPitch(yawDeg, pitchDeg) {
  const dist = getCameraYawPitch().dist
  const yaw = yawDeg * Math.PI / 180
  const pitch = pitchDeg * Math.PI / 180
  const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw))
  camera.position.copy(controls.target).addScaledVector(dir, dist)
  controls.update()
}
// Simplified vs. Handy Dandies' own version: clamps zoom distance only
// (controls.maxDistance), not the full pan-target clamped-to-boundary-
// sphere behavior (enforceCameraPanExtent()) — that additionally requires
// per-frame animate()-loop enforcement Handy Dandies has and this project
// doesn't yet. Flagged rather than silently presented as a full port.
function updateCameraMaxExtentsBound() {
  controls.maxDistance = cfg.cameraMaxExtentsEnabled ? cfg.cameraZoom : Infinity
}

function renderPhoneTiltGroup(content) {
  // "Phone Tilt" is this project's own deliberate rename of Handy
  // Dandies' "Cursor Tracking" group (explicit instruction when this
  // project was first spec'd out) -- but the SETTINGS inside keep Handy
  // Dandies' exact labels ("Cursor Target Depth", "Palm Faces Cursor",
  // etc.) even though "cursor" is a slight misnomer for a phone-tilt
  // mechanic, since you asked for exact setting names. Flag if you'd
  // rather these say "Tilt" instead of "Cursor" throughout.
  const subTarget = addSubgroup(content, 'Target')
  addRow(subTarget, { id: 'checkboxTrackingEnabled', label: 'Tracking Enabled', type: 'checkbox' })
  document.getElementById('checkboxTrackingEnabled').checked = cfg.trackingEnabled
  // Added 2026-09-28 (9th round on the Phone Model axis-mapping feature)
  // -- see checkboxPhoneResponsiveRotationEnabled's own comment; this is
  // the broader gate and needs the same guaranteed-clean-start treatment.
  wireCheckbox('checkboxTrackingEnabled', (v) => { cfg.trackingEnabled = v; if (v) { requestMotionPermissionIfNeeded(); resetPhoneModelRotationBaseline() } })
  addRow(subTarget, { id: 'sliderTargetDepthFactor', label: 'Cursor Target Depth (x Field Radius)', type: 'slider', min: -2, max: 2, step: 0.05, value: cfg.targetDepthFactor })
  wireSlider('sliderTargetDepthFactor', (v) => { cfg.targetDepthFactor = v })
  addRow(subTarget, { id: 'checkboxShowTargetMarker', label: 'Show Target Marker', type: 'checkbox' })
  document.getElementById('checkboxShowTargetMarker').checked = cfg.showTargetMarker
  wireCheckbox('checkboxShowTargetMarker', (v) => { cfg.showTargetMarker = v; targetMarkerMesh.visible = v; forearmBaseMarkerMesh.visible = v })

  const subPalm = addSubgroup(content, 'Palm Facing')
  addRow(subPalm, { id: 'checkboxPalmFacesCursor', label: 'Palm Faces Cursor', type: 'checkbox' })
  document.getElementById('checkboxPalmFacesCursor').checked = cfg.palmFacesCursor
  wireCheckbox('checkboxPalmFacesCursor', (v) => { cfg.palmFacesCursor = v })
  // Rolls around the forearm's own Y axis, anchored at its base -- see
  // animate()'s own comment. Always additive onto Palm Faces Cursor's
  // own dynamic angle, matching HANDY DANDIES' own composition pattern
  // (though not its axis).
  addRow(subPalm, { id: 'sliderPalmFaceRotationOffset', label: 'Palm Face Rotation (Deg)', type: 'slider', min: -180, max: 180, step: 1, value: cfg.palmFaceRotationOffset })
  wireSlider('sliderPalmFaceRotationOffset', (v) => { cfg.palmFaceRotationOffset = v })

  // Responsive Arm Rotation at Base -- direct request 2026-09-27, see
  // cfg's own declaration comment. Control order matches the request's
  // own list exactly: On/Off, fine-tune, min/max range, curve.
  const subBaseArmRotation = addSubgroup(content, 'Responsive Arm Rotation at Base')
  addRow(subBaseArmRotation, { id: 'checkboxBaseArmRotationResponsiveEnabled', label: 'Responsive Arm Rotation at Base (On/Off)', type: 'checkbox' })
  document.getElementById('checkboxBaseArmRotationResponsiveEnabled').checked = cfg.baseArmRotationResponsiveEnabled
  wireCheckbox('checkboxBaseArmRotationResponsiveEnabled', (v) => { cfg.baseArmRotationResponsiveEnabled = v; applyBaseArmRotation(computeResponsiveBaseArmRotationDeg(armBaseDistanceT)) })
  addRow(subBaseArmRotation, { id: 'sliderBaseArmRotationFineTune', label: 'Rotation Fine-Tune (Deg)', type: 'slider', min: -90, max: 90, step: 1, value: cfg.baseArmRotationFineTune })
  wireSlider('sliderBaseArmRotationFineTune', (v) => { cfg.baseArmRotationFineTune = v; applyBaseArmRotation(computeResponsiveBaseArmRotationDeg(armBaseDistanceT)) })
  // MIGRATED 2026-09-28 -- see Reactive Arm Length's own matching comment.
  {
    let rangeDefault = { min: -180, max: 180 }
    try { rangeDefault = JSON.parse(cfg.baseArmRotationRange) } catch (e) { /* keep fallback */ }
    addRow(subBaseArmRotation, { id: 'textBaseArmRotationRange', label: 'Min / Max Rotation (Deg)', type: 'range-bar', trackMin: -180, trackMax: 180, unit: '°', defaultValue: rangeDefault })
    let lastSeenRange = document.getElementById('textBaseArmRotationRange').value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textBaseArmRotationRange')
      if (!el || el.value === lastSeenRange) return
      lastSeenRange = el.value
      cfg.baseArmRotationRange = el.value
      parseBaseArmRotationConfig()
    })
    const curveParsed = JSON.parse(cfg.baseArmRotationCurve)
    addRow(subBaseArmRotation, { id: 'textBaseArmRotationCurve', label: 'Rotation Curve (Distance -> Rotation)', type: 'curve-editor', defaultPoints: curveParsed.points, defaultMethod: curveParsed.method, caption: 'X: Cursor Distance From Arm Base / Phone Tilt (0-1)  ·  Y: Rotation Fraction (0=Min, 1=Max)' })
    let lastSeenCurve = document.getElementById('textBaseArmRotationCurve').value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textBaseArmRotationCurve')
      if (!el || el.value === lastSeenCurve) return
      lastSeenCurve = el.value
      cfg.baseArmRotationCurve = el.value
      parseBaseArmRotationConfig()
    })
  }

  // Responsive Pose Tween -- direct request 2026-09-27, see cfg's own
  // declaration comment (Default pose = DEFAULT_POSE_NAME, Target pose
  // = a picker over SAVED_POSES).
  const subPoseTween = addSubgroup(content, 'Responsive Pose Tween')
  addRow(subPoseTween, { id: 'checkboxPoseTweenResponsiveEnabled', label: 'Responsive Pose Tween (On/Off)', type: 'checkbox' })
  document.getElementById('checkboxPoseTweenResponsiveEnabled').checked = cfg.poseTweenResponsiveEnabled
  wireCheckbox('checkboxPoseTweenResponsiveEnabled', (v) => { cfg.poseTweenResponsiveEnabled = v; if (!v) applyPoseValuesToHand(cfg) })
  const poseTweenOptions = [{ value: '', text: '(choose a target pose)' }].concat(SAVED_POSES.map((p) => ({ value: p.name, text: p.name })))
  addRow(subPoseTween, { id: 'selectPoseTweenTargetPoseName', label: 'Target Pose', type: 'select', options: poseTweenOptions, value: cfg.poseTweenTargetPoseName })
  document.getElementById('selectPoseTweenTargetPoseName').value = cfg.poseTweenTargetPoseName
  wireSelect('selectPoseTweenTargetPoseName', (v) => { cfg.poseTweenTargetPoseName = v })
  // MIGRATED 2026-09-28 -- see Reactive Arm Length's own matching comment.
  {
    const curveParsed = JSON.parse(cfg.poseTweenCurve)
    addRow(subPoseTween, { id: 'textPoseTweenCurve', label: 'Tween Curve (Distance -> Tween Progress)', type: 'curve-editor', defaultPoints: curveParsed.points, defaultMethod: curveParsed.method, caption: 'X: Cursor Distance From Arm Base / Phone Tilt (0-1)  ·  Y: Tween Progress (0=Default Pose, 1=Target Pose)' })
    let lastSeenCurve = document.getElementById('textPoseTweenCurve').value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textPoseTweenCurve')
      if (!el || el.value === lastSeenCurve) return
      lastSeenCurve = el.value
      cfg.poseTweenCurve = el.value
      parsePoseTweenConfig()
    })
  }
}

// Item Selector for PHONE MODEL's own model list -- direct request
// 2026-09-29. Reuses the SAME .dp-list-picker/.dp-list-picker-item CSS
// classes this file's own hand-built preset pickers (Saved Poses/
// Cameras/Lighting/Toon/Tween, buildListPicker()) already use, for
// visual consistency -- but is its OWN, separate, hand-built widget,
// not that function reused: buildListPicker() is built around
// capturing/naming/reapplying scalar dev-panel STATE (its own Save
// button prompts for a name and calls a captureCurrent() callback) --
// it has no file-import concept at all, which is the entire point of
// this control, so reusing it would have meant bolting import logic
// onto a control never designed for it rather than a small purpose-
// built one.
let phoneModelItemSelectorParent = null // the PHONE MODEL group's own content div, cached so loadPhoneModelManifest() can re-render in place after an async manifest fetch resolves
let phoneModelItemSelectorContainer = null // the currently-rendered widget, replaced (not appended twice) on every re-render

// Per-Model Settings -- direct request 2026-09-29: "make sure all
// slider settings within the phone model group saves per model."
// Every control under PHONE MODEL (Scale/Offset, RESPONSIVE
// BEHAVIOUR - PHONE's Responsive Rotation, and its own nested
// RECURSIVE RENDER) is captured under the OLD model's own key right
// before a switch, and the NEW model's own saved values (if any) are
// restored right after -- so tuning one model's screen brightness/
// scale doesn't silently bleed onto the next model selected.
// A model never previously tuned simply keeps whatever values are
// currently showing (no entry to restore), matching how a fresh
// control naturally behaves. Deliberately excludes
// checkboxPhoneModelEnabled and the Item Selector's own hidden
// selection control -- those are properties of the FEATURE, not of
// one specific model.
//
// CORRECTED, same day: Phone Model Rotation X/Y/Z was originally
// included here too, but per direct correction ("every phone model is
// oriented the same way in regards to world XYZ. so when rotating the
// recursie rendering, the rotations should all be the same") it's
// REMOVED from this list -- Rotation stays ONE SHARED value across
// every model, same as before this feature existed, since a
// per-model default would be actively wrong given all models share
// the same base orientation. This also means the Y=180 value set
// during this session's own live diagnostic testing (investigating
// "the screen face in the Iphone 17 max pro model isnt showing up")
// is now that ONE SHARED rotation for every model, not an
// iPhone-specific override -- if that turns out wrong for other
// models, the real cause of the iPhone visibility report was likely
// something else entirely (camera framing during testing, not a
// genuine per-model orientation difference), not a reason to
// reintroduce per-model rotation.
const PHONE_MODEL_PER_MODEL_CONTROL_IDS = [
  'sliderPhoneModelScale',
  'sliderPhoneModelOffsetX', 'sliderPhoneModelOffsetY', 'sliderPhoneModelOffsetZ',
  'checkboxPhoneResponsiveRotationEnabled', 'checkboxPhoneRotationResetEnabled', 'selectPhoneRotationMode',
  'checkboxPhoneAxisXEnabled', 'sliderPhoneRotationScaleX',
  'checkboxPhoneAxisYEnabled', 'sliderPhoneRotationScaleY',
  'checkboxPhoneAxisZEnabled', 'sliderPhoneRotationScaleZ',
  'sliderPhoneResponsiveRotationFineTune', 'sliderPhoneRotationDamping',
  // CORRECTED 2026-10-01: the old shared textPhoneResponsiveRotationRange/
  // Curve ids were replaced by 9 per-axis ones (per-axis curve-editor
  // refactor) -- this list was missed at the time, left referencing ids
  // that no longer exist (a harmless no-op in capturePhoneModelPerModelSettings()'s
  // own `if (!el) return` guard, but silently meant per-model switching
  // never captured/restored Rotation's own range/curve tuning at all).
  'textPhoneRotationRangeX', 'textPhoneRotationCurveX',
  'textPhoneRotationRangeY', 'textPhoneRotationCurveY',
  'textPhoneRotationRangeZ', 'textPhoneRotationCurveZ',
  // Responsive Displace -- added 2026-09-30, same per-model treatment as
  // Responsive Rotation directly above (a smaller/lighter phone model
  // might reasonably want different displace tuning than a larger one).
  'checkboxPhoneResponsiveDisplaceEnabled', 'selectPhoneDisplaceMode',
  'checkboxPhoneDisplaceResetEnabled',
  'checkboxPhoneDisplaceAxisXEnabled', 'sliderPhoneDisplaceScaleX', 'checkboxPhoneDisplaceInvertX',
  'checkboxPhoneDisplaceAxisYEnabled', 'sliderPhoneDisplaceScaleY', 'checkboxPhoneDisplaceInvertY',
  'checkboxPhoneDisplaceAxisZEnabled', 'sliderPhoneDisplaceScaleZ', 'checkboxPhoneDisplaceInvertZ',
  'sliderPhoneDisplaceDamping', 'sliderPhoneDisplaceVelDecayRate', 'sliderPhoneDisplacePosDecayRate',
  'checkboxPhoneDisplaceStationaryGateEnabled', 'sliderPhoneDisplaceStationaryGateDegPerSec',
  'sliderPhoneDisplaceZuptAccelThresholdMps2', 'sliderPhoneDisplaceZuptDwellMs',
  // Same correction as Rotation's own, directly above: per-axis ids,
  // not the old shared pair.
  'textPhoneDisplaceRangeX', 'textPhoneDisplaceCurveX', 'sliderPhoneDisplaceXReferenceM',
  'textPhoneDisplaceRangeY', 'textPhoneDisplaceCurveY', 'sliderPhoneDisplaceYReferenceM',
  'textPhoneDisplaceRangeZ', 'textPhoneDisplaceCurveZ', 'sliderPhoneDisplaceZReferenceM',
  'checkboxScreenRenderEnabled', 'sliderScreenRecursionLevels',
  'sliderScreenRenderResolution', 'sliderScreenTextureScale',
  'textScreenLevelScaleRange', 'textScreenLevelScaleCurve',
  'sliderScreenTextureRotation', 'sliderScreenTextureScaleX',
  'sliderScreenTextureScaleY', 'checkboxScreenToScale',
  'sliderScreenTextureOffsetX', 'sliderScreenTextureOffsetY',
  'sliderScreenEmissionIntensity',
  'checkboxScreenMirrorAlternatingX', 'checkboxScreenMirrorAlternatingY',
  'checkboxScreenMirrorPhaseX', 'checkboxScreenMirrorPhaseY',
]
let phoneModelPerModelSettings = {} // { [modelFile]: { [controlId]: value } } -- persisted via hiddenPhoneModelPerModelSettings below

function capturePhoneModelPerModelSettings(modelFile) {
  if (!modelFile) return
  const snapshot = {}
  PHONE_MODEL_PER_MODEL_CONTROL_IDS.forEach((id) => {
    const el = document.getElementById(id)
    if (!el) return
    snapshot[id] = el.type === 'checkbox' ? el.checked : el.value
  })
  phoneModelPerModelSettings[modelFile] = snapshot
  persistPhoneModelPerModelSettings()
}

function applyPhoneModelPerModelSettings(modelFile) {
  const snapshot = phoneModelPerModelSettings[modelFile]
  if (!snapshot) return // never tuned before -- leave current values as-is, same as a fresh control's default
  PHONE_MODEL_PER_MODEL_CONTROL_IDS.forEach((id) => {
    const el = document.getElementById(id)
    if (!el || !(id in snapshot)) return
    if (el.type === 'checkbox') el.checked = snapshot[id]
    else el.value = snapshot[id]
    // CORRECTED 2026-09-29: this used to dispatch only 'input', on the
    // (wrong) assumption that it drives every wireSlider()/
    // wireCheckbox() callback alike. wireCheckbox() (main.js) actually
    // listens for 'change', not 'input' -- confirmed live: a checkbox's
    // .checked visually updated correctly on a model switch, but its
    // own cfg field silently never changed, since the listener that
    // writes to cfg never fired. Every checkbox in
    // PHONE_MODEL_PER_MODEL_CONTROL_IDS (Responsive Rotation On/Off,
    // the 3 per-axis enables, Rotation Reset On/Off, Recursive Render
    // On/Off, To Scale, both Mirror Alternating checkboxes) was
    // affected -- looked switched, silently wasn't. Dispatching BOTH
    // events covers wireSlider()/wireColor()/wireTextInput() (which
    // listen for 'input') and wireCheckbox() (which listens for
    // 'change') without needing to know which kind of control each id
    // is. The curve/range-bar controls (now 6 per-axis ones, 3 each for
    // Rotation and Displace, since the per-axis refactor -- was the
    // shared textPhoneResponsiveRotationRange/Curve pair) don't reliably
    // react to either dispatched event (devPanel.js's own widgets there
    // are POLLED -- see curveWidgetResyncs elsewhere in this file) but
    // DO react to their own poll tick noticing el.value changed, which
    // setting el.value above already satisfies regardless.
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

function persistPhoneModelPerModelSettings() {
  const el = document.getElementById('hiddenPhoneModelPerModelSettings')
  if (el) el.value = JSON.stringify(phoneModelPerModelSettings)
}

// Hand Model Item Selector -- visually mirrors renderPhoneModelItemSelector()
// below (same .dp-list-picker-row-container/.dp-list-picker-item CSS, same
// clickable-row pattern), deliberately narrower: no per-model settings
// capture/apply and no Import GLB flow (see HAND_MODEL_OPTIONS' own
// declaration comment for why neither has a hand-model equivalent).
//
// The hidden, Sync-participating text control mirroring the current
// selection is NOT optional polish -- it's the exact same fix 4 OTHER
// hand-built dev-panel widgets in this file already needed (curve/range
// fields, the 5 list-pickers, the Phone Model Item Selector itself, each
// documented in this project's own CLAUDE.md as a recurring bug class):
// a plain clickable <div> row is never registered with devPanel.js's
// generic capture/restore pipeline the way addRow()'s own standard
// controls automatically are, so without this the selected hand model
// would never actually survive a Sync/Reset/Undo round-trip.
let handModelItemSelectorContainer = null
function renderHandModelItemSelector(parentContent) {
  const parent = parentContent
  if (!parent) return
  if (handModelItemSelectorContainer) handModelItemSelectorContainer.remove()

  const container = document.createElement('div')
  container.className = 'dp-list-picker-row-container'
  const label = document.createElement('span')
  label.className = 'dev-label'
  label.textContent = 'Model'
  container.appendChild(label)

  const listEl = document.createElement('div')
  listEl.className = 'dp-list-picker'
  container.appendChild(listEl)

  if (!cfg.handModelFile && HAND_MODEL_OPTIONS.length) cfg.handModelFile = HAND_MODEL_OPTIONS[0].value
  const hiddenRow = addRow(container, { id: 'hiddenHandModelFile', label: 'Model File (internal)', type: 'text', inputType: 'text', value: cfg.handModelFile, skipDeviceCheckbox: true })
  hiddenRow.style.display = 'none'
  const hiddenInput = hiddenRow.querySelector('#hiddenHandModelFile')
  let lastSeenHandModelFile = hiddenInput.value
  hiddenInput.addEventListener('input', () => {
    if (hiddenInput.value === lastSeenHandModelFile) return
    lastSeenHandModelFile = hiddenInput.value
    cfg.handModelFile = hiddenInput.value
    loadHandModel(cfg.handModelFile)
    renderHandModelItemSelector(parent)
  })

  HAND_MODEL_OPTIONS.forEach((opt) => {
    const row = document.createElement('div')
    row.className = 'dp-list-picker-item' + (opt.value === cfg.handModelFile ? ' dp-list-picker-item-selected' : '')
    row.textContent = opt.text
    row.addEventListener('click', () => {
      if (opt.value === cfg.handModelFile) return
      cfg.handModelFile = opt.value
      lastSeenHandModelFile = opt.value
      hiddenInput.value = opt.value
      loadHandModel(opt.value)
      renderHandModelItemSelector(parent)
    })
    listEl.appendChild(row)
  })

  parent.appendChild(container)
  handModelItemSelectorContainer = container
}

function renderPhoneModelItemSelector(parentContent) {
  const parent = parentContent || phoneModelItemSelectorParent
  if (!parent) return // manifest resolved before the dev panel was ever built -- the next real build reads PHONE_MODEL_OPTIONS fresh anyway
  phoneModelItemSelectorParent = parent
  if (phoneModelItemSelectorContainer) phoneModelItemSelectorContainer.remove()

  const container = document.createElement('div')
  container.className = 'dp-list-picker-row-container'
  const label = document.createElement('span')
  label.className = 'dev-label'
  label.textContent = 'Model'
  container.appendChild(label)

  const listEl = document.createElement('div')
  listEl.className = 'dp-list-picker'
  container.appendChild(listEl)

  if (!cfg.phoneModelFile && PHONE_MODEL_OPTIONS.length) cfg.phoneModelFile = PHONE_MODEL_OPTIONS[0].value
  // Hidden, Sync-participating control for the CURRENT selection --
  // found missing 2026-09-29 while investigating "it isn't working
  // like before": the Item Selector's own rows are plain clickable
  // <div>s, never registered with devPanel.js's generic capture/
  // restore pipeline the way the old <select> automatically was (every
  // addRow() call auto-registers into HANDYSET_CONTROLS) -- confirmed
  // live via the real git-tracked settings file, which had
  // `selectPhoneModelFile: null` even after real Sync round-trips,
  // meaning the selected model was NEVER actually persisted and every
  // fresh load silently fell back to PHONE_MODEL_OPTIONS[0]. This
  // hidden text row rides the exact same generic pipeline every other
  // custom widget in this file uses for the same reason (see the
  // curve/range fields' own "MIGRATED"/20th-CHANGELOG-entry history).
  const hiddenRow = addRow(container, { id: 'hiddenPhoneModelFile', label: 'Model File (internal)', type: 'text', inputType: 'text', value: cfg.phoneModelFile, skipDeviceCheckbox: true })
  hiddenRow.style.display = 'none'
  // CORRECTED 2026-09-29: `container` (built above via
  // document.createElement) is still DETACHED from the live document at
  // this point -- it only gets appended to `parent` further down in this
  // function. document.getElementById() can't find an id that only
  // exists inside a detached subtree, so this threw
  // "Cannot read properties of null (reading 'value')" on every real
  // page load, which silently aborted ensureDevPanelBuilt() partway
  // through renderHandysetDevGroups() (devPanelBuilt never got set to
  // true) -- the next caller (e.g. loadRemoteSettingsOnStartup()'s own
  // explicit ensureDevPanelBuilt() call) then re-ran the WHOLE build
  // from scratch, reproducing the exact same throw at the exact same
  // point every time. Net effect: 2 real, fully-built copies of HAND
  // MODEL and PHONE MODEL (both addGroup() calls complete before this
  // line), and every group declared AFTER Phone Model in
  // renderHandysetDevGroups() (RECURSIVE RENDER, Camera, Lighting, Toon
  // Shading, Background, Ground Plane, Finger Gizmos) missing entirely
  // on BOTH attempts -- confirmed live via console error + a direct DOM
  // section dump on the real deployed site. Fixed by querying within the
  // row itself (works whether or not it's attached to `document` yet)
  // instead of a global getElementById lookup.
  const hiddenInput = hiddenRow.querySelector('#hiddenPhoneModelFile')
  let lastSeenPhoneModelFile = hiddenInput.value

  // Per-Model Settings persistence -- a hidden JSON control, same
  // Sync-participation pattern as hiddenPhoneModelFile above. Rides
  // the generic pipeline for Copy/Save/Reset/Undo; its own restore
  // listener re-parses into the in-memory phoneModelPerModelSettings
  // object whenever an EXTERNAL restore (Sync/Reset/Undo) changes it.
  const settingsRow = addRow(container, { id: 'hiddenPhoneModelPerModelSettings', label: 'Per-Model Settings (internal)', type: 'text', inputType: 'text', value: JSON.stringify(phoneModelPerModelSettings), skipDeviceCheckbox: true })
  settingsRow.style.display = 'none'
  const settingsInput = settingsRow.querySelector('#hiddenPhoneModelPerModelSettings')
  let lastSeenPerModelSettingsJson = settingsInput.value
  settingsInput.addEventListener('input', () => {
    if (settingsInput.value === lastSeenPerModelSettingsJson) return
    lastSeenPerModelSettingsJson = settingsInput.value
    try { phoneModelPerModelSettings = JSON.parse(settingsInput.value) || {} } catch (e) { /* leave whatever's already in memory */ }
  })

  // Fires on BOTH a user-driven change (the row click handler below
  // also sets .value directly) and an EXTERNAL restore (Reset/Undo/a
  // Sync-load, which devPanel.js applies by setting .value then
  // dispatching a real 'input' event) -- covers both without needing 2
  // separate code paths.
  hiddenInput.addEventListener('input', () => {
    if (hiddenInput.value === lastSeenPhoneModelFile) return
    const previousFile = cfg.phoneModelFile
    lastSeenPhoneModelFile = hiddenInput.value
    cfg.phoneModelFile = hiddenInput.value
    capturePhoneModelPerModelSettings(previousFile)
    // Deferred one macrotask: this fires from an EXTERNAL restore
    // (Sync/Reset/Undo), where devPanel.js's applyControlValues() may
    // restore hiddenPhoneModelPerModelSettings (this file's own JSON
    // dictionary) in the SAME synchronous pass, in either order --
    // reading phoneModelPerModelSettings synchronously here could see
    // a stale (pre-restore) copy if this control's own restore runs
    // first. setTimeout(fn, 0) guarantees the whole restore loop (a
    // single synchronous forEach) has finished before this reads it,
    // regardless of which control's own registration order comes first.
    setTimeout(() => applyPhoneModelPerModelSettings(cfg.phoneModelFile), 0)
    if (cfg.phoneModelEnabled) loadPhoneModel(cfg.phoneModelFile)
    renderPhoneModelItemSelector()
  })
  PHONE_MODEL_OPTIONS.forEach((opt) => {
    const row = document.createElement('div')
    row.className = 'dp-list-picker-item' + (opt.value === cfg.phoneModelFile ? ' dp-list-picker-item-selected' : '')
    row.textContent = opt.text
    row.addEventListener('click', () => {
      const previousFile = cfg.phoneModelFile
      cfg.phoneModelFile = opt.value
      lastSeenPhoneModelFile = opt.value
      hiddenInput.value = opt.value
      capturePhoneModelPerModelSettings(previousFile)
      applyPhoneModelPerModelSettings(opt.value)
      if (cfg.phoneModelEnabled) loadPhoneModel(opt.value)
      renderPhoneModelItemSelector()
    })
    listEl.appendChild(row)
  })

  const btnRow = document.createElement('div')
  btnRow.className = 'dev-buttons'
  const importBtn = document.createElement('button')
  importBtn.type = 'button'
  importBtn.textContent = 'Import GLB...'
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = '.glb'
  fileInput.style.display = 'none'
  importBtn.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0]
    fileInput.value = '' // clears the input so importing the SAME filename again later still fires a 'change' event
    if (file) importPhoneModelFile(file)
  })
  btnRow.appendChild(importBtn)
  btnRow.appendChild(fileInput)
  container.appendChild(btnRow)

  const statusEl = document.createElement('div')
  statusEl.id = 'phoneModelImportStatus'
  statusEl.style.cssText = 'font-size:11px; opacity:0.8; margin-top:4px;'
  container.appendChild(statusEl)

  parent.appendChild(container)
  phoneModelItemSelectorContainer = container
}
// Import flow, direct request 2026-09-29: "Allow me to import glb
// models, If I import a glb model with the same name as an existing
// import, provide a popup to ask if i should overwrite." Loads the
// imported file LOCALLY and instantly via a blob: URL (GLTFLoader loads
// from one exactly like any other URL) -- the import "works" for this
// session even if the upload below fails or the device is offline, a
// disclosed, deliberate degradation, not a bug. The upload then
// persists it for real via /api/upload-phone-model (Git Data API, see
// that file's own comment for why it can't just reuse save-settings.js's
// simpler Contents-API pattern), and swaps the list entry's value from
// the temporary blob: URL to the real permanent path once that commit
// actually succeeds.
async function importPhoneModelFile(file) {
  const setStatus = (msg) => { const el = document.getElementById('phoneModelImportStatus'); if (el) el.textContent = msg }
  const realPath = PHONE_MODEL_DIR + '/' + file.name
  const existing = PHONE_MODEL_OPTIONS.find((o) => o.value === realPath || o.text === file.name.replace(/\.glb$/i, ''))
  let overwrite = false
  if (existing) {
    overwrite = confirm(`"${file.name}" already exists. Overwrite it?`)
    if (!overwrite) { setStatus('Import cancelled.'); return }
  }

  const blobUrl = URL.createObjectURL(file)
  if (existing) existing.value = blobUrl
  else PHONE_MODEL_OPTIONS = PHONE_MODEL_OPTIONS.concat([{ value: blobUrl, text: file.name.replace(/\.glb$/i, '') }])
  cfg.phoneModelFile = blobUrl
  cfg.phoneModelEnabled = true
  const enabledCb = document.getElementById('checkboxPhoneModelEnabled')
  if (enabledCb) enabledCb.checked = true
  loadPhoneModel(blobUrl)
  renderPhoneModelItemSelector()
  setStatus('Loaded locally — uploading to GitHub for permanent storage…')

  try {
    const buf = await file.arrayBuffer()
    const resp = await fetch(PHONE_MODEL_MANIFEST_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Dev-Panel-Secret': DEV_PANEL_SAVE_SECRET,
        'X-Dev-Panel-Model-Filename': file.name,
        'X-Dev-Panel-Overwrite': overwrite ? 'true' : 'false'
      },
      body: buf
    })
    const body = await resp.json().catch(() => ({}))
    if (!resp.ok || body.ok !== true) throw new Error(body.error || ('HTTP ' + resp.status))
    const entry = PHONE_MODEL_OPTIONS.find((o) => o.value === blobUrl)
    if (entry) entry.value = realPath
    if (cfg.phoneModelFile === blobUrl) cfg.phoneModelFile = realPath
    setStatus('Saved to GitHub.')
    setTimeout(() => setStatus(''), 4000)
    renderPhoneModelItemSelector()
  } catch (err) {
    setStatus('GitHub upload failed (still usable locally this session): ' + err.message)
  }
}

// PHONE MODEL -- direct request 2026-09-27, a loadable smartphone GLB
// asset with its own On/Off, Model picker, Scale, Offset, Rotation, and
// (nested 2 levels: RESPONSIVE BEHAVIOUR - PHONE > Responsive Rotation)
// its own phone-tilt-driven reactive rotation. See the Phone Model
// section above (loadPhoneModel/applyPhoneModelTransform/etc.) for the
// actual scene-graph mechanics.
function renderPhoneModelGroup(content) {
  addRow(content, { id: 'checkboxPhoneModelEnabled', label: 'Phone Model On/Off', type: 'checkbox' })
  document.getElementById('checkboxPhoneModelEnabled').checked = cfg.phoneModelEnabled
  wireCheckbox('checkboxPhoneModelEnabled', (v) => { setPhoneModelEnabled(v) })

  // Item Selector (was a plain <select>) -- direct request 2026-09-29:
  // "Make the Object Model Selector a Item Selector actually. Allow me
  // to import glb models." See renderPhoneModelItemSelector()/
  // importPhoneModelFile() below.
  renderPhoneModelItemSelector(content)

  addRow(content, { id: 'sliderPhoneModelScale', label: 'Model Scale (x100)', type: 'slider', min: 0.5, max: 5, step: 'any', value: cfg.phoneModelScale })
  wireSlider('sliderPhoneModelScale', (v) => { cfg.phoneModelScale = v; applyPhoneModelTransform() })

  const subOffset = addSubgroup(content, 'OFFSET')
  addRow(subOffset, { id: 'sliderPhoneModelOffsetX', label: 'X Offset (World Units)', type: 'slider', min: -200, max: 200, step: 'any', value: cfg.phoneModelOffsetX })
  wireSlider('sliderPhoneModelOffsetX', (v) => { cfg.phoneModelOffsetX = v; applyPhoneModelTransform() })
  addRow(subOffset, { id: 'sliderPhoneModelOffsetY', label: 'Y Offset (World Units)', type: 'slider', min: -200, max: 200, step: 'any', value: cfg.phoneModelOffsetY })
  wireSlider('sliderPhoneModelOffsetY', (v) => { cfg.phoneModelOffsetY = v; applyPhoneModelTransform() })
  addRow(subOffset, { id: 'sliderPhoneModelOffsetZ', label: 'Z Offset (World Units)', type: 'slider', min: -200, max: 200, step: 'any', value: cfg.phoneModelOffsetZ })
  wireSlider('sliderPhoneModelOffsetZ', (v) => { cfg.phoneModelOffsetZ = v; applyPhoneModelTransform() })

  // Named "PHONE ROTATION", not "ROTATION" -- direct report 2026-09-27:
  // the plain name literally collided with Pose's own pre-existing
  // "ROTATION" subgroup (modelRotX/Y/Z, renderPoseGroup() above).
  // data-sid identity is flat per device tab, not scoped by parent, so
  // 2 subgroups sharing one name anywhere in the same tab is a real
  // bug, not just a cosmetic clash -- it confused devPanel.js's own
  // sectionOrder reconciliation badly enough that this group's real
  // rows ended up missing while an empty phantom "ROTATION" appeared
  // elsewhere in HAND MODEL. Any future subgroup name should be
  // checked against every OTHER addGroup()/addSubgroup() call in this
  // file first (grep for the literal string), not assumed safe just
  // because it reads fine in isolation.
  const subRotation = addSubgroup(content, 'PHONE ROTATION')
  addRow(subRotation, { id: 'sliderPhoneModelRotX', label: 'X Rotation (Deg)', type: 'slider', min: -90, max: 89, step: 1, value: cfg.phoneModelRotX })
  wireSlider('sliderPhoneModelRotX', (v) => { cfg.phoneModelRotX = v; applyPhoneModelTransform() })
  addRow(subRotation, { id: 'sliderPhoneModelRotY', label: 'Y Rotation (Deg)', type: 'slider', min: -90, max: 89, step: 1, value: cfg.phoneModelRotY })
  wireSlider('sliderPhoneModelRotY', (v) => { cfg.phoneModelRotY = v; applyPhoneModelTransform() })
  addRow(subRotation, { id: 'sliderPhoneModelRotZ', label: 'Z Rotation (Deg)', type: 'slider', min: -90, max: 89, step: 1, value: cfg.phoneModelRotZ })
  wireSlider('sliderPhoneModelRotZ', (v) => { cfg.phoneModelRotZ = v; applyPhoneModelTransform() })

  // RESPONSIVE BEHAVIOUR - PHONE (level 2, per direct correction) >
  // Responsive Rotation (level 3). On/Off, Mode, Reset, per-axis On/Off
  // + Scale, Fine-Tune, Damping, then (2026-10-01) 3 INDEPENDENT
  // Min/Max Range + Curve pairs, one per axis -- see
  // computePhoneResponsiveAxisDeg()'s own comment for the formula.
  const subResponsiveBehaviour = addSubgroup(content, 'RESPONSIVE BEHAVIOUR - PHONE')
  const subResponsiveRotation = addSubgroup(subResponsiveBehaviour, 'Responsive Rotation')
  addRow(subResponsiveRotation, { id: 'checkboxPhoneResponsiveRotationEnabled', label: 'Responsive Rotation (On/Off)', type: 'checkbox' })
  document.getElementById('checkboxPhoneResponsiveRotationEnabled').checked = cfg.phoneResponsiveRotationEnabled
  // Added 2026-09-28 (9th round on the axis-mapping feature) -- forces a
  // known-clean starting orientation (phoneGyroQuat.identity()) every
  // time this turns ON, so re-testing an axis after toggling this off
  // and back on can't silently inherit leftover accumulated rotation
  // from a previous test. See integratePhoneGyroRotation()'s own
  // comment for why this matters (3 rounds of reports proved the SAME
  // code can look like a different permutation depending on the
  // phone's starting orientation).
  wireCheckbox('checkboxPhoneResponsiveRotationEnabled', (v) => { cfg.phoneResponsiveRotationEnabled = v; if (v) resetPhoneModelRotationBaseline() })
  // Rotation Mode -- direct request 2026-09-30: a selectable alternative
  // to the existing Gyro/Integrated system, added specifically to
  // eliminate accumulated gyro-drift/path-dependence. See
  // computePhoneAbsoluteOrientationQuat()'s own comment for the full
  // reasoning. Switching to 'absolute' doesn't need a baseline reset the
  // way Gyro mode does (it's a memoryless function of the current
  // reading, nothing to re-zero) -- switching back to 'gyro' DOES still
  // benefit from one, so resetPhoneModelRotationBaseline() is called on
  // every mode change, matching the existing on-enable behavior above.
  addRow(subResponsiveRotation, { id: 'selectPhoneRotationMode', label: 'Rotation Mode', type: 'select', options: [{ value: 'gyro', text: 'Gyro / Integrated' }, { value: 'absolute', text: 'Absolute / Orientation' }], value: cfg.phoneRotationMode })
  document.getElementById('selectPhoneRotationMode').value = cfg.phoneRotationMode
  wireSelect('selectPhoneRotationMode', (v) => { cfg.phoneRotationMode = v; resetPhoneModelRotationBaseline() })
  // Rotation Reset -- direct request 2026-09-28: double-tap(mobile)/
  // double-click(desktop) anywhere on screen re-baselines the responsive
  // rotation. See setupPhoneRotationResetGesture()'s own comment for the
  // gesture-detection details.
  addRow(subResponsiveRotation, { id: 'checkboxPhoneRotationResetEnabled', label: 'Rotation Reset On/Off', type: 'checkbox' })
  document.getElementById('checkboxPhoneRotationResetEnabled').checked = cfg.phoneRotationResetEnabled
  wireCheckbox('checkboxPhoneRotationResetEnabled', (v) => { cfg.phoneRotationResetEnabled = v })
  // Per-axis on/off + scale -- direct request 2026-09-28. X=beta
  // (up/down), Y=alpha/compass (spin), Z=gamma (left/right) -- matches
  // computePhoneCombinedQuat()'s own world-axis assignment. Y now
  // applies on desktop too (direct request 2026-09-29 -- see that
  // function's own "Y axis (spin) on desktop" comment), not just
  // mobile -- same checkbox/slider, no new controls needed.
  // Scale sliders allow NEGATIVE values (direct request 2026-09-29:
  // "-1... rotate in the other direction at the same scale") -- every
  // use of these cfg fields is already a plain multiply against a
  // signed degree value, so widening the range is the only change
  // needed; a negative scale already flips direction correctly.
  addRow(subResponsiveRotation, { id: 'checkboxPhoneAxisXEnabled', label: 'X Axis Rotation On/Off', type: 'checkbox' })
  document.getElementById('checkboxPhoneAxisXEnabled').checked = cfg.phoneAxisXEnabled
  wireCheckbox('checkboxPhoneAxisXEnabled', (v) => { cfg.phoneAxisXEnabled = v })
  addRow(subResponsiveRotation, { id: 'sliderPhoneRotationScaleX', label: 'X Axis Rotation Scale (x)', type: 'slider', min: -3, max: 3, step: 'any', value: cfg.phoneRotationScaleX })
  wireSlider('sliderPhoneRotationScaleX', (v) => { cfg.phoneRotationScaleX = v })
  addRow(subResponsiveRotation, { id: 'checkboxPhoneAxisYEnabled', label: 'Y Axis Rotation On/Off', type: 'checkbox' })
  document.getElementById('checkboxPhoneAxisYEnabled').checked = cfg.phoneAxisYEnabled
  wireCheckbox('checkboxPhoneAxisYEnabled', (v) => { cfg.phoneAxisYEnabled = v })
  addRow(subResponsiveRotation, { id: 'sliderPhoneRotationScaleY', label: 'Y Axis Rotation Scale (x)', type: 'slider', min: -3, max: 3, step: 'any', value: cfg.phoneRotationScaleY })
  wireSlider('sliderPhoneRotationScaleY', (v) => { cfg.phoneRotationScaleY = v })
  addRow(subResponsiveRotation, { id: 'checkboxPhoneAxisZEnabled', label: 'Z Axis Rotation On/Off', type: 'checkbox' })
  document.getElementById('checkboxPhoneAxisZEnabled').checked = cfg.phoneAxisZEnabled
  wireCheckbox('checkboxPhoneAxisZEnabled', (v) => { cfg.phoneAxisZEnabled = v })
  addRow(subResponsiveRotation, { id: 'sliderPhoneRotationScaleZ', label: 'Z Axis Rotation Scale (x)', type: 'slider', min: -3, max: 3, step: 'any', value: cfg.phoneRotationScaleZ })
  wireSlider('sliderPhoneRotationScaleZ', (v) => { cfg.phoneRotationScaleZ = v })
  addRow(subResponsiveRotation, { id: 'sliderPhoneResponsiveRotationFineTune', label: 'Rotation Fine-Tune (Deg)', type: 'slider', min: -90, max: 90, step: 1, value: cfg.phoneResponsiveRotationFineTune })
  wireSlider('sliderPhoneResponsiveRotationFineTune', (v) => { cfg.phoneResponsiveRotationFineTune = v })
  // Added 2026-09-28, direct report: "the rotation motion is jittery and
  // not smooth." Same 1=instant/lower=smoother semantic as cfg.trackingDamping.
  addRow(subResponsiveRotation, { id: 'sliderPhoneRotationDamping', label: 'Rotation Damping (1=Instant)', type: 'slider', min: 0.05, max: 1, step: 0.01, value: cfg.phoneRotationDamping })
  wireSlider('sliderPhoneRotationDamping', (v) => { cfg.phoneRotationDamping = v })
  // Per-axis Min/Max Range + Curve -- replaces the single shared pair
  // above (MIGRATED 2026-09-28, now superseded 2026-10-01). Called once
  // explicitly right here (matching Displace's own build-time call,
  // parsePhoneResponsiveDisplaceConfig() a bit further down) so a
  // Sync-restored non-default range/curve is in effect from the first
  // frame, not just from the first time the user touches a widget --
  // see phoneRotationAxisParsed's own declaration comment.
  parsePhoneResponsiveRotationConfig()
  ;['X', 'Y', 'Z'].forEach((axis) => {
    const rangeKey = 'phoneRotationRange' + axis
    const curveKey = 'phoneRotationCurve' + axis
    let rangeDefault = { min: 0, max: 90 }
    try { rangeDefault = JSON.parse(cfg[rangeKey]) } catch (e) { /* keep fallback */ }
    // trackMin 0 (was -180), default max 90 (was 30) -- direct request
    // 2026-10-01: "make the input form 0 upwards. if i set it to 30,
    // assume it means -30 to 30. Set default to 90." The track no
    // longer offers a negative value at all; whatever `max` is set to
    // is the symmetric output ceiling in both directions (already true
    // of the underlying magnitude-then-sign formula -- see cfg's own
    // phoneRotationRangeX declaration comment).
    addRow(subResponsiveRotation, { id: 'textPhoneRotationRange' + axis, label: axis + ' Axis Min / Max Rotation (Deg, Symmetric ±)', type: 'range-bar', trackMin: 0, trackMax: 180, unit: '°', defaultValue: rangeDefault })
    let lastSeenRange = document.getElementById('textPhoneRotationRange' + axis).value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textPhoneRotationRange' + axis)
      if (!el || el.value === lastSeenRange) return
      lastSeenRange = el.value
      cfg[rangeKey] = el.value
      parsePhoneResponsiveRotationConfig()
    })
    let curveDefault = { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], method: 'catmullrom' }
    try { curveDefault = JSON.parse(cfg[curveKey]) } catch (e) { /* keep fallback */ }
    addRow(subResponsiveRotation, { id: 'textPhoneRotationCurve' + axis, label: axis + ' Axis Rotation Curve (Tilt -> Rotation)', type: 'curve-editor', defaultPoints: curveDefault.points, defaultMethod: curveDefault.method, caption: 'X: ' + axis + ' Axis Tilt Magnitude, Either Direction (0-1)  ·  Y: Rotation Fraction (0=Min, 1=Max)' })
    let lastSeenCurve = document.getElementById('textPhoneRotationCurve' + axis).value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textPhoneRotationCurve' + axis)
      if (!el || el.value === lastSeenCurve) return
      lastSeenCurve = el.value
      cfg[curveKey] = el.value
      parsePhoneResponsiveRotationConfig()
    })
  })

  // RESPONSIVE BEHAVIOUR - PHONE > RESPONSIVE DISPLACE -- added
  // 2026-09-30, direct request (per the *DC*RESPONSIVE DISPLACE* dev-
  // panel shorthand, CLAUDE.md §12g): mirrors Responsive Rotation's own
  // control set 1:1 (On/Off, a 2-mode selector, per-axis On/Off+Scale,
  // Fine-Tune, Min/Max Range, Curve, Damping) for POSITIONAL displacement
  // instead of tilt. See integratePhoneDisplacement()'s own comment for
  // the leaky double-integration math and the real, disclosed drift
  // trade-off, and computePhoneDisplaceAxisUnits()'s comment for how the
  // curve/range mapping works. parsePhoneResponsiveDisplaceConfig() is
  // called once here explicitly (unlike Rotation's own parser, which is
  // ONLY ever triggered by a detected widget-value CHANGE -- see that
  // parser's own comment) so a Sync-restored non-default range/curve is
  // actually in effect from the first frame, not just from the first time
  // the user touches the widget.
  parsePhoneResponsiveDisplaceConfig()
  const subResponsiveDisplace = addSubgroup(subResponsiveBehaviour, 'RESPONSIVE DISPLACE')
  addRow(subResponsiveDisplace, { id: 'checkboxPhoneResponsiveDisplaceEnabled', label: 'Responsive Displace (On/Off)', type: 'checkbox' })
  document.getElementById('checkboxPhoneResponsiveDisplaceEnabled').checked = cfg.phoneResponsiveDisplaceEnabled
  // Requests motion permission on enable -- ADDED 2026-09-30, now that
  // Displace is independent of Tracking Enabled (whose own checkbox used
  // to be the only thing that ever called this), enabling Displace ALONE
  // (Tracking Enabled off) needs its own trigger or mobile's real
  // devicemotion listener never gets attached at all. See
  // initMotionInput()'s own matching fix for the page-load case.
  wireCheckbox('checkboxPhoneResponsiveDisplaceEnabled', (v) => {
    cfg.phoneResponsiveDisplaceEnabled = v
    if (v) {
      requestMotionPermissionIfNeeded()
      // Avoids an initial jump if Displace happens to already be set to
      // Tilt mode the moment it's turned on -- without this, the first
      // reading would be compared against a stale/zero baseline from
      // whenever the page loaded. Harmless to call for the other 2
      // modes too (computePhoneResponsiveDisplacement() only ever reads
      // the tilt baseline while Tilt mode is actually selected).
      resetPhoneDisplaceTiltBaseline()
    }
  })
  // Displace Mode -- direct request: "i also want the 2 calclation
  // types, simialr to rotation, one with acceleration, and i guess the
  // other is the real world position." See integratePhoneDisplacement()'s
  // own comment for exactly what each mode computes. Extended 2026-10-01
  // with 2 more modes, direct follow-up after a real device log showed
  // acceleration-integration's own fundamental "push-then-stop nets to
  // ~zero displacement" limitation (see computePhoneResponsiveDisplacement()'s
  // own Tilt-mode comment for the full physics account): 'freeze' (hold
  // position once the Stationary Gate says motion has stopped, instead
  // of letting the leaky decay keep pulling it back to 0) and 'tilt'
  // (skip integration entirely -- map the CURRENT orientation angle
  // straight to displacement, driftless by construction, X/Y only). All
  // 4 options stay selectable side by side specifically so the 2 new
  // ones can be A/B tested against the original 2 on a real device,
  // per direct request: "gimne a drop down to test both as well as the
  // current system."
  addRow(subResponsiveDisplace, { id: 'selectPhoneDisplaceMode', label: 'Displace Mode', type: 'select', options: [{ value: 'acceleration', text: 'Acceleration / Local Frame' }, { value: 'worldPosition', text: 'Real World Position' }, { value: 'freeze', text: 'Freeze on Stop' }, { value: 'tilt', text: 'Tilt (Driftless, X/Y Only)' }], value: cfg.phoneDisplaceMode })
  document.getElementById('selectPhoneDisplaceMode').value = cfg.phoneDisplaceMode
  wireSelect('selectPhoneDisplaceMode', (v) => {
    cfg.phoneDisplaceMode = v
    // Re-baseline the moment Tilt is selected -- without this, switching
    // INTO Tilt mode would compare the phone's current tilt against
    // whatever stale baseline (0, or a leftover value from a previous
    // Tilt session) happened to be sitting there, causing a jump on
    // switch instead of starting cleanly at "wherever the phone already
    // is right now = 0 displacement." Harmless to call when switching to
    // a different mode too.
    resetPhoneDisplaceTiltBaseline()
  })
  // Displace Reset -- added 2026-09-30, direct request: "add a
  // displacement reset checkbox. Similar to the rotation, a double tap
  // will place the phone back in its starting location." Independently
  // toggleable from Rotation's own "Rotation Reset On/Off" -- both share
  // the SAME double-tap/double-click gesture (setupPhoneRotationResetGesture()),
  // not 2 separate gestures.
  addRow(subResponsiveDisplace, { id: 'checkboxPhoneDisplaceResetEnabled', label: 'Displace Reset On/Off', type: 'checkbox' })
  document.getElementById('checkboxPhoneDisplaceResetEnabled').checked = cfg.phoneDisplaceResetEnabled
  wireCheckbox('checkboxPhoneDisplaceResetEnabled', (v) => { cfg.phoneDisplaceResetEnabled = v })
  // Per-axis on/off + scale + invert -- X=left-right, Y=up-down,
  // Z=perpendicular to the phone face/depth (direct correction of the
  // user's own first message, which said Y for this). Matches the raw
  // W3C devicemotion.acceleration.x/y/z convention directly -- see cfg's
  // own phoneResponsiveDisplaceEnabled declaration comment for why no
  // axis reshuffling was needed here, unlike Rotation's own beta/gamma/
  // alpha mapping. Invert -- direct request: "provide me some ui to flip
  // axes. so i dont need to go through you to fix it" -- see cfg's own
  // phoneDisplaceInvertX declaration comment.
  addRow(subResponsiveDisplace, { id: 'checkboxPhoneDisplaceAxisXEnabled', label: 'X Axis Displace On/Off', type: 'checkbox' })
  document.getElementById('checkboxPhoneDisplaceAxisXEnabled').checked = cfg.phoneDisplaceAxisXEnabled
  wireCheckbox('checkboxPhoneDisplaceAxisXEnabled', (v) => { cfg.phoneDisplaceAxisXEnabled = v })
  addRow(subResponsiveDisplace, { id: 'sliderPhoneDisplaceScaleX', label: 'X Axis Displace Scale (x)', type: 'slider', min: -3, max: 3, step: 'any', value: cfg.phoneDisplaceScaleX })
  wireSlider('sliderPhoneDisplaceScaleX', (v) => { cfg.phoneDisplaceScaleX = v })
  addRow(subResponsiveDisplace, { id: 'checkboxPhoneDisplaceInvertX', label: 'Invert X Axis Displace', type: 'checkbox' })
  document.getElementById('checkboxPhoneDisplaceInvertX').checked = cfg.phoneDisplaceInvertX
  wireCheckbox('checkboxPhoneDisplaceInvertX', (v) => { cfg.phoneDisplaceInvertX = v })
  addRow(subResponsiveDisplace, { id: 'checkboxPhoneDisplaceAxisYEnabled', label: 'Y Axis Displace On/Off', type: 'checkbox' })
  document.getElementById('checkboxPhoneDisplaceAxisYEnabled').checked = cfg.phoneDisplaceAxisYEnabled
  wireCheckbox('checkboxPhoneDisplaceAxisYEnabled', (v) => { cfg.phoneDisplaceAxisYEnabled = v })
  addRow(subResponsiveDisplace, { id: 'sliderPhoneDisplaceScaleY', label: 'Y Axis Displace Scale (x)', type: 'slider', min: -3, max: 3, step: 'any', value: cfg.phoneDisplaceScaleY })
  wireSlider('sliderPhoneDisplaceScaleY', (v) => { cfg.phoneDisplaceScaleY = v })
  addRow(subResponsiveDisplace, { id: 'checkboxPhoneDisplaceInvertY', label: 'Invert Y Axis Displace', type: 'checkbox' })
  document.getElementById('checkboxPhoneDisplaceInvertY').checked = cfg.phoneDisplaceInvertY
  wireCheckbox('checkboxPhoneDisplaceInvertY', (v) => { cfg.phoneDisplaceInvertY = v })
  addRow(subResponsiveDisplace, { id: 'checkboxPhoneDisplaceAxisZEnabled', label: 'Z Axis Displace On/Off (Perpendicular To Face)', type: 'checkbox' })
  document.getElementById('checkboxPhoneDisplaceAxisZEnabled').checked = cfg.phoneDisplaceAxisZEnabled
  wireCheckbox('checkboxPhoneDisplaceAxisZEnabled', (v) => { cfg.phoneDisplaceAxisZEnabled = v })
  addRow(subResponsiveDisplace, { id: 'sliderPhoneDisplaceScaleZ', label: 'Z Axis Displace Scale (x)', type: 'slider', min: -3, max: 3, step: 'any', value: cfg.phoneDisplaceScaleZ })
  wireSlider('sliderPhoneDisplaceScaleZ', (v) => { cfg.phoneDisplaceScaleZ = v })
  addRow(subResponsiveDisplace, { id: 'checkboxPhoneDisplaceInvertZ', label: 'Invert Z Axis Displace', type: 'checkbox' })
  document.getElementById('checkboxPhoneDisplaceInvertZ').checked = cfg.phoneDisplaceInvertZ
  wireCheckbox('checkboxPhoneDisplaceInvertZ', (v) => { cfg.phoneDisplaceInvertZ = v })
  addRow(subResponsiveDisplace, { id: 'sliderPhoneDisplaceDamping', label: 'Displace Damping (1=Instant)', type: 'slider', min: 0.05, max: 1, step: 0.01, value: cfg.phoneDisplaceDamping })
  wireSlider('sliderPhoneDisplaceDamping', (v) => { cfg.phoneDisplaceDamping = v })
  addRow(subResponsiveDisplace, { id: 'sliderPhoneDisplaceVelDecayRate', label: 'Displace Velocity Decay Rate (1/s)', type: 'slider', min: 0.5, max: 10, step: 0.1, value: cfg.phoneDisplaceVelDecayRate })
  wireSlider('sliderPhoneDisplaceVelDecayRate', (v) => { cfg.phoneDisplaceVelDecayRate = v })
  addRow(subResponsiveDisplace, { id: 'sliderPhoneDisplacePosDecayRate', label: 'Displace Position Decay Rate (1/s)', type: 'slider', min: 0.02, max: 5, step: 0.01, value: cfg.phoneDisplacePosDecayRate })
  wireSlider('sliderPhoneDisplacePosDecayRate', (v) => { cfg.phoneDisplacePosDecayRate = v })
  addRow(subResponsiveDisplace, { id: 'checkboxPhoneDisplaceStationaryGateEnabled', label: 'Stationary Gate (Suppress Drift When Still)', type: 'checkbox' })
  document.getElementById('checkboxPhoneDisplaceStationaryGateEnabled').checked = cfg.phoneDisplaceStationaryGateEnabled
  wireCheckbox('checkboxPhoneDisplaceStationaryGateEnabled', (v) => { cfg.phoneDisplaceStationaryGateEnabled = v })
  addRow(subResponsiveDisplace, { id: 'sliderPhoneDisplaceStationaryGateDegPerSec', label: 'Stationary Gate Threshold (Deg/s)', type: 'slider', min: 0.1, max: 10, step: 0.1, value: cfg.phoneDisplaceStationaryGateDegPerSec })
  wireSlider('sliderPhoneDisplaceStationaryGateDegPerSec', (v) => { cfg.phoneDisplaceStationaryGateDegPerSec = v })
  // ZUPT upgrade -- 2 new controls alongside the existing Stationary
  // Gate, direct request after real device data showed the gyro-only
  // gate let residual velocity leak into position with nothing to
  // correct it. See cfg.phoneDisplaceZuptAccelThresholdMps2's own
  // declaration comment for the full reasoning.
  addRow(subResponsiveDisplace, { id: 'sliderPhoneDisplaceZuptAccelThresholdMps2', label: 'ZUPT Accel Threshold (m/s^2)', type: 'slider', min: 0.1, max: 3, step: 0.05, value: cfg.phoneDisplaceZuptAccelThresholdMps2 })
  wireSlider('sliderPhoneDisplaceZuptAccelThresholdMps2', (v) => { cfg.phoneDisplaceZuptAccelThresholdMps2 = v })
  addRow(subResponsiveDisplace, { id: 'sliderPhoneDisplaceZuptDwellMs', label: 'ZUPT Dwell Time (Ms)', type: 'slider', min: 0, max: 500, step: 10, value: cfg.phoneDisplaceZuptDwellMs })
  wireSlider('sliderPhoneDisplaceZuptDwellMs', (v) => { cfg.phoneDisplaceZuptDwellMs = v })
  // Per-axis Min/Max Range + Curve + Reference -- added 2026-10-01,
  // replacing the single shared Range/Curve pair above (one X/Y/Z
  // magnitude run through one shared curve). Each axis now gets its own
  // Range-bar (output magnitude bounds), Curve-editor (X: how far along
  // that axis's own Reference the real movement is, 0-1 · Y: output
  // fraction between Min and Max), and a Reference slider (the real
  // displacement distance in meters that reads as curve-X=1.0) -- see
  // computePhoneDisplaceAxisUnits()'s own comment for the exact formula
  // and phoneDisplaceAxisParsed's own declaration for the parsed-state
  // shape this writes into via parsePhoneResponsiveDisplaceConfig().
  ;['X', 'Y', 'Z'].forEach((axis) => {
    const rangeKey = 'phoneDisplaceRange' + axis
    const curveKey = 'phoneDisplaceCurve' + axis
    const refKey = 'phoneDisplace' + axis + 'ReferenceM'
    let rangeDefault = { min: 0, max: 20 }
    try { rangeDefault = JSON.parse(cfg[rangeKey]) } catch (e) { /* keep fallback */ }
    addRow(subResponsiveDisplace, { id: 'textPhoneDisplaceRange' + axis, label: axis + ' Axis Min / Max Displacement (World Units)', type: 'range-bar', trackMin: -100, trackMax: 100, unit: '', defaultValue: rangeDefault })
    let lastSeenRange = document.getElementById('textPhoneDisplaceRange' + axis).value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textPhoneDisplaceRange' + axis)
      if (!el || el.value === lastSeenRange) return
      lastSeenRange = el.value
      cfg[rangeKey] = el.value
      parsePhoneResponsiveDisplaceConfig()
    })
    let curveDefault = { points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], method: 'monotone' }
    try { curveDefault = JSON.parse(cfg[curveKey]) } catch (e) { /* keep fallback */ }
    addRow(subResponsiveDisplace, { id: 'textPhoneDisplaceCurve' + axis, label: axis + ' Axis Displacement Curve (Movement -> Displace)', type: 'curve-editor', defaultPoints: curveDefault.points, defaultMethod: curveDefault.method, caption: 'X: Movement / ' + axis + ' Reference (0-1)  ·  Y: Displacement Fraction (0=Min, 1=Max)' })
    let lastSeenCurve = document.getElementById('textPhoneDisplaceCurve' + axis).value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textPhoneDisplaceCurve' + axis)
      if (!el || el.value === lastSeenCurve) return
      lastSeenCurve = el.value
      cfg[curveKey] = el.value
      parsePhoneResponsiveDisplaceConfig()
    })
    addRow(subResponsiveDisplace, { id: 'sliderPhoneDisplace' + axis + 'ReferenceM', label: axis + ' Axis Reference Distance (M, = Curve X:1.0)', type: 'slider', min: 0.02, max: 2, step: 0.01, value: cfg[refKey] })
    wireSlider('sliderPhoneDisplace' + axis + 'ReferenceM', (v) => { cfg[refKey] = v })
  })

  // CORRECTED 2026-09-29, direct request: "The recurrsive render group
  // should be int he phone model group under the repsonsive behaviour
  // group" -- moved from a top-level sibling group (its original
  // placement, see renderRecursiveRenderGroup()'s own header comment
  // for that history) to a subgroup of RESPONSIVE BEHAVIOUR - PHONE.
  // Its own title-bar On/Off toggle (makeDevGroupToggleable()) used to
  // require a top-level group -- rather than silently lose that
  // feature or refuse the move, devPanel.js's makeDevGroupToggleable()
  // itself was widened to work at any nesting depth (see its own
  // comment), the same fix shape window.findGroupContent() already got
  // via findNestedGroupContent() for a different reason.
  renderRecursiveRenderGroup(addSubgroup(subResponsiveBehaviour, 'RECURSIVE RENDER'))
}

// RECURSIVE RENDER -- toggleable group (direct request 2026-09-29:
// "place them in a new toggleable group called 'RECURSIVE RENDER'").
// CORRECTED, same day: originally built as its own TOP-LEVEL group
// specifically because devPanel.js's own makeDevGroupToggleable() only
// looked up its title via a direct-child selector -- per a later direct
// request ("The recurrsive render group should be int he phone model
// group under the repsonsive behaviour group") it's now nested inside
// PHONE MODEL > RESPONSIVE BEHAVIOUR - PHONE instead (see its own call
// site, renderPhoneModelGroup()). Rather than lose its title-bar On/Off
// toggle to make that nesting possible, makeDevGroupToggleable() itself
// was generalized to work at any depth (its own comment) -- the same
// fix shape window.findGroupContent() already got via
// findNestedGroupContent() for group CONTENT lookups.
function renderRecursiveRenderGroup(content) {
  addRow(content, { id: 'checkboxScreenRenderEnabled', label: 'Recursive Render On/Off', type: 'checkbox' })
  document.getElementById('checkboxScreenRenderEnabled').checked = cfg.screenRenderEnabled
  wireCheckbox('checkboxScreenRenderEnabled', (v) => { setScreenRenderEnabled(v) })
  addRow(content, { id: 'sliderScreenRecursionLevels', label: 'Recursion Levels', type: 'slider', min: 1, max: 10, step: 1, value: cfg.screenRecursionLevels })
  wireSlider('sliderScreenRecursionLevels', (v) => { cfg.screenRecursionLevels = v })
  addRow(content, { id: 'sliderScreenRenderResolution', label: 'Render Resolution (%)', type: 'slider', min: 10, max: 200, step: 5, value: cfg.screenRenderResolution })
  wireSlider('sliderScreenRenderResolution', (v) => { cfg.screenRenderResolution = v })
  // Texture transform controls -- direct request 2026-09-29.
  addRow(content, { id: 'sliderScreenTextureScale', label: 'Texture Scale (x)', type: 'slider', min: 0.1, max: 5, step: 'any', value: cfg.screenTextureScale })
  wireSlider('sliderScreenTextureScale', (v) => { cfg.screenTextureScale = v })
  // Per-Level Scale (Min/Max + Curve) -- direct request 2026-09-29, see
  // cfg.screenLevelScaleRange's own comment. Multiplies into Texture
  // Scale above rather than replacing it (see computeScreenLevelScale()).
  {
    let levelRangeDefault = { min: 1, max: 1 }
    try { levelRangeDefault = JSON.parse(cfg.screenLevelScaleRange) } catch (e) { /* keep fallback */ }
    addRow(content, { id: 'textScreenLevelScaleRange', label: 'Min / Max Scale (Per Level)', type: 'range-bar', trackMin: 0, trackMax: 5, unit: 'x', defaultValue: levelRangeDefault })
    let lastSeenLevelScaleRange = document.getElementById('textScreenLevelScaleRange').value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textScreenLevelScaleRange')
      if (!el || el.value === lastSeenLevelScaleRange) return
      lastSeenLevelScaleRange = el.value
      cfg.screenLevelScaleRange = el.value
      parseScreenLevelScaleConfig()
    })
    const levelCurveParsed = JSON.parse(cfg.screenLevelScaleCurve)
    addRow(content, { id: 'textScreenLevelScaleCurve', label: 'Scale Curve (Level -> Scale)', type: 'curve-editor', defaultPoints: levelCurveParsed.points, defaultMethod: levelCurveParsed.method, caption: 'X: Recursion Level (Left=First, Right=Last)  ·  Y: Scale Fraction (0=Min, 1=Max)' })
    let lastSeenLevelScaleCurve = document.getElementById('textScreenLevelScaleCurve').value
    curveWidgetResyncs.push(() => {
      const el = document.getElementById('textScreenLevelScaleCurve')
      if (!el || el.value === lastSeenLevelScaleCurve) return
      lastSeenLevelScaleCurve = el.value
      cfg.screenLevelScaleCurve = el.value
      parseScreenLevelScaleConfig()
    })
  }
  addRow(content, { id: 'sliderScreenTextureRotation', label: 'Texture Rotation (Deg)', type: 'slider', min: -180, max: 180, step: 1, value: cfg.screenTextureRotation })
  wireSlider('sliderScreenTextureRotation', (v) => { cfg.screenTextureRotation = v })
  addRow(content, { id: 'sliderScreenTextureOffsetX', label: 'Texture X Offset', type: 'slider', min: -1, max: 1, step: 'any', value: cfg.screenTextureOffsetX })
  wireDeviceSlider('sliderScreenTextureOffsetX', 'screenTextureOffsetX')
  wireDeviceSliderMirror('sliderScreenTextureOffsetX', 'screenTextureOffsetX')
  addRow(content, { id: 'sliderScreenTextureOffsetY', label: 'Texture Y Offset', type: 'slider', min: -1, max: 1, step: 'any', value: cfg.screenTextureOffsetY })
  wireDeviceSlider('sliderScreenTextureOffsetY', 'screenTextureOffsetY')
  wireDeviceSliderMirror('sliderScreenTextureOffsetY', 'screenTextureOffsetY')
  addRow(content, { id: 'sliderScreenTextureScaleX', label: 'Texture X Scale (x)', type: 'slider', min: 0.1, max: 5, step: 'any', value: cfg.screenTextureScaleX })
  wireDeviceSlider('sliderScreenTextureScaleX', 'screenTextureScaleX')
  wireDeviceSliderMirror('sliderScreenTextureScaleX', 'screenTextureScaleX')
  addRow(content, { id: 'sliderScreenTextureScaleY', label: 'Texture Y Scale (x)', type: 'slider', min: 0.1, max: 5, step: 'any', value: cfg.screenTextureScaleY })
  wireDeviceSlider('sliderScreenTextureScaleY', 'screenTextureScaleY')
  wireDeviceSliderMirror('sliderScreenTextureScaleY', 'screenTextureScaleY')
  // Emission Intensity -- direct report: "When i use the Pixel 9A
  // model, the screen is very dim." See cfg.screenEmissionIntensity's
  // own comment for why this multiplies .color rather than a real
  // .emissiveIntensity (phoneScreenRenderMaterial is an unlit
  // MeshBasicMaterial, which has no emissive property at all).
  addRow(content, { id: 'sliderScreenEmissionIntensity', label: 'Screen Emission Intensity (x)', type: 'slider', min: 0, max: 5, step: 0.05, value: cfg.screenEmissionIntensity })
  wireSlider('sliderScreenEmissionIntensity', (v) => { cfg.screenEmissionIntensity = v })
  // Mirror Alternating X/Y -- direct request: "provide me 2 checkboxes.
  // If checked it will mirror alternating in the x axis, and another
  // for the y axis." See applyScreenTextureTransform()'s own comment
  // for the parity logic these actually drive.
  addRow(content, { id: 'checkboxScreenMirrorAlternatingX', label: 'Mirror Alternating (X Axis)', type: 'checkbox' })
  document.getElementById('checkboxScreenMirrorAlternatingX').checked = cfg.screenMirrorAlternatingX
  wireCheckbox('checkboxScreenMirrorAlternatingX', (v) => { cfg.screenMirrorAlternatingX = v })
  addRow(content, { id: 'checkboxScreenMirrorAlternatingY', label: 'Mirror Alternating (Y Axis)', type: 'checkbox' })
  document.getElementById('checkboxScreenMirrorAlternatingY').checked = cfg.screenMirrorAlternatingY
  wireCheckbox('checkboxScreenMirrorAlternatingY', (v) => { cfg.screenMirrorAlternatingY = v })
  // Mirror Order/Phase X/Y -- direct request 2026-09-29: "add 2
  // checkboxes, 1 for each axis. It will determine the mirroring
  // order. so if off, it maybe 010101, when on it will be 101010
  // etc." See applyScreenTextureTransform()'s own comment for the
  // depth-parity logic these flip.
  addRow(content, { id: 'checkboxScreenMirrorPhaseX', label: 'Mirror Order (X Axis)', type: 'checkbox' })
  document.getElementById('checkboxScreenMirrorPhaseX').checked = cfg.screenMirrorPhaseX
  wireCheckbox('checkboxScreenMirrorPhaseX', (v) => { cfg.screenMirrorPhaseX = v })
  addRow(content, { id: 'checkboxScreenMirrorPhaseY', label: 'Mirror Order (Y Axis)', type: 'checkbox' })
  document.getElementById('checkboxScreenMirrorPhaseY').checked = cfg.screenMirrorPhaseY
  wireCheckbox('checkboxScreenMirrorPhaseY', (v) => { cfg.screenMirrorPhaseY = v })
  // "To Scale" -- direct report: "whenever my actual browser size is
  // different from the model mesh size, the rendered image gets scaled
  // incorrectly." Locks the X/Y Scale sliders (setSliderLocked(), same
  // helper Camera Lock Pan/Zoom/Rotate already uses) while on, since
  // their effective value is computed automatically instead -- see
  // applyScreenTextureTransform()'s own comment.
  addRow(content, { id: 'checkboxScreenToScale', label: 'To Scale (Lock X/Y to Live Aspect)', type: 'checkbox' })
  document.getElementById('checkboxScreenToScale').checked = cfg.screenToScaleEnabled
  wireCheckbox('checkboxScreenToScale', (v) => { cfg.screenToScaleEnabled = v; syncScreenToScaleLock() })
  syncScreenToScaleLock()
  // Moves checkboxScreenRenderEnabled into the group's own title bar and
  // dims the rest of the group while off -- must run after the rows
  // above are actually in the DOM, which they are by this point.
  if (typeof window.makeDevGroupToggleable === 'function') window.makeDevGroupToggleable('desktop', 'RECURSIVE RENDER', 'checkboxScreenRenderEnabled')
}
function syncScreenToScaleLock() {
  setSliderLocked('sliderScreenTextureScaleX', cfg.screenToScaleEnabled)
  setSliderLocked('sliderScreenTextureScaleY', cfg.screenToScaleEnabled)
}

function renderLightingGroup(content) {
  addRow(content, { id: 'sliderKeyAzimuth', label: 'Key Light Azimuth (Deg)', type: 'slider', min: 0, max: 360, step: 1, value: cfg.keyAzimuth })
  wireSlider('sliderKeyAzimuth', (v) => { cfg.keyAzimuth = v; updateKeyLightPosition() })
  addRow(content, { id: 'sliderKeyElevation', label: 'Key Light Elevation (Deg)', type: 'slider', min: -89, max: 89, step: 1, value: cfg.keyElevation })
  wireSlider('sliderKeyElevation', (v) => { cfg.keyElevation = v; updateKeyLightPosition() })
  addRow(content, { id: 'sliderKeyTargetHeight', label: 'Key Light Aim Height (%)', type: 'slider', min: -100, max: 100, step: 1, value: cfg.keyTargetHeight })
  wireSlider('sliderKeyTargetHeight', (v) => { cfg.keyTargetHeight = v; updateKeyLightPosition() })
  addRow(content, { id: 'sliderKeyIntensity', label: 'Key Light Intensity (x)', type: 'slider', min: 0, max: 6, step: 0.1, value: cfg.keyIntensity })
  wireSlider('sliderKeyIntensity', (v) => { cfg.keyIntensity = v; keyLight.intensity = v })
  addRow(content, { id: 'colorKeyColor', label: 'Key Light Color', type: 'color', value: cfg.keyColor })
  wireColor('colorKeyColor', (v) => { cfg.keyColor = v; keyLight.color.set(v) })
  addRow(content, { id: 'sliderAmbientIntensity', label: 'Ambient Intensity (x)', type: 'slider', min: 0, max: 3, step: 0.05, value: cfg.ambientIntensity })
  wireSlider('sliderAmbientIntensity', (v) => { cfg.ambientIntensity = v; hemiLight.intensity = v })
  addRow(content, { id: 'colorAmbientSkyColor', label: 'Ambient Sky Color', type: 'color', value: cfg.ambientSkyColor })
  wireColor('colorAmbientSkyColor', (v) => { cfg.ambientSkyColor = v; hemiLight.color.set(v) })
  addRow(content, { id: 'colorAmbientGroundColor', label: 'Ambient Ground Color', type: 'color', value: cfg.ambientGroundColor })
  wireColor('colorAmbientGroundColor', (v) => { cfg.ambientGroundColor = v; hemiLight.groundColor.set(v) })
  renderPresetPicker(content, 'Saved Lighting', SAVED_LIGHTING, DEFAULT_LIGHTING_NAME, applyLightingPreset, captureLightingFromLive, { defaultFieldKey: 'defaultLighting', storageKey: 'lighting' })
}

function renderToonGroup(content) {
  addRow(content, { id: 'sliderToonSteps', label: 'Toon Steps (Count)', type: 'slider', min: 2, max: 6, step: 1, value: cfg.toonSteps })
  wireSlider('sliderToonSteps', (v) => { cfg.toonSteps = v; rebuildGradientMap() })
  addRow(content, { id: 'sliderToonStepThreshold', label: 'Toon Step Threshold (Bias)', type: 'slider', min: 0.2, max: 5, step: 0.05, value: cfg.toonStepThreshold })
  wireSlider('sliderToonStepThreshold', (v) => { cfg.toonStepThreshold = v; rebuildGradientMap() })
  addRow(content, { id: 'sliderToonShadowFloor', label: 'Toon Shadow Floor (%)', type: 'slider', min: 0, max: 90, step: 1, value: cfg.toonShadowFloor })
  wireSlider('sliderToonShadowFloor', (v) => { cfg.toonShadowFloor = v; rebuildGradientMap() })
  addRow(content, { id: 'sliderToonLightCeiling', label: 'Toon Light Ceiling (%)', type: 'slider', min: 10, max: 100, step: 1, value: cfg.toonLightCeiling })
  wireSlider('sliderToonLightCeiling', (v) => { cfg.toonLightCeiling = v; rebuildGradientMap() })
  addRow(content, { id: 'colorToonBaseTint', label: 'Toon Base Tint', type: 'color', value: cfg.toonBaseTint })
  wireColor('colorToonBaseTint', (v) => { cfg.toonBaseTint = v; hands.forEach((h) => h.skinnedMesh.material.color.set(v)) })
  // Rim-light + texture/duotone-tint controls — ported from HANDY DANDIES'
  // own createToonMaterial() shader injection (added this round; the
  // first build's Toon Shading group didn't have these at all).
  addRow(content, { id: 'sliderTextureInfluence', label: 'Texture Influence (%)', type: 'slider', min: 0, max: 100, step: 1, value: cfg.textureInfluence })
  wireSlider('sliderTextureInfluence', (v) => { cfg.textureInfluence = v; setToonUniform('textureInfluence', v / 100) })
  addRow(content, { id: 'colorToonTint', label: 'Toon Texture Tint', type: 'color', value: cfg.toonTint })
  wireColor('colorToonTint', (v) => { cfg.toonTint = v; setToonUniform('toonTint', new THREE.Color(v)) })
  addRow(content, { id: 'sliderRimIntensity', label: 'Rim Light Intensity (x)', type: 'slider', min: 0, max: 3, step: 0.05, value: cfg.rimIntensity })
  wireSlider('sliderRimIntensity', (v) => { cfg.rimIntensity = v; setToonUniform('rimIntensity', v) })
  addRow(content, { id: 'sliderRimPower', label: 'Rim Light Power (x)', type: 'slider', min: 0.5, max: 8, step: 0.1, value: cfg.rimPower })
  wireSlider('sliderRimPower', (v) => { cfg.rimPower = v; setToonUniform('rimPower', v) })
  addRow(content, { id: 'colorRimColor', label: 'Rim Light Color', type: 'color', value: cfg.rimColor })
  wireColor('colorRimColor', (v) => { cfg.rimColor = v; setToonUniform('rimColor', new THREE.Color(v)) })

  // Outline subgroup removed per direct request ("Remove Outline settings
  // group. I dont need that.") — outlinePass itself stays permanently
  // disabled (cfg.outlineEnabled's own literal default, never toggled by
  // anything now) rather than removing the composer pass entirely, so
  // removing this is a pure UI/config change, not a rendering-pipeline one.

  renderPresetPicker(content, 'Saved Toon Shading', SAVED_TOON, null, applyToonPreset, captureToonFromCfg, { exportable: true, importable: true, defaultFieldKey: 'defaultToon', storageKey: 'toon' })
}

// Ordered multi-select widget — ported concept from Hando's own
// buildMultiSelectRow()/renderMultiSelectRows() (devPanel.js there): a
// reorderable vertical list of per-row pose dropdowns (or Hold entries),
// with "+ Add"/"+ Hold" above and a "Remove" button per row. Re-implemented
// from scratch against this project's own real devPanel.js API (Hando's
// own buildGroupedDropdown()/setupReorder()/commit() infra isn't part of
// the raw template this project is built on) using native HTML5 drag-and-
// drop for reordering rather than Hando's own pointer-capture-based
// engine drag system — a deliberate, disclosed simplification of the
// REORDER MECHANISM only; the actual UI/interaction shape (dropdown-per-
// row, Hold entries, +Add defaulting to "whatever comes after the
// previous row's pick", +Hold defaulting to the last Hold's own percent)
// matches Hando's exactly.
function buildMultiSelectWidget(content, opts) {
  const container = document.createElement('div')
  container.className = 'dp-multi-select-row-container'
  const addBtnRow = document.createElement('div')
  // Also 'dev-buttons' (the same class Save/Overwrite/Use/etc. use on the
  // list-picker above) so "+ Add"/"+ Hold" get the panel's own real
  // button styling instead of default browser white/gray -- direct
  // request ("currently they are default white/gray buttons... match
  // hando"), which itself uses this exact same template-driven look.
  addBtnRow.className = 'dp-multi-select-add-row dev-buttons'
  const addBtn = document.createElement('button'); addBtn.type = 'button'; addBtn.textContent = '+ Add'
  const holdBtn = document.createElement('button'); holdBtn.type = 'button'; holdBtn.textContent = '+ Hold'
  addBtnRow.append(addBtn, holdBtn)
  container.appendChild(addBtnRow)
  const listEl = document.createElement('div')
  listEl.className = 'dp-multi-select-list'
  container.appendChild(listEl)
  content.appendChild(container)

  function render() {
    listEl.innerHTML = ''
    opts.values.forEach((val, i) => {
      const row = document.createElement('div')
      row.className = 'dp-multi-select-row'
      row.draggable = true
      const handle = document.createElement('span')
      handle.className = 'dp-multi-select-row-handle'
      handle.textContent = '⠿'
      row.appendChild(handle)
      const removeBtn = document.createElement('button')
      removeBtn.type = 'button'; removeBtn.textContent = 'Remove'
      removeBtn.addEventListener('click', () => { opts.values.splice(i, 1); opts.onChange(opts.values); render() })
      if (isHoldEntry(val)) {
        row.classList.add('dp-multi-select-hold-row')
        const label = document.createElement('span')
        label.className = 'dp-multi-select-hold-label'
        label.textContent = 'Hold'
        const slider = document.createElement('input')
        slider.type = 'range'; slider.min = 0; slider.max = 100; slider.step = 1; slider.value = val.percent
        const numInput = document.createElement('input')
        numInput.type = 'text'; numInput.value = val.percent
        const apply = (v) => {
          v = parseFloat(v)
          if (isNaN(v)) return
          v = Math.max(0, v)
          slider.value = Math.min(v, 100)
          numInput.value = v
          opts.values[i] = { type: 'hold', percent: v }
          opts.onChange(opts.values)
        }
        slider.addEventListener('input', () => apply(slider.value))
        numInput.addEventListener('change', () => apply(numInput.value))
        row.append(label, slider, numInput, removeBtn)
      } else {
        const select = document.createElement('select')
        opts.options().forEach((o) => { const el = document.createElement('option'); el.value = o.value; el.textContent = o.text; select.appendChild(el) })
        select.value = val
        select.addEventListener('change', () => { opts.values[i] = select.value; opts.onChange(opts.values) })
        row.append(select, removeBtn)
      }
      row.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); row.classList.add('dragging') })
      row.addEventListener('dragend', () => row.classList.remove('dragging'))
      row.addEventListener('dragover', (e) => e.preventDefault())
      row.addEventListener('drop', (e) => {
        e.preventDefault()
        const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10)
        if (isNaN(fromIdx) || fromIdx === i) return
        const [moved] = opts.values.splice(fromIdx, 1)
        opts.values.splice(i, 0, moved)
        opts.onChange(opts.values)
        render()
      })
      listEl.appendChild(row)
    })
  }
  addBtn.addEventListener('click', () => {
    const names = opts.options().map((o) => o.value)
    const prevValue = opts.values[opts.values.length - 1]
    const prevIndex = names.indexOf(prevValue)
    const next = prevIndex >= 0 ? names[Math.min(prevIndex + 1, names.length - 1)] : names[0]
    opts.values.push(next || '')
    opts.onChange(opts.values)
    render()
  })
  holdBtn.addEventListener('click', () => {
    const lastHold = opts.values.slice().reverse().find(isHoldEntry)
    opts.values.push({ type: 'hold', percent: lastHold ? lastHold.percent : 25 })
    opts.onChange(opts.values)
    render()
  })
  render()
}

function renderTweenGroup(content) {
  buildMultiSelectWidget(content, {
    values: cfg.tweenPoses,
    options: () => SAVED_POSES.map((p) => ({ value: p.name, text: p.name })),
    onChange: () => { applyTweenAtT(cfg.tweenT) }
  })
  addRow(content, { id: 'sliderTweenT', label: 'Tween (0=First, 1=Last)', type: 'slider', min: 0, max: 1, step: 0.001, value: cfg.tweenT })
  wireSlider('sliderTweenT', (v) => { cfg.tweenT = v; applyTweenAtT(v) })
  addRow(content, { id: 'sliderTweenFrameCount', label: 'Export Frame Count', type: 'slider', min: 1, max: 30, step: 1, value: cfg.tweenFrameCount })
  wireSlider('sliderTweenFrameCount', (v) => { cfg.tweenFrameCount = v })
  addRow(content, { id: 'textExportFramePrefix', label: 'Export Filename Prefix', type: 'text', inputType: 'text', value: cfg.exportFramePrefix })
  document.getElementById('textExportFramePrefix').addEventListener('change', (e) => { cfg.exportFramePrefix = e.target.value })

  renderPresetPicker(content, 'Saved Tween Sequences', SAVED_TWEEN_SEQUENCES, null,
    (item) => { cfg.tweenPoses = (item.tweenPoses || []).slice(); applyTweenAtT(cfg.tweenT) },
    () => ({ tweenPoses: cfg.tweenPoses.slice() }),
    { storageKey: 'tweenSequences' })

  const exportBtnRow = document.createElement('div'); exportBtnRow.className = 'dev-buttons'
  const exportBtn = document.createElement('button'); exportBtn.type = 'button'; exportBtn.textContent = 'Export Tween PNG Sequence'
  exportBtnRow.appendChild(exportBtn); content.appendChild(exportBtnRow)
  exportBtn.addEventListener('click', () => exportTweenSequence(exportBtn))
}

// =======================================================================
// Device Information (Debug -> Settings) — client-side-only diagnostic
// display of whatever the browser's own User-Agent Client Hints (or,
// absent that, the traditional User-Agent string) actually expose about
// the visiting device. Never sent to a server, never persisted beyond the
// normal dev-panel settings blob, no fingerprinting. See
// src/deviceInfo.js for the detection logic itself.
// =======================================================================
let latestDeviceInfo = null
let deviceInfoDisplayEl = null
let deviceInfoRawEl = null
function kvRow(label, value) {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex; justify-content:space-between; gap:10px; padding:1px 0;'
  const l = document.createElement('span'); l.textContent = label; l.style.opacity = '0.7'
  const v = document.createElement('span'); v.textContent = value == null || value === '' ? '—' : String(value); v.style.textAlign = 'right'
  row.appendChild(l); row.appendChild(v)
  return row
}
function renderDeviceInfoDisplay(info) {
  if (!deviceInfoDisplayEl) return
  deviceInfoDisplayEl.innerHTML = ''
  const confidenceLabel = { confirmed: 'Confirmed', inferred: 'Inferred', unavailable: 'Unavailable' }[info.modelConfidence] || info.modelConfidence
  deviceInfoDisplayEl.appendChild(kvRow('Device Type', info.deviceType))
  deviceInfoDisplayEl.appendChild(kvRow('Brand', info.brand))
  deviceInfoDisplayEl.appendChild(kvRow('Model', info.model || 'Not exposed by browser'))
  deviceInfoDisplayEl.appendChild(kvRow('Platform', info.platform))
  deviceInfoDisplayEl.appendChild(kvRow('OS Version', info.platformVersion))
  deviceInfoDisplayEl.appendChild(kvRow('Browser', info.browser))
  deviceInfoDisplayEl.appendChild(kvRow('Browser Version', info.browserVersion))
  deviceInfoDisplayEl.appendChild(kvRow('Mobile', info.mobile === null ? null : (info.mobile ? 'Yes' : 'No')))
  deviceInfoDisplayEl.appendChild(kvRow('Model Source', info.modelSource))
  deviceInfoDisplayEl.appendChild(kvRow('Confidence', confidenceLabel))
  deviceInfoDisplayEl.appendChild(kvRow('UA Client Hints Supported', info.userAgentDataSupported ? 'Yes' : 'No'))
  if (deviceInfoRawEl) deviceInfoRawEl.textContent = JSON.stringify(info.raw, null, 2)
}
async function refreshDeviceInfo() {
  try {
    latestDeviceInfo = await detectDeviceInfo()
  } catch (err) {
    // detectDeviceInfo() itself never throws by design, but this display
    // must never break the app even if that guarantee is ever violated.
    latestDeviceInfo = { deviceType: 'unknown', brand: null, model: null, platform: null, platformVersion: null, browser: null, browserVersion: null, mobile: null, modelSource: 'unavailable', modelConfidence: 'unavailable', userAgentDataSupported: !!navigator.userAgentData, raw: { error: String((err && err.message) || err) } }
  }
  renderDeviceInfoDisplay(latestDeviceInfo)
}
function renderDeviceInfoSettings(debugContent) {
  const settingsSub = addSubgroup(debugContent, 'Settings')
  addRow(settingsSub, { id: 'checkboxDeviceInfoEnabled', label: 'Device Information', type: 'checkbox' })
  document.getElementById('checkboxDeviceInfoEnabled').checked = cfg.deviceInfoEnabled

  const panel = document.createElement('div')
  panel.style.cssText = 'font-size:11px; margin-top:4px; padding:6px 8px; background:rgba(255,255,255,0.06); border:1px solid var(--dev-accent-color, #0ff); border-radius:4px;'
  panel.style.display = cfg.deviceInfoEnabled ? '' : 'none'
  deviceInfoDisplayEl = document.createElement('div')
  panel.appendChild(deviceInfoDisplayEl)

  const refreshRow = document.createElement('div'); refreshRow.className = 'dev-buttons'; refreshRow.style.marginTop = '6px'
  const refreshBtn = document.createElement('button'); refreshBtn.type = 'button'; refreshBtn.textContent = 'Refresh'
  refreshRow.appendChild(refreshBtn)
  panel.appendChild(refreshRow)
  refreshBtn.addEventListener('click', () => refreshDeviceInfo())

  const rawDetails = document.createElement('details')
  rawDetails.style.marginTop = '6px'
  const rawSummary = document.createElement('summary')
  rawSummary.textContent = 'Raw diagnostic data'
  rawSummary.style.cssText = 'cursor:pointer; opacity:0.75; font-size:10px;'
  deviceInfoRawEl = document.createElement('pre')
  deviceInfoRawEl.style.cssText = 'font: 10px/1.4 ui-monospace, Consolas, monospace; white-space:pre-wrap; word-break:break-all; margin:4px 0 0; opacity:0.85; max-height:160px; overflow-y:auto;'
  rawDetails.appendChild(rawSummary)
  rawDetails.appendChild(deviceInfoRawEl)
  panel.appendChild(rawDetails)

  settingsSub.appendChild(panel)

  wireCheckbox('checkboxDeviceInfoEnabled', (v) => {
    cfg.deviceInfoEnabled = v
    panel.style.display = v ? '' : 'none'
    if (v && !latestDeviceInfo) refreshDeviceInfo()
  })
  if (cfg.deviceInfoEnabled) refreshDeviceInfo()
}

function renderDebugExtras() {
  /* eslint-disable-next-line no-undef */
  const debugContent = findGroupContent('desktop', 'Debug', 'renderDebugExtras', 'debugExtras')
  if (!debugContent) return
  // Global Responsive Rotation/Displace overrides -- direct request:
  // "global on off switches for the responsive rotation and the
  // responsive displacement... this will override that [the individual
  // Phone Model checkboxes]... when I'm switching between phone models, I
  // don't have to keep turning them on and off individually." AND-combined
  // with each feature's own existing checkbox at every real gate -- see
  // cfg.responsiveRotationGlobalEnabled's own declaration comment.
  addRow(debugContent, { id: 'checkboxResponsiveRotationGlobalEnabled', label: 'Responsive Rotation (Global Override)', type: 'checkbox' })
  document.getElementById('checkboxResponsiveRotationGlobalEnabled').checked = cfg.responsiveRotationGlobalEnabled
  wireCheckbox('checkboxResponsiveRotationGlobalEnabled', (v) => { cfg.responsiveRotationGlobalEnabled = v; if (v) resetPhoneModelRotationBaseline() })
  addRow(debugContent, { id: 'checkboxResponsiveDisplaceGlobalEnabled', label: 'Responsive Displacement (Global Override)', type: 'checkbox' })
  document.getElementById('checkboxResponsiveDisplaceGlobalEnabled').checked = cfg.responsiveDisplaceGlobalEnabled
  wireCheckbox('checkboxResponsiveDisplaceGlobalEnabled', (v) => { cfg.responsiveDisplaceGlobalEnabled = v })
  addRow(debugContent, { id: 'checkboxShowGridHelper', label: 'Show Grid Helper', type: 'checkbox' })
  document.getElementById('checkboxShowGridHelper').checked = cfg.showGridHelper
  wireCheckbox('checkboxShowGridHelper', (v) => { cfg.showGridHelper = v; gridHelper.visible = v })
  addRow(debugContent, { id: 'checkboxShowAxesHelper', label: 'Show World Axes Gizmo', type: 'checkbox' })
  document.getElementById('checkboxShowAxesHelper').checked = cfg.showAxesHelper
  wireCheckbox('checkboxShowAxesHelper', (v) => { cfg.showAxesHelper = v; updateWorldAxes() })
  addRow(debugContent, { id: 'sliderWorldAxesLength', label: 'World Axes Line Length', type: 'slider', min: 10, max: 200, step: 5, value: cfg.worldAxesLength })
  wireSlider('sliderWorldAxesLength', (v) => { cfg.worldAxesLength = v; updateWorldAxes() })
  addRow(debugContent, { id: 'sliderWorldAxesThickness', label: 'World Axes Line Thickness', type: 'slider', min: 1, max: 10, step: 0.5, value: cfg.worldAxesThickness })
  wireSlider('sliderWorldAxesThickness', (v) => { cfg.worldAxesThickness = v; updateWorldAxes() })
  addRow(debugContent, { id: 'checkboxShowWireframe', label: 'Show Wireframe', type: 'checkbox' })
  wireCheckbox('checkboxShowWireframe', (v) => { cfg.showWireframe = v; hands.forEach((h) => { h.skinnedMesh.material.wireframe = v }) })
  // CORRECTED 2026-09-30, direct report: "The Pause button... should be
  // stylized the same as other buttons. It should use the button color
  // and font etc." Was a bare .dev-row with an unstyled <button> -- real
  // dev-panel buttons get their look from `.dev-buttons button` (Button
  // Color/font/border-radius/hover), which only applies inside a
  // `.dev-buttons` container (the same wrapper class Save/Use/Delete/Set
  // Default already use), not a plain `.dev-row`.
  const pauseRow = document.createElement('div'); pauseRow.className = 'dev-buttons'
  // id required for Set Hotkey (devPanel.js) -- every hotkey-bindable
  // control is looked up by id (triggerHotkey()/renderAllHotkeyBadges()),
  // and this button never had one, which is the other half of why it
  // couldn't be hotkeyed (see devPanel.js's own .dev-buttons container fix).
  const pauseBtn = document.createElement('button'); pauseBtn.id = 'buttonPauseToggle'; pauseBtn.textContent = 'PAUSE'
  pauseRow.appendChild(pauseBtn); debugContent.appendChild(pauseRow)
  pauseBtn.addEventListener('click', () => { isPaused = !isPaused; pauseBtn.textContent = isPaused ? 'RESUME' : 'PAUSE'; requestRender() })

  // All-logs controls -- direct requests: "provide a clear all logs
  // button and copy all logs button" / "and a pause and resume logs
  // button." Sits above the 3 individual logs below (Mouse Log is
  // devPanel.js's own built-in subgroup, appearing even earlier in the
  // panel; Sensors/Phone Model Log are HANDYSET's own, right below) so
  // it reads as a shared master-controls row for all of them. See
  // clearAllLogs()/copyAllLogsText()/toggleAllLogsPaused()'s own
  // comments for what each spans.
  const allLogsRow = document.createElement('div'); allLogsRow.className = 'dev-buttons'
  const clearAllLogsBtn = document.createElement('button'); clearAllLogsBtn.textContent = 'CLEAR ALL LOGS'
  const copyAllLogsBtn = document.createElement('button'); copyAllLogsBtn.textContent = 'COPY ALL LOGS'
  const pauseAllLogsBtn = document.createElement('button'); pauseAllLogsBtn.textContent = 'PAUSE LOGS'
  allLogsRow.append(clearAllLogsBtn, copyAllLogsBtn, pauseAllLogsBtn)
  debugContent.appendChild(allLogsRow)
  clearAllLogsBtn.addEventListener('click', clearAllLogs)
  copyAllLogsBtn.addEventListener('click', () => copyAllLogsText(copyAllLogsBtn))
  pauseAllLogsBtn.addEventListener('click', () => toggleAllLogsPaused(pauseAllLogsBtn))

  const sensorSub = addSubgroup(debugContent, 'Sensors')
  if (!isTouchDevice) {
    const note = document.createElement('div')
    note.style.cssText = 'font-size:10px; color:#888; padding:2px 0 6px;'
    note.textContent = 'No sensor data on Desktop.'
    sensorSub.appendChild(note)
  }
  addRow(sensorSub, { id: 'checkboxSensorStream', label: 'Stream Sensor Data', type: 'checkbox' })
  wireCheckbox('checkboxSensorStream', (v) => { cfg.sensorStreamEnabled = v; restartSensorTimer(); restartPhoneModelLogTimer() })
  addRow(sensorSub, { id: 'sliderSensorInterval', label: 'Sample Interval (Ms)', type: 'slider', min: 50, max: 2000, step: 50, value: cfg.sensorIntervalMs })
  wireSlider('sliderSensorInterval', (v) => { cfg.sensorIntervalMs = v; restartSensorTimer(); restartPhoneModelLogTimer() })
  // Per-sensor log toggles -- direct request 2026-09-28.
  addRow(sensorSub, { id: 'checkboxSensorLogAccel', label: 'Log Accelerometer', type: 'checkbox' })
  document.getElementById('checkboxSensorLogAccel').checked = cfg.sensorLogAccel
  wireCheckbox('checkboxSensorLogAccel', (v) => { cfg.sensorLogAccel = v })
  // Diagnostic -- added 2026-09-30, see cfg.sensorLogLinearAccel's own
  // declaration comment. Shows the EXACT gravity-subtracted value
  // Responsive Displace consumes, distinct from "Log Accelerometer"
  // above (raw accelerationIncludingGravity).
  addRow(sensorSub, { id: 'checkboxSensorLogLinearAccel', label: 'Log Linear Accel (No Gravity, Used By Displace)', type: 'checkbox' })
  document.getElementById('checkboxSensorLogLinearAccel').checked = cfg.sensorLogLinearAccel
  wireCheckbox('checkboxSensorLogLinearAccel', (v) => { cfg.sensorLogLinearAccel = v })
  addRow(sensorSub, { id: 'checkboxSensorLogGyro', label: 'Log Gyroscope', type: 'checkbox' })
  document.getElementById('checkboxSensorLogGyro').checked = cfg.sensorLogGyro
  wireCheckbox('checkboxSensorLogGyro', (v) => { cfg.sensorLogGyro = v })
  addRow(sensorSub, { id: 'checkboxSensorLogCompass', label: 'Log Compass', type: 'checkbox' })
  document.getElementById('checkboxSensorLogCompass').checked = cfg.sensorLogCompass
  wireCheckbox('checkboxSensorLogCompass', (v) => { cfg.sensorLogCompass = v })
  // Absolute orientation angle (deviceorientation.beta/gamma), NOT the
  // same as Gyro's rotationRate alpha/beta/gamma above -- direct request
  // 2026-09-28, added after the user asked what the difference was.
  addRow(sensorSub, { id: 'checkboxSensorLogOrientBeta', label: 'Log Beta (Front/Back Tilt Angle)', type: 'checkbox' })
  document.getElementById('checkboxSensorLogOrientBeta').checked = cfg.sensorLogOrientBeta
  wireCheckbox('checkboxSensorLogOrientBeta', (v) => { cfg.sensorLogOrientBeta = v })
  addRow(sensorSub, { id: 'checkboxSensorLogOrientGamma', label: 'Log Gamma (Left/Right Tilt Angle)', type: 'checkbox' })
  document.getElementById('checkboxSensorLogOrientGamma').checked = cfg.sensorLogOrientGamma
  wireCheckbox('checkboxSensorLogOrientGamma', (v) => { cfg.sensorLogOrientGamma = v })
  const sensorBtnRow = document.createElement('div')
  sensorBtnRow.className = 'dev-buttons'
  const sensorCopyBtn = document.createElement('button')
  sensorCopyBtn.type = 'button'
  sensorCopyBtn.textContent = 'COPY'
  const sensorSaveBtn = document.createElement('button')
  sensorSaveBtn.type = 'button'
  sensorSaveBtn.textContent = 'SAVE'
  const sensorClearBtn = document.createElement('button')
  sensorClearBtn.type = 'button'
  sensorClearBtn.textContent = 'CLEAR'
  sensorBtnRow.append(sensorCopyBtn, sensorSaveBtn, sensorClearBtn)
  sensorSub.appendChild(sensorBtnRow)
  sensorCopyBtn.addEventListener('click', () => copySensorLog(sensorCopyBtn))
  sensorSaveBtn.addEventListener('click', saveSensorLog)
  sensorClearBtn.addEventListener('click', clearSensorLog)
  sensorLogEl = document.createElement('div')
  sensorLogEl.className = 'dev-mouse-log'
  sensorSub.appendChild(sensorLogEl)

  // Phone Model Log -- direct request 2026-09-28: logs the Phone Model's
  // own position/rotation, at the same rate as the Sensors log above
  // (shares cfg.sensorIntervalMs and the Stream Sensor Data checkbox),
  // with timestamps. See restartPhoneModelLogTimer()'s own comment for
  // why it's NOT gated to touch devices the way the Sensors log is.
  const phoneModelLogSub = addSubgroup(debugContent, 'Phone Model Log')
  const phoneModelLogBtnRow = document.createElement('div')
  phoneModelLogBtnRow.className = 'dev-buttons'
  const phoneModelLogCopyBtn = document.createElement('button')
  phoneModelLogCopyBtn.type = 'button'
  phoneModelLogCopyBtn.textContent = 'COPY'
  const phoneModelLogSaveBtn = document.createElement('button')
  phoneModelLogSaveBtn.type = 'button'
  phoneModelLogSaveBtn.textContent = 'SAVE'
  const phoneModelLogClearBtn = document.createElement('button')
  phoneModelLogClearBtn.type = 'button'
  phoneModelLogClearBtn.textContent = 'CLEAR'
  phoneModelLogBtnRow.append(phoneModelLogCopyBtn, phoneModelLogSaveBtn, phoneModelLogClearBtn)
  phoneModelLogSub.appendChild(phoneModelLogBtnRow)
  phoneModelLogCopyBtn.addEventListener('click', () => copyPhoneModelLog(phoneModelLogCopyBtn))
  phoneModelLogSaveBtn.addEventListener('click', savePhoneModelLog)
  phoneModelLogClearBtn.addEventListener('click', clearPhoneModelLog)
  phoneModelLogEl = document.createElement('div')
  phoneModelLogEl.className = 'dev-mouse-log'
  phoneModelLogSub.appendChild(phoneModelLogEl)

  // Object Axes -- ported from 3JS ENGINE's own Debug/Diagnostics
  // subgroup (its src/main.js), per direct request. World Axes wasn't
  // requested, so only this half was ported.
  const objectAxesContent = addSubgroup(debugContent, 'Object Axes')
  addRow(objectAxesContent, { id: 'checkboxObjectAxesEnabled', label: 'Object Axes On/Off', type: 'checkbox' })
  document.getElementById('checkboxObjectAxesEnabled').checked = cfg.objectAxesEnabled
  wireCheckbox('checkboxObjectAxesEnabled', (v) => { cfg.objectAxesEnabled = v; objectAxesGroups.forEach((group) => { group.visible = v }) })
  addRow(objectAxesContent, { id: 'checkboxObjectAxesRenderInFront', label: 'Render In Front', type: 'checkbox' })
  document.getElementById('checkboxObjectAxesRenderInFront').checked = cfg.objectAxesRenderInFront
  wireCheckbox('checkboxObjectAxesRenderInFront', (v) => { cfg.objectAxesRenderInFront = v; objectAxesGroups.forEach((group) => applyFatAxesRenderState(group, v, cfg.objectAxesThickness)) })
  addRow(objectAxesContent, { id: 'sliderObjectAxesThickness', label: 'Line Thickness (Px)', type: 'slider', min: 1, max: 10, step: 0.5, value: cfg.objectAxesThickness })
  wireSlider('sliderObjectAxesThickness', (v) => { cfg.objectAxesThickness = v; objectAxesGroups.forEach((group) => applyFatAxesRenderState(group, cfg.objectAxesRenderInFront, v)) })
  addRow(objectAxesContent, { id: 'sliderObjectAxesLength', label: 'Line Length (World Units)', type: 'slider', min: 1, max: 200, step: 1, value: cfg.objectAxesLength })
  wireSlider('sliderObjectAxesLength', (v) => { cfg.objectAxesLength = v; objectAxesGroups.forEach((group) => rebuildFatAxesLength(group, v)) })
  const objectAxesPickerLabel = document.createElement('div')
  objectAxesPickerLabel.className = 'dev-label'
  objectAxesPickerLabel.style.marginTop = '6px'
  objectAxesPickerLabel.textContent = 'Objects (check to show its axes — multi-select):'
  objectAxesContent.appendChild(objectAxesPickerLabel)
  const objectAxesPickerListEl = document.createElement('div')
  objectAxesPickerListEl.id = 'objectAxesPickerList'
  objectAxesPickerListEl.className = 'dev-list-picker'
  objectAxesContent.appendChild(objectAxesPickerListEl)
  renderObjectAxesPicker()

  renderDeviceInfoSettings(debugContent)
}

function renderHandysetDevGroups() {
  // HAND MODEL -- direct request 2026-09-27: a new top-level group holding
  // Field Layout, Pose, Tween, and the renamed Phone Tilt subgroup, in
  // that exact order. "Phone Tilt" is renamed "RESPONSIVE BEHAVIOUR -
  // HAND" (per direct correction, distinguishing it from the new PHONE
  // MODEL group's own "RESPONSIVE BEHAVIOUR - PHONE" subgroup) -- same
  // function (renderPhoneTiltGroup), just built into a subgroup instead
  // of a top-level group and titled differently.
  const handModelContent = addGroup('HAND MODEL')

  // CORRECTED 2026-09-28, direct request: this row was originally a
  // Phone Model On/Off duplicate (2026-09-27) -- repurposed into a
  // Hand Model On/Off toggle instead (drives cfg.hideHands, inverted
  // sense, kept in sync with Field Layout's own "Hide Hands" checkbox
  // via syncHandModelEnabledCheckboxes()).
  addRow(handModelContent, { id: 'checkboxHandModelEnabled', label: 'Hand Model On/Off', type: 'checkbox' })
  document.getElementById('checkboxHandModelEnabled').checked = !cfg.hideHands
  wireCheckbox('checkboxHandModelEnabled', (v) => { cfg.hideHands = !v; relayoutField(); syncHandModelEnabledCheckboxes() })

  // Hand Model Selector -- direct request: "provide a hand model selector
  // liek the phone and load in this geometry... HandiBonesB-IK.glb". See
  // HAND_MODEL_OPTIONS'/renderHandModelItemSelector()'s own comments.
  renderHandModelItemSelector(handModelContent)

  const fieldContent = addSubgroup(handModelContent, 'Field Layout')
  addRow(fieldContent, { id: 'sliderFieldRows', label: 'Rows (Count)', type: 'slider', min: 1, max: 40, step: 1, value: cfg.fieldRows })
  wireSlider('sliderFieldRows', (v) => { cfg.fieldRows = v; rebuildField() })
  addRow(fieldContent, { id: 'sliderFieldCols', label: 'Columns (Count)', type: 'slider', min: 1, max: 40, step: 1, value: cfg.fieldCols })
  wireSlider('sliderFieldCols', (v) => { cfg.fieldCols = v; rebuildField() })
  addRow(fieldContent, { id: 'sliderRowSpacing', label: 'Row Spacing (World Units)', type: 'slider', min: 2, max: 40, step: 0.5, value: cfg.rowSpacing })
  wireSlider('sliderRowSpacing', (v) => { cfg.rowSpacing = v; relayoutField() })
  addRow(fieldContent, { id: 'sliderColumnSpacing', label: 'Column Spacing (World Units)', type: 'slider', min: 2, max: 40, step: 0.5, value: cfg.columnSpacing })
  wireSlider('sliderColumnSpacing', (v) => { cfg.columnSpacing = v; relayoutField() })
  addRow(fieldContent, { id: 'sliderHandScale', label: 'Hand Scale (x)', type: 'slider', min: 0.5, max: 5, step: 0.05, value: cfg.handScale })
  wireSlider('sliderHandScale', (v) => { cfg.handScale = v; relayoutField(); applyPoseValuesToHand(cfg) })
  addRow(fieldContent, { id: 'sliderAlternateRowOffset', label: 'Alternate Row Offset (World Units)', type: 'slider', min: -20, max: 20, step: 0.5, value: cfg.alternateRowOffset })
  wireSlider('sliderAlternateRowOffset', (v) => { cfg.alternateRowOffset = v; relayoutField() })
  addRow(fieldContent, { id: 'sliderProgressiveRowOffset', label: 'Progressive Row Offset (World Units / Row)', type: 'slider', min: -20, max: 20, step: 0.5, value: cfg.progressiveRowOffset })
  wireSlider('sliderProgressiveRowOffset', (v) => { cfg.progressiveRowOffset = v; relayoutField() })
  addRow(fieldContent, { id: 'checkboxUseProgressiveOffset', label: 'Use Progressive Offset (Off = Alternate)', type: 'checkbox' })
  document.getElementById('checkboxUseProgressiveOffset').checked = cfg.useProgressiveOffset
  wireCheckbox('checkboxUseProgressiveOffset', (v) => { cfg.useProgressiveOffset = v; relayoutField() })
  addRow(fieldContent, { id: 'checkboxHideHands', label: 'Hide Hands', type: 'checkbox' })
  document.getElementById('checkboxHideHands').checked = cfg.hideHands
  wireCheckbox('checkboxHideHands', (v) => { cfg.hideHands = v; relayoutField(); syncHandModelEnabledCheckboxes() })

  renderPoseGroup(addSubgroup(handModelContent, 'Pose'))
  renderTweenGroup(addSubgroup(handModelContent, 'Tween'))
  renderPhoneTiltGroup(addSubgroup(handModelContent, 'RESPONSIVE BEHAVIOUR - HAND'))

  renderPhoneModelGroup(addGroup('PHONE MODEL'))

  renderResponsiveWristSplayGroup(addGroup('Responsive Wrist Splay'))
  renderCameraGroup(addGroup('Camera'))
  renderLightingGroup(addGroup('Lighting'))
  renderToonGroup(addGroup('Toon Shading'))

  const bgContent = addGroup('Background')
  addRow(bgContent, { id: 'colorBgColor', label: 'Background Color', type: 'color', value: cfg.bgColor })
  wireColor('colorBgColor', (v) => { cfg.bgColor = v; scene.background.set(v) })

  const groundContent = addGroup('Ground Plane')
  addRow(groundContent, { id: 'checkboxGroundPlaneEnabled', label: 'Ground Plane On/Off', type: 'checkbox' })
  document.getElementById('checkboxGroundPlaneEnabled').checked = cfg.groundPlaneEnabled
  wireCheckbox('checkboxGroundPlaneEnabled', (v) => { cfg.groundPlaneEnabled = v; updateGroundPlane() })
  addRow(groundContent, { id: 'sliderGroundHeight', label: 'Ground Height (World Units)', type: 'slider', min: -200, max: 200, step: 1, value: cfg.groundHeight })
  wireSlider('sliderGroundHeight', (v) => { cfg.groundHeight = v; updateGroundPlane() })
  addRow(groundContent, { id: 'colorGroundColor', label: 'Ground Color', type: 'color', value: cfg.groundColor })
  wireColor('colorGroundColor', (v) => { cfg.groundColor = v; updateGroundPlane() })
  addRow(groundContent, { id: 'sliderGroundScale', label: 'Ground Scale (Horizontal, World Units)', type: 'slider', min: 10, max: 2000, step: 10, value: cfg.groundScale })
  wireSlider('sliderGroundScale', (v) => { cfg.groundScale = v; updateGroundPlane() })

  const gizmoContent = addGroup('Finger Gizmos')
  addRow(gizmoContent, { id: 'checkboxFingerGizmosEnabled', label: 'Finger Gizmos On/Off', type: 'checkbox' })
  document.getElementById('checkboxFingerGizmosEnabled').checked = cfg.fingerGizmosEnabled
  wireCheckbox('checkboxFingerGizmosEnabled', (v) => { cfg.fingerGizmosEnabled = v; setFingerGizmosVisible(v) })
  addRow(gizmoContent, { id: 'sliderFingerGizmoSize', label: 'Gizmo Size (x)', type: 'slider', min: 0.1, max: 5, step: 0.05, value: cfg.fingerGizmoSize })
  wireSlider('sliderFingerGizmoSize', (v) => { cfg.fingerGizmoSize = v })
  addRow(gizmoContent, { id: 'colorFingerGizmoColor', label: 'Gizmo Color', type: 'color', value: cfg.fingerGizmoColor })
  wireColor('colorFingerGizmoColor', (v) => { cfg.fingerGizmoColor = v })
  addRow(gizmoContent, { id: 'sliderFingerGizmoAxisLength', label: 'Axis Line Length (World Units)', type: 'slider', min: 0.5, max: 20, step: 0.25, value: cfg.fingerGizmoAxisLength })
  wireSlider('sliderFingerGizmoAxisLength', (v) => { cfg.fingerGizmoAxisLength = v })
  addRow(gizmoContent, { id: 'sliderFingerGizmoAxisThickness', label: 'Axis Line Thickness (World Units)', type: 'slider', min: 0.02, max: 3, step: 0.02, value: cfg.fingerGizmoAxisThickness })
  wireSlider('sliderFingerGizmoAxisThickness', (v) => { cfg.fingerGizmoAxisThickness = v })

  renderDebugExtras()

  // REQUIRED — see HANDYSET_CONTROLS' own declaration comment above
  // addRow(): without this, every control's "Show in Mobile/Landscape"
  // checkbox toggles and cascades correctly but the Mobile/Landscape row
  // itself is never actually created.
  /* eslint-disable-next-line no-undef */
  registerDevControlArray('HANDYSET_CONTROLS', HANDYSET_CONTROLS)
}
window.renderHandysetDevGroups = renderHandysetDevGroups

// =======================================================================
// Git-tracked dev panel Save (CLAUDE.md §12l upgrade) — writes through to
// /api/save-settings (a Vercel serverless function, api/save-settings.js)
// so a Save from any device/browser is visible everywhere, not just
// localStorage on the one that clicked it. Deliberately does NOT touch
// devPanel.js (kept a verbatim copy of the template) — this attaches
// its own additional click listeners to the existing SYNC buttons rather
// than wrapping/overriding devPanel.js's own saveDevPanelSettings, and
// polls for devPanel.js's globals (createDevGroupElement etc. load AFTER
// main.js — see index.html's own script-order comment) before using them.
// DEV_PANEL_SAVE_SECRET below is the workspace-shared anti-abuse token
// (CLAUDE.md §12l — same value HANDO/DICKOCLICKO/OKCILCOKCID/HANDY
// DANDIES all use) — update this AND the Vercel env var together if this
// project's own Vercel setup used a different value.
const DEV_PANEL_SAVE_SECRET = 'PkrbMti03M6xm3FEThYXa8gGW_08BOGj'
const SAVE_SETTINGS_ENDPOINT = '/api/save-settings'

function waitForDevPanelGlobal(name, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    ;(function poll() {
      if (typeof window[name] === 'function') { resolve(window[name]); return }
      if (performance.now() - start > timeoutMs) { reject(new Error(name + ' never became available')); return }
      setTimeout(poll, 50)
    })()
  })
}

function setSyncStatusText(text) {
  const status = document.getElementById('devSaveSyncStatus')
  if (status) status.textContent = text
}

// GET-merge-POST, not a blind overwrite — REQUIRED (real bug, found live
// 2026-09-21): this used to POST captureFullDevPanelState()'s own
// snapshot directly, which wholesale-replaced the entire remote settings
// file. captureFullDevPanelState() (a devPanel.js-owned function) has no
// knowledge of this project's own extra top-level fields
// (defaultPose/defaultCamera/defaultLighting/defaultToon, written by
// saveFieldAsDefault() below) — so clicking the main Save/Sync button
// after "Set as Default" silently stripped the just-set default field
// right back out, exactly matching the reported repro ("I click it, and
// i click save, and on refresh its still the old settings"). Merging
// onto a fresh GET first preserves any field this function doesn't know
// about, the same pattern saveFieldAsDefault() already used correctly.
async function remoteSaveCurrentSettings() {
  const capture = await waitForDevPanelGlobal('captureFullDevPanelState')
  const snapshot = capture()
  const getResp = await fetch(SAVE_SETTINGS_ENDPOINT, { cache: 'no-store' })
  const getBody = await getResp.json().catch(() => ({}))
  const base = (getResp.ok && getBody.ok === true && getBody.settings && typeof getBody.settings === 'object') ? getBody.settings : {}
  const merged = Object.assign({}, base, snapshot)
  const resp = await fetch(SAVE_SETTINGS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Dev-Panel-Secret': DEV_PANEL_SAVE_SECRET },
    body: JSON.stringify(merged)
  })
  const data = await resp.json().catch(() => ({ ok: false, error: 'Invalid server response' }))
  if (!data.ok) throw new Error(data.error || ('HTTP ' + resp.status))
  return data
}

function wireRemoteSaveButtons() {
  const buttons = [
    document.querySelector('.dev-buttons button[onclick="saveDevPanelSettings()"]'),
    document.getElementById('devHeaderSyncBtn')
  ].filter(Boolean)
  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      remoteSaveCurrentSettings()
        .then(() => setSyncStatusText('synced to GitHub'))
        .catch((err) => {
          console.error(ts() + ' Remote save failed', err)
          setSyncStatusText('GitHub save failed — ' + err.message)
        })
      setTimeout(() => setSyncStatusText(''), 3000)
    })
  })
}

// Generic "Set as Default" mechanism — GET-merge-POST a dedicated top-
// level field (defaultPose/defaultCamera/defaultLighting/defaultToon)
// through the same git-tracked settings endpoint the panel's own Sync
// already uses. Ported from Hando's own saveAsDefaultForModel()/
// loadDefaultForModelIfSaved() (main.js), simplified: Hando keys its
// default per MODEL_LIST entry (multi-model project); Handyset has
// exactly one hand/model, so there's nothing to key by — one flat field
// per settings category is the direct equivalent. GET-merge-POST (not a
// blind overwrite) so this never clobbers unrelated fields already saved
// by a normal panel Sync.
async function saveFieldAsDefault(fieldKey, captureFn, btn) {
  const orig = btn.textContent
  const flash = (msg) => { btn.textContent = msg; setTimeout(() => { btn.textContent = orig }, 2000) }
  try {
    const getResp = await fetch(SAVE_SETTINGS_ENDPOINT, { cache: 'no-store' })
    const getBody = await getResp.json().catch(() => ({}))
    const base = (getResp.ok && getBody.ok === true && getBody.settings && typeof getBody.settings === 'object') ? getBody.settings : {}
    const merged = Object.assign({}, base, { [fieldKey]: captureFn() })
    const postResp = await fetch(SAVE_SETTINGS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Dev-Panel-Secret': DEV_PANEL_SAVE_SECRET },
      body: JSON.stringify(merged)
    })
    const postBody = await postResp.json().catch(() => ({}))
    if (postResp.ok && postBody.ok === true) { flash('Saved!'); return }
    flash('Save failed: ' + (postBody.error || ('HTTP ' + postResp.status)))
  } catch (err) {
    flash('Save failed: offline/unreachable')
  }
}
async function loadFieldDefaultIfSaved(fieldKey, useFn) {
  try {
    const resp = await fetch(SAVE_SETTINGS_ENDPOINT, { cache: 'no-store' })
    const body = await resp.json().catch(() => ({}))
    if (resp.ok && body.ok === true && body.settings && body.settings[fieldKey]) {
      useFn(body.settings[fieldKey])
    }
  } catch (err) { /* offline/unreachable/not-yet-deployed -- keep whatever's already applied */ }
}

async function loadRemoteSettingsOnStartup() {
  try {
    const resp = await fetch(SAVE_SETTINGS_ENDPOINT, { cache: 'no-store' })
    const data = await resp.json().catch(() => null)
    if (!data || !data.ok || !data.settings) return
    const apply = await waitForDevPanelGlobal('applyFullDevPanelState')
    // Root-caused 2026-09-23 (?dev=1 vs no-dev startup state diverging):
    // applyFullDevPanelState() -> applyControlValues() writes each saved
    // value by `document.getElementById(id)` and dispatching a real
    // 'input'/'change' event -- a control with no DOM element is a silent
    // no-op (devPanel.js's own applyControlValues: `if (!el) return`).
    // devPanel.js's own initDevPanelEngine() only builds that DOM eagerly
    // when `isDevAllowed` (the panel's VISIBILITY gate, per
    // TEMPLATE_DEV_PANEL.html's own design), so on a plain production
    // visit (no ?dev=1, not localhost) the panel DOM never existed at
    // all and this whole remote-settings apply silently did nothing --
    // confirmed live: cfg.bgColor/wristSplayResponsiveEnabled/etc. read
    // the raw hardcoded literal defaults in production while correctly
    // reflecting the git-tracked Sync'd values under ?dev=1. Calling
    // ensureDevPanelBuilt() here (idempotent -- it no-ops if already
    // built, per its own `devPanelBuilt` guard) builds the DOM the apply
    // needs regardless of dev-mode, while the panel itself stays hidden
    // for a normal visitor exactly as before (visibility is a separate,
    // pure-CSS `.dev-mode` gate untouched by this).
    // Merge any remote (git-synced) list-picker items -- Saved Poses/
    // Cameras/Lighting/Toon Shading/Tween Sequences -- BEFORE the dev
    // panel gets built below, so a fresh visit whose panel hasn't been
    // eagerly built yet (the normal production/no-?dev=1 case, since
    // ensureDevPanelBuilt() below is exactly what builds it) renders the
    // list-picker widgets already showing the remote data, not just the
    // localStorage-restored snapshot from this same browser. When the
    // panel WAS already eagerly built (dev-mode auto-open, which runs
    // synchronously before this fetch can resolve), the arrays are still
    // updated correctly here -- only that one picker's already-rendered
    // list won't visually refresh until next reload, a minor, disclosed
    // gap given each mutation's own Save/Overwrite reads the live array.
    if (data.settings.listPicker_poses) loadListPickerItemsFromRemoteData(data.settings.listPicker_poses, SAVED_POSES)
    if (data.settings.listPicker_cameras) loadListPickerItemsFromRemoteData(data.settings.listPicker_cameras, SAVED_CAMERAS)
    if (data.settings.listPicker_lighting) loadListPickerItemsFromRemoteData(data.settings.listPicker_lighting, SAVED_LIGHTING)
    if (data.settings.listPicker_toon) loadListPickerItemsFromRemoteData(data.settings.listPicker_toon, SAVED_TOON)
    if (data.settings.listPicker_tweenSequences) loadListPickerItemsFromRemoteData(data.settings.listPicker_tweenSequences, SAVED_TWEEN_SEQUENCES)
    if (typeof window.ensureDevPanelBuilt === 'function') window.ensureDevPanelBuilt()
    apply(data.settings)
  } catch (err) {
    console.warn(ts() + ' Remote dev panel settings unavailable (expected on a plain static server, e.g. local dev):', err.message)
  }
}

waitForDevPanelGlobal('saveDevPanelSettings').then(wireRemoteSaveButtons).catch((err) => console.warn(ts() + ' ' + err.message))
loadRemoteSettingsOnStartup()
// Best-effort, non-blocking -- if this resolves before the dev panel is
// ever built, renderPhoneModelItemSelector() just no-ops (per its own
// `if (!parent) return` guard) and the panel's first real build reads
// PHONE_MODEL_OPTIONS fresh, already updated by then in the common case.
loadPhoneModelManifest()
