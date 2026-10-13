# iOS Motion API Mapping for HandySet

Status: source review and documentation, 2026-10-13  
Scope: HandySet's current web implementation in `src/main.js`, targeting Safari on iPhone. This is not a claim that browser APIs are identical to native Core Motion.

## Findings at a glance

HandySet is a web app. It cannot call `CMMotionManager` or read `CMDeviceMotion` directly unless the project is later wrapped in a native iOS app with a native-to-web bridge. Safari's WebKit motion events are the available web-facing surface.

Apple documents Core Motion as a fused/processed service that can expose attitude, unbiased rotation rate, gravity, user acceleration, and magnetic field. WebKit's `DeviceMotionEvent` exposes acceleration, acceleration including gravity, and rotation rate; `DeviceOrientationEvent` exposes alpha/beta/gamma and WebKit's compass heading/accuracy extensions. These are related concepts, not one-to-one identical contracts.

## Field-by-field mapping

| HandySet concept / code path | Browser input currently used | iOS web equivalent | Native Core Motion equivalent | Assessment |
|---|---|---|---|---|
| Raw accelerometer diagnostic ("Accel") | `devicemotion.accelerationIncludingGravity` | Same | `CMAccelerometerData.acceleration` or `CMDeviceMotion.gravity + userAcceleration` | Good raw comparison input; includes gravity. |
| Gravity-compensated acceleration, current default displacement path | `accelerationIncludingGravity` minus gravity reconstructed from `deviceorientation` | No separate standard browser gravity vector | `CMDeviceMotion.userAcceleration` | HandySet manually reconstructs gravity. Its result inherits errors/lag from orientation, so it is not equivalent to Core Motion's fused userAcceleration. |
| Native/browser acceleration displacement mode | `devicemotion.acceleration` | Same | Closest conceptual match: `CMDeviceMotion.userAcceleration` | Best direct browser-provided gravity-excluded candidate when non-null. Must validate actual availability, noise, axes, and behavior on target browsers. |
| Rotation integration | `devicemotion.rotationRate` | Same | `CMDeviceMotion.rotationRate` | Angular rates, not absolute orientation. Integrating them allows continuous turns but accumulates bias/drift. Browser units/axis conventions must be verified before comparing numerically. |
| Relative orientation / phone tilt | `deviceorientation.alpha/beta/gamma` | Same | `CMDeviceMotion.attitude` with an arbitrary reference frame is conceptually closest for relative change | Browser angles are Euler angles and are not a direct quaternion or guaranteed world attitude. Use them for relative tilt/re-baselining, not as a guaranteed absolute world pose. |
| Heading | `deviceorientation.webkitCompassHeading`, where available | WebKit extension | `CMDeviceMotion.heading` or attitude with magnetic/true-north reference frames | Compass heading is magnetic-north-relative and may be unavailable/invalid. Do not assume `alpha` is compass heading. |
| Explicit gravity vector | Not exposed as a dedicated standard `DeviceMotionEvent` property | No direct standard equivalent | `CMDeviceMotion.gravity` | Gap. Current manual gravity removal estimates this from orientation. |
| Magnetic-field vector and calibration | Not exposed as a standard DeviceMotionEvent field | No direct standard equivalent | `CMDeviceMotion.magneticField` and calibration accuracy | Gap. Browser can expose heading/accuracy on WebKit, not the full calibrated vector. |
| Sensor timestamp | HandySet currently derives dt from `performance.now()` on each event path | Event `interval` is also exposed, but not a robust absolute sample timestamp | Core Motion samples have timestamps | Keep capped monotonic dt for web integration; consider logging event interval and arrival dt separately. |

## What Apple's documentation does and does not establish

1. Core Motion processes raw sensor inputs and can provide device attitude, unbiased rotation rate, gravity, user acceleration, and magnetic field.
2. WebKit's motion event defines `acceleration` as user acceleration in m/s² and documents its axes: +x to the right of the screen, +y toward the top of the screen, +z out of the screen. It can be null when user acceleration is unavailable.
3. WebKit's orientation documentation says alpha/beta/gamma are offsets from an arbitrary direction and are suitable for tracking changes, not determining current real-world facing direction. It identifies `webkitCompassHeading` as the magnetic-north-relative heading.
4. None of these APIs provides physical position/displacement directly. Double-integrating acceleration remains vulnerable to sensor bias and drift, even when acceleration is gravity-compensated.
5. Core Motion's reference-frame choice (arbitrary Z-vertical, corrected arbitrary, magnetic north, or true north) is a native-app capability. A webpage cannot select those Core Motion frames through the standard browser event API.

