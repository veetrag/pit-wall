import { describe, it, expect } from 'vitest'
import { initRace, stepSector, projectPitNow, shouldAIPit } from '@engine/index'
import { loadGameData } from '@data/validators'
import type { RaceConfig } from '@engine/types'

describe('engine public API', () => {
  it('exports initRace, stepSector, projectPitNow, shouldAIPit', () => {
    expect(typeof initRace).toBe('function')
    expect(typeof stepSector).toBe('function')
    expect(typeof projectPitNow).toBe('function')
    expect(typeof shouldAIPit).toBe('function')
  })

  it('can init a race from real game data', () => {
    const data = loadGameData()
    const circuit = data.circuits['silverpark']!
    const config: RaceConfig = {
      circuit,
      tuning: data.tuning,
      compounds: data.compounds,
      drivers: data.drivers.drivers,
      teams: data.cars.teams,
      strategies: data.strategies.defaults,
      playerDriverId: 'd_voss',
      seed: 42,
    }
    const state = initRace(config)
    expect(state.cars).toHaveLength(data.drivers.drivers.length)
  })
})
