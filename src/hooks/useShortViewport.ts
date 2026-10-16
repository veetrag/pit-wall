import { useEffect, useState } from 'react'

/**
 * A phone short enough that a pinned footer starts crowding out the content:
 * 360x640 and 360x720/740 (older 16:9 and 18:9 Android phones). The 1.4 phone
 * pass measured the championship footer at ~260px on one of these.
 */
export const SHORT_VIEWPORT_QUERY = '(max-height: 740px)'

function query(): MediaQueryList | null {
  // Guarded: jsdom has no matchMedia unless a test installs one.
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(SHORT_VIEWPORT_QUERY)
}

/** True on a short viewport; follows rotation and window resizes. */
export function useShortViewport(): boolean {
  const [short, setShort] = useState(() => query()?.matches ?? false)
  useEffect(() => {
    const mq = query()
    if (!mq) return
    const onChange = (e: MediaQueryListEvent) => setShort(e.matches)
    setShort(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return short
}
