import { describe, it, expect } from 'vitest'
import { runRaces } from './monteCarloHarness'
import { loadGameData } from '@data/validators'

// The calendar's showery circuits (circuits.json weatherBias 'showery'), where
// the old AI made ~100 weather stops per race.
const SHOWERY = ['bengaluru', 'harbour_lights', 'highland', 'aurora', 'kaido']
const SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']

describe('1.6 race bands', () => {
  // Not a gate:
  //   MEASURE=1 npx vitest run tests/engine/race16Bands.test.ts --reporter=verbose
  it.runIf(process.env.MEASURE === '1')('MEASURE weather: four cells, n=240 each, showery circuits', () => {
    for (const difficulty of ['pro', 'rookie'] as const) {
      for (const seedBase of [1000, 7000]) {
        const m = runRaces({ races: 240, circuitIds: SHOWERY, difficulty, seedBase })
        // eslint-disable-next-line no-console
        console.log(`MEASURE weather ${difficulty} seedBase=${seedBase} n=240 aiWeatherStopsPerRace=${m.aiWeatherStopsPerRace.toFixed(3)}`)
      }
    }
  }, 1_800_000)

  it('AI weather stops per race on the showery circuits are inside their band', () => {
    const m = runRaces({ races: 120, circuitIds: SHOWERY })
    const b = loadGameData().tuning._regressionBands!
    const n = `n=${m.races} showery races`
    expect(m.aiWeatherStopsPerRace, n).toBeGreaterThanOrEqual(b.aiWeatherStopsPerRace[0])
    expect(m.aiWeatherStopsPerRace, n).toBeLessThanOrEqual(b.aiWeatherStopsPerRace[1])
  }, 300_000)

  it.runIf(process.env.MEASURE === '1')('MEASURE slow stops: four cells, n=240 each', () => {
    for (const difficulty of ['pro', 'rookie'] as const) {
      for (const seedBase of [1000, 7000]) {
        const m = runRaces({ races: 240, circuitIds: SAMPLE, difficulty, seedBase })
        // eslint-disable-next-line no-console
        console.log(`MEASURE slow ${difficulty} seedBase=${seedBase} n=240 slowStopsPerRace=${m.slowStopsPerRace.toFixed(3)} ` +
          `rho=${m.gridFinishSpearman.toFixed(3)} dpos=${m.meanAbsPosChange.toFixed(3)} top=${m.topTeamShare.toFixed(3)}`)
      }
    }
  }, 1_800_000)

  it('slow stops per race are inside their band, and live', () => {
    const m = runRaces({ races: 120, circuitIds: SAMPLE })
    const b = loadGameData().tuning._regressionBands!
    expect(m.slowStopsPerRace, 'slow stops must be live in the shipped tuning').toBeGreaterThan(0)
    expect(m.slowStopsPerRace).toBeGreaterThanOrEqual(b.slowStopsPerRace[0])
    expect(m.slowStopsPerRace).toBeLessThanOrEqual(b.slowStopsPerRace[1])
  }, 300_000)
})
