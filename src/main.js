import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

const MODEL_URL = 'data/processed/HAND3D/Hand2.glb'
const loadingEl = document.getElementById('loading')
const motionBtn = document.getElementById('motionPermissionBtn')

// ---------------------------------------------------------------------
// Live tunable state (dev-panel-backed). Plain object, read/written
// directly by control event listeners further down.
// ---------------------------------------------------------------------
const cfg = {
  // Field Layout
  handScale: 1.55,
  // Pose (finger/wrist/whole-hand — filled from POSE_KEY_DEFAULTS below)
  // Camera
  cameraX: 3.598517809628556, cameraY: 31.35475415298584, cameraZ: 60.28634317626074,
  cameraFov: 32, targetX: 3.5985178096286012, targetY: 31.35475415298582, targetZ: -314.71365682373926,
  // Phone Tilt (renamed from Cursor Tracking)
  trackingEnabled: false, trackingDamping: 1, targetDepthFactor: 0.6,
  showTargetMarker: false, palmFacesCursor: false, palmFaceRotationOffset: 0,
  // Lighting
  keyAzimuth: 117, keyElevation: 56, keyTargetHeight: 71, keyIntensity: 6, keyColor: '#ffffff',
  ambientIntensity: 0, ambientSkyColor: '#ffffff', ambientGroundColor: '#3a2f2a',
  // Toon Shading
  toonSteps: 2, toonStepThreshold: 2.7, toonShadowFloor: 7, toonLightCeiling: 100, toonBaseTint: '#ffffff',
  outlineEnabled: false, outlineColor: '#000000', outlineThickness: 2, outlineStrength: 5, outlineGlow: 0,
  // Background
  bgColor: '#ffffff',
  // Tween
  tweenPoses: [], tweenSpeedMs: 2000,
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
let hand = null // { wrapper, clone, skinnedMesh, outlineMesh, currentBaseQuat }

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
  if (!hand) return
  applyCurlToSkeleton(fingerName, hand.skinnedMesh.skeleton, hand.currentBaseQuat, hand.wrapper.quaternion, cfg)
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

// Single entry point: apply a full pose-values object to the one visible
// hand. Used directly by Pose-group sliders, saved-pose "Use", and Tween.
function applyPoseValuesToHand(poseValues) {
  if (!hand) return
  hand.currentBaseQuat.copy(computeBaseQuatFromValues(poseValues))
  applyWristPoseToSkeleton(hand.skinnedMesh.skeleton, poseValues)
  FINGER_NAMES.forEach((name) => applyCurlToSkeleton(name, hand.skinnedMesh.skeleton, hand.currentBaseQuat, hand.wrapper.quaternion, poseValues))
  hand.clone.position.set(poseValues.poseOffsetX || 0, poseValues.poseOffsetY || 0, poseValues.poseOffsetZ || 0)
  hand.clone.scale.setScalar(computeBaseScale() * (poseValues.poseScale ?? 1))
  updateWristCrop(poseValues.hideWrist || 0)
}

// Wrist crop — single clipping plane along the measured wrist->forearm
// normal, lerped from "no crop" (hideWrist=0) to "cropped at the wrist"
// (hideWrist=100). Simplified from HANDY DANDIES' own reactive-arm-length
// system (not ported — not part of this project's requested scope).
let wristClipPlane = null
function updateWristCrop(hideWristPct) {
  if (!hand || !wristCropNormalAligned) return
  if (!wristClipPlane) {
    wristClipPlane = new THREE.Plane()
    hand.skinnedMesh.material.clippingPlanes = [wristClipPlane]
    if (hand.outlineMesh) hand.outlineMesh.material.clippingPlanes = [wristClipPlane]
  }
  const t = THREE.MathUtils.clamp(hideWristPct / 100, 0, 1)
  // wristPosRaw is a bind-pose, pre-transform local position (measured
  // directly off the loaded GLB) — material.clippingPlanes are evaluated
  // in world space, so it needs the clone's actual current matrixWorld,
  // not the raw bind-pose frame (a bug on the first pass here: the plane
  // was defined in the un-transformed bind-pose frame while the mesh
  // itself renders fully transformed).
  //
  // The visible sleeve/forearm mesh turned out to extend WAY past the
  // 'rForearmBend' bone's own position (confirmed via a wide diagnostic
  // screenshot during initial live verification — a long dark sleeve with
  // only a small fist-colored patch at the wrist end) — lerping between
  // the wrist and forearm-BONE positions barely moved the plane relative
  // to that much longer visible mesh. Using a generous fixed multiple of
  // handLengthRaw as the "fully uncropped" reach instead, measured from
  // the wrist along the forearm direction: t=0 -> plane far out past the
  // visible sleeve (nothing cropped); t=1 -> plane at the wrist itself
  // (crops the whole sleeve, only the hand past the wrist remains).
  hand.clone.updateMatrixWorld(true)
  const worldWrist = hand.clone.localToWorld(wristPosRaw.clone())
  // Points toward the forearm/sleeve side (three.js discards the POSITIVE
  // side of a clipping plane's normal) — was inverted on an earlier pass,
  // caught via explicit distanceToPoint() checks at the wrist vs. the
  // hand's own visible center, which should never land on the same side.
  const worldNormal = wristCropNormalAligned.clone().applyQuaternion(hand.wrapper.quaternion).normalize().negate()
  const maxReach = handLengthRaw * computeBaseScale() * 0.35
  const planePoint = worldWrist.clone().addScaledVector(worldNormal, (1 - t) * maxReach)
  wristClipPlane.setFromNormalAndCoplanarPoint(worldNormal, planePoint)
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
function makeGradientTexture() {
  const size = 64
  const data = new Uint8Array(size)
  const floor = cfg.toonShadowFloor / 100, ceil = cfg.toonLightCeiling / 100
  for (let i = 0; i < size; i++) {
    let t = Math.pow(i / (size - 1), cfg.toonStepThreshold)
    const stepped = Math.floor(t * cfg.toonSteps) / Math.max(cfg.toonSteps - 1, 1)
    data[i] = Math.round(THREE.MathUtils.clamp(floor + stepped * (ceil - floor), 0, 1) * 255)
  }
  const tex = new THREE.DataTexture(data, size, 1, THREE.RedFormat)
  tex.needsUpdate = true
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  return tex
}
function rebuildGradientMap() {
  if (!hand) return
  hand.skinnedMesh.material.gradientMap = makeGradientTexture()
  hand.skinnedMesh.material.needsUpdate = true
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
function initMotionInput() {
  if (isTouchDevice && typeof DeviceOrientationEvent !== 'undefined') {
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
  } else {
    window.addEventListener('mousemove', handleMouseMoveFallback)
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
// Field build (single hand, always centered at origin)
// =======================================================================
function rebuildField() {
  if (hand) hand.wrapper.parent && hand.wrapper.parent.remove(hand.wrapper)
  const wrapper = new THREE.Group()
  const clone = modelRoot.clone(true)
  clone.quaternion.copy(alignQuat)
  clone.scale.setScalar(computeBaseScale())
  wrapper.add(clone)
  scene.add(wrapper)

  const skinnedMesh = findSkinnedMesh(clone)
  skinnedMesh.material = toonMaterial.clone()
  skinnedMesh.material.color.set(cfg.toonBaseTint)
  skinnedMesh.material.gradientMap = makeGradientTexture()

  hand = { wrapper, clone, skinnedMesh, outlineMesh: null, currentBaseQuat: alignQuat.clone() }
  outlinePass.selectedObjects = [clone]
  sceneState.fieldRadius = Math.max(handBoundsRadiusLocal * computeBaseScale(), 5)
  updateKeyLightPosition()
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
new GLTFLoader().load(MODEL_URL, (gltf) => {
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

  toonMaterial = new THREE.MeshToonMaterial({ map: skinned.material.map || null, color: cfg.toonBaseTint })
  modelRoot = root

  rebuildField()
  applyDefaultSelections()
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
}
function applyLightingPreset(item) {
  Object.assign(cfg, item)
  hemiLight.intensity = cfg.ambientIntensity
  hemiLight.color.set(cfg.ambientSkyColor)
  hemiLight.groundColor.set(cfg.ambientGroundColor)
  keyLight.intensity = cfg.keyIntensity
  keyLight.color.set(cfg.keyColor)
  updateKeyLightPosition()
}
function applyPosePreset(item) {
  Object.assign(cfg, item)
  applyPoseValuesToHand(cfg)
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
// Tween playback (ordered saved-pose list, applies directly to the hand)
// =======================================================================
function lerpPoseValues(a, b, t) {
  const out = {}
  POSE_PRESET_KEYS.forEach((k) => { out[k] = THREE.MathUtils.lerp(a[k] ?? 0, b[k] ?? 0, t) })
  return out
}
let tweenPlay = null
function playTween() {
  const poses = cfg.tweenPoses.map((name) => SAVED_POSES.find((p) => p.name === name)).filter(Boolean)
  if (!poses.length) return
  tweenPlay = { poses, startMs: performance.now(), speedMs: Math.max(cfg.tweenSpeedMs, 1) }
}
function updateTween() {
  if (!tweenPlay) return
  const segMs = tweenPlay.speedMs
  const totalMs = segMs * Math.max(tweenPlay.poses.length - 1, 1)
  const elapsed = performance.now() - tweenPlay.startMs
  const t = THREE.MathUtils.clamp(elapsed / totalMs, 0, 1)
  const segCount = tweenPlay.poses.length - 1
  const segT = t * segCount
  const i0 = Math.min(Math.floor(segT), segCount - 1 < 0 ? 0 : segCount - 1)
  const localT = segCount > 0 ? segT - i0 : 0
  const a = tweenPlay.poses[i0], b = tweenPlay.poses[Math.min(i0 + 1, tweenPlay.poses.length - 1)]
  applyPoseValuesToHand(lerpPoseValues(a, b, localT))
  if (t >= 1) tweenPlay = null
}

// =======================================================================
// Render loop
// =======================================================================
window.__debug = {
  camera, controls, cfg, scene, THREE,
  get hand() { return hand }, get sceneState() { return sceneState },
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

function animate() {
  requestAnimationFrame(animate)
  if (renderer.getSize(new THREE.Vector2()).width !== window.innerWidth || renderer.getSize(new THREE.Vector2()).height !== window.innerHeight) {
    applyRendererSize(window.innerWidth, window.innerHeight)
  }
  controls.update()
  if (cfg.trackingEnabled && hand) {
    updateTiltTarget()
    const m = new THREE.Matrix4().lookAt(hand.wrapper.position, tiltTarget, UP)
    const desired = new THREE.Quaternion().setFromRotationMatrix(m)
    const baseDeg = cfg.palmFacesCursor ? computeRadialRollDeg(hand.wrapper.position, tiltTarget) : 0
    desired.multiply(computeRollQuat(baseDeg))
    hand.wrapper.quaternion.slerp(desired, cfg.trackingDamping)
  }
  updateTween()
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

function addFingerSliders(content, finger) {
  const defs = [
    [FINGER_CURL_KEY[finger], 'Curl', -200, 200], [FINGER_SPLAY_KEY[finger], 'Splay', -200, 200],
    [FINGER_SPLAY2_KEY[finger], 'Splay 2', -200, 200], [FINGER_CURL_BIAS_KEY[finger], 'Curl Bias', -100, 100],
    [FINGER_BASE_ONLY_CURL_KEY[finger], 'Base-Only Curl', -200, 200], [FINGER_MID_ONLY_CURL_KEY[finger], 'Mid-Only Curl', -200, 200],
    [FINGER_TIP_ONLY_CURL_KEY[finger], 'Tip-Only Curl', -200, 200], [FINGER_TIP_TWIST_KEY[finger], 'Tip Twist', -100, 100]
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

function renderPresetPicker(content, title, items, defaultName, applyFn, captureFn) {
  const sub = addSubgroup(content, title)
  const selectId = 'select' + title.replace(/\s+/g, '')
  addRow(sub, { id: selectId, label: 'Preset', type: 'select', options: items.map((i) => ({ value: i.name, text: i.name })) })
  const selectEl = document.getElementById(selectId)
  selectEl.value = defaultName
  const btnRow = document.createElement('div')
  btnRow.className = 'dev-buttons'
  const useBtn = document.createElement('button'); useBtn.textContent = 'USE'
  const saveBtn = document.createElement('button'); saveBtn.textContent = 'SAVE AS NEW'
  const deleteBtn = document.createElement('button'); deleteBtn.textContent = 'DELETE'
  btnRow.append(useBtn, saveBtn, deleteBtn)
  sub.appendChild(btnRow)
  useBtn.addEventListener('click', () => { const item = items.find((i) => i.name === selectEl.value); if (item) applyFn(item) })
  saveBtn.addEventListener('click', () => {
    const name = prompt('Name this preset:')
    if (!name) return
    const captured = captureFn(); captured.name = name
    items.push(captured)
    const opt = document.createElement('option'); opt.value = name; opt.textContent = name
    selectEl.appendChild(opt); selectEl.value = name
  })
  deleteBtn.addEventListener('click', () => {
    if (items.length <= 1) return
    const idx = items.findIndex((i) => i.name === selectEl.value)
    if (idx < 0) return
    items.splice(idx, 1)
    selectEl.remove(selectEl.selectedIndex)
    selectEl.value = items[0].name
  })
}

function renderPoseGroup(content) {
  const subWhole = addSubgroup(content, 'Whole-Hand Rotation & Thumb')
  ;[['modelRotX', -180, 180], ['modelRotY', -180, 180], ['modelRotZ', -180, 180]].forEach(([k, mn, mx]) => {
    addRow(subWhole, { id: 'slider' + k, label: k, type: 'slider', min: mn, max: mx, step: 1, value: cfg[k] })
    wireSlider('slider' + k, (v) => { cfg[k] = v; applyPoseValuesToHand(cfg) })
  })
  addFingerSliders(subWhole, 'thumb')

  const subWrist = addSubgroup(content, 'Wrist')
  ;[['wristBend', -90, 90], ['wristSplay', -30, 30], ['wristRotation', -180, 180]].forEach(([k, mn, mx]) => {
    addRow(subWrist, { id: 'slider' + k, label: k, type: 'slider', min: mn, max: mx, step: 1, value: cfg[k] })
    wireSlider('slider' + k, (v) => { cfg[k] = v; applyPoseValuesToHand(cfg) })
  })
  addRow(subWrist, { id: 'sliderHideWrist', label: 'Hide Wrist (%)', type: 'slider', min: 0, max: 100, step: 1, value: cfg.hideWrist })
  wireSlider('sliderHideWrist', (v) => { cfg.hideWrist = v; updateWristCrop(v) })

  ;['index', 'middle', 'ring', 'pinky'].forEach((f) => {
    const sub = addSubgroup(content, f.charAt(0).toUpperCase() + f.slice(1))
    addFingerSliders(sub, f)
  })

  ;[['poseOffsetX', -20, 20], ['poseOffsetY', -20, 20], ['poseOffsetZ', -20, 20]].forEach(([k, mn, mx]) => {
    addRow(content, { id: 'slider' + k, label: k, type: 'slider', min: mn, max: mx, step: 0.1, value: cfg[k] })
    wireSlider('slider' + k, (v) => { cfg[k] = v; applyPoseValuesToHand(cfg) })
  })
  addRow(content, { id: 'sliderPoseScale', label: 'Pose Scale (x)', type: 'slider', min: 0.1, max: 3, step: 0.05, value: cfg.poseScale })
  wireSlider('sliderPoseScale', (v) => { cfg.poseScale = v; applyPoseValuesToHand(cfg) })

  renderPresetPicker(content, 'Saved Poses', SAVED_POSES, DEFAULT_POSE_NAME, applyPosePreset, capturePoseFromCfg)
}

function renderCameraGroup(content) {
  addRow(content, { id: 'sliderCameraX', label: 'Camera X', type: 'slider', min: -500, max: 500, step: 0.5, value: cfg.cameraX })
  wireSlider('sliderCameraX', (v) => { cfg.cameraX = v; camera.position.x = v })
  addRow(content, { id: 'sliderCameraY', label: 'Camera Y', type: 'slider', min: -500, max: 500, step: 0.5, value: cfg.cameraY })
  wireSlider('sliderCameraY', (v) => { cfg.cameraY = v; camera.position.y = v })
  addRow(content, { id: 'sliderCameraZ', label: 'Camera Z', type: 'slider', min: -500, max: 500, step: 0.5, value: cfg.cameraZ })
  wireSlider('sliderCameraZ', (v) => { cfg.cameraZ = v; camera.position.z = v })
  addRow(content, { id: 'sliderCameraFov', label: 'Field Of View (Deg)', type: 'slider', min: 15, max: 90, step: 1, value: cfg.cameraFov })
  wireSlider('sliderCameraFov', (v) => { cfg.cameraFov = v; camera.fov = v; camera.updateProjectionMatrix() })
  renderPresetPicker(content, 'Saved Cameras', SAVED_CAMERAS, DEFAULT_CAMERA_NAME, applyCameraPreset, captureCameraFromLive)
}

function renderPhoneTiltGroup(content) {
  const subTracking = addSubgroup(content, 'Tracking')
  addRow(subTracking, { id: 'checkboxTrackingEnabled', label: 'Tracking Enabled', type: 'checkbox' })
  document.getElementById('checkboxTrackingEnabled').checked = cfg.trackingEnabled
  wireCheckbox('checkboxTrackingEnabled', (v) => { cfg.trackingEnabled = v })
  addRow(subTracking, { id: 'sliderTrackingDamping', label: 'Look-At Damping (x)', type: 'slider', min: 0.02, max: 1, step: 0.01, value: cfg.trackingDamping })
  wireSlider('sliderTrackingDamping', (v) => { cfg.trackingDamping = v })

  const subTarget = addSubgroup(content, 'Target')
  addRow(subTarget, { id: 'sliderTargetDepthFactor', label: 'Tilt Target Depth (x Field Radius)', type: 'slider', min: -2, max: 2, step: 0.05, value: cfg.targetDepthFactor })
  wireSlider('sliderTargetDepthFactor', (v) => { cfg.targetDepthFactor = v })
  addRow(subTarget, { id: 'checkboxShowTargetMarker', label: 'Show Target Marker', type: 'checkbox' })
  document.getElementById('checkboxShowTargetMarker').checked = cfg.showTargetMarker
  wireCheckbox('checkboxShowTargetMarker', (v) => { cfg.showTargetMarker = v })

  const subPalm = addSubgroup(content, 'Palm Facing')
  addRow(subPalm, { id: 'checkboxPalmFacesCursor', label: 'Palm Faces Tilt Direction', type: 'checkbox' })
  document.getElementById('checkboxPalmFacesCursor').checked = cfg.palmFacesCursor
  wireCheckbox('checkboxPalmFacesCursor', (v) => { cfg.palmFacesCursor = v })
  addRow(subPalm, { id: 'sliderPalmFaceRotationOffset', label: 'Palm Face Rotation (Deg)', type: 'slider', min: -180, max: 180, step: 1, value: cfg.palmFaceRotationOffset })
  wireSlider('sliderPalmFaceRotationOffset', (v) => { cfg.palmFaceRotationOffset = v })
}

function renderLightingGroup(content) {
  addRow(content, { id: 'sliderKeyAzimuth', label: 'Key Azimuth (Deg)', type: 'slider', min: 0, max: 360, step: 1, value: cfg.keyAzimuth })
  wireSlider('sliderKeyAzimuth', (v) => { cfg.keyAzimuth = v; updateKeyLightPosition() })
  addRow(content, { id: 'sliderKeyElevation', label: 'Key Elevation (Deg)', type: 'slider', min: -89, max: 89, step: 1, value: cfg.keyElevation })
  wireSlider('sliderKeyElevation', (v) => { cfg.keyElevation = v; updateKeyLightPosition() })
  addRow(content, { id: 'sliderKeyTargetHeight', label: 'Key Light Aim Height (%)', type: 'slider', min: -100, max: 100, step: 1, value: cfg.keyTargetHeight })
  wireSlider('sliderKeyTargetHeight', (v) => { cfg.keyTargetHeight = v; updateKeyLightPosition() })
  addRow(content, { id: 'sliderKeyIntensity', label: 'Key Intensity', type: 'slider', min: 0, max: 6, step: 0.1, value: cfg.keyIntensity })
  wireSlider('sliderKeyIntensity', (v) => { cfg.keyIntensity = v; keyLight.intensity = v })
  addRow(content, { id: 'colorKeyColor', label: 'Key Color', type: 'color', value: cfg.keyColor })
  wireColor('colorKeyColor', (v) => { cfg.keyColor = v; keyLight.color.set(v) })
  addRow(content, { id: 'sliderAmbientIntensity', label: 'Ambient Intensity', type: 'slider', min: 0, max: 3, step: 0.05, value: cfg.ambientIntensity })
  wireSlider('sliderAmbientIntensity', (v) => { cfg.ambientIntensity = v; hemiLight.intensity = v })
  addRow(content, { id: 'colorAmbientSkyColor', label: 'Ambient Sky Color', type: 'color', value: cfg.ambientSkyColor })
  wireColor('colorAmbientSkyColor', (v) => { cfg.ambientSkyColor = v; hemiLight.color.set(v) })
  addRow(content, { id: 'colorAmbientGroundColor', label: 'Ambient Ground Color', type: 'color', value: cfg.ambientGroundColor })
  wireColor('colorAmbientGroundColor', (v) => { cfg.ambientGroundColor = v; hemiLight.groundColor.set(v) })
  renderPresetPicker(content, 'Saved Lighting', SAVED_LIGHTING, DEFAULT_LIGHTING_NAME, applyLightingPreset, captureLightingFromLive)
}

function renderToonGroup(content) {
  addRow(content, { id: 'sliderToonSteps', label: 'Toon Steps', type: 'slider', min: 2, max: 6, step: 1, value: cfg.toonSteps })
  wireSlider('sliderToonSteps', (v) => { cfg.toonSteps = v; rebuildGradientMap() })
  addRow(content, { id: 'sliderToonStepThreshold', label: 'Toon Step Threshold', type: 'slider', min: 0.2, max: 5, step: 0.05, value: cfg.toonStepThreshold })
  wireSlider('sliderToonStepThreshold', (v) => { cfg.toonStepThreshold = v; rebuildGradientMap() })
  addRow(content, { id: 'sliderToonShadowFloor', label: 'Toon Shadow Floor (%)', type: 'slider', min: 0, max: 90, step: 1, value: cfg.toonShadowFloor })
  wireSlider('sliderToonShadowFloor', (v) => { cfg.toonShadowFloor = v; rebuildGradientMap() })
  addRow(content, { id: 'sliderToonLightCeiling', label: 'Toon Light Ceiling (%)', type: 'slider', min: 10, max: 100, step: 1, value: cfg.toonLightCeiling })
  wireSlider('sliderToonLightCeiling', (v) => { cfg.toonLightCeiling = v; rebuildGradientMap() })
  addRow(content, { id: 'colorToonBaseTint', label: 'Toon Base Tint', type: 'color', value: cfg.toonBaseTint })
  wireColor('colorToonBaseTint', (v) => { cfg.toonBaseTint = v; if (hand) hand.skinnedMesh.material.color.set(v) })

  const outlineSub = addSubgroup(content, 'Outline')
  addRow(outlineSub, { id: 'checkboxOutlineEnabled', label: 'Outline Enabled', type: 'checkbox' })
  document.getElementById('checkboxOutlineEnabled').checked = cfg.outlineEnabled
  wireCheckbox('checkboxOutlineEnabled', (v) => { cfg.outlineEnabled = v; outlinePass.enabled = v })
  addRow(outlineSub, { id: 'colorOutlineColor', label: 'Outline Color', type: 'color', value: cfg.outlineColor })
  wireColor('colorOutlineColor', (v) => { cfg.outlineColor = v; outlinePass.edgeColor.set(v) })
  addRow(outlineSub, { id: 'sliderOutlineThickness', label: 'Outline Thickness', type: 'slider', min: 0.1, max: 10, step: 0.1, value: cfg.outlineThickness })
  wireSlider('sliderOutlineThickness', (v) => { cfg.outlineThickness = v; outlinePass.edgeThickness = v })
  addRow(outlineSub, { id: 'sliderOutlineStrength', label: 'Outline Strength', type: 'slider', min: 0, max: 15, step: 0.5, value: cfg.outlineStrength })
  wireSlider('sliderOutlineStrength', (v) => { cfg.outlineStrength = v; outlinePass.edgeStrength = v })
  addRow(outlineSub, { id: 'sliderOutlineGlow', label: 'Outline Glow', type: 'slider', min: 0, max: 5, step: 0.1, value: cfg.outlineGlow })
  wireSlider('sliderOutlineGlow', (v) => { cfg.outlineGlow = v; outlinePass.edgeGlow = v })
}

function renderTweenGroup(content) {
  addRow(content, { id: 'selectTweenAddPose', label: 'Add Pose To Sequence', type: 'select', options: SAVED_POSES.map((p) => ({ value: p.name, text: p.name })) })
  const addBtnRow = document.createElement('div'); addBtnRow.className = 'dev-row'
  const addBtn = document.createElement('button'); addBtn.textContent = '+ Add'
  addBtnRow.appendChild(addBtn); content.appendChild(addBtnRow)
  const seqDisplay = document.createElement('div')
  seqDisplay.className = 'dev-value'
  seqDisplay.style.cssText = 'display:block; white-space:normal; padding:4px 0;'
  content.appendChild(seqDisplay)
  function refreshSeqDisplay() { seqDisplay.textContent = cfg.tweenPoses.length ? cfg.tweenPoses.join(' → ') : '(empty)' }
  addBtn.addEventListener('click', () => {
    const sel = document.getElementById('selectTweenAddPose')
    if (sel && sel.value) { cfg.tweenPoses.push(sel.value); refreshSeqDisplay() }
  })
  const clearBtnRow = document.createElement('div'); clearBtnRow.className = 'dev-row'
  const clearBtn = document.createElement('button'); clearBtn.textContent = 'Clear Sequence'
  clearBtnRow.appendChild(clearBtn); content.appendChild(clearBtnRow)
  clearBtn.addEventListener('click', () => { cfg.tweenPoses = []; refreshSeqDisplay() })
  addRow(content, { id: 'sliderTweenSpeedMs', label: 'Tween Speed (Ms)', type: 'slider', min: 100, max: 10000, step: 100, value: cfg.tweenSpeedMs })
  wireSlider('sliderTweenSpeedMs', (v) => { cfg.tweenSpeedMs = v })
  const runBtnRow = document.createElement('div'); runBtnRow.className = 'dev-row'
  const runBtn = document.createElement('button'); runBtn.textContent = 'Run Tween'
  runBtnRow.appendChild(runBtn); content.appendChild(runBtnRow)
  runBtn.addEventListener('click', () => playTween())
  refreshSeqDisplay()
}

function renderDebugExtras() {
  /* eslint-disable-next-line no-undef */
  const debugContent = findGroupContent('desktop', 'Debug', 'renderDebugExtras', 'debugExtras')
  if (!debugContent) return
  addRow(debugContent, { id: 'checkboxShowGridHelper', label: 'Show Grid Helper', type: 'checkbox' })
  document.getElementById('checkboxShowGridHelper').checked = cfg.showGridHelper
  wireCheckbox('checkboxShowGridHelper', (v) => { cfg.showGridHelper = v; gridHelper.visible = v })
  addRow(debugContent, { id: 'checkboxShowWireframe', label: 'Show Wireframe', type: 'checkbox' })
  wireCheckbox('checkboxShowWireframe', (v) => { cfg.showWireframe = v; if (hand) hand.skinnedMesh.material.wireframe = v })

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
  addRow(fieldContent, { id: 'sliderHandScale', label: 'Hand Scale (x)', type: 'slider', min: 0.1, max: 3, step: 0.05, value: cfg.handScale })
  wireSlider('sliderHandScale', (v) => { cfg.handScale = v; applyPoseValuesToHand(cfg) })

  renderPoseGroup(addGroup('Pose'))
  renderCameraGroup(addGroup('Camera'))
  renderPhoneTiltGroup(addGroup('Phone Tilt'))
  renderLightingGroup(addGroup('Lighting'))
  renderToonGroup(addGroup('Toon Shading'))

  const bgContent = addGroup('Background')
  addRow(bgContent, { id: 'colorBgColor', label: 'Background Color', type: 'color', value: cfg.bgColor })
  wireColor('colorBgColor', (v) => { cfg.bgColor = v; scene.background.set(v) })

  renderDebugExtras()
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
