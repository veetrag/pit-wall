import type { WeatherState, WeatherForecast, TuningConstants, CircuitSpec } from './types'
import { createRng } from './rng'

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


/**
 * THE ONE PLACE OPENING WEATHER IS DERIVED. Use this; do not call
 * generateWeatherTimeline with a hand-rolled RNG.
 *
 * Before this existed the derivation was copy-pasted into FOUR places --
 * initRace(), qualifying.ts, RaceSetup.tsx and Qualifying.tsx -- each
 * repeating the `seed + 999999` offset by hand. Adding `dryStart` to the race
 * config reached the two engine sites and neither UI one, so on a real phone
 * the setup screen announced WET and pre-selected the wet tyre, and the
 * qualifying screen said "TRACK WET - WETS ADVISED", for a race that started
 * DRY. Two screens confidently contradicting the race, from one missed
 * argument, twice.
 *
 * The offset is deliberate and load-bearing: weather runs on its own RNG
 * stream so that a qualifying session, a forecast preview and the race itself
 * all see the same weather without any of them consuming the main race seed.
 * That is precisely the kind of invariant that must live in one function.
 */
export function openingTimeline(opts: {
  laps: number
  circuit: CircuitSpec
  tuning: TuningConstants
  /** The race seed. */
  seed: number
  /** Explicit override, as RaceConfig.weatherSeed. Falls back to seed + 999999. */
  weatherSeed?: number
  /** Forces lap 1 to DRY -- see RaceConfig.dryStart. */
  dryStart?: boolean
}): WeatherState[] {
  const { laps, circuit, tuning, seed, weatherSeed, dryStart } = opts
  return generateWeatherTimeline(laps, circuit, tuning, createRng(weatherSeed ?? seed + 999999), dryStart)
}
