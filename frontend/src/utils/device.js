const DEVICE_LABELS = {
  mobile: '移动端',
  tablet: '平板端',
  desktop: '桌面端',
}

function detectPlatform(userAgent = '') {
  const ua = userAgent.toLowerCase()
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios'
  if (ua.includes('android')) return 'android'
  if (ua.includes('windows')) return 'windows'
  if (ua.includes('mac os x') || ua.includes('macintosh')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

function detectBrowser(userAgent = '') {
  const ua = userAgent.toLowerCase()
  if (ua.includes('edg/')) return 'edge'
  if (ua.includes('chrome/') && !ua.includes('edg/')) return 'chrome'
  if (ua.includes('firefox/')) return 'firefox'
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'safari'
  return 'unknown'
}

function detectDeviceType({ width = 1440, userAgent = '', isTouch = false }) {
  const ua = userAgent.toLowerCase()
  const isTabletUa =
    ua.includes('ipad')
    || ua.includes('tablet')
    || ua.includes('playbook')
    || ua.includes('kindle')
    || ua.includes('silk')
    || (ua.includes('android') && !ua.includes('mobile'))
  const isMobileUa =
    ua.includes('iphone')
    || ua.includes('ipod')
    || ua.includes('windows phone')
    || ua.includes('opera mini')
    || (ua.includes('android') && ua.includes('mobile'))

  if (width <= 768) return 'mobile'
  if (width <= 1180 && (isTouch || isTabletUa || isMobileUa)) return 'tablet'
  if (isTabletUa) return 'tablet'
  if (isMobileUa) return 'mobile'
  if (width <= 1180) return 'tablet'
  return 'desktop'
}

export function getClientDeviceInfo() {
  if (typeof window === 'undefined') {
    return {
      deviceType: 'desktop',
      deviceLabel: DEVICE_LABELS.desktop,
      viewportWidth: 1440,
      viewportHeight: 900,
      orientation: 'landscape',
      platform: 'unknown',
      browser: 'unknown',
      isTouch: false,
      isMobileLayout: false,
      isTabletLayout: false,
      isCompactLayout: false,
    }
  }

  const userAgent = window.navigator.userAgent || ''
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1440
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 900
  const hasCoarsePointer =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false
  const isTouch = Boolean(window.navigator.maxTouchPoints > 0 || hasCoarsePointer)
  const deviceType = detectDeviceType({ width: viewportWidth, userAgent, isTouch })
  const isMobileLayout = viewportWidth < 992
  const isTabletLayout = !isMobileLayout && viewportWidth < 1280

  return {
    deviceType,
    deviceLabel: DEVICE_LABELS[deviceType] || DEVICE_LABELS.desktop,
    viewportWidth,
    viewportHeight,
    orientation: viewportWidth >= viewportHeight ? 'landscape' : 'portrait',
    platform: detectPlatform(userAgent),
    browser: detectBrowser(userAgent),
    isTouch,
    isMobileLayout,
    isTabletLayout,
    isCompactLayout: viewportWidth < 1280,
  }
}

export function getClientDeviceHeaders() {
  const info = getClientDeviceInfo()

  return {
    'X-CY-Device-Type': info.deviceType,
    'X-CY-Viewport-Width': String(info.viewportWidth),
    'X-CY-Viewport-Height': String(info.viewportHeight),
    'X-CY-Touch-Capable': info.isTouch ? 'true' : 'false',
    'X-CY-Platform': info.platform,
  }
}

export default getClientDeviceInfo
