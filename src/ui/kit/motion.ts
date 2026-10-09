import { useEffect, useState } from 'react'
import { useSettingsStore } from '@state/settingsStore'

export const EASE = [0.2, 0, 0, 1] as const

export function useReducedMotion(): boolean {
  return useSettingsStore(s => s.reducedMotion)
}

/** Enter by snapping along the slant (spec §5); opacity only when reduced. */
export function snapIn(reduced: boolean, index = 0) {
  return reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.12 } }
    : { initial: { opacity: 0, x: -18 }, animate: { opacity: 1, x: 0 }, transition: { duration: 0.18, ease: EASE, delay: index * 0.04 } }
}

/** Counts from 0 to target over durationMs on a timer; instant under reduced motion. */
export function useCountUp(target: number, durationMs = 600): number {
  const reduced = useReducedMotion()
  const [value, setValue] = useState(reduced ? target : 0)
  useEffect(() => {
    if (reduced) { setValue(target); return }
    const steps = Math.max(1, Math.round(durationMs / 16))
    let i = 0
    setValue(0)
    const id = setInterval(() => {
      i++
      setValue(i >= steps ? target : Math.round((target * i) / steps))
      if (i >= steps) clearInterval(id)
    }, 16)
    return () => clearInterval(id)
  }, [target, durationMs, reduced])
  return value
}
