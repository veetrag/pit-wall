import { useEffect, useRef } from 'react'
import { useClockStore } from '@state/clockStore'
import { useRaceStore } from '@state/raceStore'
import { soundService } from '@audio/soundService'

const INTERVALS: Record<number, number> = { 1: 2000, 2: 500, 4: 100 }

export function GameClock() {
  const speed = useClockStore(s => s.speed)
  const step = useRaceStore(s => s.step)
  const phase = useRaceStore(s => s.phase)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPhaseRef = useRef(phase)

  useEffect(() => {
    if (prevPhaseRef.current === 'racing' && phase === 'finished') {
      soundService.play('positionGain')
    }
    prevPhaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (speed === 0 || phase !== 'racing') return
    const ms = INTERVALS[speed] ?? 2000
    timerRef.current = setInterval(step, ms)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [speed, phase, step])

  return null
}
