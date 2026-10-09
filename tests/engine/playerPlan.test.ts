import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { buildRaceConfig } from '@state/buildRaceConfig'
import type { RaceConfig, RaceState } from '@engine/types'

function runToEnd(config: RaceConfig): RaceState {
  let s = initRace(config)
  const rng = createRng(config.seed)
  while (!(s.lap >= s.totalLaps && s.sector === 0)) s = stepSector(config, s, rng)
  return s
}
const player = (s: RaceState) => s.cars.find(c => c.isPlayer)!

describe("the player's pre-race plan", () => {
  it('EXECUTES: the car pits at the planned lap onto the planned tyre', () => {
    const config = buildRaceConfig(4242, 'd_voss', 'bengaluru', 'rookie',
      { startCompound: 'M', plannedStops: [{ lap: 5, compound: 'H' }] }, null, undefined, true)
    const end = player(runToEnd(config))
    expect(end.pitsDone).toBeGreaterThanOrEqual(1)
    expect(end.compoundsUsed.slice(0, 2)).toEqual(['M', 'H'])
  })

  it('does nothing when no plan was chosen -- the engine oracles depend on it', () => {
    // No playerStrategyOverride: the player car carries its team's default
    // strategy, which the engine has never executed for the player.
    const end = player(runToEnd(buildRaceConfig(4242, 'd_voss')))
    expect(end.pitsDone).toBe(0)
  })
})
