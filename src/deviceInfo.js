// Centralized device-identification utility — browser-provided information
// only, no fingerprinting. Primary path is User-Agent Client Hints
// (navigator.userAgentData); falls back to navigator.userAgent/platform
// parsing when Client Hints aren't supported (e.g. Safari, which doesn't
// implement userAgentData at all). Every field distinguishes CONFIRMED
// (the browser explicitly said so) from INFERRED (derived from other
// confirmed fields) from UNAVAILABLE (the browser never exposed it) — see
// modelSource/modelConfidence. Never guesses an exact device model from
// screen size, DPR, or any other indirect signal.

// Small, deliberately non-exhaustive brand map — only unambiguous model
// prefixes, per the spec's own "don't build a giant phone-model database"
// instruction. A model the browser reports that isn't recognized here
// simply leaves brand unset rather than guessing.
const MODEL_BRAND_PREFIXES = [
  [/^Pixel\b/i, 'Google'],
  [/^Nexus\b/i, 'Google'],
  [/^SM-|Galaxy\b/i, 'Samsung'],
  [/^OnePlus\b/i, 'OnePlus'],
  [/^Redmi\b|^Mi\s/i, 'Xiaomi'],
  [/^Moto\b|^XT\d/i, 'Motorola']
]
function inferBrandFromModel(model) {
  if (!model) return null
  const hit = MODEL_BRAND_PREFIXES.find(([re]) => re.test(model))
  return hit ? hit[1] : null
}

function isRealBrand(entry) {
  return entry && entry.brand && !/Not.?A.?Brand/i.test(entry.brand)
}

// Best-effort browser name/version parse from the traditional UA string —
// only used as a fallback when Client Hints aren't available, and never
// treated as an exact model source (per spec).
function parseBrowserFromUserAgent(ua) {
  const patterns = [
    [/Edg\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/CriOS\/([\d.]+)/, 'Chrome'], // Chrome on iOS
    [/FxiOS\/([\d.]+)/, 'Firefox'], // Firefox on iOS
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari\//, 'Safari']
  ]
  for (const [re, name] of patterns) {
    const m = ua.match(re)
    if (m) return { name, version: m[1] }
  }
  return { name: null, version: null }
}

function parsePlatformFromUserAgent(ua) {
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)) return 'iOS'
  if (/iPhone|iPod/i.test(ua)) return 'iOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X/i.test(ua)) return 'macOS'
  if (/CrOS/i.test(ua)) return 'ChromeOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return null
}

// Returns a Promise<DeviceInfo>. Never throws — every failure mode
// (missing API, rejected promise, empty values) degrades to whatever
// lower-level information is still available, per the spec's error-
// handling requirements.
export async function detectDeviceInfo() {
  const raw = { userAgent: navigator.userAgent, platformLegacy: navigator.platform || null }
  let deviceType = 'unknown'
  let brand = null
  let model = null
  let platform = null
  let platformVersion = null
  let browser = null
  let browserVersion = null
  let mobile = null
  let modelSource = 'unavailable'
  let modelConfidence = 'unavailable'

  const uaData = navigator.userAgentData
  const userAgentDataSupported = !!uaData

  if (uaData) {
    raw.uaDataMobile = uaData.mobile
    raw.uaDataPlatform = uaData.platform
    raw.uaDataBrands = Array.isArray(uaData.brands) ? uaData.brands.map((b) => `${b.brand} ${b.version}`) : null

    mobile = typeof uaData.mobile === 'boolean' ? uaData.mobile : null
    platform = uaData.platform || null

    if (Array.isArray(uaData.brands)) {
      const real = uaData.brands.find(isRealBrand)
      if (real) { browser = real.brand; browserVersion = real.version }
    }

    if (typeof uaData.getHighEntropyValues === 'function') {
      try {
        const hi = await uaData.getHighEntropyValues(['model', 'platformVersion', 'fullVersionList'])
        raw.highEntropyModel = hi.model
        raw.highEntropyPlatformVersion = hi.platformVersion
        raw.highEntropyFullVersionList = Array.isArray(hi.fullVersionList) ? hi.fullVersionList.map((b) => `${b.brand} ${b.version}`) : null

        if (hi.platformVersion) platformVersion = hi.platformVersion
        if (Array.isArray(hi.fullVersionList) && hi.fullVersionList.length) {
          const realFull = hi.fullVersionList.find(isRealBrand)
          if (realFull) { browser = realFull.brand; browserVersion = realFull.version }
        }
        modelSource = 'user-agent-client-hints'
        if (hi.model) { model = hi.model; modelConfidence = 'confirmed' }
        else { modelConfidence = 'unavailable' }
      } catch (err) {
        raw.highEntropyError = String((err && err.message) || err)
        modelSource = 'unavailable'
        modelConfidence = 'unavailable'
      }
    }
  }

  // Fallback / supplement from the traditional UA string — used whenever
  // Client Hints didn't supply a given field (not just when uaData is
  // entirely absent), since Client Hints' own low-entropy fields don't
  // cover browser name/version at all.
  if (!platform) platform = parsePlatformFromUserAgent(raw.userAgent)
  if (!browser) { const p = parseBrowserFromUserAgent(raw.userAgent); browser = p.name; browserVersion = browserVersion || p.version }
  if (mobile === null) mobile = /Mobi|Android/i.test(raw.userAgent) || (platform === 'iOS' && !/iPad/i.test(raw.userAgent))

  // deviceType: INFERRED from confirmed/derived platform+mobile signals
  // only — never from screen size or any indirect characteristic (per
  // spec). iPad specifically reports platform 'iOS' above via the UA
  // Macintosh+multi-touch heuristic (Apple's own documented UA quirk for
  // iPadOS Safari), not a guessed model.
  if (/iPad/i.test(raw.userAgent) || (platform === 'iOS' && /Macintosh/i.test(raw.userAgent))) deviceType = 'tablet'
  else if (platform === 'iOS') deviceType = 'phone'
  else if (mobile === true) deviceType = 'phone'
  else if (mobile === false && (platform === 'Windows' || platform === 'macOS' || platform === 'Linux' || platform === 'ChromeOS')) deviceType = 'desktop'
  else if (mobile === false) deviceType = 'tablet'

  // brand: INFERRED only from an unambiguous model string, or from a
  // platform that maps to exactly one manufacturer (Apple). Never
  // guessed from screen dimensions or other indirect signals.
  brand = inferBrandFromModel(model) || (platform === 'iOS' ? 'Apple' : (platform === 'macOS' ? 'Apple' : null))

  return {
    deviceType, brand, model,
    platform, platformVersion,
    browser, browserVersion,
    mobile,
    modelSource, modelConfidence,
    userAgentDataSupported,
    raw
  }
}
