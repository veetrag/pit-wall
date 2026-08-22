import { describe, it, expect } from 'vitest'
import { loadGameData } from '@data/validators'

describe('loadGameData', () => {
  it('loads and validates all data files without throwing', () => {
    const data = loadGameData()
    expect(data.tuning.carPerformance.deltaPerRating).toBe(0.22)
    expect(data.compounds['S']!.cliff).toBe(10)
    expect(data.circuits['bengaluru']!.laps).toBe(56)
    expect(data.cars.teams).toHaveLength(10)
    expect(data.drivers.drivers).toHaveLength(20)
  })

  it('every driver teamId references a valid team', () => {
    const data = loadGameData()
    const teamIds = new Set(data.cars.teams.map(t => t.id))
    for (const d of data.drivers.drivers) {
      expect(teamIds.has(d.teamId), `driver ${d.id} has unknown teamId ${d.teamId}`).toBe(true)
    }
  })

  it('all strategy teamIds reference valid teams', () => {
    const data = loadGameData()
    const teamIds = new Set(data.cars.teams.map(t => t.id))
    for (const s of data.strategies.defaults) {
      expect(teamIds.has(s.teamId)).toBe(true)
    }
  })

  it('sectorBase arrays all have length 3', () => {
    const data = loadGameData()
    for (const [id, circuit] of Object.entries(data.circuits) as [string, { sectorBase: number[] }][]) {
      expect(circuit.sectorBase, `${id} sectorBase`).toHaveLength(3)
    }
  })

  it('compound keys include S, M, H, I, W', () => {
    const data = loadGameData()
    const keys = Object.keys(data.compounds).sort()
    expect(keys).toContain('S')
    expect(keys).toContain('M')
    expect(keys).toContain('H')
    expect(keys).toContain('I')
    expect(keys).toContain('W')
  })

  // The zod guards on these two are hardcoded (`.nonnegative()` and
  // `.max(0.35)`); these assertions check the same intent against the DATA, so
  // they also catch circuits.json moving under the hardcoded bound.
  it('overtaking.fightCost is non-negative', () => {
    // Mutation caught: a negative fightCost. It is added to the OVERTAKEN car
    // in race.ts's swap, so a negative value silently REWARDS being overtaken,
    // and no gate on the overtaking branch prices the defender's loss directly.
    expect(loadGameData().tuning.overtaking.fightCost).toBeGreaterThanOrEqual(0)
  })

  it('overtaking.factorFloor does not clip every sector of any circuit', () => {
    // factorFloor is the divisor's lower bound in race.ts's traffic penalty. It
    // already clips SOME sectors by design (2 of 3 at harbour_lights and kaido
    // -- see TuningConstants.overtaking.factorFloor and MODEL_SPEC.md §7). What
    // must never happen is a circuit with ALL THREE sectors clipped: its
    // penalty becomes uniform and the per-circuit mechanism is silently off
    // there, which would take the two clearing gates in
    // tests/engine/overtakeRaceTime.test.ts red with no obvious cause.
    //
    // Mutations caught: factorFloor raised above 0.35 (the smallest per-circuit
    // MAXIMUM overtakingFactor, harbour_lights'), or a circuit's factors all
    // lowered under the shipped floor.
    const data = loadGameData()
    const floor = data.tuning.overtaking.factorFloor
    for (const [id, circuit] of Object.entries(data.circuits) as [string, { overtakingFactor: number[] }][]) {
      const max = Math.max(...circuit.overtakingFactor)
      expect(max, `${id} overtakingFactor ${JSON.stringify(circuit.overtakingFactor)} is entirely clipped by factorFloor ${floor}`)
        .toBeGreaterThanOrEqual(floor)
    }
  })

  it('loads the mechanicalFailure tuning block', () => {
    const data = loadGameData()
    expect(data.tuning.mechanicalFailure.baseChancePerLap).toBeCloseTo(0.008, 5)
  })
})
