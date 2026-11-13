import type { CircuitSpec, RaceState, TuningConstants, WeatherState } from './types'

/**
 * Laps of rubber on the racing line after `lap` completed laps (spec
 * 2026-10-24 §4.3, ruling R1). A pure fold over the weather timeline: each lap
 * lays one lap of rubber (capped at decayLaps), then a non-dry lap washes a
 * fraction off (ruling R2). With both wash rates 0 the arithmetic is exact
 * integers and equals min(decayLaps, lap), i.e. the 1.6 formula.
 */
export function rubberLaps(timeline: readonly WeatherState[], lap: number, tuning: TuningConstants): number {
  const { decayLaps, wash } = tuning.trackEvolution
  let r = 0
  for (let i = 0; i < lap; i++) {
    r = Math.min(decayLaps, r + 1)
    const w = timeline[i] ?? 'DRY'
    if (w !== 'DRY') {
      const f = wash[w]
      if (f > 0) r = r * (1 - f)
    }
  }
  return r
}

/** Undefined when nothing can wash (the 1.6 path: lapModel keeps car.lap). */
export function rubberLapsFor(state: Pick<RaceState, 'weatherTimeline' | 'lap'>, tuning: TuningConstants): number | undefined {
  const w = tuning.trackEvolution.wash
  if (w.DAMP === 0 && w.WET === 0) return undefined
  return rubberLaps(state.weatherTimeline, state.lap, tuning)
}

/** Fraction of full grip the racing line has, in [0, 1]. */
export function trackGrip(state: Pick<RaceState, 'weatherTimeline' | 'lap'>, tuning: TuningConstants): number {
  return Math.min(1, rubberLaps(state.weatherTimeline, state.lap, tuning) / tuning.trackEvolution.decayLaps)
}

/** Seconds per lap the green track costs now; the same expression lapModel uses, x3. */
export function trackPaceDelta(state: Pick<RaceState, 'weatherTimeline' | 'lap'>, tuning: TuningConstants): number {
  const { startDelta, decayLaps } = tuning.trackEvolution
  return startDelta * Math.max(0, 1 - rubberLaps(state.weatherTimeline, state.lap, tuning) / decayLaps)
}

/** 2.1 track temperature °C (spec §5.2): the circuit's value, else the default, plus the weather offset. */
export function trackTemp(circuit: CircuitSpec, weather: WeatherState, tuning: TuningConstants): number {
  return (circuit.trackTempC ?? tuning.tyreTemp.defaultTrackTemp) + tuning.tyreTemp.weatherOffset[weather]
}
