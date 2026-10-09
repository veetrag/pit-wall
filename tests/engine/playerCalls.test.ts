import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/race'
import { createRng } from '@engine/rng'
import { applyPlayerPit, applyPlayerPace } from '@engine/playerCalls'
import { buildRaceConfig } from '@state/buildRaceConfig'

const config = buildRaceConfig(777, 'd_voss', 'bengaluru', 'rookie',
  { startCompound: 'M', plannedStops: [] }, null, undefined, true)
function at(steps: number) {
  let s = initRace(config); const rng = createRng(config.seed)
  for (let i = 0; i < steps; i++) s = stepSector(config, s, rng)
  return { s, rng }
}

describe('applyPlayerPit', () => {
  it('fits the tyre, resets age, counts the stop, consumes a set, adds time', () => {
    const { s, rng } = at(30)
    const before = s.cars.find(c => c.isPlayer)!
    const next = applyPlayerPit(config, s, 'H', rng)!
    const p = next.cars.find(c => c.isPlayer)!
    expect(p.compound).toBe('H')
    expect(p.tyreAge).toBe(0)
    expect(p.pitsDone).toBe(before.pitsDone + 1)
    expect(p.tyreAllocation.H).toBe(before.tyreAllocation.H - 1)
    expect(p.compoundsUsed[p.compoundsUsed.length - 1]).toBe('H')
    expect(p.raceTime).toBeGreaterThan(before.raceTime)
    // Only the player changes.
    expect(next.cars.filter(c => !c.isPlayer)).toEqual(s.cars.filter(c => !c.isPlayer))
  })

  it('returns null and draws nothing when no tyres remain', () => {
    const { s } = at(30)
    const empty = { ...s, cars: s.cars.map(c => c.isPlayer
      ? { ...c, tyreAllocation: { S: 0, M: 0, H: 0, I: 0, W: 0 } } : c) }
    let draws = 0
    const counting = () => { draws++; return 0.5 }
    expect(applyPlayerPit(config, empty, 'H', counting)).toBeNull()
    expect(draws).toBe(0)
  })

  it('does not mutate its input', () => {
    const { s, rng } = at(30)
    const frozen = JSON.stringify(s)
    applyPlayerPit(config, s, 'S', rng)
    expect(JSON.stringify(s)).toBe(frozen)
  })
})

describe('applyPlayerPace', () => {
  it("changes only the player's pace mode", () => {
    const { s } = at(10)
    const next = applyPlayerPace(s, 'push')
    expect(next.cars.find(c => c.isPlayer)!.paceMode).toBe('push')
    expect(next.cars.filter(c => !c.isPlayer)).toEqual(s.cars.filter(c => !c.isPlayer))
  })
})