## HandySet-specific observations from the current source

- `handleDeviceOrientation(e)` stores the latest orientation and uses beta/gamma for the general phone-tilt controls.
- `integratePhoneGyroRotation(e)` integrates `devicemotion.rotationRate` into a persistent quaternion. This should remain a separate rotation mode; do not replace it with Euler-angle reconstruction.
- `computePhoneLinearAccelDeviceLocal(e)` currently derives a gravity vector from `latestOrientation` and subtracts it from `accelerationIncludingGravity`.
- `computePhoneLinearAccelNative(e)` uses `e.acceleration` directly, returning null when the field is unavailable.
- Displacement then applies a raw-axis Y/Z swap before optional world-frame rotation in `worldPosition` mode. The source comments explicitly say that this swap needs a fresh controlled-axis test after changing acceleration sources. Do not silently change the order or axis mapping based only on documentation.
- The existing default is the manual gravity-subtraction path (`phoneDisplaceMode: 'acceleration'`); `nativeSensor` is an opt-in A/B mode. Preserve that default until comparable device logs show which input is better on the target iPhone/browser.
- The current iOS permission helper calls both permission APIs where present, but only waits for `DeviceOrientationEvent.requestPermission()` to grant before attaching both listeners. That couples the motion-event listener to orientation permission. The code update in this branch decouples the permission results and attaches listeners when at least one requested motion permission is granted.

## Recommended implementation order

### Implement now
- Keep the existing sensor modes and saved defaults unchanged.
- Request iOS motion/orientation permissions synchronously from the user's existing Tracking/Displace/Rotation control gesture.
- Handle the two permission results independently. Attach the listeners when at least one requested sensor permission is granted; each event stream will still be governed by its own browser permission.
- Continue treating missing `event.acceleration` as unavailable, not as a valid zero sample.
- Preserve the current axis mapping until a controlled iPhone test identifies the actual physical-to-visual mapping.

### Instrument and test on an iPhone
Log per sample: event arrival time, `event.interval`, whether `acceleration` is null, `accelerationIncludingGravity`, `rotationRate`, orientation alpha/beta/gamma/absolute, `webkitCompassHeading`, `webkitCompassAccuracy`, current mode, and the final post-mapping acceleration. Never log a synthetic zero for a missing field without also recording that it was missing.

Run the same repeatable trials for each available acceleration source:
1. Still, screen-up for 10 seconds.
2. Still, held vertically for 10 seconds.
3. Translate along one physical axis, stop, and hold still.
4. Repeat independently along the other two physical axes.
5. Rotate in place without translating.
6. Repeat with `acceleration` unavailable if the browser/device permits reproducing that case.

Compare the existing manual-gravity and `nativeSensor` shadow pipelines using the same event samples. Do not compare runs with different damping, ranges, reference distances, or curve settings. Only after raw signal quality and axis mapping are understood should the position integration/decay be tuned.

### Native wrapper only if needed
If Safari's event data proves insufficient, a native iOS wrapper can use Core Motion to expose `userAcceleration`, `gravity`, `attitude`, `rotationRate`, and magnetic-field data to the web app. That is a separate architecture change, not a browser-only patch.

## Official Apple references

- [Getting Processed Device-Motion Data (Core Motion)](https://developer.apple.com/documentation/coremotion/getting-processed-device-motion-data)
- [CMDeviceMotion](https://developer.apple.com/documentation/coremotion/cmdevicemotion)
- [CMDeviceMotion.userAcceleration](https://developer.apple.com/documentation/coremotion/cmdevicemotion/useracceleration)
- [CMAttitudeReferenceFrame](https://developer.apple.com/documentation/coremotion/cmattitudereferenceframe)
- [WebKit DeviceMotionEvent](https://developer.apple.com/documentation/webkitjs/devicemotionevent)
- [WebKit DeviceMotionEvent.acceleration](https://developer.apple.com/documentation/webkitjs/devicemotionevent/1629483-acceleration)
- [WebKit DeviceOrientationEvent](https://developer.apple.com/documentation/webkitjs/deviceorientationevent)
- [WebKit DeviceOrientationEvent.webkitCompassHeading](https://developer.apple.com/documentation/webkitjs/deviceorientationevent/1804777-webkitcompassheading)

## Validation limits

This source review is not a substitute for running Safari on a physical iPhone. It cannot establish the actual event rates, field availability, permission behavior, sensor-fusion lag, or which axis mapping feels correct on the target device. Those need device logs and controlled physical movements.
