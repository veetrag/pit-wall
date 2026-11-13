import { describe, it, expect } from 'vitest'
import {
  initThermal, outLapThermal, thermalTarget, thermalWindow, thermalPace, thermalAfterSector,
} from '@engine/thermal'
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
