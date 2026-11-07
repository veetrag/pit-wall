import { describe, it, expect } from 'vitest'
import { rubberLaps, rubberLapsFor, trackGrip, trackPaceDelta } from '@engine/track'
import { computeSectorTime } from '@engine/lapModel'
import { initRace } from '@engine/race'
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
})
