import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig, CircuitSpec } from '@engine/types'

const DATA = loadGameData()

// rainProbability 0 keeps every test dry: wet weather would introduce
// crossover penalties and wet-incident retirements and confound the rates.
const CIRCUIT: CircuitSpec = {
  name: 'Reference', laps: 56,
  sectorBase: [28.0, 34.0, 28.0], carSensitivity: [0.30, 0.45, 0.25],
  driverSensitivity: [0.30, 0.40, 0.30], overtakingFactor: [1.0, 0.25, 0.55],
  pitLaneTimeLoss: 22.0, rainProbability: 0.0, weatherBias: 'stable',
}

function configFor(teamId: string, seed: number): RaceConfig {
  const team = DATA.cars.teams.find(t => t.id === teamId)!
  const drivers = DATA.drivers.drivers.filter(d => d.teamId === teamId).slice(0, 1)
  return {
    circuit: CIRCUIT,
    tuning: DATA.tuning,
    compounds: DATA.compounds,
    drivers,
    teams: [team],
    // Generous allocation and a mid-race stop keep tyres away from the cliff,
    // so any retirement observed here is mechanical, not a puncture.
    strategies: [{ teamId, startCompound: 'M', plannedStops: [{ lap: 28, compound: 'M' }], brain: 'smart' }],
    playerDriverId: 'none',
    seed,
    tyreAllocationBase: { S: 99, M: 99, H: 99, I: 99, W: 99 },
  }
}

/** Run one full race and report whether the single car retired. */
function raceRetires(teamId: string, seed: number): boolean {
  const config = configFor(teamId, seed)
  let state = initRace(config)
  const rng = createRng(seed)
  const totalSectors = CIRCUIT.laps * 3
  for (let i = 0; i < totalSectors; i++) state = stepSector(config, state, rng)
  return state.cars[0]!.retired
}

function dnfRate(teamId: string, races: number): number {
  let dnfs = 0
  for (let s = 0; s < races; s++) if (raceRetires(teamId, s + 1)) dnfs++
  return dnfs / races
}

describe('mechanical failure', () => {
  it('retires a fragile car far more often than a bulletproof one', () => {
    // Halcyon reliability 72, Zenith reliability 94.
    const fragile = dnfRate('halcyon', 300)
    const solid = dnfRate('zenith', 300)
    expect(fragile).toBeGreaterThan(solid)
  })

  it('never retires a car when the base chance is zero', () => {
    const config = configFor('halcyon', 7)
    config.tuning = { ...DATA.tuning, mechanicalFailure: { baseChancePerLap: 0 } }
    let state = initRace(config)
    const rng = createRng(7)
    for (let i = 0; i < CIRCUIT.laps * 3; i++) state = stepSector(config, state, rng)
    expect(state.cars[0]!.retired).toBe(false)
  })

  it('freezes a mechanically retired car', () => {
    // Force certain failure on the first roll.
    const config = configFor('halcyon', 3)
    config.tuning = { ...DATA.tuning, mechanicalFailure: { baseChancePerLap: 100 } }
    let state = initRace(config)
    const rng = createRng(3)
    state = stepSector(config, state, rng)
    const car = state.cars[0]!
    expect(car.retired).toBe(true)
    expect(car.retiredLap).not.toBeNull()

    const timeAtRetirement = car.raceTime
    state = stepSector(config, state, rng)
    // A frozen car accrues no further race time.
    expect(state.cars[0]!.raceTime).toBe(timeAtRetirement)
  })
})
