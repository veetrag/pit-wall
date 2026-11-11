import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { neutralisationOutlook } from '@engine/outlook'
import { buildHarnessConfig, runRaces } from './monteCarloHarness'
import { makeTuning } from '../fixtures/tuning'
import { loadGameData } from '@data/validators'

export const SAMPLE = ['monsoon_bay', 'sol_desert', 'harbour_lights', 'veloce']
const DEPLOY = new Set(['safety_car_deployed', 'vsc_deployed', 'red_flag'])

describe('2.0 bands', () => {
  it('OUTLOOK IS CALIBRATED: in every well-populated bucket, observed is within 0.06 of predicted', () => {
    const tuning = makeTuning({ incidents: { wetErrorMultiplier: { DRY: 1, DAMP: 1.4, WET: 1.8 }, circuitRiskWeight: 1 } })
    const buckets = [[0, 0.15], [0.15, 0.30], [0.30, 1.01]] as const
    const acc = buckets.map(() => ({ n: 0, pred: 0, hit: 0 }))
    for (let r = 0; r < 240; r++) {
      const seed = 31000 + r * 7919
      const config = buildHarnessConfig(seed, SAMPLE[r % SAMPLE.length]!, 'pro', false, tuning)
      let s = initRace(config)
      const rng = createRng(seed)
      const preds: { lap: number; p: number }[] = []
      const MAX_STEPS = config.circuit.laps * 3
      for (let i = 0; i < MAX_STEPS; i++) {
        s = stepSector(config, s, rng)
        if (s.sector === 0 && s.totalLaps - s.lap >= 5) {
          const o = neutralisationOutlook(config, s, 5)
          if (o.kind === 'clear') preds.push({ lap: s.lap, p: o.chance })
        }
      }
      expect(s.lap).toBe(s.totalLaps)
      const deploys = s.incidents.filter(e => DEPLOY.has(e.kind)).map(e => e.lap)
      for (const { lap, p } of preds) {
        const b = buckets.findIndex(([lo, hi]) => p >= lo && p < hi)
        acc[b]!.n++; acc[b]!.pred += p
        if (deploys.some(d => d >= lap && d < lap + 5)) acc[b]!.hit++
      }
    }
    for (const [i, a] of acc.entries()) {
      // eslint-disable-next-line no-console
      console.log(`MEASURE outlook bucket ${i} n=${a.n} pred=${(a.pred / Math.max(1, a.n)).toFixed(3)} obs=${(a.hit / Math.max(1, a.n)).toFixed(3)}`)
      if (a.n < 200) continue
      expect(Math.abs(a.hit / a.n - a.pred / a.n), `bucket ${i}`).toBeLessThanOrEqual(0.06)
    }
  }, 300_000)

  // MEASURE=1 FEATURE=<label> npx vitest run tests/engine/v2Bands.test.ts -t "MEASURE 2.0" --reporter=verbose
  it.runIf(process.env.MEASURE === '1')('MEASURE 2.0: four cells, n=240 each, SAMPLE', () => {
    const label = process.env.FEATURE ?? 'shipped'
    for (const difficulty of ['pro', 'rookie'] as const) {
      for (const seedBase of [1000, 7000]) {
        const m = runRaces({ races: 240, circuitIds: SAMPLE, difficulty, seedBase })
        // eslint-disable-next-line no-console
        console.log(`MEASURE ${label} ${difficulty} seedBase=${seedBase} n=240 ` +
          `top=${m.topTeamShare.toFixed(3)} winners=${m.distinctWinners} dpos=${m.meanAbsPosChange.toFixed(3)} ` +
          `rho=${m.gridFinishSpearman.toFixed(3)} paceRank=${m.paceRankCorrelation.toFixed(3)} ` +
          `mech=${m.mechanicalDnfPerCarRace.toFixed(4)} crash=${m.crashesPerCarRace.toFixed(4)} ` +
          `sc=${m.safetyCarsPerRace.toFixed(3)} vsc=${m.vscPerRace.toFixed(3)} aiNeut=${m.aiNeutralisationStopsPerRace.toFixed(3)} ` +
          `slow=${m.slowStopsPerRace.toFixed(3)} red=${m.redFlagPerRace.toFixed(3)} ` +
          `trains=${m.drsTrainLapEndsPerRace.toFixed(3)} drsPass=${m.drsPassShare.toFixed(3)} ` +
          `stacks=${m.doubleStacksPerRace.toFixed(3)} pens=${m.penaltiesPerRace.toFixed(3)} ` +
          `unsafe=${m.unsafeReleasesPerRace.toFixed(3)} tl=${m.trackLimitWarningsPerRace.toFixed(3)} ` +
          `overtakes=${m.meanOvertakeEvents.toFixed(1)}`)
      }
    }
  }, 1_800_000)
})
