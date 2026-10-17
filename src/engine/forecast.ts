import type { RaceConfig, RaceState, WeatherState } from './types'

/**
 * The weather strip's forecast (spec 2026-10-17 §3): honest but imprecise.
 * Pure, no rng. `fromLap`/`toLap` are laps AHEAD of the current lap (1 = the
 * next lap), inclusive, and always contain the true change lap (ruling R9).
 */
export type WeatherForecast =
  | { kind: 'steady' }
  | { kind: 'rain' | 'drying'; fromLap: number; toLap: number; chance: number }

const SEVERITY: Record<WeatherState, number> = { DRY: 0, DAMP: 1, WET: 2 }

/**
 * A fixed shift in [-1, 1) for one change in one race, hashed from the seed and
 * the ABSOLUTE lap of the change -- so the window keeps its side as the change
 * approaches instead of jumping about lap to lap. Same integer finaliser as
 * raceStore's projectionSeed.
 */
export function forecastOffset(seed: number, changeLap: number): number {
  let h = (seed ^ Math.imul(changeLap + 1, 0x9E3779B1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0
  h = (h ^ (h >>> 16)) >>> 0
  return (h / 4294967296) * 2 - 1
}

export function forecast(
  state: Pick<RaceState, 'lap' | 'weatherState' | 'weatherTimeline' | 'totalLaps'>,
  config: RaceConfig,
  horizon: number = config.tuning.weather.forecastHorizon,
): WeatherForecast {
  const w = config.tuning.weather
  // Laps still to start after the current one. 0 on the last lap and after the flag.
  const lapsLeft = state.totalLaps - state.lap - 1
  if (!(lapsLeft > 0)) return { kind: 'steady' }
  const now = state.weatherState
  const reach = Math.min(horizon, lapsLeft)
  for (let d = 1; d <= reach; d++) {
    const at = state.weatherTimeline[state.lap + d]
    if (at === undefined) break
    if (SEVERITY[at] === SEVERITY[now]) continue
    const half = w.forecastSpread[Math.min(d, w.forecastSpread.length - 1)] ?? 0
    const shift = Math.round(forecastOffset(config.seed, state.lap + d) * half)
    const raw = w.forecastConfidence[Math.min(d, w.forecastConfidence.length - 1)] ?? 0
    return {
      kind: SEVERITY[at] > SEVERITY[now] ? 'rain' : 'drying',
      fromLap: Math.max(1, d - half + shift),
      toLap: Math.min(lapsLeft, d + half + shift),
      chance: Math.round(raw * 20) / 20,
    }
  }
  return { kind: 'steady' }
}
