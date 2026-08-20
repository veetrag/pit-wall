import { describe, it, expect } from 'vitest'
import { initRace } from '@engine/index'
import { loadGameData } from '@data/validators'
import type { RaceConfig, CircuitSpec, StrategyPlan } from '@engine/types'

// Found during on-device playtesting: every AI car started on the hardcoded dry
// compound from strategies.json regardless of the weather, so a wet start left
// the whole field eating the 9s/lap crossover penalty while a player who had
// fitted wets (now recommended by the race-setup forecast) built a race-winning
// lead by lap 9. The rule under test is deliberately simple — if it's wet at
// lights out, start on wets — with no difficulty gating.

const DATA = loadGameData()

// rainProbability is irrelevant here: every test forces weatherTimeline[0] via
// weatherSeed search, so the circuit only supplies geometry.
const CIRCUIT: CircuitSpec = {
  name: 'Reference', laps: 30,
  sectorBase: [28.0, 34.0, 28.0], carSensitivity: [0.30, 0.45, 0.25],
  driverSensitivity: [0.30, 0.40, 0.30], overtakingFactor: [1.0, 0.25, 0.55],
  pitLaneTimeLoss: 22.0, rainProbability: 0.5, weatherBias: 'stable',
}

const DRY_PLAN: StrategyPlan = { teamId: 'apex', startCompound: 'M', plannedStops: [], brain: 'naive' }

function makeConfig(overrides: Partial<RaceConfig> = {}): RaceConfig {
  const drivers = DATA.drivers.drivers.slice(0, 4)
  return {
    circuit: CIRCUIT,
    tuning: DATA.tuning,
    compounds: DATA.compounds,
    drivers,
    teams: DATA.cars.teams,
    // Every car gets an explicitly dry plan, so any wet compound seen in the
    // grid must have come from the rule and not from the source data.
    strategies: drivers.map(d => ({ ...DRY_PLAN, teamId: d.teamId })),
    playerDriverId: 'none',
    seed: 1,
    ...overrides,
  }
}

/** Find a weatherSeed whose lap-1 state is `want`, so tests assert on intent. */
function seedFor(want: 'DRY' | 'DAMP' | 'WET', base: Partial<RaceConfig> = {}): number {
  for (let s = 0; s < 4000; s++) {
    const state = initRace(makeConfig({ ...base, weatherSeed: s }))
    if (state.weatherState === want) return s
  }
  throw new Error(`no seed produced a ${want} start`)
}

describe('grid-conditions starting compound', () => {
  it('starts the field on wets when the race opens WET', () => {
    const seed = seedFor('WET')
    const state = initRace(makeConfig({ weatherSeed: seed }))

    expect(state.weatherState).toBe('WET')
    expect(state.cars.length).toBeGreaterThan(0)
    for (const car of state.cars) {
      expect(car.compound).toBe('W')
      // strategy, compoundsUsed and allocation must agree with the fitted tyre,
      // or the two-compound rule and tyre-pool accounting drift out of sync.
      expect(car.strategy.startCompound).toBe('W')
      expect(car.compoundsUsed).toEqual(['W'])
    }
  })

  it('starts the field on intermediates when the race opens DAMP', () => {
    const seed = seedFor('DAMP')
    const state = initRace(makeConfig({ weatherSeed: seed }))

    expect(state.weatherState).toBe('DAMP')
    for (const car of state.cars) {
      expect(car.compound).toBe('I')
      expect(car.strategy.startCompound).toBe('I')
    }
  })

  it("leaves the team's planned compound alone in the dry", () => {
    const seed = seedFor('DRY')
    const state = initRace(makeConfig({ weatherSeed: seed }))

    expect(state.weatherState).toBe('DRY')
    for (const car of state.cars) {
      expect(car.compound).toBe('M')
      expect(car.strategy.startCompound).toBe('M')
    }
  })

  it('never overrides the player\'s own deliberate choice', () => {
    const playerId = DATA.drivers.drivers[0]!.id
    const playerTeam = DATA.drivers.drivers[0]!.teamId
    // Starting on softs in the wet is a bad idea, but it is the player's to make.
    const override: StrategyPlan = { teamId: playerTeam, startCompound: 'S', plannedStops: [] }
    const base = { playerDriverId: playerId, playerStrategyOverride: override }

    const seed = seedFor('WET', base)
    const state = initRace(makeConfig({ ...base, weatherSeed: seed }))

    expect(state.weatherState).toBe('WET')
    const player = state.cars.find(c => c.isPlayer)!
    expect(player.compound).toBe('S')

    // ...while the AI around them still gets it right.
    for (const ai of state.cars.filter(c => !c.isPlayer)) {
      expect(ai.compound).toBe('W')
    }
  })

  it('consumes a set of the compound actually fitted, not the planned one', () => {
    const seed = seedFor('WET')
    const allocation = { S: 4, M: 4, H: 4, I: 3, W: 3 }
    const state = initRace(makeConfig({ weatherSeed: seed, tyreAllocationBase: allocation }))

    for (const car of state.cars) {
      expect(car.tyreAllocation.W).toBe(allocation.W - 1)
      expect(car.tyreAllocation.M).toBe(allocation.M)
    }
  })
})
