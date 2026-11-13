import { describe, it, expect } from 'vitest'
import {
  initThermal, outLapThermal, thermalTarget, thermalWindow, thermalPace, thermalAfterSector,
  thermalAtLapEnd, thermalStatus, aiThermalPaceMode, outLapCost,
} from '@engine/thermal'
import { effectiveTyreAge } from '@engine/tyres'
import { rivalIntel } from '@engine/rivalIntel'
import { initRace, stepSector } from '@engine/race'
import { executeStop } from '@engine/pitStop'
import { applyRedFlagRestart } from '@engine/redFlag'
import { projectPitState } from '@engine/projection'
import { createRng } from '@engine/rng'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'
import type { CarState, Compound, RaceConfig, RaceState } from '@engine/types'

const ON = { tyreTemp: { enabled: true } }
function cfg(circuitId = 'bengaluru', over = {}): RaceConfig {
  const c = makeConfig({}, 11, circuitId)
  // allDry: thermal pace only applies to slicks on a dry track (ruling H3).
  return { ...c, allDry: true, tuning: makeDeterministicTuning({ ...ON, ...over }) }
}
const car0 = (config: RaceConfig, patch: Partial<CarState> = {}): CarState =>
  ({ ...initRace(config).cars[0]!, ...patch })

/** Seconds of thermal pace over one lap from `temp`, letting the temperature evolve. */
function lapCost(config: RaceConfig, compound: Compound, temp: number, base: CarState = car0(config)): number {
  let car: CarState = { ...base, compound, thermal: { temp, coldLaps: 0, grainLaps: 0, heatWear: 0 } }
  let sum = 0
  for (let s = 0; s < 3; s++) {
    sum += thermalPace(config, car, 'DRY')
    car = { ...car, thermal: thermalAfterSector(config, car, 'DRY', false) }
  }
  return sum
}

