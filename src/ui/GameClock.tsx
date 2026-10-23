import { useEffect, useRef } from 'react'
import { useClockStore } from '@state/clockStore'
import { useRaceStore } from '@state/raceStore'
import { soundService } from '@audio/soundService'

// ms per sector: 2x and 4x are true multiples of 1x, so the labels mean what they say.
export const INTERVALS: Record<number, number> = { 1: 2000, 2: 1000, 4: 500 }

export function GameClock() {
  const speed = useClockStore(s => s.speed)
  const appVisible = useClockStore(s => s.appVisible)
  const step = useRaceStore(s => s.step)
  const phase = useRaceStore(s => s.phase)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPhaseRef = useRef(phase)

  useEffect(() => {
    if (prevPhaseRef.current === 'racing' && phase === 'finished') {
      soundService.play('finish')
    }
    prevPhaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    // appVisible: Capacitor's WebView keeps JS timers running in the
    // background, so without this the race carried on unseen. See clockStore.
    if (speed === 0 || phase !== 'racing' || !appVisible) return
    const ms = INTERVALS[speed] ?? 2000
    timerRef.current = setInterval(step, ms)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [speed, phase, step, appVisible])

  return null
}
