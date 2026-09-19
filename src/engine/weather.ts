import type { WeatherState, WeatherForecast, TuningConstants, CircuitSpec } from './types'

type RNG = () => number

function compoundKey(compound: string): string {
  if (compound === 'I') return 'inter'
  if (compound === 'W') return 'wet'
  return 'dry'
}

export function generateWeatherTimeline(
  totalLaps: number,
  circuit: CircuitSpec,
  tuning: TuningConstants,
  rng: RNG,
  /** Forces lap 1 to DRY. Later laps evolve normally -- see RaceConfig.dryStart. */
  dryStart = false,
): WeatherState[] {
  const { rainProbability = 0.1, weatherBias = 'stable' } = circuit
  const tl = tuning.weather.timeline
  const bias = tl.intensityBias[weatherBias] ?? 0.2

  /*
   * The rolls are consumed EXACTLY as before and the result is overridden
   * afterwards, deliberately.
   *
   * The obvious refactor -- hoisting both rolls into consts and testing
   * dryStart in the condition -- consumes two rolls unconditionally, where
   * this expression short-circuits and consumes the second only when the
   * first says rain. That shifts the weather stream for every race whose
   * opening roll was dry, which broke four scenario tests, driverError and
   * the 8000-race strategy validation. The RNG stream is the contract.
   */
  let state: WeatherState = rng() < rainProbability ? (rng() < 0.5 ? 'WET' : 'DAMP') : 'DRY'
  // Constrains the OPENING conditions only; the timeline below evolves from
  // here exactly as it would have, so rain can still arrive later.
  if (dryStart) state = 'DRY'
  const timeline: WeatherState[] = [state]
  let lapsSinceChange = 0

  for (let lap = 1; lap < totalLaps; lap++) {
    lapsSinceChange++
    let next: WeatherState = state

    if (state === 'DRY' && lapsSinceChange >= tl.minDuration) {
      if (rng() < bias / tl.minDuration) next = 'DAMP'
    } else if (state === 'DAMP') {
      if (rng() < bias * 0.5) next = 'WET'
      else if (rng() < (1 - bias) * 0.4) next = 'DRY'
    } else if (state === 'WET' && lapsSinceChange >= tl.minDuration) {
      if (rng() < (1 - bias) * 0.3) next = 'DAMP'
    }

    if (next !== state) lapsSinceChange = 0
    state = next
    timeline.push(state)
  }

  return timeline
}

export function getWeatherForecast(
  currentLap: number,
  timeline: WeatherState[],
  confidence: number,
  rng: RNG,
): WeatherForecast {
  const currentState = timeline[currentLap] ?? 'DRY'
  const lap1 = timeline[currentLap + 1] ?? currentState
  const actualLap2 = timeline[currentLap + 2] ?? lap1
  const lap2 = rng() < confidence ? actualLap2 : currentState

  return { currentState, lap1, lap2, lap2Confidence: confidence }
}

export function optimalCompoundType(state: WeatherState): 'dry' | 'wet' {
  return state === 'DRY' ? 'dry' : 'wet'
}

export function crossoverPenalty(
  compound: string,
  weather: WeatherState,
  tuning: TuningConstants,
): number {
  const key = compoundKey(compound)
  return tuning.weather.crossoverPenalty[key]?.[weather] ?? 0
}
