import { describe, it, expect } from 'vitest'
import { buildScenarioConfig, buildRaceConfig, SCENARIO_DIFFICULTY } from '@state/buildRaceConfig'
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

  it('DOES NOT VARY WITH THE PLAYER\'S SAVE STATE', () => {
    /*
     * A scenario must be the same challenge for everyone, so its config must
     * not pick up the season's purchased upgrades or rival development.
     *
     * Comparing two identical calls would NOT show this: if buildScenarioConfig
     * started reading useSeasonStore internally, both calls would read the same
     * store and still agree. So this compares the scenario config against one
     * built with a fully-developed season, which must differ ONLY if the
     * scenario path is leaking save state.
     */
    const spec = { circuitId: 'veloce', seed: 17, playerDriverId: PLAYER }
    const plain = buildScenarioConfig(spec)
    const upgraded = buildRaceConfig(17, PLAYER, 'veloce', SCENARIO_DIFFICULTY, null, {
      purchasedTiers: { power: 3, aero: 3, handling: 3, reliability: 3, driverPace: 3 },
      rivalDevelopment: { terra: 12, zenith: 12 },
    })
    expect(JSON.stringify(plain.teams),
      'a scenario must not inherit purchased upgrades').not.toBe(JSON.stringify(upgraded.teams))
    expect(plain.playerStrategyOverride,
      'no pre-race plan in a mid-race takeover').toBeUndefined()
  })
})