describe('tyre temperature (spec §5.2)', () => {
  it('start and stop temperatures', () => {
    const t = cfg().tuning
    expect(initThermal(t).temp).toBe(85)
    expect(outLapThermal(t)).toEqual({ temp: 70, coldLaps: 0, grainLaps: 0, heatWear: 0 })
  })

  it('the heat target adds track, running heat, pace mode, dirty air and yellow', () => {
    const config = cfg('sol_desert')
    const base = car0(config, { paceMode: 'neutral', lapsInDirtyAir: 0 })
    expect(thermalTarget(config, base, 'DRY', false)).toBe(44 + 62)
    expect(thermalTarget(config, { ...base, paceMode: 'push' }, 'DRY', false)).toBe(44 + 62 + 8)
    expect(thermalTarget(config, { ...base, lapsInDirtyAir: 2 }, 'DRY', false)).toBe(44 + 62 + 3)
    expect(thermalTarget(config, base, 'DRY', true)).toBe(44 + 62 - 25)
    expect(thermalTarget(config, base, 'WET', false)).toBe(44 - 35 + 62)
  })

  it('window distances, and no thermal pace on the wrong tyre family (ruling H3)', () => {
    const config = cfg()
    const hot = car0(config, { compound: 'S', thermal: { temp: 110, coldLaps: 0, grainLaps: 0, heatWear: 0 } })
    expect(thermalWindow(config, hot, 'DRY')).toEqual({ deficit: 0, excess: 10, applies: true })
    expect(thermalPace(config, hot, 'DRY')).toBeCloseTo(0.20 / 3, 12)
    expect(thermalWindow(config, hot, 'DAMP').applies).toBe(false)
    expect(thermalPace(config, hot, 'DAMP')).toBe(0)
  })

  it('a cold out-lap costs hards far more than softs (ruling H2)', () => {
    const config = cfg()                         // bengaluru 38 °C
    const h = lapCost(config, 'H', 70), m = lapCost(config, 'M', 70), s = lapCost(config, 'S', 70)
    expect(h).toBeGreaterThan(0.35)
    expect(m).toBeGreaterThan(s)
    expect(h).toBeGreaterThan(m)
    expect(s).toBeLessThan(0.05)
  })

  it('the temperature converges to the target at responsePerSector', () => {
    const config = cfg()
    const c = car0(config, { compound: 'M', thermal: { temp: 70, coldLaps: 0, grainLaps: 0, heatWear: 0 } })
    const target = thermalTarget(config, c, 'DRY', false)
    expect(thermalAfterSector(config, c, 'DRY', false).temp).toBeCloseTo(70 + 0.35 * (target - 70), 12)
  })

  it('UNDER A NEUTRALISATION THE TYRES COOL BUT COST NOTHING (ruling H6)', () => {
    const config = cfg()
    const c = car0(config, { compound: 'H', thermal: { temp: 70, coldLaps: 0, grainLaps: 0, heatWear: 0 } })
    expect(thermalPace(config, c, 'DRY')).toBeGreaterThan(0)
    expect(thermalPace(config, c, 'DRY', true)).toBe(0)
    expect(thermalAfterSector(config, c, 'DRY', true).temp).toBeLessThan(thermalAfterSector(config, c, 'DRY', false).temp)
  })

  it('initRace, every stop and a red-flag restart set the temperature', () => {
    const config = cfg()
    const s = initRace(config)
    expect(s.cars.every(c => c.thermal?.temp === 85)).toBe(true)
    // thermal is the last key on the car (append-last rule).
    const keys = Object.keys(s.cars[0]!)
    expect(keys[keys.length - 1]).toBe('thermal')
    const out = executeStop(config, { safetyCar: null, lap: 4, sector: 2 }, { ...s.cars[0]!, thermal: { temp: 101, coldLaps: 1, grainLaps: 2, heatWear: 0.4 } }, 'H', createRng(1))
    expect(out.car.thermal).toEqual({ temp: 70, coldLaps: 0, grainLaps: 0, heatWear: 0 })
    const restarted = applyRedFlagRestart(config, s.cars, 'DRY', 20)
    expect(restarted.every(c => c.thermal?.temp === 85)).toBe(true)
  })

  it('A RED-FLAG RESTART RE-BLANKETS A CAR WITH NO SETS LEFT', () => {
    const config = cfg()
    const s = initRace(config)
    const empty = { S: 0, M: 0, H: 0, I: 0, W: 0 }
    const cars = s.cars.map(c => ({ ...c, tyreAllocation: empty, thermal: { temp: 60, coldLaps: 0, grainLaps: 0, heatWear: 0 } }))
    const restarted = applyRedFlagRestart(config, cars, 'DRY', 20)
    for (const [i, c] of restarted.entries()) {
      expect(c.compound).toBe(cars[i]!.compound)       // no set to fit: it restarts on what it has
      expect(c.thermal?.temp).toBe(85)
    }
  })

  it('OUT-LAP COST IS IN THE STOP PATH THE PROJECTION USES: a fresh hard is slower than a fresh soft by the cold margin', () => {
    const config = cfg()
    const tOn = (comp: Compound) => {
      const st = initRace(config)
      const stopped = executeStop(config, { safetyCar: null, lap: 0, sector: 0 }, st.cars[0]!, comp, createRng(3), { allowSlow: false }).car
      const next = stepSector(config, { ...st, cars: [stopped, ...st.cars.slice(1)] }, createRng(4))
      return next.sectorResults.find(r => r.driverId === stopped.driverId)!.sectorTime - next.sectorResults.find(r => r.driverId === stopped.driverId)!.tyreContribution
    }
    expect(tOn('H') - tOn('S')).toBeGreaterThan(0.15)
  })

  it('OUT-LAP COST IS IN THE STOP PATH THE PROJECTION USES: projectPitState charges the cold out-lap (diff of diffs)', () => {
    const on = cfg()
    const player = initRace(on).cars[0]!.driverId
    const cOn: RaceConfig = { ...on, playerDriverId: player }
    const cOff: RaceConfig = { ...cOn, tuning: makeDeterministicTuning() }
    // One dry race to lap 5 with tyreTemp OFF, then the same state with every car's temperature added.
    let s: RaceState = initRace(cOff)
    const rng = createRng(21)
    while (s.lap < 5) s = stepSector(cOff, s, rng)
    expect(s.cars.some(c => 'thermal' in c)).toBe(false)
    const sOn: RaceState = { ...s, cars: s.cars.map(c => ({ ...c, thermal: initThermal(cOn.tuning) })) }

    const rt = (config: RaceConfig, state: RaceState, comp: Compound) =>
      projectPitState(config, state, comp, 99).cars.find(c => c.driverId === player)!.raceTime
    const dOn = rt(cOn, sOn, 'H') - rt(cOn, sOn, 'S')
    const dOff = rt(cOff, s, 'H') - rt(cOff, s, 'S')
    const base = s.cars.find(c => c.driverId === player)!
    const outLap = lapCost(cOn, 'H', 70, base) - lapCost(cOn, 'S', 70, base)
    expect(outLap).toBeGreaterThan(0.3)
    expect(dOn - dOff).toBeGreaterThanOrEqual(0.8 * outLap)
  })

  it('switched off, nothing exists and nothing changes', () => {
    const config = { ...cfg(), tuning: makeDeterministicTuning() }
    const s = initRace(config)
    expect(s.cars.some(c => 'thermal' in c)).toBe(false)
    expect(thermalPace(config, s.cars[0]!, 'DRY')).toBe(0)
    const out = executeStop(config, { safetyCar: null, lap: 4, sector: 2 }, s.cars[0]!, 'H', createRng(1))
    expect('thermal' in out.car).toBe(false)
    expect(applyRedFlagRestart(config, s.cars, 'DRY', 20).some(c => 'thermal' in c)).toBe(false)
  })
})

