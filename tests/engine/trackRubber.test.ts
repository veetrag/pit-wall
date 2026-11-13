import { describe, it, expect } from 'vitest'
import { rubberLaps, rubberLapsFor, trackGrip, trackPaceDelta, trackTemp } from '@engine/track'
import { computeSectorTime } from '@engine/lapModel'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { WeatherState } from '@engine/types'

const OFF = makeDeterministicTuning()
const ON = makeDeterministicTuning({ trackEvolution: { wash: { DAMP: 0.35, WET: 0.80 } } })
const dry = (n: number): WeatherState[] => Array<WeatherState>(n).fill('DRY')

describe('track rubber (spec §4)', () => {
  it('with no wash it is exactly min(decayLaps, lap): the 1.6 formula', () => {
    for (const lap of [0, 1, 7, 20, 21, 55]) {
      const tl: WeatherState[] = [...dry(10), 'WET', 'WET', 'DAMP', ...dry(50)]
      expect(rubberLaps(tl, lap, OFF)).toBe(Math.min(20, lap))
    }
    expect(rubberLapsFor({ weatherTimeline: dry(60), lap: 12 }, OFF)).toBeUndefined()
  })

  it('a wet lap lays then washes 80%, a damp lap 35%', () => {
    const tl: WeatherState[] = [...dry(10), 'WET', 'DAMP', ...dry(5)]
    expect(rubberLaps(tl, 10, ON)).toBe(10)
    expect(rubberLaps(tl, 11, ON)).toBeCloseTo(11 * 0.2, 12)
    expect(rubberLaps(tl, 12, ON)).toBeCloseTo((11 * 0.2 + 1) * 0.65, 12)
    expect(rubberLaps(tl, 13, ON)).toBeCloseTo((11 * 0.2 + 1) * 0.65 + 1, 12)
  })

  it('grip is rubber / decayLaps, clamped; the pace cost mirrors lapModel', () => {
    const s = { weatherTimeline: dry(60), lap: 5 }
    expect(trackGrip(s, ON)).toBeCloseTo(0.25, 12)
    expect(trackPaceDelta(s, ON)).toBeCloseTo(0.30 * 0.75, 12)
    expect(trackGrip({ ...s, lap: 40 }, ON)).toBe(1)
  })

  it('lapModel uses ctx.rubberLaps when given and car.lap otherwise', () => {
    const config = makeConfig({}, 3)
    const car = { ...initRace(config).cars[0]!, lap: 10 }
    const t0 = computeSectorTime(config, car, 0, createRng(9)).sectorTime
    const tSame = computeSectorTime(config, car, 0, createRng(9), 'DRY', null, { rubberLaps: 10 }).sectorTime
    const tGreen = computeSectorTime(config, car, 0, createRng(9), 'DRY', null, { rubberLaps: 2 }).sectorTime
    expect(tSame).toBe(t0)
    expect(tGreen - t0).toBeCloseTo(0.30 * (8 / 20) / 3, 10)
  })

  it('stepSector applies the washed rubber track-wide: every car pays the same green-track cost', () => {
    // Task 3 review note: rubber is a property of the track, read once per tick.
    // Same state, same seed; only the wash differs. Lap 12 after two wet laps:
    // OFF has 12 laps of rubber, ON has (11 * 0.2 + 1) = 3.2 at lap 12.
    const tl: WeatherState[] = [...dry(10), 'WET', 'DRY', ...dry(60)]
    const cfgOff = { ...makeConfig({}, 4), tuning: OFF }
    const cfgOn = { ...cfgOff, tuning: ON }
    const s0 = initRace(cfgOff)
    const s = { ...s0, lap: 12, sector: 0 as const, weatherState: 'DRY' as const, weatherTimeline: tl, cars: s0.cars.map(c => ({ ...c, lap: 12 })) }
    const off = stepSector(cfgOff, s, createRng(77)).sectorResults.slice(s.sectorResults.length)
    const on = stepSector(cfgOn, s, createRng(77)).sectorResults.slice(s.sectorResults.length)
    expect(on.length).toBe(s.cars.length)
    const expected = (trackPaceDelta(s, ON) - trackPaceDelta(s, OFF)) / 3
    expect(expected).toBeGreaterThan(0)
    for (const [i, r] of on.entries()) {
      expect(r.driverId).toBe(off[i]!.driverId)
      expect(r.sectorTime - off[i]!.sectorTime, r.driverId).toBeCloseTo(expected, 9)
    }
  })

  it('track temperature: circuit value, else the default, plus the weather offset', () => {
    const TT = makeDeterministicTuning({ tyreTemp: { enabled: true } })
    const c = makeConfig({}, 1).circuit
    expect(trackTemp({ ...c, trackTempC: 44 }, 'DRY', TT)).toBe(44)
    expect(trackTemp({ ...c, trackTempC: undefined }, 'DRY', TT)).toBe(32)
    expect(trackTemp({ ...c, trackTempC: 30 }, 'WET', TT)).toBe(30 + TT.tyreTemp.weatherOffset.WET)
  })
})
