import { describe, it, expect } from 'vitest'
import { runRaces } from './monteCarloHarness'
import { loadGameData } from '@data/validators'

// The calendar's showery circuits (circuits.json weatherBias 'showery'), where
// the old AI made ~100 weather stops per race.
const SHOWERY = ['bengaluru', 'harbour_lights', 'highland', 'aurora', 'kaido']

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
})