describe('overheating wear, graining, AI (spec §5.2–§5.3)', () => {
  const th = (temp: number, extra: Partial<{ coldLaps: number; grainLaps: number; heatWear: number }> = {}) =>
    ({ temp, coldLaps: 0, grainLaps: 0, heatWear: 0, ...extra })

  it('a sector 10 °C over the window adds overheatWearPerLap/3 laps of age', () => {
    const config = cfg('sol_desert')
    const c = car0(config, { compound: 'S', thermal: th(110) })
    expect(thermalAfterSector(config, c, 'DRY', false).heatWear).toBeCloseTo(0.08 / 3, 12)
  })

  it('no overheating wear inside the window, or on the wrong tyre family (H3)', () => {
    const config = cfg('sol_desert')
    expect(thermalAfterSector(config, car0(config, { compound: 'S', thermal: th(95, { heatWear: 0.5 }) }), 'DRY', false).heatWear).toBe(0.5)
    expect(thermalAfterSector(config, car0(config, { compound: 'S', thermal: th(110) }), 'DAMP', false).heatWear).toBe(0)
  })

  it('effectiveTyreAge adds heatWear, and is untouched without it', () => {
    const config = cfg()
    const driver = config.drivers[0]!
    const c = car0(config, { tyreAge: 10, thermal: th(90, { heatWear: 1.5 }) })
    const plain = effectiveTyreAge({ ...c, thermal: undefined }, driver, 'DRY', config)
    expect(effectiveTyreAge(c, driver, 'DRY', config)).toBeCloseTo(plain + 1.5, 12)
    expect(effectiveTyreAge({ ...c, thermal: th(90) }, driver, 'DRY', config)).toBe(plain)
  })

  it('PER-LAP WEAR PROBES IGNORE ACCUMULATED HEAT (rivalIntel)', () => {
    const config = { ...cfg(), lapsOverride: 60 }
    const s = initRace(config)
    const rival = { ...s.cars[3]!, compound: 'H' as Compound, tyreAge: 6, paceMode: 'neutral' as const,
      strategy: { ...s.cars[3]!.strategy, brain: 'smart' as const, plannedStops: [] } }
    const driver = config.drivers.find(d => d.id === rival.driverId)!
    const rate = effectiveTyreAge({ ...rival, tyreAge: 1, thermal: undefined }, driver, 'DRY', config)
    // Same effective age now, one via heat and one via plain laps: same box window.
    const heated: CarState = { ...rival, thermal: th(100, { heatWear: 3 }) }
    const plain: CarState = { ...rival, tyreAge: rival.tyreAge + 3 / rate, thermal: th(100) }
    const intel = (car: CarState) => {
      const r = rivalIntel(config, { ...s, cars: s.cars.map(c => c.driverId === car.driverId ? car : c) }, car.driverId)
      return r && r.status === 'window' ? [r.from, r.to] : r?.status
    }
    expect(intel(heated)).toEqual(intel(plain))
    expect(Array.isArray(intel(heated))).toBe(true)
  })

  it('two cold lap ends on a green dry track start graining; it then counts down', () => {
    const config = cfg('aurora')                    // window M [85, 108]; grain below 77
    let c = car0(config, { compound: 'M', thermal: th(70) })
    const a = thermalAtLapEnd(config, c, 'DRY', 0.3)
    expect(a.grained).toBe(false)
    c = { ...c, thermal: a.thermal }
    const b = thermalAtLapEnd(config, c, 'DRY', 0.3)
    expect(b.grained).toBe(true)
    expect(b.thermal.grainLaps).toBe(4)
    expect(thermalAtLapEnd(config, { ...c, thermal: b.thermal }, 'DRY', 0.3).thermal.grainLaps).toBe(3)
  })

  it('no graining on a rubbered track (H4), on hards, or in the wet', () => {
    const config = cfg('aurora')
    const cold = { thermal: th(70, { coldLaps: 1 }) }
    expect(thermalAtLapEnd(config, car0(config, { compound: 'M', ...cold }), 'DRY', 0.9).grained).toBe(false)
    expect(thermalAtLapEnd(config, car0(config, { compound: 'H', ...cold }), 'DRY', 0.3).grained).toBe(false)
    expect(thermalAtLapEnd(config, car0(config, { compound: 'M', ...cold }), 'DAMP', 0.3).grained).toBe(false)
  })

  it('graining costs grainPenalty per lap while it lasts', () => {
    const config = cfg()
    const c = car0(config, { compound: 'M', thermal: th(95, { grainLaps: 2 }) })
    expect(thermalPace(config, c, 'DRY')).toBeCloseTo(0.35 / 3, 12)
  })

  it('status zones', () => {
    const config = cfg()
    expect(thermalStatus(config, car0(config, { compound: 'H', thermal: th(80) }), 'DRY')!.zone).toBe('cold')
    expect(thermalStatus(config, car0(config, { compound: 'H', thermal: th(100) }), 'DRY')!.zone).toBe('window')
    expect(thermalStatus(config, car0(config, { compound: 'S', thermal: th(105) }), 'DRY')!.zone).toBe('hot')
    expect(thermalStatus(config, { ...car0(config), thermal: undefined }, 'DRY')).toBeNull()
  })

  it('AI: a hot pusher backs off, a cold car pushes, a neutralisation changes nothing', () => {
    const config = cfg()
    const hot = car0(config, { compound: 'S', paceMode: 'push', thermal: th(106) })
    expect(aiThermalPaceMode(config, hot, 'DRY', false, 'push')).toBe('neutral')
    const cold = car0(config, { compound: 'H', thermal: th(80) })
    expect(aiThermalPaceMode(config, cold, 'DRY', false, 'neutral')).toBe('push')
    expect(aiThermalPaceMode(config, cold, 'DRY', true, 'neutral')).toBe('neutral')
  })

  /** Steps the lap-completing sector with car 3 set up by `patch`; returns that car and the new state. */
  function step(config: RaceConfig, patch: (c: CarState) => CarState): { car: CarState; next: RaceState } {
    const s0 = initRace(config)
    const id = s0.cars[3]!.driverId
    const s: RaceState = { ...s0, lap: 6, sector: 2, cars: s0.cars.map(c => c.driverId === id ? patch({ ...c, lap: 6 }) : { ...c, lap: 6 }) }
    const next = stepSector(config, s, createRng(5))
    return { car: next.cars.find(c => c.driverId === id)!, next }
  }
  const boundary = (config: RaceConfig, patch: (c: CarState) => CarState): CarState => step(config, patch).car

  it('AI WARMS A FRESH COLD SET: an optimal car that boxes onto hards leaves the boundary on PUSH', () => {
    const base = cfg()
    const config: RaceConfig = { ...base, circuit: { ...base.circuit, trackTempC: undefined } }   // 32 °C
    const after = boundary(config, c => ({
      ...c, compound: 'M', tyreAge: 12, paceMode: 'neutral', thermal: th(95),
      strategy: { ...c.strategy, brain: 'optimal', plannedStops: [{ lap: 7, compound: 'H' }] },
    }))
    expect(after.pitsDone).toBe(1)
    expect(after.compound).toBe('H')
    expect(after.thermal!.temp).toBe(70)
    expect(after.paceMode).toBe('push')
  })

  it('A PENALTY-COVER PUSH IS NOT BACKED OFF BY HEAT', () => {
    const config = cfg('sol_desert')
    const hotPush = (pendingSec: number) => boundary(config, c => ({
      ...c, compound: 'S', tyreAge: 0, paceMode: 'push', thermal: th(112),
      penalty: { warnings: 0, pendingSec, servedSec: 0 },
      strategy: { ...c.strategy, brain: 'optimal', plannedStops: [] },
    }))
    expect(hotPush(0).paceMode).toBe('neutral')    // hot and nothing to cover: back off
    expect(hotPush(5).paceMode).toBe('push')       // covering a pending penalty outranks heat
  })

  it('race: lap-end graining is logged once, and the naive brain keeps its pace', () => {
    const config = cfg('aurora')
    const { car: after, next } = step(config, c => ({ ...c, compound: 'M', tyreAge: 2, thermal: th(60, { coldLaps: 1 }),
      strategy: { ...c.strategy, brain: 'naive', plannedStops: [] } }))
    expect(after.thermal!.grainLaps).toBe(4)
    expect(after.paceMode).toBe('neutral')         // naive: no thermal pace call, even this cold
    const grains = next.incidents.filter(e => e.kind === 'graining')
    expect(grains).toEqual([{ lap: 6, sector: 2, kind: 'graining', driverId: after.driverId, timeLoss: null }])
  })
})

