import { useEffect, useRef } from 'react'
import { useClockStore } from '@state/clockStore'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { soundService } from '@audio/soundService'

const INTERVALS: Record<number, number> = { 1: 2000, 2: 500, 4: 100 }

export function GameClock() {
  const speed = useClockStore(s => s.speed)
  const appVisible = useClockStore(s => s.appVisible)
  const step = useRaceStore(s => s.step)
  const phase = useRaceStore(s => s.phase)
  const weatherState = useRaceStore(s => s.raceState?.weatherState)
  const soundEnabled = useSettingsStore(s => s.soundEnabled)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevPhaseRef = useRef(phase)

  useEffect(() => {
    if (prevPhaseRef.current === 'racing' && phase === 'finished') {
      soundService.play('finish')
    }
    prevPhaseRef.current = phase
  }, [phase])

  // Engine/crowd/rain ambience — live for the whole race (incl. the start
  // sequence), torn down once it ends or if the player mutes sound mid-race.
  useEffect(() => {
    const active = (phase === 'starting' || phase === 'racing') && soundEnabled && appVisible
    if (active) soundService.startAmbience()
    else soundService.stopAmbience()
  }, [phase, soundEnabled, appVisible])

  useEffect(() => {
    if (weatherState) soundService.setWeather(weatherState)
  }, [weatherState])

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
