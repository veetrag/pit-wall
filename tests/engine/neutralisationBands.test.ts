import { describe, it, expect } from 'vitest'
import { runRaces } from './monteCarloHarness'
import { loadGameData } from '@data/validators'

// Same gated sample as monteCarlo.test.ts.
const SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']

describe('1.5 neutralisation bands', () => {
  // The measurement the bands are sized from. Not a gate: run it with
  //   MEASURE=1 npx vitest run tests/engine/neutralisationBands.test.ts --reporter=verbose
  it.runIf(process.env.MEASURE === '1')('MEASURE: four cells, n=240 each', () => {
    for (const difficulty of ['pro', 'rookie'] as const) {
      for (const seedBase of [1000, 7000]) {
        const m = runRaces({ races: 240, circuitIds: SAMPLE, difficulty, seedBase })
        // eslint-disable-next-line no-console
        console.log(`MEASURE ${difficulty} seedBase=${seedBase} n=240 ` +
          `vscPerRace=${m.vscPerRace.toFixed(3)} aiNeutralisationStopsPerRace=${m.aiNeutralisationStopsPerRace.toFixed(3)} ` +
          `safetyCarsPerRace=${m.safetyCarsPerRace.toFixed(3)} meanAbsPosChange=${m.meanAbsPosChange.toFixed(3)}`)
      }
    }
  }, 1_800_000)

  it('VSC and AI neutralisation-stop rates are inside their tuning.json bands', () => {
    const m = runRaces({ races: 120, circuitIds: SAMPLE })
    const b = loadGameData().tuning._regressionBands!
    const n = `n=${m.races} races`
    expect(m.vscPerRace, `${n}: the VSC must be live in the shipped tuning`).toBeGreaterThan(0)
    expect(m.vscPerRace, n).toBeGreaterThanOrEqual(b.vscPerRace[0])
    expect(m.vscPerRace, n).toBeLessThanOrEqual(b.vscPerRace[1])
    expect(m.aiNeutralisationStopsPerRace, n).toBeGreaterThanOrEqual(b.aiNeutralisationStopsPerRace[0])
    expect(m.aiNeutralisationStopsPerRace, n).toBeLessThanOrEqual(b.aiNeutralisationStopsPerRace[1])
  }, 200_000)
})
