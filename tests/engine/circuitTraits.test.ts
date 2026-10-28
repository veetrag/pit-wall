import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { circuitTraits } from '@engine/circuitTraits'
import { effectiveTyreAge } from '@engine/tyres'
import {
  driverErrorChancePerSector, rollDriverError, rollSafetyCarDeployment, rollVscDeployment,
} from '@engine/incidents'
import { loadGameData } from '@data/validators'
import { makeTuning, makeDeterministicTuning } from '../fixtures/tuning'
import type { CircuitSpec, RaceConfig, RaceState } from '@engine/types'

const DATA = loadGameData()
const BASE = DATA.circuits['bengaluru']! as CircuitSpec

function config(circuit: CircuitSpec, tuning = makeDeterministicTuning(), seed = 7): RaceConfig {
  return {
    circuit, tuning, compounds: DATA.compounds, drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
    strategies: DATA.strategies.defaults, playerDriverId: '__none__', seed,
  }
}
function run(c: RaceConfig): RaceState {
  let s = initRace(c)
  const rng = createRng(c.seed)
  for (let i = 0; i < c.circuit.laps * 3; i++) s = stepSector(c, s, rng)
  return s
}

describe('circuitTraits', () => {
  it('is neutral when a circuit carries no trait', () => {
    expect(circuitTraits(BASE, makeTuning())).toEqual({ wear: 1, crashRisk: 1, neutralisationRisk: 1 })
  })
  it('multiplies tyreWear by the night factor at night only', () => {
    const T = makeTuning({ timeOfDay: { nightWearFactor: 0.94 } })
    expect(circuitTraits({ ...BASE, tyreWear: 1.35 }, T).wear).toBeCloseTo(1.35, 12)
    expect(circuitTraits({ ...BASE, tyreWear: 1.35, timeOfDay: 'night' }, T).wear).toBeCloseTo(1.35 * 0.94, 12)
    expect(circuitTraits({ ...BASE, timeOfDay: 'dusk' }, T).wear).toBe(1)
  })
})

describe('NEUTRAL TRAITS ARE THE OLD ARITHMETIC', () => {
  it('a circuit with explicit neutral traits races byte-identically to one with none', () => {
    const plain = run(config(BASE))
    const neutral = run(config({ ...BASE, tyreWear: 1, crashRisk: 1, neutralisationRisk: 1, timeOfDay: 'dusk', layout: 'permanent' }))
    expect(JSON.stringify(neutral)).toBe(JSON.stringify(plain))
  }, 60_000)

  it('a night circuit at nightWearFactor 1 races byte-identically', () => {
    const T = makeDeterministicTuning({ timeOfDay: { nightWearFactor: 1 } })
    expect(JSON.stringify(run(config({ ...BASE, timeOfDay: 'night' }, T)))).toBe(JSON.stringify(run(config(BASE, T))))
  }, 60_000)
})

describe('wear', () => {
  it('scales effective tyre age exactly by the circuit wear', () => {
    const T = makeTuning()
    const car = initRace(config(BASE)).cars[0]!
    const driver = DATA.drivers.drivers.find(d => d.id === car.driverId)!
    const aged = { ...car, tyreAge: 10 }
    const plain = effectiveTyreAge(aged, driver, 'DRY', { tuning: T, circuit: BASE })
    const worn = effectiveTyreAge(aged, driver, 'DRY', { tuning: T, circuit: { ...BASE, tyreWear: 1.35 } })
    expect(worn / plain).toBeCloseTo(1.35, 12)
  })

  it('a high-wear circuit makes the field stop more often', () => {
    const T = makeDeterministicTuning()
    const stops = (s: RaceState) => s.cars.reduce((a, c) => a + c.pitsDone, 0)
    expect(stops(run(config({ ...BASE, tyreWear: 1.5 }, T)))).toBeGreaterThan(stops(run(config(BASE, T))))
  }, 60_000)
})

describe('risk factors scale chances and never add a draw', () => {
  it('driver error chance scales by crashRisk', () => {
    const T = makeTuning()
    expect(driverErrorChancePerSector(80, T, 1.6)).toBeCloseTo(driverErrorChancePerSector(80, T) * 1.6, 12)
  })

  it('DRAWS NOTHING at a zero base whatever the factor', () => {
    const zeroed = makeDeterministicTuning()
    let draws = 0
    const counting = () => { draws++; return 0.5 }
    for (let i = 0; i < 50; i++) {
      expect(rollDriverError(50, zeroed, counting, 2)).toBe(false)
      expect(rollSafetyCarDeployment('crash', zeroed, counting, 2)).toBe(false)
      expect(rollVscDeployment('mechanical', zeroed, counting, 2)).toBe(false)
    }
    expect(draws).toBe(0)
  })

  it('SC and VSC chances are base x risk, capped at 1', () => {
    const T = makeTuning({ incidents: { safetyCar: { crashDeployChance: 0.30 }, vsc: { mechanicalDeployChance: 0.40 } } })
    const N = 20_000
    const rate = (f: (r: () => number) => boolean, seed: number) => {
      const rng = createRng(seed); let h = 0
      for (let i = 0; i < N; i++) if (f(rng)) h++
      return h / N
    }
    expect(Math.abs(rate(r => rollSafetyCarDeployment('crash', T, r, 1.5), 11) - 0.45)).toBeLessThan(4 * Math.sqrt(0.45 * 0.55 / N))
    expect(Math.abs(rate(r => rollVscDeployment('mechanical', T, r, 1.5), 13) - 0.60)).toBeLessThan(4 * Math.sqrt(0.6 * 0.4 / N))
    const sure = makeTuning({ incidents: { safetyCar: { crashDeployChance: 0.8 } } })
    expect(rate(r => rollSafetyCarDeployment('crash', sure, r, 2), 17)).toBe(1)
  })

  it('race.ts passes the circuit crash risk: 2x risk roughly doubles errors', () => {
    const T = makeDeterministicTuning({ incidents: { driverErrorPerLap: 0.02, terminalFraction: 0 } })
    const errors = (c: CircuitSpec) => {
      let n = 0
      for (let seed = 1; seed <= 12; seed++) n += run(config(c, T, seed)).incidents.filter(i => i.kind === 'driver_error').length
      return n
    }
    const ratio = errors({ ...BASE, crashRisk: 2 }) / errors(BASE)
    expect(ratio).toBeGreaterThan(1.6)
    expect(ratio).toBeLessThan(2.4)
  }, 120_000)
})
