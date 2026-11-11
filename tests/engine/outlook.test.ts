import { describe, it, expect } from 'vitest'
import { neutralisationOutlook } from '@engine/outlook'
import { incidentRiskFactor, driverErrorChancePerSector } from '@engine/incidents'
import { aiDecision } from '@engine/strategy'
import { initRace } from '@engine/race'
import { createRng } from '@engine/rng'
import { makeTuning, makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { RaceConfig } from '@engine/types'

const LIVE = { incidents: { wetErrorMultiplier: { DRY: 1, DAMP: 1.4, WET: 1.8 }, circuitRiskWeight: 1 } }
// allDry so no weather stop pre-empts the AI cases; the wet case passes weatherState explicitly.
const cfg = (id: string, over = LIVE): RaceConfig => ({ ...makeConfig({}, 3, id), allDry: true, tuning: makeTuning(over) })

describe('risk inputs (spec §9.2, ruling O2)', () => {
  it('the factor is exactly 1 when off and multiplies the error chance when on', () => {
    const off = { ...makeConfig({}, 3, 'harbour_lights'), tuning: makeDeterministicTuning() }
    expect(incidentRiskFactor(off, 'WET')).toBe(1)
    const on = cfg('harbour_lights')
    expect(incidentRiskFactor(on, 'DRY')).toBeCloseTo(1.45, 12)
    expect(incidentRiskFactor(on, 'WET')).toBeCloseTo(1.45 * 1.8, 12)
    const t = on.tuning
    expect(driverErrorChancePerSector(80, t, 2)).toBeCloseTo(2 * driverErrorChancePerSector(80, t), 15)
    expect(driverErrorChancePerSector(80, t, 1)).toBe(driverErrorChancePerSector(80, t))
  })
})

describe('the outlook (spec §9.2)', () => {
  it('reads OUT under a neutralisation', () => {
    const c = cfg('veloce')
    const s = { ...initRace(c), safetyCar: { deployedLap: 3, lapsRemaining: 2, cause: 'crash' as const, kind: 'sc' as const } }
    expect(neutralisationOutlook(c, s)).toEqual({ kind: 'out' })
  })

  it('is higher at a street circuit than at a fast open one, and higher in the wet', () => {
    const street = cfg('harbour_lights'), open = cfg('sol_desert')
    const p = (c: RaceConfig, w: 'DRY' | 'WET' = 'DRY') => {
      const o = neutralisationOutlook(c, { ...initRace(c), lap: 10, weatherState: w })
      if (o.kind !== 'clear') throw new Error('expected clear')
      return o
    }
    expect(p(street).chance).toBeGreaterThan(p(open).chance)
    expect(p(street, 'WET').chance).toBeGreaterThan(p(street).chance)
    expect(p(street).reasons).toContain('street')
    expect(p(street, 'WET').reasons).toContain('wet')
  })

  it('worn tyres raise it; used caps lower it; it is 0 with every cap used', () => {
    const c = cfg('aurora')
    const s = { ...initRace(c), lap: 20 }
    const base = neutralisationOutlook(c, s)
    const worn = neutralisationOutlook(c, { ...s, cars: s.cars.map(x => ({ ...x, tyreAge: 40, compound: 'S' as const })) })
    if (base.kind !== 'clear' || worn.kind !== 'clear') throw new Error('expected clear')
    expect(worn.chance).toBeGreaterThan(base.chance)
    expect(worn.reasons).toContain('worn_tyres')
    const ev = (kind: 'safety_car_deployed' | 'vsc_deployed' | 'red_flag') => ({ lap: 1, sector: 0 as const, kind, driverId: null, timeLoss: null })
    const capped = neutralisationOutlook(c, { ...s, incidents: [ev('safety_car_deployed'), ev('safety_car_deployed'), ev('vsc_deployed'), ev('vsc_deployed'), ev('red_flag')] })
    expect(capped).toMatchObject({ kind: 'clear', chance: 0, reasons: ['all_used'] })
  })

  it('bands follow scOutlook.bands', () => {
    const c = cfg('harbour_lights')
    const o = neutralisationOutlook(c, { ...initRace(c), lap: 10 })
    if (o.kind !== 'clear') throw new Error('expected clear')
    const [lo, hi] = c.tuning.scOutlook.bands
    expect(o.band).toBe(o.chance < lo ? 'low' : o.chance < hi ? 'medium' : 'high')
    expect(o.horizon).toBe(5)
  })
})

describe('the optimal SC gamble (spec §9.2)', () => {
  it('delays a due planned stop while the chance is high, at most scGambleMaxDelay laps', () => {
    const base = cfg('harbour_lights', { ...LIVE, ai: { scGambleMaxDelay: 3, scGambleChance: 0.01 } } as never)
    const s0 = initRace(base)
    const me = { ...s0.cars[4]!, lap: 20, tyreAge: 3, compound: 'H' as const, strategy: { ...s0.cars[4]!.strategy, brain: 'optimal' as const, plannedStops: [{ lap: 20, compound: 'M' as const }] } }
    const st = { ...s0, lap: 20, cars: s0.cars.map(c => c.driverId === me.driverId ? me : c) }
    expect(aiDecision(base, me, st, createRng(1)).pit, 'stays out on the gamble').toBe(false)
    const late = { ...me, lap: 23 }
    expect(aiDecision(base, late, { ...st, lap: 23, cars: st.cars.map(c => c.driverId === me.driverId ? late : c) }, createRng(1)).pit, 'never more than 3 laps late').toBe(true)
    const off = { ...base, tuning: makeTuning({ ...LIVE, ai: { scGambleMaxDelay: 0 } } as never) }
    expect(aiDecision(off, me, st, createRng(1)).pit).toBe(true)
  })
})

describe('SC gamble vs DRS train escape (controller ruling B, plan scope §2)', () => {
  // A car that is BOTH due its planned stop AND stuck in a DRS train behind the head.
  const setup = (maxCliff: number) => {
    const c = { ...makeConfig({}, 5, 'veloce'), allDry: true as const,
      tuning: makeTuning({ ...LIVE, drs: { enabled: true }, ai: { scGambleMaxDelay: 3, scGambleChance: 0.01, scGambleMaxCliffFrac: maxCliff } } as never) }
    const s0 = initRace(c)
    let t = 0
    const lap = 6
    const cars = s0.cars.map((x, i) => {
      if (i === 0) return { ...x, raceTime: 0, lap }
      if (i <= 3) { t += [0.5, 0.6, 0.7][i - 1]!; return { ...x, raceTime: t, lap } }
      return { ...x, raceTime: 100 + i * 5, lap }
    })
    const s = { ...s0, lap, cars, weatherState: 'DRY' as const }
    const sorted = [...s.cars].sort((a, b) => a.raceTime - b.raceTime)
    // tyreAge 10 on M: cliff fraction ≈0.53 -- over the escape's 0.50, under the undercut's 0.60.
    const me = { ...sorted[2]!, tyreAge: 10, compound: 'M' as const, lapsInDirtyAir: 3,
      strategy: { ...sorted[2]!.strategy, brain: 'optimal' as const, plannedStops: [{ lap: 6, compound: 'H' as const }] } }
    return { c, me, st: { ...s, cars: s.cars.map(x => x.driverId === me.driverId ? me : x) } }
  }

  it('under the cliff limit the gamble holds the stop; at or over it the train escape / stop wins', () => {
    const under = setup(0.85)
    expect(neutralisationOutlook(under.c, under.st)).toMatchObject({ kind: 'clear' })
    expect(aiDecision(under.c, under.me, under.st, createRng(1)).pit, 'gamble first, below its cliff limit').toBe(false)
    const over = setup(0.50)
    expect(aiDecision(over.c, over.me, over.st, createRng(1))).toMatchObject({ pit: true, compound: 'H' })
  })
})
