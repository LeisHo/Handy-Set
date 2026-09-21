import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

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
const HANDYSET_SETTINGS_SCHEMA_VERSION = '2026-09-21c'
try {
  if (localStorage.getItem('handysetSettingsSchemaVersion') !== HANDYSET_SETTINGS_SCHEMA_VERSION) {
    localStorage.removeItem('devPanelSettings')
    localStorage.setItem('handysetSettingsSchemaVersion', HANDYSET_SETTINGS_SCHEMA_VERSION)
  }
} catch (e) { /* localStorage unavailable (private mode, etc.) -- nothing to guard */ }

const MODEL_URL = 'data/processed/HAND3D/Hand2.glb'
const loadingEl = document.getElementById('loading')
const motionBtn = document.getElementById('motionPermissionBtn')

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
  cameraZoom: 60, lockCameraPan: false, lockCameraZoom: false, cameraMaxExtentsEnabled: false,
  cropWristEnabled: true,
  // Phone Tilt (renamed from Cursor Tracking)
  trackingEnabled: false, trackingDamping: 1, targetDepthFactor: 0.6,
  showTargetMarker: false, palmFacesCursor: false, palmFaceRotationOffset: 0,
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
  showGridHelper: false, showWireframe: false,
  sensorStreamEnabled: false, sensorIntervalMs: 200
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
const SAVED_CAMERAS = [
  {"name":"Front-Straightened","x":-0.6588710648813576,"y":21.03987225085262,"z":61.163231799331065,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32},
  {"name":"Top","x":2.66896914517113,"y":97.11147444693532,"z":7.815146933748445,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32},
  {"name":"Right","x":65.88319083347677,"y":41.967250857145764,"z":-5.881337000872083,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32},
  {"name":"Left","x":65.88319083347677,"y":41.967250857145764,"z":-5.881337000872083,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32},
  {"name":"Front","x":3.5526427374650176,"y":36.76541698494362,"z":62.37681969375567,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32},
  {"name":"Behind","x":-2.105471271806241,"y":41.54324641652082,"z":-65.39766111787976,"tx":2.307708223589727,"ty":33.57715598945507,"tz":-1.7891143893104762,"fov":32},
  {"name":"FRONTOS","x":3.598517809628556,"y":31.35475415298584,"z":60.28634317626074,"tx":3.5985178096286012,"ty":31.35475415298582,"tz":-314.71365682373926,"fov":32}
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

const POSE_KEY_DEFAULTS = {}
FINGER_NAMES.forEach((f) => {
  POSE_KEY_DEFAULTS[FINGER_CURL_KEY[f]] = 0; POSE_KEY_DEFAULTS[FINGER_SPLAY_KEY[f]] = 0
  POSE_KEY_DEFAULTS[FINGER_SPLAY2_KEY[f]] = 0; POSE_KEY_DEFAULTS[FINGER_CURL_BIAS_KEY[f]] = 0
  POSE_KEY_DEFAULTS[FINGER_BASE_ONLY_CURL_KEY[f]] = 0; POSE_KEY_DEFAULTS[FINGER_MID_ONLY_CURL_KEY[f]] = 0
  POSE_KEY_DEFAULTS[FINGER_TIP_ONLY_CURL_KEY[f]] = 0; POSE_KEY_DEFAULTS[FINGER_TIP_TWIST_KEY[f]] = 0
})
Object.assign(POSE_KEY_DEFAULTS, {
  wristBend: 0, wristSplay: 0, wristRotation: 0, modelRotX: 0, modelRotY: 0, modelRotZ: 0,
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
const sceneState = { fieldRadius: 10 }
let toonMaterial = null
let outlineMaterial = null
let modelRoot = null
let hands = [] // [{ wrapper, clone, skinnedMesh, outlineMesh, currentBaseQuat, clipPlane, row, col }, ...]
let hand = null // hands[0] — the "primary" hand: pose-editing reference frame, camera targeting, wireframe/tint toggles

function computeBaseScale() { return (8 / handLengthRaw) * cfg.handScale }

// applyCurlToSkeleton — ported verbatim from HANDY DANDIES.
const _curlAxisScratch = new THREE.Vector3()
const _splayAxisScratch = new THREE.Vector3()
const _splay2AxisScratch = new THREE.Vector3()
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
  const axisRefQuat = baseQuat
  const curlAxis = _curlAxisScratch.copy(FINGER_CURL_AXIS[fingerName]).applyQuaternion(axisRefQuat)
  const splayAxis = _splayAxisScratch.copy(FINGER_SPLAY_AXIS[fingerName]).applyQuaternion(axisRefQuat)
  const splay2Axis = _splay2AxisScratch.copy(FINGER_SPLAY2_AXIS[fingerName]).applyQuaternion(axisRefQuat)

  joints.forEach((boneName, i) => {
    const bone = skeleton.getBoneByName(boneName)
    if (!bone) return
    const rest = boneRestQuat[boneName]
    if (rest) bone.quaternion.copy(rest)

    const weight = curlBiasWeight(i, joints.length, bias)
    const curlAngle = THREE.MathUtils.degToRad((curlDeg / 100) * maxDegs[i] * weight * sign)
    rotateOnTrueWorldAxis(bone, curlAxis, curlAngle, wrapperQuat)

    if (i === FINGER_SPLAY_JOINT_INDEX[fingerName]) {
      const splayAngle = THREE.MathUtils.degToRad((splayDeg / 100) * FINGER_SPLAY_MAX_DEG[fingerName] * FINGER_SPLAY_SIGN[fingerName])
      rotateOnTrueWorldAxis(bone, splayAxis, splayAngle, wrapperQuat)
    }
    if (i === FINGER_SPLAY2_JOINT_INDEX[fingerName]) {
      const splay2Angle = THREE.MathUtils.degToRad((splay2Deg / 100) * FINGER_SPLAY2_MAX_DEG[fingerName] * FINGER_SPLAY2_SIGN[fingerName])
      rotateOnTrueWorldAxis(bone, splay2Axis, splay2Angle, wrapperQuat)
    }
    if (i === 0 && baseOnly) rotateOnTrueWorldAxis(bone, curlAxis, THREE.MathUtils.degToRad((baseOnly / 100) * maxDegs[0] * sign), wrapperQuat)
    if (i === 1 && midOnly) rotateOnTrueWorldAxis(bone, curlAxis, THREE.MathUtils.degToRad((midOnly / 100) * maxDegs[1] * sign), wrapperQuat)
    if (i === joints.length - 1 && tipOnly) rotateOnTrueWorldAxis(bone, curlAxis, THREE.MathUtils.degToRad((tipOnly / 100) * maxDegs[i] * sign), wrapperQuat)
    if (i === joints.length - 1 && tipTwist) {
      const prevBone = skeleton.getBoneByName(joints[i - 1])
      if (prevBone) {
        const twistAxis = segmentDirection(prevBone, bone)
        bone.rotateOnWorldAxis(twistAxis, THREE.MathUtils.degToRad((tipTwist / 100) * FINGER_TIP_TWIST_MAX_DEG))
      }
    }
  })
}
function applyCurl(fingerName) {
  hands.forEach((h) => applyCurlToSkeleton(fingerName, h.skinnedMesh.skeleton, h.currentBaseQuat, h.wrapper.quaternion, cfg))
}

// Wrist bend/splay/rotation — same rotateOnTrueWorldAxis mechanism as the
// finger system above (not preserved verbatim from HANDY DANDIES since
// that function's body wasn't available to port from; axis choices here
// mirror the finger convention — bend around world X, splay around world
// Z, twist/rotation around the hand's own pointing axis — worth a visual
// sanity check against a source-of-truth build if the direction feels off).
function applyWristPoseToSkeleton(skeleton, values) {
  const bone = skeleton.getBoneByName('rHand')
  if (!bone) return
  const rest = boneRestQuat.rHand
  if (rest) bone.quaternion.copy(rest)
  const bendAxis = WORLD_X_AXIS, splayAxis = WORLD_Z_AXIS, twistAxis = WORLD_Y_AXIS
  rotateOnTrueWorldAxis(bone, bendAxis, THREE.MathUtils.degToRad(values.wristBend || 0))
  rotateOnTrueWorldAxis(bone, splayAxis, THREE.MathUtils.degToRad(values.wristSplay || 0))
  rotateOnTrueWorldAxis(bone, twistAxis, THREE.MathUtils.degToRad(values.wristRotation || 0))
}

function computeBaseQuatFromValues(values) {
  return alignQuat.clone().multiply(new THREE.Quaternion().setFromEuler(
    new THREE.Euler(THREE.MathUtils.degToRad(values.modelRotX || 0), THREE.MathUtils.degToRad(values.modelRotY || 0), THREE.MathUtils.degToRad(values.modelRotZ || 0))
  ))
}

// Single entry point: apply a full pose-values object to every hand in
// the field. Used directly by Pose-group sliders, saved-pose "Use", and
// Tween — same cfg applied uniformly to all hands (matching HANDY
// DANDIES' own design: one shared pose, N independent field positions).
function applyPoseValuesToHand(poseValues) {
  hands.forEach((h) => {
    h.currentBaseQuat.copy(computeBaseQuatFromValues(poseValues))
    applyWristPoseToSkeleton(h.skinnedMesh.skeleton, poseValues)
    FINGER_NAMES.forEach((name) => applyCurlToSkeleton(name, h.skinnedMesh.skeleton, h.currentBaseQuat, h.wrapper.quaternion, poseValues))
    h.clone.position.set(poseValues.poseOffsetX || 0, poseValues.poseOffsetY || 0, poseValues.poseOffsetZ || 0)
    h.clone.scale.setScalar(computeBaseScale() * (poseValues.poseScale ?? 1))
  })
  updateWristCrop(poseValues.hideWrist || 0)
}

// Wrist crop — one clipping plane PER HAND (each hand faces a different
// direction once Phone Tilt rotates it, so each needs its own plane/
// normal), along the measured wrist->forearm normal, lerped from "no
// crop" (hideWrist=0) to "cropped at the wrist" (hideWrist=100).
// Simplified from HANDY DANDIES' own reactive-arm-length system (not
// ported — not part of this project's requested scope).
function updateWristCrop(hideWristPct) {
  if (!wristCropNormalAligned || !cfg.cropWristEnabled) {
    hands.forEach((h) => { h.skinnedMesh.material.clippingPlanes = [] })
    return
  }
  const t = THREE.MathUtils.clamp(hideWristPct / 100, 0, 1)
  const maxReach = handLengthRaw * computeBaseScale() * 0.35
  hands.forEach((h) => {
    if (!h.clipPlane) {
      h.clipPlane = new THREE.Plane()
      h.skinnedMesh.material.clippingPlanes = [h.clipPlane]
    }
    // wristPosRaw is a bind-pose, pre-transform local position —
    // material.clippingPlanes are evaluated in world space, so it needs
    // this hand's own current matrixWorld, not the raw bind-pose frame.
    h.clone.updateMatrixWorld(true)
    const worldWrist = h.clone.localToWorld(wristPosRaw.clone())
    // Points toward the forearm/sleeve side (three.js discards the
    // POSITIVE side of a clipping plane's normal).
    const worldNormal = wristCropNormalAligned.clone().applyQuaternion(h.wrapper.quaternion).normalize().negate()
    const planePoint = worldWrist.clone().addScaledVector(worldNormal, (1 - t) * maxReach)
    h.clipPlane.setFromNormalAndCoplanarPoint(worldNormal, planePoint)
  })
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
// Both real device tilt and the desktop mouse fallback are reduced to the
// same abstraction: a normalized 2D tilt vector (0..1 magnitude, radians
// angle). That vector becomes a target point on the hand's own facing
// plane, then reuses the exact HANDY DANDIES "rotate toward target"
// pattern (lookAt + optional roll + slerp damping).
let tiltMagnitude = 0, tiltAngle = 0
let latestOrientation = null
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0

function handleDeviceOrientation(e) {
  latestOrientation = e
  const beta = THREE.MathUtils.clamp(e.beta || 0, -90, 90)   // front-back tilt
  const gamma = THREE.MathUtils.clamp(e.gamma || 0, -90, 90) // left-right tilt
  const maxTilt = 45
  const nx = THREE.MathUtils.clamp(gamma / maxTilt, -1, 1)
  const ny = THREE.MathUtils.clamp(beta / maxTilt, -1, 1)
  tiltMagnitude = Math.min(Math.hypot(nx, ny), 1)
  tiltAngle = Math.atan2(ny, nx)
}
function handleMouseMoveFallback(e) {
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
function initMotionInput() {
  window.addEventListener('mousemove', handleMouseMoveFallback)
  if (typeof DeviceOrientationEvent === 'undefined') return
  const needsPermission = typeof DeviceOrientationEvent.requestPermission === 'function'
  if (needsPermission) {
    motionBtn.classList.remove('hidden')
    motionBtn.addEventListener('click', () => {
      DeviceOrientationEvent.requestPermission().then((state) => {
        if (state === 'granted') attachMotionListeners()
        motionBtn.classList.add('hidden')
      }).catch(() => {})
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().catch(() => {})
      }
    })
  } else {
    attachMotionListeners()
  }
}

const tiltTarget = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)
function computeRadialRollDeg(handPos, targetPos) {
  const dx = handPos.x - targetPos.x, dy = handPos.y - targetPos.y
  return THREE.MathUtils.radToDeg(Math.atan2(dx, -dy))
}
function computeRollQuat(baseDeg) {
  const axis = wristCropNormalAligned || new THREE.Vector3(0, 0, -1)
  return new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(baseDeg || 0) + THREE.MathUtils.degToRad(cfg.palmFaceRotationOffset || 0))
}
function updateTiltTarget() {
  const maxOffset = sceneState.fieldRadius * 1.2
  tiltTarget.set(tiltMagnitude * maxOffset * Math.cos(tiltAngle), tiltMagnitude * maxOffset * Math.sin(tiltAngle), sceneState.fieldRadius * cfg.targetDepthFactor)
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
  hands.forEach((h) => { if (h.wrapper.parent) h.wrapper.parent.remove(h.wrapper) })
  hands = []
  const rows = Math.max(1, Math.round(cfg.fieldRows))
  const cols = Math.max(1, Math.round(cfg.fieldCols))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wrapper = new THREE.Group()
      const clone = modelRoot.clone(true)
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

      hands.push({ wrapper, clone, skinnedMesh, outlineMesh: null, currentBaseQuat: alignQuat.clone(), clipPlane: null, row: r, col: c })
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
  }
  wristPosRaw = wristPos.clone()

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
const CAMERA_SYNC_PAIRS = [['sliderCameraX', 'cameraX'], ['sliderCameraY', 'cameraY'], ['sliderCameraZ', 'cameraZ'], ['sliderCameraFov', 'cameraFov']]
const LIGHTING_SYNC_PAIRS = [['sliderKeyAzimuth', 'keyAzimuth'], ['sliderKeyElevation', 'keyElevation'], ['sliderKeyTargetHeight', 'keyTargetHeight'], ['sliderKeyIntensity', 'keyIntensity'], ['colorKeyColor', 'keyColor'], ['sliderAmbientIntensity', 'ambientIntensity'], ['colorAmbientSkyColor', 'ambientSkyColor'], ['colorAmbientGroundColor', 'ambientGroundColor']]
const TOON_SYNC_PAIRS = [['sliderToonSteps', 'toonSteps'], ['sliderToonStepThreshold', 'toonStepThreshold'], ['sliderToonShadowFloor', 'toonShadowFloor'], ['sliderToonLightCeiling', 'toonLightCeiling'], ['colorToonBaseTint', 'toonBaseTint'], ['sliderTextureInfluence', 'textureInfluence'], ['colorToonTint', 'toonTint'], ['sliderRimIntensity', 'rimIntensity'], ['sliderRimPower', 'rimPower'], ['colorRimColor', 'rimColor']]
function syncPairsFromCfg(pairs) { pairs.forEach(([id, key]) => syncControlDom(id, cfg[key])) }

function applyCameraPreset(item) {
  const center = getHandCenterWorld()
  const rawOffset = new THREE.Vector3(item.x - item.tx, item.y - item.ty, item.z - item.tz)
  const dir = rawOffset.lengthSq() > 1e-6 ? rawOffset.normalize() : new THREE.Vector3(0, 0, 1)
  const radius = Math.max(handBoundsRadiusLocal * computeBaseScale(), 0.5)
  const distance = (radius / Math.sin(THREE.MathUtils.degToRad(item.fov / 2))) * 4.5
  const pos = center.clone().add(dir.multiplyScalar(distance))
  Object.assign(cfg, { cameraX: pos.x, cameraY: pos.y, cameraZ: pos.z, cameraFov: item.fov, targetX: center.x, targetY: center.y, targetZ: center.z })
  camera.position.copy(pos)
  camera.fov = item.fov
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.update()
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
function applyPosePreset(item) {
  Object.assign(cfg, item)
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
        if (pose) applyPoseValuesToHand(pose)
      } else {
        const a = SAVED_POSES.find((p) => p.name === seg.poseA)
        const b = SAVED_POSES.find((p) => p.name === seg.poseB)
        if (a && b) applyPoseValuesToHand(lerpPoseValues(a, b, seg.weight > 0 ? THREE.MathUtils.clamp(remaining / seg.weight, 0, 1) : 1))
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
  if (!isPaused) {
    if (cfg.trackingEnabled && hands.length) {
      updateTiltTarget()
      hands.forEach((h) => {
        const m = new THREE.Matrix4().lookAt(h.wrapper.position, tiltTarget, UP)
        const desired = new THREE.Quaternion().setFromRotationMatrix(m)
        const baseDeg = cfg.palmFacesCursor ? computeRadialRollDeg(h.wrapper.position, tiltTarget) : 0
        desired.multiply(computeRollQuat(baseDeg))
        h.wrapper.quaternion.slerp(desired, cfg.trackingDamping)
      })
    }
  }
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
  if (ctrl.type !== 'text' && ctrl.type !== 'number') HANDYSET_CONTROLS.push(ctrl)
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
function captureCameraFromLive() { return { x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov, tx: controls.target.x, ty: controls.target.y, tz: controls.target.z } }
function captureLightingFromLive() { const o = {}; LIGHTING_PRESET_KEYS.forEach((k) => { o[k] = cfg[k] }); return o }

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
  })
  overwriteBtn.addEventListener('click', () => {
    if (!state.selected) return
    const data = opts.captureCurrent ? opts.captureCurrent() : {}
    Object.assign(state.selected, data, { name: state.selected.name })
    render()
  })
  useBtn.addEventListener('click', () => { if (state.selected && opts.onUse) opts.onUse(state.selected) })
  renameBtn.addEventListener('click', () => {
    if (!state.selected) return
    const name = prompt('Rename to:', state.selected.name)
    if (!name || name === state.selected.name) return
    state.selected.name = name
    render()
  })
  deleteBtn.addEventListener('click', () => {
    if (!state.selected) return
    const idx = items.indexOf(state.selected)
    if (idx >= 0) items.splice(idx, 1)
    state.selected = null
    render()
  })
  groupBtn.addEventListener('click', () => {
    if (!state.selected) { alert('Select an item first, then + Group.'); return }
    const gname = prompt('Group name:')
    if (!gname) return
    state.selected.group = gname
    render()
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

  const subThumb = addSubgroup(content, 'THUMB')
  addFingerSliders(subThumb, 'thumb')

  const subWrist = addSubgroup(content, 'Wrist')
  ;[['wristRotation', -360, 360, 'Wrist Rotation (Deg)'], ['wristBend', -90, 90, 'Wrist Bend (Deg)'], ['wristSplay', -30, 30, 'Wrist Splay (Deg)']].forEach(([k, mn, mx, label]) => {
    addRow(subWrist, { id: 'slider' + k, label, type: 'slider', min: mn, max: mx, step: 1, value: cfg[k] })
    wireSlider('slider' + k, (v) => { cfg[k] = v; applyPoseValuesToHand(cfg) })
  })
  // "Default Arm Length (Crop %, Reactive Off)" in Handy Dandies -- that
  // exact label describes ITS OWN reactive-arm-length system (not ported
  // here, per this project's documented simplification), so kept as this
  // project's own accurate description instead of copying a label that
  // would misdescribe what the slider actually does here.
  addRow(subWrist, { id: 'checkboxCropWristEnabled', label: 'Crop Wrist (Master On/Off)', type: 'checkbox' })
  document.getElementById('checkboxCropWristEnabled').checked = cfg.cropWristEnabled
  wireCheckbox('checkboxCropWristEnabled', (v) => { cfg.cropWristEnabled = v; updateWristCrop(v ? cfg.hideWrist : 0) })
  addRow(subWrist, { id: 'sliderHideWrist', label: 'Hide Wrist (%)', type: 'slider', min: 0, max: 100, step: 1, value: cfg.hideWrist })
  wireSlider('sliderHideWrist', (v) => { cfg.hideWrist = v; if (cfg.cropWristEnabled) updateWristCrop(v) })

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

  renderPresetPicker(content, 'Saved Poses', SAVED_POSES, DEFAULT_POSE_NAME, applyPosePreset, capturePoseFromCfg, { exportable: true, importable: true, defaultFieldKey: 'defaultPose' })
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
  addRow(content, { id: 'checkboxCameraMaxExtentsEnabled', label: 'Set Default Camera As Max Extents', type: 'checkbox' })
  document.getElementById('checkboxCameraMaxExtentsEnabled').checked = cfg.cameraMaxExtentsEnabled
  wireCheckbox('checkboxCameraMaxExtentsEnabled', (v) => { cfg.cameraMaxExtentsEnabled = v; updateCameraMaxExtentsBound() })
  renderPresetPicker(content, 'Saved Cameras', SAVED_CAMERAS, DEFAULT_CAMERA_NAME, applyCameraPreset, captureCameraFromLive, { defaultFieldKey: 'defaultCamera' })
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
  const subTracking = addSubgroup(content, 'Tracking')
  addRow(subTracking, { id: 'checkboxTrackingEnabled', label: 'Tracking Enabled', type: 'checkbox' })
  document.getElementById('checkboxTrackingEnabled').checked = cfg.trackingEnabled
  wireCheckbox('checkboxTrackingEnabled', (v) => { cfg.trackingEnabled = v })
  addRow(subTracking, { id: 'sliderTrackingDamping', label: 'Look-At Damping (x)', type: 'slider', min: 0.02, max: 1, step: 0.01, value: cfg.trackingDamping })
  wireSlider('sliderTrackingDamping', (v) => { cfg.trackingDamping = v })

  const subTarget = addSubgroup(content, 'Target')
  addRow(subTarget, { id: 'sliderTargetDepthFactor', label: 'Cursor Target Depth (x Field Radius)', type: 'slider', min: -2, max: 2, step: 0.05, value: cfg.targetDepthFactor })
  wireSlider('sliderTargetDepthFactor', (v) => { cfg.targetDepthFactor = v })
  addRow(subTarget, { id: 'checkboxShowTargetMarker', label: 'Show Target Marker', type: 'checkbox' })
  document.getElementById('checkboxShowTargetMarker').checked = cfg.showTargetMarker
  wireCheckbox('checkboxShowTargetMarker', (v) => { cfg.showTargetMarker = v })

  const subPalm = addSubgroup(content, 'Palm Facing')
  addRow(subPalm, { id: 'checkboxPalmFacesCursor', label: 'Palm Faces Cursor', type: 'checkbox' })
  document.getElementById('checkboxPalmFacesCursor').checked = cfg.palmFacesCursor
  wireCheckbox('checkboxPalmFacesCursor', (v) => { cfg.palmFacesCursor = v })
  addRow(subPalm, { id: 'sliderPalmFaceRotationOffset', label: 'Palm Face Rotation (Deg)', type: 'slider', min: -180, max: 180, step: 1, value: cfg.palmFaceRotationOffset })
  wireSlider('sliderPalmFaceRotationOffset', (v) => { cfg.palmFaceRotationOffset = v })
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
  renderPresetPicker(content, 'Saved Lighting', SAVED_LIGHTING, DEFAULT_LIGHTING_NAME, applyLightingPreset, captureLightingFromLive, { defaultFieldKey: 'defaultLighting' })
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

  renderPresetPicker(content, 'Saved Toon Shading', SAVED_TOON, null, applyToonPreset, captureToonFromCfg, { exportable: true, importable: true, defaultFieldKey: 'defaultToon' })
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
  addBtnRow.className = 'dp-multi-select-add-row'
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
    () => ({ tweenPoses: cfg.tweenPoses.slice() }))

  const exportBtnRow = document.createElement('div'); exportBtnRow.className = 'dev-row'
  const exportBtn = document.createElement('button'); exportBtn.type = 'button'; exportBtn.textContent = 'Export Tween PNG Sequence'
  exportBtnRow.appendChild(exportBtn); content.appendChild(exportBtnRow)
  exportBtn.addEventListener('click', () => exportTweenSequence(exportBtn))
}

function renderDebugExtras() {
  /* eslint-disable-next-line no-undef */
  const debugContent = findGroupContent('desktop', 'Debug', 'renderDebugExtras', 'debugExtras')
  if (!debugContent) return
  addRow(debugContent, { id: 'checkboxShowGridHelper', label: 'Show Grid Helper', type: 'checkbox' })
  document.getElementById('checkboxShowGridHelper').checked = cfg.showGridHelper
  wireCheckbox('checkboxShowGridHelper', (v) => { cfg.showGridHelper = v; gridHelper.visible = v })
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
  renderCameraGroup(addGroup('Camera'))
  renderPhoneTiltGroup(addGroup('Phone Tilt'))
  renderLightingGroup(addGroup('Lighting'))
  renderToonGroup(addGroup('Toon Shading'))

  const bgContent = addGroup('Background')
  addRow(bgContent, { id: 'colorBgColor', label: 'Background Color', type: 'color', value: cfg.bgColor })
  wireColor('colorBgColor', (v) => { cfg.bgColor = v; scene.background.set(v) })

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

async function remoteSaveCurrentSettings() {
  const capture = await waitForDevPanelGlobal('captureFullDevPanelState')
  const snapshot = capture()
  const resp = await fetch(SAVE_SETTINGS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Dev-Panel-Secret': DEV_PANEL_SAVE_SECRET },
    body: JSON.stringify(snapshot)
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
    apply(data.settings)
  } catch (err) {
    console.warn('Remote dev panel settings unavailable (expected on a plain static server, e.g. local dev):', err.message)
  }
}

waitForDevPanelGlobal('saveDevPanelSettings').then(wireRemoteSaveButtons).catch((err) => console.warn(err.message))
loadRemoteSettingsOnStartup()
