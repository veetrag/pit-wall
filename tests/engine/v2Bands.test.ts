import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { neutralisationOutlook } from '@engine/outlook'
import { buildHarnessConfig, runRaces, type Metrics } from './monteCarloHarness'
import { measureClearing } from './overtakeClearing'
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
          `graining=${m.grainingPerRace.toFixed(3)} hot=${m.hotSectorShare.toFixed(3)} cold=${m.coldSectorShare.toFixed(3)} ` +
          `tyreDnf=${m.tyreDnfPerCarRace.toFixed(4)} stops=${m.meanStopsPerClassifiedCar.toFixed(3)} ` +
          `overtakes=${m.meanOvertakeEvents.toFixed(1)}`)
      }
    }
  }, 1_800_000)

  // 2.1 (scope 2026-11-13 Task S.4): band sized from the MEASURE 2.0 four cells, MODEL_SPEC §3.
  it('2.1 graining is inside its band, and live', () => {
    const m = runRaces({ races: 240, circuitIds: SAMPLE })
    const b = loadGameData().tuning._regressionBands!
    expect(m.grainingPerRace, 'graining must be live').toBeGreaterThan(0)
    expect(m.grainingPerRace).toBeGreaterThanOrEqual(b.grainingPerRace[0])
    expect(m.grainingPerRace).toBeLessThanOrEqual(b.grainingPerRace[1])
  })

  // 2.1 switch-on (scope 2026-11-13 Task S, MODEL_SPEC §17.2): the gates are judged on the MEAN
  // over four seed bases at n=240 each (§17.1 Round 2), same floors.
  // MEASURE=1 FEATURE=<label> npx vitest run tests/engine/v2Bands.test.ts -t "MEASURE 2.1" --reporter=verbose
  // SEED_BASES=1000,4000 narrows the bases (the MEAN line is then over those only).
  it.runIf(process.env.MEASURE === '1')('MEASURE 2.1: four seed bases, n=240 each', () => {
    const label = process.env.FEATURE ?? 'shipped'
    const bases = (process.env.SEED_BASES ?? '1000,4000,7000,10000').split(',').map(Number)
    const cells: { name: string; circuitIds: string[]; difficulty: 'pro' | 'rookie'; withSetups?: boolean }[] = [
      { name: 'sample-pro', circuitIds: SAMPLE, difficulty: 'pro' },
      { name: 'sample-rookie', circuitIds: SAMPLE, difficulty: 'rookie' },
      { name: 'setups-pro', circuitIds: SAMPLE, difficulty: 'pro', withSetups: true },
      { name: 'lantern_quay-pro', circuitIds: ['lantern_quay'], difficulty: 'pro' },
      { name: 'lantern_quay-rookie', circuitIds: ['lantern_quay'], difficulty: 'rookie' },
      { name: 'mesa_roja-pro', circuitIds: ['mesa_roja'], difficulty: 'pro' },
      { name: 'mesa_roja-rookie', circuitIds: ['mesa_roja'], difficulty: 'rookie' },
    ]
    const fields: [string, (m: Metrics) => number, number][] = [
      ['rho', m => m.gridFinishSpearman, 3], ['dpos', m => m.meanAbsPosChange, 3],
      ['paceRank', m => m.paceRankCorrelation, 3], ['crash', m => m.crashesPerCarRace, 4],
      ['mech', m => m.mechanicalDnfPerCarRace, 4], ['top', m => m.topTeamShare, 3],
      ['winners', m => m.distinctWinners, 2], ['sc', m => m.safetyCarsPerRace, 3],
      ['tyreDnf', m => m.tyreDnfPerCarRace, 4], ['stops', m => m.meanStopsPerClassifiedCar, 3],
      ['graining', m => m.grainingPerRace, 3], ['hot', m => m.hotSectorShare, 3], ['cold', m => m.coldSectorShare, 3],
    ]
    const fmt = (vals: number[]) => fields.map(([k, , d], i) => `${k}=${vals[i]!.toFixed(d)}`).join(' ')
    for (const cell of cells) {
      const rows: number[][] = []
      for (const seedBase of bases) {
        const m = runRaces({ races: 240, circuitIds: cell.circuitIds, difficulty: cell.difficulty, seedBase, withSetups: cell.withSetups })
        const vals = fields.map(([, f]) => f(m))
        rows.push(vals)
        // eslint-disable-next-line no-console
        console.log(`MEASURE ${label} ${cell.name} seedBase=${seedBase} n=240 ${fmt(vals)}`)
      }
      const mean = fields.map((_, i) => rows.reduce((a, r) => a + r[i]!, 0) / rows.length)
      // eslint-disable-next-line no-console
      console.log(`MEASURE ${label} ${cell.name} MEAN(${bases.join('/')}) ${fmt(mean)}`)
    }
    const rates = bases.map(base => {
      const seeds = Array.from({ length: 240 }, (_, i) => base + 13 * i)
      const r = measureClearing({ circuitId: 'lantern_quay', seeds, advantage: 0.4 }).failureRate
      // eslint-disable-next-line no-console
      console.log(`MEASURE ${label} clearing-lantern_quay seedBase=${base} n=240 failure=${r.toFixed(3)}`)
      return r
    })
    // eslint-disable-next-line no-console
    console.log(`MEASURE ${label} clearing-lantern_quay MEAN(${bases.join('/')}) failure=${(rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(4)}`)
  }, 3_600_000)

  // Diagnostic (Task 6 review note): does graining spike after a long neutralisation?
  // A neutralised field cools (neutralisedHeat), so S/M can sit below window - grainMargin for
  // grainOnsetLaps lap ends; graining also needs a green track (grip < grainMaxGrip).
  // Counts graining onsets in the 3 laps after each SC/VSC ends, by neutralisation length,
  // against car-laps exposed; and the rate on every other car-lap.
  it.runIf(process.env.MEASURE === '1')('MEASURE 2.1 graining after neutralisations', () => {
    const label = process.env.FEATURE ?? 'shipped'
    const bases = (process.env.SEED_BASES ?? '1000,4000,7000,10000').split(',').map(Number)
    const buckets = { short: { ends: 0, grains: 0, carLaps: 0 }, mid: { ends: 0, grains: 0, carLaps: 0 }, long: { ends: 0, grains: 0, carLaps: 0 } }
    let otherGrains = 0, otherCarLaps = 0, races = 0, grainsTotal = 0
    for (const seedBase of bases) {
      for (let r = 0; r < 240; r++) {
        const seed = seedBase + r * 7919
        const config = buildHarnessConfig(seed, SAMPLE[r % SAMPLE.length]!, 'pro', false)
        let s = initRace(config)
        const rng = createRng(seed)
        const MAX_STEPS = config.circuit.laps * 3
        for (let i = 0; i < MAX_STEPS; i++) s = stepSector(config, s, rng)
        expect(s.lap).toBe(s.totalLaps)
        races++
        const cars = s.cars.length
        const windowLap = new Map<number, keyof typeof buckets>()
        let start: number | null = null
        for (const e of s.incidents) {
          if (e.kind === 'safety_car_deployed' || e.kind === 'vsc_deployed') start = e.lap
          if ((e.kind === 'safety_car_ended' || e.kind === 'vsc_ended') && start !== null) {
            const len = e.lap - start
            const b: keyof typeof buckets = len <= 3 ? 'short' : len <= 5 ? 'mid' : 'long'
            buckets[b].ends++
            for (let l = e.lap; l < e.lap + 3 && l <= s.totalLaps; l++) {
              if (!windowLap.has(l)) { windowLap.set(l, b); buckets[b].carLaps += cars }
            }
            start = null
          }
        }
        otherCarLaps += (s.totalLaps - windowLap.size) * cars
        for (const e of s.incidents) {
          if (e.kind !== 'graining') continue
          grainsTotal++
          const b = windowLap.get(e.lap)
          if (b) buckets[b].grains++
          else otherGrains++
        }
      }
    }
    const per1000 = (g: number, cl: number) => (cl ? (1000 * g) / cl : 0).toFixed(2)
    // eslint-disable-next-line no-console
    console.log(`MEASURE ${label} graining-after-neutralisation races=${races} perRace=${(grainsTotal / races).toFixed(3)} ` +
      `other=${otherGrains}/${otherCarLaps} (${per1000(otherGrains, otherCarLaps)}/1000 car-laps) ` +
      Object.entries(buckets).map(([k, b]) => `${k}: ends=${b.ends} grains=${b.grains} (${per1000(b.grains, b.carLaps)}/1000 car-laps)`).join(' '))
  }, 3_600_000)
})
