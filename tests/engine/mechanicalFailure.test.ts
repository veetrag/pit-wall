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

  it('holds the fragile-team DNF band', () => {
    // Halcyon reliability 72, spec §5 target 10-15%. Measured 11.9% at 1500
    // races with fixed seeds (s + 1) — 400 races is only a ~0.8pp-SE
    // binomial sample and reads high by ~1.6 SE, so the band is set at the
    // spec's own analytic target rather than the small-sample measurement.
    const rate = dnfRate('halcyon', 1500)
    expect(rate).toBeGreaterThan(0.09)
    expect(rate).toBeLessThan(0.15)
  })

  it('holds the bulletproof-team DNF band', () => {
    // Zenith reliability 94, spec §5 target 2-4%. Measured 2.5% at 1500
    // races with fixed seeds (s + 1) — the 400-race sample reads 3.75%,
    // about 1.6 SE high, which would force the ceiling above the spec's own
    // 4% target. The band is set at the spec's target, not the small sample.
    const rate = dnfRate('zenith', 1500)
    expect(rate).toBeGreaterThan(0.015)
    expect(rate).toBeLessThan(0.04)
  })

  it('orders the whole grid by reliability', () => {
    // The mechanic must be monotonic in reliability, not merely different at
    // the extremes — otherwise the archetypes still lie in the middle.
    const halcyon = dnfRate('halcyon', 300)  // 72
    const delta = dnfRate('delta', 300)      // 89
    const apex = dnfRate('apex', 300)        // 96
    expect(halcyon).toBeGreaterThan(delta)
    expect(delta).toBeGreaterThan(apex)
  })

  it('sets retiredCause per failure path', () => {
    // Force a tyre-cliff failure: push cliffFractionThreshold to 0 and
    // chancePerLapOverThreshold sky-high so the tyre roll fires first, with
    // mechanical failure disabled so it can't also fire on the same car.
    const tyreConfig = configFor('halcyon', 3)
    tyreConfig.tuning = {
      ...DATA.tuning,
      mechanicalFailure: { baseChancePerLap: 0 },
      tyreFailure: { ...DATA.tuning.tyreFailure, cliffFractionThreshold: 0, chancePerLapOverThreshold: 999, maxChancePerLap: 999 },
    }
    let tyreState = initRace(tyreConfig)
    const tyreRng = createRng(3)
    // tyreAge only increments once a lap completes (every 3rd sector), and
    // the cliff check needs tyreAge > 0 to clear the (threshold-0) bar, so
    // step until the car retires rather than assuming it happens on sector 1.
    for (let i = 0; i < 12 && !tyreState.cars[0]!.retired; i++) {
      tyreState = stepSector(tyreConfig, tyreState, tyreRng)
    }
    expect(tyreState.cars[0]!.retired).toBe(true)
    expect(tyreState.cars[0]!.retiredCause).toBe('tyre')

    // Force a mechanical failure: base chance 100 guarantees the roll fires;
    // tyre failure stays at its default (inert threshold) so it can't race
    // the mechanical roll on the same sector.
    const mechConfig = configFor('halcyon', 3)
    mechConfig.tuning = { ...DATA.tuning, mechanicalFailure: { baseChancePerLap: 100 } }
    let mechState = initRace(mechConfig)
    const mechRng = createRng(3)
    mechState = stepSector(mechConfig, mechState, mechRng)
    expect(mechState.cars[0]!.retired).toBe(true)
    expect(mechState.cars[0]!.retiredCause).toBe('mechanical')
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

  it('keeps field-wide attrition in band on the full 20-car grid', () => {
    // Spec §11 risk 1: single-team DNF bands can't catch a mechanic that
    // thins the *whole* field. Run the real 20-car grid on the real
    // Bengaluru circuit with real tuning and real strategies.defaults, and
    // bound the mean and worst-case retirement count per race.
    //
    // Measured over 40 races (seeds 1..40) on this branch: mean 1.32
    // retirements/race, worst single race 3. (The design doc's own
    // reference measurement was mean 2.13 / worst 6 — this run differs,
    // so the bands below are set from what was actually measured here,
    // per the instruction to prefer the measured value over the reference.)
    // The design's own fail condition (per the development-points design
    // work) was "a third or more of the grid" retiring — 6.67 of 20 — so
    // the worst-case ceiling here is set well under that with headroom.
    const circuit = DATA.circuits['bengaluru']!
    const RACES = 40
    const counts: number[] = []
    for (let seed = 1; seed <= RACES; seed++) {
      const config: RaceConfig = {
        circuit,
        tuning: DATA.tuning,
        compounds: DATA.compounds,
        drivers: DATA.drivers.drivers,
        teams: DATA.cars.teams,
        strategies: DATA.strategies.defaults,
        playerDriverId: 'none',
        seed,
      }
      let state = initRace(config)
      const rng = createRng(seed)
      const totalSectors = circuit.laps * 3
      for (let i = 0; i < totalSectors; i++) state = stepSector(config, state, rng)
      counts.push(state.cars.filter(c => c.retired).length)
    }
    const mean = counts.reduce((a, b) => a + b, 0) / RACES
    const worst = Math.max(...counts)
    // eslint-disable-next-line no-console
    console.log(`Field attrition over ${RACES} races: mean ${mean.toFixed(2)}, worst ${worst}`)
    expect(mean).toBeGreaterThan(0.3)
    expect(mean).toBeLessThan(3)
    expect(worst).toBeLessThan(6) // well under "a third of the grid" (6.67 of 20)
  })
})
