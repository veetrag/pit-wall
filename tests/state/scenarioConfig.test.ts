import { describe, it, expect } from 'vitest'
import { buildScenarioConfig } from '@state/buildRaceConfig'
import { startScenario, describeSituation } from '@engine/scenario'
import { loadGameData } from '@data/validators'
import type { RaceConfig } from '@engine/types'

const DATA = loadGameData()
const PLAYER = 'd_voss'

/** The config the search script used to build by hand, before Task 1. */
function naiveConfig(circuitId: string, seed: number): RaceConfig {
  return {
    circuit: DATA.circuits[circuitId]!, tuning: DATA.tuning, compounds: DATA.compounds,
    drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
    strategies: DATA.strategies.defaults, playerDriverId: PLAYER, seed,
  }
}

describe('buildScenarioConfig', () => {
  it('APPLIES THE SETTINGS A HAND-BUILT CONFIG FORGETS', () => {
    /*
     * THE REGRESSION GUARD FOR THIS WHOLE FEATURE.
     *
     * A scenario is a seed plus a lap; that only reproduces the authored
     * situation if the config matches too. When the search tool built its own
     * config, bengaluru seed 2 lap 40 was P8 "buried in the pack" during
     * authoring and P1 LEADING at play time. This asserts the shared builder
     * actually carries the fields the hand-built one dropped.
     */
    const config = buildScenarioConfig({ circuitId: 'bengaluru', seed: 2, playerDriverId: PLAYER })
    expect(config.tyreAllocationBase, 'allocation must be set').toBeDefined()
    expect(config.mandatoryTwoCompound).toBeDefined()
    expect(config.coverReactionScale).toBeDefined()
    expect(config.paceModeAggression).toBeDefined()
    // Planned stops are scaled to the circuit, not left on the 30-lap reference.
    const laps = DATA.circuits['bengaluru']!.laps
    const raw = DATA.strategies.defaults[0]!.plannedStops[0]!.lap
    expect(config.strategies[0]!.plannedStops[0]!.lap).toBe(Math.round((raw / 30) * laps))
  })

  it('produces a DIFFERENT race than the hand-built config did', () => {
    // Proves the two paths were genuinely divergent -- if this ever passes
    // trivially, the naive config has drifted into agreement and the guard
    // above is carrying the weight alone.
    const shared = describeSituation(startScenario(buildScenarioConfig({ circuitId: 'bengaluru', seed: 2, playerDriverId: PLAYER }), 40).state, PLAYER)
    const naive = describeSituation(startScenario(naiveConfig('bengaluru', 2), 40).state, PLAYER)
    expect(shared).not.toEqual(naive)
  }, 60_000)

  it('does not vary with season upgrades or a pre-race strategy', () => {
    // Two calls with identical spec must be identical configs; a scenario that
    // moved with the player's save state would not be a fixed challenge.
    const a = buildScenarioConfig({ circuitId: 'veloce', seed: 17, playerDriverId: PLAYER })
    const b = buildScenarioConfig({ circuitId: 'veloce', seed: 17, playerDriverId: PLAYER })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(a.playerStrategyOverride, 'no pre-race plan in a mid-race takeover').toBeUndefined()
  })
})
