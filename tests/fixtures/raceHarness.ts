import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import { makeTuning } from './tuning'
import type { RaceConfig, RaceState } from '@engine/types'

const DATA = loadGameData()
export type TuningOverrides = Parameters<typeof makeTuning>[0]

/** A full-grid race config on the shipped data with the given tuning overrides and no player car. */
export function makeConfig(overrides: TuningOverrides, seed: number, circuitId = 'bengaluru'): RaceConfig {
  return {
    circuit: DATA.circuits[circuitId]!,
    tuning: makeTuning(overrides),
    compounds: DATA.compounds,
    drivers: DATA.drivers.drivers,
    teams: DATA.cars.teams,
    strategies: DATA.strategies.defaults,
    playerDriverId: '__none__',
    seed,
  }
}

/** Steps a whole race, handing every intermediate state to `onTick`. */
export function runRace(config: RaceConfig, seed: number, onTick?: (prev: RaceState, next: RaceState) => void): RaceState {
  let state = initRace(config)
  const rng = createRng(seed)
  for (let i = 0; i < (config.lapsOverride ?? config.circuit.laps) * 3; i++) {
    const next = stepSector(config, state, rng)
    onTick?.(state, next)
    state = next
  }
  return state
}
