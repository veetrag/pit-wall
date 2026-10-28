import { describe, it, expect } from 'vitest'
import { projectPitNow } from '@engine/projection'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import type { RaceConfig, TuningConstants, CircuitSpec, CompoundSpec } from '@engine/types'
import { makeDeterministicTuning } from '../fixtures/tuning'

const TUNING: TuningConstants = makeDeterministicTuning()

const CIRCUIT: CircuitSpec = {
  name: 'Proj', laps: 20, sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
}

const COMPOUNDS: Record<'S' | 'M' | 'H', CompoundSpec> = {
  S: { name: 'Soft',   type: 'dry', offset: -0.8, lin: 0.06,  cliff: 10, pen: 0.10, colorToken: '--tyre-soft' },
  M: { name: 'Medium', type: 'dry', offset:  0.0, lin: 0.04,  cliff: 16, pen: 0.07, colorToken: '--tyre-medium' },
  H: { name: 'Hard',   type: 'dry', offset:  0.6, lin: 0.025, cliff: 24, pen: 0.045, colorToken: '--tyre-hard' },
}

function makeConfig(): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
    drivers: [
      { id: 'player', name: 'Player', code: 'PLR', teamId: 'apex', facets: { pace: 80, racecraft: 90, tyreManagement: 80, consistency: 95, wetWeather: 80, experience: 80 } },
      { id: 'rival1', name: 'Rival1', code: 'RV1', teamId: 'mid',  facets: { pace: 60, racecraft: 80, tyreManagement: 80, consistency: 88, wetWeather: 80, experience: 80 } },
    ],
    teams: [
      { id: 'apex', name: 'Apex', colorPrimary: '#0ef', colorSecondary: '#000', facets: { power: 100,  aero: 100,  handling: 100,  reliability: 99, pitCrew: 80 } },
      { id: 'mid',  name: 'Mid',  colorPrimary: '#f00', colorSecondary: '#fff', facets: { power: 66.7, aero: 66.7, handling: 66.7, reliability: 98, pitCrew: 80 } },
    ],
    strategies: [
      { teamId: 'apex', startCompound: 'M', plannedStops: [{ lap: 10, compound: 'H' }] },
      { teamId: 'mid',  startCompound: 'M', plannedStops: [{ lap: 10, compound: 'H' }] },
    ],
    playerDriverId: 'player',
    seed: 1,
  }
}

describe('projectPitNow', () => {
  it('returns a valid position between 1 and grid size', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(1)
    for (let i = 0; i < 15; i++) state = stepSector(config, state, rng)
    const result = projectPitNow(config, state, 'H', 999)
    expect(result.rejoinPosition).toBeGreaterThanOrEqual(1)
    expect(result.rejoinPosition).toBeLessThanOrEqual(config.drivers.length)
  })

  it('does not mutate the live race state', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(1)
    for (let i = 0; i < 12; i++) state = stepSector(config, state, rng)
    const playerBefore = state.cars.find(c => c.driverId === 'player')!.raceTime
    projectPitNow(config, state, 'H', 777)
    expect(state.cars.find(c => c.driverId === 'player')!.raceTime).toBe(playerBefore)
  })

  it('returns lapsProjected equal to projection.horizonLaps', () => {
    const config = makeConfig()
    let state = initRace(config)
    const rng = createRng(1)
    for (let i = 0; i < 9; i++) state = stepSector(config, state, rng)
    const result = projectPitNow(config, state, 'H', 42)
    expect(result.lapsProjected).toBe(config.tuning.projection.horizonLaps)
  })
})

// Two latent defects the 2.0 planning pass found (spec 2.0 ruling A4): the
// projected stop never recorded its compound, and the fast-forward ran on past
// the chequered flag. Together they priced a phantom two-compound penalty.
describe('projectPitNow near the flag', () => {
  /** Player on a no-stop plan, so the live car has only ever used M. */
  function nearFlag(laps: number, mandatoryTwoCompound: boolean) {
    const base = makeConfig()
    const config: RaceConfig = {
      ...base,
      mandatoryTwoCompound,
      strategies: [
        { teamId: 'apex', startCompound: 'M', plannedStops: [] },
        { teamId: 'mid',  startCompound: 'M', plannedStops: [{ lap: 10, compound: 'H' }] },
      ],
    }
    let state = initRace(config)
    const rng = createRng(1)
    while (state.lap < laps) state = stepSector(config, state, rng)
    return { config, state }
  }

  it('records the projected compound, so a stop at the end owes no two-compound penalty', () => {
    const off = nearFlag(18, false)
    const on = nearFlag(18, true)
    expect(on.state.cars.find(c => c.isPlayer)!.compoundsUsed).toEqual(['M'])
    const withRule = projectPitNow(on.config, on.state, 'H', 4242)
    const withoutRule = projectPitNow(off.config, off.state, 'H', 4242)
    expect(withRule).toEqual(withoutRule)
  })

  it('stops at the flag instead of simulating laps after it', () => {
    const { config, state } = nearFlag(19, false)
    const longer: RaceConfig = {
      ...config,
      tuning: { ...config.tuning, projection: { ...config.tuning.projection, horizonLaps: 10, netEstimateHorizonLaps: 30 } },
    }
    const a = projectPitNow(config, state, 'H', 99)
    const b = projectPitNow(longer, state, 'H', 99)
    expect({ ...b, lapsProjected: a.lapsProjected }).toEqual(a)
  })
})
