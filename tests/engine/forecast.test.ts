import { describe, it, expect } from 'vitest'
import { forecast, forecastOffset } from '@engine/forecast'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { loadGameData } from '@data/validators'
import type { RaceConfig, RaceState, WeatherState } from '@engine/types'

const DATA = loadGameData()
const config: RaceConfig = {
  circuit: DATA.circuits['bengaluru']!, tuning: makeDeterministicTuning(), compounds: DATA.compounds,
  drivers: DATA.drivers.drivers, teams: DATA.cars.teams, strategies: DATA.strategies.defaults,
  playerDriverId: '__none__', seed: 4242,
}
const W = config.tuning.weather

function at(lap: number, timeline: WeatherState[], totalLaps = timeline.length): RaceState {
  return {
    lap, sector: 0, totalLaps, cars: [], sectorResults: [], overtakeEvents: [], safetyCar: null, incidents: [],
    trackEvolutionLaps: lap, rngState: 1, weatherTimeline: timeline, weatherState: timeline[lap] ?? 'DRY',
  }
}
/** `total` laps, DRY until `changeAt`, then `then`. */
function tl(total: number, changeAt: number, then: WeatherState, from: WeatherState = 'DRY'): WeatherState[] {
  return Array.from({ length: total }, (_, i) => (i < changeAt ? from : then))
}

describe('forecast (spec 1.6 §3)', () => {
  it('the shipped tables cover the horizon', () => {
    expect(W.forecastHorizon).toBe(10)
    expect(W.forecastSpread).toEqual([0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4])
    expect(W.forecastConfidence).toEqual([1, 1, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5])
  })

  it('ALWAYS CONTAINS THE TRUE CHANGE LAP, at every distance and seed', () => {
    for (const seed of [1, 2, 3, 4242, 99999]) {
      for (let d = 1; d <= 10; d++) {
        const f = forecast(at(10, tl(50, 10 + d, 'DAMP')), { ...config, seed })
        expect(f.kind).toBe('rain')
        if (f.kind === 'steady') continue
        expect(f.fromLap, `seed ${seed} d ${d}`).toBeLessThanOrEqual(d)
        expect(f.toLap, `seed ${seed} d ${d}`).toBeGreaterThanOrEqual(d)
        expect(f.fromLap).toBeGreaterThanOrEqual(1)
        expect(f.toLap - f.fromLap).toBeLessThanOrEqual(2 * W.forecastSpread[d]!)
        expect(f.chance).toBe(Math.round(W.forecastConfidence[d]! * 20) / 20)
      }
    }
  })

  it('names the direction: rain when it gets wetter, drying when it gets drier', () => {
    expect(forecast(at(10, tl(50, 14, 'WET', 'DAMP')), config).kind).toBe('rain')
    expect(forecast(at(10, tl(50, 14, 'DAMP', 'WET')), config).kind).toBe('drying')
    expect(forecast(at(10, tl(50, 14, 'DRY', 'DAMP')), config).kind).toBe('drying')
  })

  it('beyond the horizon, or no change at all: steady', () => {
    expect(forecast(at(10, tl(50, 21, 'WET')), config)).toEqual({ kind: 'steady' })
    expect(forecast(at(10, tl(50, 99, 'WET')), config)).toEqual({ kind: 'steady' })
  })

  it('NEAR THE FLAG: clamped inside the race, steady on the last lap and after the flag', () => {
    // 30 laps, now lap 26 (4 laps after this one), change at 29 (d = 3).
    const f = forecast(at(26, tl(30, 29, 'DAMP')), config)
    expect(f.kind).toBe('rain')
    if (f.kind !== 'steady') {
      expect(f.toLap).toBeLessThanOrEqual(3)
      expect(f.fromLap).toBeGreaterThanOrEqual(1)
      expect(Number.isFinite(f.chance)).toBe(true)
    }
    expect(forecast(at(29, tl(30, 29, 'DAMP')), config)).toEqual({ kind: 'steady' })
    expect(forecast(at(30, tl(30, 29, 'DAMP')), config)).toEqual({ kind: 'steady' })
  })

  it('does not jitter: the offset belongs to the change lap, not to the lap it is read on', () => {
    const signs = [12, 14, 16, 18].map(now => {
      const f = forecast(at(now, tl(50, 20, 'DAMP')), config)
      return f.kind === 'steady' ? 0 : Math.sign((f.fromLap + f.toLap) / 2 - (20 - now))
    })
    expect(new Set(signs.filter(s => s !== 0)).size, 'the shift never flips side as the change approaches').toBeLessThanOrEqual(1)
  })

  it('forecastOffset is deterministic and in [-1, 1)', () => {
    for (let k = 0; k < 500; k++) {
      const o = forecastOffset(k * 7919, k)
      expect(o).toBeGreaterThanOrEqual(-1)
      expect(o).toBeLessThan(1)
      expect(forecastOffset(k * 7919, k)).toBe(o)
    }
  })

  it('mutates nothing', () => {
    const s = at(10, tl(50, 15, 'WET'))
    const before = JSON.stringify(s)
    forecast(s, config)
    expect(JSON.stringify(s)).toBe(before)
  })
})