describe('outLapCost (spec §5.4)', () => {
  it('prices the first lap from blankets; 0 when the model is off', () => {
    const config = cfg()
    const c = car0(config)
    expect(outLapCost(config, c, 'H', 'DRY')).toBeGreaterThan(outLapCost(config, c, 'M', 'DRY'))
    expect(outLapCost(config, c, 'S', 'DRY')).toBeLessThan(0.05)
    const off = { ...config, tuning: makeDeterministicTuning() }
    expect(outLapCost(off, initRace(off).cars[0]!, 'H', 'DRY')).toBe(0)
  })

  it('is the same three-sector sum the stop path charges, from blanket temperature', () => {
    const config = cfg()
    const c = car0(config)
    // Whatever the car's current temperature: the fitted set starts at blankets.
    const hot = { ...c, thermal: { temp: 110, coldLaps: 0, grainLaps: 2, heatWear: 1 } }
    expect(outLapCost(config, hot, 'H', 'DRY')).toBeCloseTo(lapCost(config, 'H', 70, c), 12)
  })

  it('costs nothing under a neutralisation (ruling H6) or on the wrong tyre family (H3)', () => {
    const config = cfg()
    const c = car0(config)
    expect(outLapCost(config, c, 'H', 'DRY', true)).toBe(0)
    expect(outLapCost(config, c, 'H', 'WET')).toBe(0)
  })
})
