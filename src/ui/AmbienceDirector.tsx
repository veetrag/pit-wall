import { useEffect, useRef } from 'react'
import { useClockStore } from '@state/clockStore'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { soundService } from '@audio/soundService'
import { computeAmbienceMix, deriveAmbienceInput, makeAmbienceInput, makeAmbienceMix } from '@audio/ambienceMix'

/** How long the chequered-flag crowd swell plays before the bed fades out. */
export const CHEQUER_HOLD_MS = 6000

/**
 * Drives the ambient bed from race state. Renders nothing; re-renders at most
 * once per sim tick (a narrow raceState subscription), and reuses one input
 * and one mix object so a tick allocates nothing.
 */
export function AmbienceDirector() {
  const raceState = useRaceStore(s => s.raceState)
  const phase = useRaceStore(s => s.phase)
  const radioActive = useRaceStore(s => s.radioRequest !== null)
  const paused = useClockStore(s => s.speed === 0)
  const appVisible = useClockStore(s => s.appVisible)
  const soundEnabled = useSettingsStore(s => s.soundEnabled)
  const input = useRef(makeAmbienceInput())
  const mix = useRef(makeAmbienceMix())

  // Mix first, so a fresh start fades straight in to the right bed.
  useEffect(() => {
    // 'starting' runs with the clock at 0 until GO; only pause mid-race.
    const isPaused = paused && phase === 'racing'
    deriveAmbienceInput(raceState, phase, isPaused, radioActive, input.current)
    soundService.setAmbienceMix(computeAmbienceMix(input.current, mix.current))
  }, [raceState, phase, paused, radioActive])

  // Lifecycle: live through the race, a crowd swell after the flag, torn down
  // on mute or when the app is backgrounded (fades, never cuts).
  useEffect(() => {
    if (!soundEnabled || !appVisible) { soundService.stopAmbience(); return }
    if (phase === 'starting' || phase === 'racing' || phase === 'red_flag') {
      soundService.startAmbience()
      return
    }
    if (phase === 'finished') {
      // Swell for CHEQUER_HOLD_MS, then fade and stop even if results stay open.
      const t = setTimeout(() => soundService.stopAmbience(), CHEQUER_HOLD_MS)
      return () => clearTimeout(t)
    }
    soundService.stopAmbience()
  }, [phase, soundEnabled, appVisible])

  useEffect(() => () => soundService.stopAmbience(), [])

  return null
}
