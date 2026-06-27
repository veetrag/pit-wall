import { describe, it, expect } from 'vitest'
import { projectPitNow } from '@engine/projection'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import type { RaceConfig, TuningConstants, CircuitSpec, CompoundSpec } from '@engine/types'

const TUNING: TuningConstants = {
  carPerformance: { deltaPerRating: 0.22, sectorSplit: [0.30, 0.45, 0.25] },
  driverPerformance: { deltaPerSkill: 0.10, sectorSplit: [0.30, 0.40, 0.30] },
  fuel: { effectPerLap: 0.035 },
  noise: { sigmaPerSector: 0.08 },
  trackEvolution: { startDelta: 0.30, decayLaps: 20 },
  traffic: { gapThreshold: 2.2, penalty: 0.30 },
  overtaking: { base: 0.22, paceMultiplier: 3.0, sectorFactor: [1.0, 0.25, 0.55] },
  pit: { laneTimeLoss: 22.0, stopMean: 2.4, stopSigma: 0.3 },
  paceModes: {
    push:     { paceDelta: -0.15, degMultiplier: 1.30 },
    neutral:  { paceDelta:  0.00, degMultiplier: 1.00 },
    conserve: { paceDelta:  0.20, degMultiplier: 0.75 },
  },
  projection: { horizonLaps: 4, useOvertakeRolls: false },
  incidents: { dnfPerLap: 0.0, driverErrorPerLap: 0.0 },
}

const CIRCUIT: CircuitSpec = {
  name: 'Proj', laps: 20, sectorBase: [28.0, 34.0, 28.0],
  carSensitivity: [0.30, 0.45, 0.25], driverSensitivity: [0.30, 0.40, 0.30],
  overtakingFactor: [1.0, 0.25, 0.55], pitLaneTimeLoss: 22.0,
}

const COMPOUNDS: Record<'S' | 'M' | 'H', CompoundSpec> = {
  S: { name: 'Soft',   offset: -0.6, lin: 0.040, cliff: 12, pen: 0.030, colorToken: '--tyre-soft' },
  M: { name: 'Medium', offset:  0.0, lin: 0.025, cliff: 22, pen: 0.020, colorToken: '--tyre-medium' },
  H: { name: 'Hard',   offset:  0.5, lin: 0.015, cliff: 35, pen: 0.012, colorToken: '--tyre-hard' },
}

function makeConfig(): RaceConfig {
  return {
    circuit: CIRCUIT, tuning: TUNING, compounds: COMPOUNDS,
    drivers: [
      { id: 'player', name: 'Player', code: 'PLR', teamId: 'apex', skill: 2, racecraft: 0.9, consistency: 0.95 },
      { id: 'rival1', name: 'Rival1', code: 'RV1', teamId: 'mid',  skill: 4, racecraft: 0.8, consistency: 0.88 },
    ],
    teams: [
      { id: 'apex', name: 'Apex', rating: 0, reliability: 0.99, colorPrimary: '#0ef', colorSecondary: '#000' },
      { id: 'mid',  name: 'Mid',  rating: 3, reliability: 0.98, colorPrimary: '#f00', colorSecondary: '#fff' },
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
