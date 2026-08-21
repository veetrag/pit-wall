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
