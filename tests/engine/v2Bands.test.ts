import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { neutralisationOutlook } from '@engine/outlook'
import { buildHarnessConfig } from './monteCarloHarness'
import { makeTuning } from '../fixtures/tuning'

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
})
