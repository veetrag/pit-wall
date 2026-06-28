import type { WeatherState, WeatherForecast, TuningConstants, CircuitSpec } from './types'

type RNG = () => number

export function generateWeatherTimeline(
  totalLaps: number,
  circuit: CircuitSpec,
  tuning: TuningConstants,
  rng: RNG,
): WeatherState[] {
  const { rainProbability = 0.1 } = circuit
  const w = tuning.weather

  // Decide if race starts wet
  let state: WeatherState = rng() < rainProbability ? (rng() < 0.5 ? 'WET' : 'DAMP') : 'DRY'
  const timeline: WeatherState[] = [state]
  let lapsSinceChange = 0

  for (let lap = 1; lap < totalLaps; lap++) {
    lapsSinceChange++
    let next: WeatherState = state

    if (state === 'DRY' && lapsSinceChange >= w.minDryLaps) {
      if (rng() < w.dryToDampProb / w.minDryLaps) next = 'DAMP'
    } else if (state === 'DAMP') {
      if (rng() < w.dampToWetProb) next = 'WET'
      else if (rng() < w.dampToDryProb) next = 'DRY'
    } else if (state === 'WET' && lapsSinceChange >= w.minWetLaps) {
      if (rng() < w.wetToDampProb / w.minWetLaps) next = 'DAMP'
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
  // Fuzz lap2 at (1-confidence) rate
  const lap2 = rng() < confidence ? actualLap2 : currentState

  return { currentState, lap1, lap2, lap2Confidence: confidence }
}

export function optimalCompoundType(state: WeatherState): 'dry' | 'wet' {
  return state === 'DRY' ? 'dry' : 'wet'
}

export function crossoverPenalty(
  compound: string,
  compoundType: 'dry' | 'wet',
  weather: WeatherState,
  tuning: TuningConstants,
): number {
  const w = tuning.weather.crossoverPenalty
  if (compoundType === 'dry' && weather === 'WET') return w.dryInWet
  if (compoundType === 'dry' && weather === 'DAMP') return w.dryInDamp
  if (compoundType === 'wet' && weather === 'DRY') return w.wetInDry
  if (compoundType === 'wet' && weather === 'DAMP') return w.dampInDry
  return 0
}
