import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { clone as cloneSkinnedSkeleton } from 'three/addons/utils/SkeletonUtils.js'
import { detectDeviceInfo } from './deviceInfo.js'

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
const HANDYSET_SETTINGS_SCHEMA_VERSION = '2026-09-25a'
try {
  if (localStorage.getItem('handysetSettingsSchemaVersion') !== HANDYSET_SETTINGS_SCHEMA_VERSION) {
    localStorage.removeItem('devPanelSettings')
    localStorage.setItem('handysetSettingsSchemaVersion', HANDYSET_SETTINGS_SCHEMA_VERSION)
  }
} catch (e) { /* localStorage unavailable (private mode, etc.) -- nothing to guard */ }

const MODEL_URL = 'data/processed/HAND3D/Hand2.glb'
const loadingEl = document.getElementById('loading')

// ---------------------------------------------------------------------
// Live tunable state (dev-panel-backed). Plain object, read/written
// directly by control event listeners further down.
// ---------------------------------------------------------------------
const cfg = {
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
  armLengthCurve: '[{"x":0,"y":1},{"x":0.148333740234375,"y":0.6613540649414062},{"x":0.4100001017252604,"y":0.31468760172526045},{"x":0.5316670735677084,"y":0.2680206298828125},{"x":0.748333740234375,"y":0.19468739827473958},{"x":1,"y":0}]',
  // Responsive Wrist Splay — RESTORED 2026-09-21 after direct instruction
  // ("Leave Responsive Wrist Splay") following an earlier removal this
  // same session that was based on a misidentification of a DIFFERENT
  // group ("Responsive Palm Rotation") the user asked to remove — see
  // docs/CHANGELOG.txt for the full account. Same porting/adaptation note
  // as Reactive Arm Length above (tiltMagnitude stands in for HANDY
  // DANDIES' per-field live distance range).
  wristSplayResponsiveEnabled: true, wristSplayDefault: 7, wristSplayReactiveEnabled: true,
  wristSplayRange: '{"min":5,"max":-71}',
  wristSplayCurve: '[{"x":0,"y":1},{"x":0.31833343505859374,"y":0.6961458841959636},{"x":1,"y":0.042812347412109375}]',
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
  baseArmRotationCurve: '[{"x":0,"y":1},{"x":1,"y":0}]',
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
  poseTweenCurve: '[{"x":0,"y":0},{"x":1,"y":1}]',
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
  deviceInfoEnabled: false
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
function rotateOnTrueWorldAxis(bone, worldAxis, angle, excludeQuat) {
  bone.getWorldQuaternion(_worldToLocalQuat)
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
let wristSplayRangeParsed = { min: 5, max: -71 }
let wristSplayCurveParsed = [{ x: 0, y: 1 }, { x: 1, y: 0 }]
// Wrist axis clamps (safety ceiling on the FINAL combined angle, not a
// reactive curve's own range) — see cfg's own declaration comment.
let wristRotationClampParsed = { min: -360, max: 360 }
let wristBendClampParsed = { min: -90, max: 90 }
let wristSplayClampParsed = { min: -180, max: 180 }
const curveWidgetResyncs = []

function catmullRomY(y0, y1, y2, y3, t) {
  const t2 = t * t, t3 = t2 * t
  return 0.5 * ((2 * y1) + (-y0 + y2) * t + (2 * y0 - 5 * y1 + 4 * y2 - y3) * t2 + (-y0 + 3 * y1 - 3 * y2 + y3) * t3)
}
function cubicBezier1D(p0, p1, p2, p3, t) {
  const u = 1 - t
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
}
function bezierSegmentY(P0, C1, C2, P3, x) {
  let lo = 0, hi = 1
  for (let iter = 0; iter < 24; iter++) {
    const mid = (lo + hi) / 2
    const xm = cubicBezier1D(P0.x, C1.x, C2.x, P3.x, mid)
    if (xm < x) lo = mid; else hi = mid
  }
  const t = (lo + hi) / 2
  return cubicBezier1D(P0.y, C1.y, C2.y, P3.y, t)
}
function evaluateReactiveCurve(points, x) {
  if (!points || points.length === 0) return 1
  if (points.length === 1) return points[0].y
  const sorted = points
  if (x <= sorted[0].x) return sorted[0].y
  if (x >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i], p2 = sorted[i + 1]
    if (x >= p1.x && x <= p2.x) {
      if (p1.h1 || p2.h2) {
        const C1 = p1.h1 ? { x: p1.x + p1.h1.x, y: p1.y + p1.h1.y } : p1
        const C2 = p2.h2 ? { x: p2.x + p2.h2.x, y: p2.y + p2.h2.y } : p2
        return bezierSegmentY(p1, C1, C2, p2, x)
      }
      const p0 = sorted[i - 1] || p1
      const p3 = sorted[i + 2] || p2
      const segT = p2.x === p1.x ? 0 : (x - p1.x) / (p2.x - p1.x)
      return catmullRomY(p0.y, p1.y, p2.y, p3.y, segT)
    }
  }
  return sorted[sorted.length - 1].y
}
function parseArmLengthConfig() {
  try { armLengthRangeParsed = JSON.parse(cfg.armLengthRange) } catch (e) { /* keep last-good value */ }
  try { armLengthCurveParsed = JSON.parse(cfg.armLengthCurve).sort((a, b) => a.x - b.x) } catch (e) { /* keep last-good value */ }
}
function parseWristSplayConfig() {
  try { wristSplayRangeParsed = JSON.parse(cfg.wristSplayRange) } catch (e) { /* keep last-good value */ }
  try { wristSplayCurveParsed = JSON.parse(cfg.wristSplayCurve).sort((a, b) => a.x - b.x) } catch (e) { /* keep last-good value */ }
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
  const curveY = THREE.MathUtils.clamp(evaluateReactiveCurve(armLengthCurveParsed, distanceT), 0, 1)
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
  const curveY = THREE.MathUtils.clamp(evaluateReactiveCurve(wristSplayCurveParsed, distanceT), 0, 1)
  const { min, max } = wristSplayRangeParsed
  return min + (max - min) * curveY
}
// Responsive Arm Rotation at Base -- see cfg's own declaration comment.
let baseArmRotationRangeParsed = { min: 0, max: 30 }
let baseArmRotationCurveParsed = [{ x: 0, y: 1 }, { x: 1, y: 0 }]
function parseBaseArmRotationConfig() {
  try { baseArmRotationRangeParsed = JSON.parse(cfg.baseArmRotationRange) } catch (e) { /* keep last-good value */ }
  try { baseArmRotationCurveParsed = JSON.parse(cfg.baseArmRotationCurve).sort((a, b) => a.x - b.x) } catch (e) { /* keep last-good value */ }
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
  const curveY = THREE.MathUtils.clamp(evaluateReactiveCurve(baseArmRotationCurveParsed, distanceT), 0, 1)
  const { min, max } = baseArmRotationRangeParsed
  return min + (max - min) * curveY + (cfg.baseArmRotationFineTune || 0)
}
// Responsive Pose Tween -- see cfg's own declaration comment.
let poseTweenCurveParsed = [{ x: 0, y: 0 }, { x: 1, y: 1 }]
function parsePoseTweenConfig() {
  try { poseTweenCurveParsed = JSON.parse(cfg.poseTweenCurve).sort((a, b) => a.x - b.x) } catch (e) { /* keep last-good value */ }
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
function applyModelRootTransform(h, poseValues) {
  h.clone.quaternion.copy(h.currentBaseQuat)
  const scale = computeBaseScale() * (poseValues.poseScale ?? 1)
  h.clone.scale.setScalar(scale)
  _rotatedScaledPivot.copy(modelRotationPivot).multiplyScalar(scale).applyQuaternion(h.clone.quaternion)
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
  const curveY = THREE.MathUtils.clamp(evaluateReactiveCurve(poseTweenCurveParsed, armBaseDistanceT), 0, 1)
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

const axesHelper = new THREE.AxesHelper(50)
axesHelper.visible = cfg.showAxesHelper
scene.add(axesHelper)

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
}
function handleMouseMoveFallback(e) {
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
  if (cfg.trackingEnabled) requestMotionPermissionIfNeeded()
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
  hands.forEach((h) => {
    if (h.wrapper.parent) h.wrapper.parent.remove(h.wrapper)
    teardownFingerGizmosForHand(h) // NOT parented under h.wrapper -- must be removed separately or they leak into the scene
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
    h.clone.scale.setScalar(computeBaseScale() * (cfg.poseScale ?? 1))
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
new GLTFLoader().load(MODEL_URL, async (gltf) => {
  const root = gltf.scene
  const skinned = findSkinnedMesh(root)
  if (!skinned) { loadingEl.textContent = 'No skinned mesh found in model.'; return }
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
  animate()
}, undefined, (err) => {
  console.error('Failed to load hand model', err)
  loadingEl.textContent = 'Failed to load hand model — see console.'
})

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
    el.value = value
    const vEl = document.getElementById(id.replace(/^slider/, 'value'))
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
  getHandCenterWorld, updateWristCrop, computeBaseScale
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
}
window.addEventListener('resize', () => applyRendererSize(window.innerWidth, window.innerHeight))

let isPaused = false

function animate() {
  requestAnimationFrame(animate)
  if (renderer.getSize(new THREE.Vector2()).width !== window.innerWidth || renderer.getSize(new THREE.Vector2()).height !== window.innerHeight) {
    applyRendererSize(window.innerWidth, window.innerHeight)
  }
  controls.update()
  syncCameraPanelFromLive()
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

          const scale = computeBaseScale() * (cfg.poseScale ?? 1)
          const pivotLocal = forearmPosRaw.clone().multiplyScalar(scale).applyQuaternion(h.clone.quaternion).add(h.clone.position)
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
  }
  curveWidgetResyncs.forEach((fn) => fn())
  composer.render()
}

// =======================================================================
// Sensor console (Debug group) — raw accelerometer/gyroscope/compass
// readout, opt-in streaming, silent on Desktop (no real sensors to show).
// =======================================================================
let latestMotion = null
function handleDeviceMotion(e) { latestMotion = e }
let sensorLogEl = null
let sensorTimer = null
function fmt(n) { return (typeof n === 'number' && !Number.isNaN(n)) ? n.toFixed(2) : '--' }
function pushSensorLog(text) {
  if (!sensorLogEl) return
  const line = document.createElement('div')
  line.textContent = text
  sensorLogEl.appendChild(line)
  while (sensorLogEl.children.length > 200) sensorLogEl.removeChild(sensorLogEl.firstChild)
  sensorLogEl.scrollTop = sensorLogEl.scrollHeight
}
function restartSensorTimer() {
  clearInterval(sensorTimer)
  sensorTimer = null
  if (!cfg.sensorStreamEnabled || !isTouchDevice) { if (sensorLogEl) sensorLogEl.innerHTML = ''; return }
  sensorTimer = setInterval(() => {
    const accel = (latestMotion && latestMotion.accelerationIncludingGravity) || {}
    const gyro = (latestMotion && latestMotion.rotationRate) || {}
    const heading = latestOrientation ? latestOrientation.alpha : null
    pushSensorLog(`Accel x:${fmt(accel.x)} y:${fmt(accel.y)} z:${fmt(accel.z)}  |  Gyro α:${fmt(gyro.alpha)} β:${fmt(gyro.beta)} γ:${fmt(gyro.gamma)}  |  Compass:${fmt(heading)}°`)
  }, cfg.sensorIntervalMs)
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
    const vEl = document.getElementById(id.replace(/^slider/, 'value'))
    if (vEl) vEl.textContent = v
  })
}
function wireCheckbox(id, onChange) { const el = document.getElementById(id); if (el) el.addEventListener('change', (e) => onChange(e.target.checked)) }
function wireColor(id, onChange) { const el = document.getElementById(id); if (el) el.addEventListener('input', (e) => onChange(e.target.value)) }
function wireTextInput(id, onChange) { const el = document.getElementById(id); if (el) el.addEventListener('input', (e) => onChange(e.target.value)) }
function wireSelect(id, onChange) { const el = document.getElementById(id); if (el) el.addEventListener('change', (e) => onChange(e.target.value)) }

// =======================================================================
// Reactive Arm Length — custom curve-editor and dual-handle range
// widgets, ported from HANDY DANDIES (its own generic engine has no
// equivalent control type, so these are hand-built DOM/SVG on top of a
// plain devPanel.js 'text' control, same convention as this project's
// other custom widgets). Genericized into 2 parametrized builders
// (originally shared with Responsive Wrist Splay too, removed 2026-09-21
// per direct request — kept generic since a future feature may reuse
// them; HANDY DANDIES itself has 4 near-duplicate functions; behavior here
// is identical, just DRY'd) rather than duplicated per feature.
// =======================================================================
function elLocal(tag, styles, attrs) {
  const node = document.createElement(tag)
  if (styles) Object.assign(node.style, styles)
  if (attrs) Object.entries(attrs).forEach(([k, v]) => { if (k === 'text') node.textContent = v; else node.setAttribute(k, v) })
  return node
}
function commitTextControl(input, value) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
// Dual-handle range bar. opts: {trackMin, trackMax, isPercent, crossClamp, minLabel, maxLabel}
function buildReactiveRangeWidget(row, opts) {
  const input = row.querySelector('.dev-text-input')
  if (!input) return
  input.style.display = 'none'
  row.style.flexDirection = 'column'
  row.style.alignItems = 'stretch'
  const toPct = opts.isPercent ? (v) => v : (v) => THREE.MathUtils.clamp((v - opts.trackMin) / (opts.trackMax - opts.trackMin) * 100, 0, 100)
  const fromPct = opts.isPercent ? (p) => Math.round(p) : (p) => Math.round(opts.trackMin + (p / 100) * (opts.trackMax - opts.trackMin))

  const wrap = elLocal('div', { flex: '1', padding: '6px 4px 2px' })
  const track = elLocal('div', { position: 'relative', height: '18px', margin: '0 9px', background: 'rgba(255,255,255,0.12)', borderRadius: '9px' })
  const fill = elLocal('div', { position: 'absolute', top: '0', bottom: '0', background: 'var(--dev-accent-color, #7d8cff)', opacity: '0.5', borderRadius: '9px' })
  const zeroTick = !opts.isPercent ? elLocal('div', { position: 'absolute', top: '-2px', bottom: '-2px', width: '1px', background: 'rgba(255,255,255,0.35)' }) : null
  const minHandle = elLocal('div', { position: 'absolute', top: '-3px', width: '18px', height: '24px', marginLeft: '-9px', background: 'var(--dev-accent-color, #7d8cff)', borderRadius: '4px', cursor: 'ew-resize', touchAction: 'none' })
  const maxHandle = elLocal('div', { position: 'absolute', top: '-3px', width: '18px', height: '24px', marginLeft: '-9px', background: 'var(--dev-accent-color, #7d8cff)', borderRadius: '4px', cursor: 'ew-resize', touchAction: 'none' })
  const readout = elLocal('div', { fontSize: '11px', textAlign: 'center', marginTop: '4px', opacity: '0.85' })
  track.appendChild(fill); if (zeroTick) track.appendChild(zeroTick)
  track.appendChild(minHandle); track.appendChild(maxHandle)
  wrap.appendChild(track); wrap.appendChild(readout)
  row.appendChild(wrap)

  let current = { min: opts.trackMin, max: opts.trackMax }
  try { current = JSON.parse(input.value) } catch (e) { /* keep default */ }
  let lastSeenValue = input.value

  function redraw() {
    const minPct = toPct(current.min), maxPct = toPct(current.max)
    const leftPct = Math.min(minPct, maxPct), rightPct = Math.max(minPct, maxPct)
    fill.style.left = leftPct + '%'
    fill.style.right = (100 - rightPct) + '%'
    if (zeroTick) zeroTick.style.left = toPct(0) + '%'
    minHandle.style.left = minPct + '%'
    maxHandle.style.left = maxPct + '%'
    readout.textContent = `${opts.minLabel}: ${current.min}${opts.unit}  ${opts.maxLabel}: ${current.max}${opts.unit}`
  }
  redraw()
  curveWidgetResyncs.push(() => {
    if (input.value === lastSeenValue) return
    lastSeenValue = input.value
    try { current = JSON.parse(input.value); redraw(); if (opts.onExternalChange) opts.onExternalChange(input.value) } catch (e) { /* leave displayed state as-is */ }
  })

  function startDrag(handleKey, otherKey) {
    return (downEv) => {
      downEv.preventDefault()
      function onMove(moveEv) {
        const rect = track.getBoundingClientRect()
        if (rect.width <= 0) return // hidden/mid-collapse-transition -- avoid committing a NaN-derived value
        let pct = THREE.MathUtils.clamp((moveEv.clientX - rect.left) / rect.width, 0, 1) * 100
        let v = fromPct(pct)
        if (opts.crossClamp) v = handleKey === 'min' ? Math.min(v, current[otherKey]) : Math.max(v, current[otherKey])
        current[handleKey] = v
        redraw()
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        commitTextControl(input, JSON.stringify(current))
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }
  }
  minHandle.addEventListener('pointerdown', startDrag('min', 'max'))
  maxHandle.addEventListener('pointerdown', startDrag('max', 'min'))
}
// Draggable-point curve editor (SVG), 0-1 x 0-1 domain, Catmull-Rom
// spline (evaluateReactiveCurve) with optional per-point bezier handles.
// opts: {caption}
function buildReactiveCurveWidget(row, opts) {
  const input = row.querySelector('.dev-text-input')
  if (!input) return
  input.style.display = 'none'
  row.style.flexDirection = 'column'
  row.style.alignItems = 'stretch'

  const W = 240, H = 120
  const svgNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(svgNS, 'svg')
  svg.setAttribute('width', W); svg.setAttribute('height', H)
  Object.assign(svg.style, { background: 'rgba(255,255,255,0.06)', borderRadius: '4px', marginTop: '6px', touchAction: 'none', cursor: 'crosshair' })
  const axisX = document.createElementNS(svgNS, 'line')
  axisX.setAttribute('x1', 0); axisX.setAttribute('y1', H - 1); axisX.setAttribute('x2', W); axisX.setAttribute('y2', H - 1)
  axisX.setAttribute('stroke', 'rgba(255,255,255,0.25)')
  const axisY = document.createElementNS(svgNS, 'line')
  axisY.setAttribute('x1', 1); axisY.setAttribute('y1', 0); axisY.setAttribute('x2', 1); axisY.setAttribute('y2', H)
  axisY.setAttribute('stroke', 'rgba(255,255,255,0.25)')
  const curvePath = document.createElementNS(svgNS, 'path')
  curvePath.setAttribute('fill', 'none'); curvePath.setAttribute('stroke', 'var(--dev-accent-color, #7d8cff)'); curvePath.setAttribute('stroke-width', '2')
  svg.appendChild(axisX); svg.appendChild(axisY); svg.appendChild(curvePath)
  const caption = elLocal('div', { fontSize: '10px', opacity: '0.7', marginTop: '3px', textAlign: 'center' }, { text: opts.caption })
  row.appendChild(svg)
  row.appendChild(caption)

  let points = [{ x: 0, y: 1 }, { x: 1, y: 0 }]
  try {
    const parsed = JSON.parse(input.value)
    if (Array.isArray(parsed) && parsed.length >= 2) points = parsed.sort((a, b) => a.x - b.x)
  } catch (e) { /* keep default */ }

  const toPx = (p) => ({ x: p.x * W, y: (1 - p.y) * H })
  const fromPx = (px, py) => ({ x: THREE.MathUtils.clamp(px / W, 0, 1), y: THREE.MathUtils.clamp(1 - py / H, 0, 1) })
  let circles = []

  function commitPoints() {
    points.sort((a, b) => a.x - b.x)
    commitTextControl(input, JSON.stringify(points))
  }
  const CURVE_SAMPLES = 48
  function redraw() {
    let d = ''
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const x = i / CURVE_SAMPLES
      const y = THREE.MathUtils.clamp(evaluateReactiveCurve(points, x), 0, 1)
      const px = toPx({ x, y })
      d += (i === 0 ? 'M' : 'L') + px.x.toFixed(2) + ',' + px.y.toFixed(2) + ' '
    }
    curvePath.setAttribute('d', d.trim())
    circles.forEach((c) => svg.removeChild(c))
    circles = points.map((p, i) => {
      const px = toPx(p)
      const c = document.createElementNS(svgNS, 'circle')
      c.setAttribute('cx', px.x); c.setAttribute('cy', px.y); c.setAttribute('r', 5)
      c.setAttribute('fill', 'var(--dev-accent-color, #7d8cff)')
      Object.assign(c.style, { cursor: 'grab' })
      let dragged = false
      c.addEventListener('pointerdown', (downEv) => {
        downEv.stopPropagation()
        dragged = false
        const isEndpoint = i === 0 || i === points.length - 1
        function onMove(moveEv) {
          const rect = svg.getBoundingClientRect()
          if (rect.width <= 0 || rect.height <= 0) return
          dragged = true
          const np = fromPx(moveEv.clientX - rect.left, moveEv.clientY - rect.top)
          if (isEndpoint) { p.y = np.y } else { p.x = np.x; p.y = np.y }
          redraw()
        }
        function onUp() {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)
          if (dragged) commitPoints()
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      })
      function deletePointIfRemovable() {
        if (points.length > 2 && i !== 0 && i !== points.length - 1) {
          points.splice(points.indexOf(p), 1)
          redraw()
          commitPoints()
        }
      }
      c.addEventListener('dblclick', (dblEv) => { dblEv.stopPropagation(); deletePointIfRemovable() })
      c.addEventListener('contextmenu', (ctxEv) => { ctxEv.preventDefault(); ctxEv.stopPropagation(); deletePointIfRemovable() })
      svg.appendChild(c)
      return c
    })
  }
  svg.addEventListener('click', (clickEv) => {
    if (clickEv.target.tagName === 'circle') return
    const rect = svg.getBoundingClientRect()
    const np = fromPx(clickEv.clientX - rect.left, clickEv.clientY - rect.top)
    if (np.x <= 0 || np.x >= 1) return
    points.push(np)
    redraw()
    commitPoints()
  })
  redraw()
  let lastSeenValue = input.value
  curveWidgetResyncs.push(() => {
    if (input.value === lastSeenValue) return
    lastSeenValue = input.value
    try {
      const parsed = JSON.parse(input.value)
      if (Array.isArray(parsed) && parsed.length >= 2) { points = parsed.sort((a, b) => a.x - b.x); redraw(); if (opts.onExternalChange) opts.onExternalChange(input.value) }
    } catch (e) { /* leave displayed state as-is */ }
  })
}

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
  useBtn.addEventListener('click', () => { if (state.selected && opts.onUse) opts.onUse(state.selected) })
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
  // not either contributing source alone. Same dual-handle range-bar
  // widget already used for Reactive Arm Length/Wrist Splay's own curve
  // range above/below -- reused for consistency, not rebuilt.
  ;[
    ['wristRotationClampRange', 'Min / Max Wrist Rotation (Deg)', -360, 360, parseWristClampConfig],
    ['wristBendClampRange', 'Min / Max Wrist Bend (Deg)', -90, 90, parseWristClampConfig],
    ['wristSplayClampRange', 'Min / Max Wrist Splay (Deg, Combined)', -180, 180, parseWristClampConfig]
  ].forEach(([key, label, trackMin, trackMax, parseFn]) => {
    const row = addRow(subWrist, { id: 'text' + key, label, type: 'text', inputType: 'text', value: cfg[key] })
    wireTextInput('text' + key, (v) => { cfg[key] = v; parseFn(); applyPoseValuesToHand(cfg) })
    buildReactiveRangeWidget(row, { trackMin, trackMax, isPercent: false, crossClamp: false, minLabel: 'Min', maxLabel: 'Max', unit: '°', onExternalChange: (v) => { cfg[key] = v; parseFn(); applyPoseValuesToHand(cfg) } })
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
  const armRangeRow = addRow(subWrist, { id: 'textArmLengthRange', label: 'Min / Max Arm Length (Crop %)', type: 'text', inputType: 'text', value: cfg.armLengthRange })
  wireTextInput('textArmLengthRange', (v) => { cfg.armLengthRange = v; parseArmLengthConfig() })
  buildReactiveRangeWidget(armRangeRow, { trackMin: 0, trackMax: 100, isPercent: true, crossClamp: false, minLabel: 'Min', maxLabel: 'Max', unit: '%', onExternalChange: (v) => { cfg.armLengthRange = v; parseArmLengthConfig() } })
  const armCurveRow = addRow(subWrist, { id: 'textArmLengthCurve', label: 'Length Scaling Curve (Distance -> Crop)', type: 'text', inputType: 'text', value: cfg.armLengthCurve })
  wireTextInput('textArmLengthCurve', (v) => { cfg.armLengthCurve = v; parseArmLengthConfig() })
  buildReactiveCurveWidget(armCurveRow, { caption: 'X: Tilt/Cursor Distance From Center (0-1)  ·  Y: Crop (0=None, 1=Full)', onExternalChange: (v) => { cfg.armLengthCurve = v; parseArmLengthConfig() } })

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
  const splayRangeRow = addRow(content, { id: 'textWristSplayRange', label: 'Min / Max Wrist Splay (Deg)', type: 'text', inputType: 'text', value: cfg.wristSplayRange })
  wireTextInput('textWristSplayRange', (v) => { cfg.wristSplayRange = v; parseWristSplayConfig() })
  buildReactiveRangeWidget(splayRangeRow, { trackMin: -180, trackMax: 180, isPercent: false, crossClamp: false, minLabel: 'Min (Near Arm Base)', maxLabel: 'Max (Far / Full Tilt)', unit: '°', onExternalChange: (v) => { cfg.wristSplayRange = v; parseWristSplayConfig() } })
  const splayCurveRow = addRow(content, { id: 'textWristSplayCurve', label: 'Splay Scaling Curve (Distance -> Splay)', type: 'text', inputType: 'text', value: cfg.wristSplayCurve })
  wireTextInput('textWristSplayCurve', (v) => { cfg.wristSplayCurve = v; parseWristSplayConfig() })
  buildReactiveCurveWidget(splayCurveRow, { caption: 'X: Cursor Distance From Arm Base / Phone Tilt (0-1)  ·  Y: Splay Fraction (0=Min End, 1=Max End)', onExternalChange: (v) => { cfg.wristSplayCurve = v; parseWristSplayConfig() } })
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
function applyCameraLockState() {
  controls.enablePan = !cfg.lockCameraPan
  controls.enableZoom = !cfg.lockCameraZoom
  controls.enableRotate = !cfg.lockCameraRotate
}
// Extract yaw and pitch from camera direction (ported from HANDO)
// Yaw: rotation around Y axis, Pitch: rotation around X axis
function getCameraYawPitch() {
  const dir = controls.target.clone().sub(camera.position)
  const dist = dir.length() || 1
  dir.normalize()
  const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180 / Math.PI
  const yaw = Math.atan2(dir.x, dir.z) * 180 / Math.PI
  return { yaw, pitch, dist }
}

// Rotate by moving the target (not camera) to a point at current distance
// along the new yaw/pitch direction (ported from HANDO)
function setCameraYawPitch(yawDeg, pitchDeg) {
  const dist = getCameraYawPitch().dist
  const yaw = yawDeg * Math.PI / 180
  const pitch = pitchDeg * Math.PI / 180
  const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw))
  controls.target.copy(camera.position).addScaledVector(dir, dist)
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
  wireCheckbox('checkboxTrackingEnabled', (v) => { cfg.trackingEnabled = v; if (v) requestMotionPermissionIfNeeded() })
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
  const baseArmRangeRow = addRow(subBaseArmRotation, { id: 'textBaseArmRotationRange', label: 'Min / Max Rotation (Deg)', type: 'text', inputType: 'text', value: cfg.baseArmRotationRange })
  wireTextInput('textBaseArmRotationRange', (v) => { cfg.baseArmRotationRange = v; parseBaseArmRotationConfig() })
  buildReactiveRangeWidget(baseArmRangeRow, { trackMin: -180, trackMax: 180, isPercent: false, crossClamp: false, minLabel: 'Min', maxLabel: 'Max', unit: '°', onExternalChange: (v) => { cfg.baseArmRotationRange = v; parseBaseArmRotationConfig() } })
  const baseArmCurveRow = addRow(subBaseArmRotation, { id: 'textBaseArmRotationCurve', label: 'Rotation Curve (Distance -> Rotation)', type: 'text', inputType: 'text', value: cfg.baseArmRotationCurve })
  wireTextInput('textBaseArmRotationCurve', (v) => { cfg.baseArmRotationCurve = v; parseBaseArmRotationConfig() })
  buildReactiveCurveWidget(baseArmCurveRow, { caption: 'X: Cursor Distance From Arm Base / Phone Tilt (0-1)  ·  Y: Rotation Fraction (0=Min, 1=Max)', onExternalChange: (v) => { cfg.baseArmRotationCurve = v; parseBaseArmRotationConfig() } })

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
  const poseTweenCurveRow = addRow(subPoseTween, { id: 'textPoseTweenCurve', label: 'Tween Curve (Distance -> Tween Progress)', type: 'text', inputType: 'text', value: cfg.poseTweenCurve })
  wireTextInput('textPoseTweenCurve', (v) => { cfg.poseTweenCurve = v; parsePoseTweenConfig() })
  buildReactiveCurveWidget(poseTweenCurveRow, { caption: 'X: Cursor Distance From Arm Base / Phone Tilt (0-1)  ·  Y: Tween Progress (0=Default Pose, 1=Target Pose)', onExternalChange: (v) => { cfg.poseTweenCurve = v; parsePoseTweenConfig() } })
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
  addRow(debugContent, { id: 'checkboxShowGridHelper', label: 'Show Grid Helper', type: 'checkbox' })
  document.getElementById('checkboxShowGridHelper').checked = cfg.showGridHelper
  wireCheckbox('checkboxShowGridHelper', (v) => { cfg.showGridHelper = v; gridHelper.visible = v })
  addRow(debugContent, { id: 'checkboxShowAxesHelper', label: 'Show World Axes Gizmo', type: 'checkbox' })
  document.getElementById('checkboxShowAxesHelper').checked = cfg.showAxesHelper
  wireCheckbox('checkboxShowAxesHelper', (v) => { cfg.showAxesHelper = v; axesHelper.visible = v })
  addRow(debugContent, { id: 'checkboxShowWireframe', label: 'Show Wireframe', type: 'checkbox' })
  wireCheckbox('checkboxShowWireframe', (v) => { cfg.showWireframe = v; hands.forEach((h) => { h.skinnedMesh.material.wireframe = v }) })
  const pauseRow = document.createElement('div'); pauseRow.className = 'dev-row'
  const pauseBtn = document.createElement('button'); pauseBtn.textContent = 'PAUSE'
  pauseRow.appendChild(pauseBtn); debugContent.appendChild(pauseRow)
  pauseBtn.addEventListener('click', () => { isPaused = !isPaused; pauseBtn.textContent = isPaused ? 'RESUME' : 'PAUSE' })

  const sensorSub = addSubgroup(debugContent, 'Sensors')
  if (!isTouchDevice) {
    const note = document.createElement('div')
    note.style.cssText = 'font-size:10px; color:#888; padding:2px 0 6px;'
    note.textContent = 'No sensor data on Desktop.'
    sensorSub.appendChild(note)
  }
  addRow(sensorSub, { id: 'checkboxSensorStream', label: 'Stream Sensor Data', type: 'checkbox' })
  wireCheckbox('checkboxSensorStream', (v) => { cfg.sensorStreamEnabled = v; restartSensorTimer() })
  addRow(sensorSub, { id: 'sliderSensorInterval', label: 'Sample Interval (Ms)', type: 'slider', min: 50, max: 2000, step: 50, value: cfg.sensorIntervalMs })
  wireSlider('sliderSensorInterval', (v) => { cfg.sensorIntervalMs = v; restartSensorTimer() })
  sensorLogEl = document.createElement('div')
  sensorLogEl.className = 'dev-mouse-log'
  sensorSub.appendChild(sensorLogEl)

  renderDeviceInfoSettings(debugContent)
}

function renderHandysetDevGroups() {
  renderTweenGroup(addGroup('Tween'))

  const fieldContent = addGroup('Field Layout')
  addRow(fieldContent, { id: 'sliderFieldRows', label: 'Rows (Count)', type: 'slider', min: 1, max: 40, step: 1, value: cfg.fieldRows })
  wireSlider('sliderFieldRows', (v) => { cfg.fieldRows = v; rebuildField() })
  addRow(fieldContent, { id: 'sliderFieldCols', label: 'Columns (Count)', type: 'slider', min: 1, max: 40, step: 1, value: cfg.fieldCols })
  wireSlider('sliderFieldCols', (v) => { cfg.fieldCols = v; rebuildField() })
  addRow(fieldContent, { id: 'sliderRowSpacing', label: 'Row Spacing (World Units)', type: 'slider', min: 2, max: 40, step: 0.5, value: cfg.rowSpacing })
  wireSlider('sliderRowSpacing', (v) => { cfg.rowSpacing = v; relayoutField() })
  addRow(fieldContent, { id: 'sliderColumnSpacing', label: 'Column Spacing (World Units)', type: 'slider', min: 2, max: 40, step: 0.5, value: cfg.columnSpacing })
  wireSlider('sliderColumnSpacing', (v) => { cfg.columnSpacing = v; relayoutField() })
  addRow(fieldContent, { id: 'sliderHandScale', label: 'Hand Scale (x)', type: 'slider', min: 0.1, max: 3, step: 0.05, value: cfg.handScale })
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
  wireCheckbox('checkboxHideHands', (v) => { cfg.hideHands = v; relayoutField() })

  renderPoseGroup(addGroup('Pose'))
  renderResponsiveWristSplayGroup(addGroup('Responsive Wrist Splay'))
  renderCameraGroup(addGroup('Camera'))
  renderPhoneTiltGroup(addGroup('Phone Tilt'))
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
          console.error('Remote save failed', err)
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
    console.warn('Remote dev panel settings unavailable (expected on a plain static server, e.g. local dev):', err.message)
  }
}

waitForDevPanelGlobal('saveDevPanelSettings').then(wireRemoteSaveButtons).catch((err) => console.warn(err.message))
loadRemoteSettingsOnStartup()
