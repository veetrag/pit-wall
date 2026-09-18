import { describe, it, expect } from 'vitest'
import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { fastForwardTo, startScenario, goalMet, describeSituation } from '@engine/scenario'
import { loadGameData } from '@data/validators'
import type { RaceConfig, RaceState } from '@engine/types'

const DATA = loadGameData()
const PLAYER = 'd_voss'

function makeConfig(seed: number, circuitId = 'bengaluru'): RaceConfig {
  return {
    circuit: DATA.circuits[circuitId]!,
    tuning: DATA.tuning,
    compounds: DATA.compounds,
    drivers: DATA.drivers.drivers,
    teams: DATA.cars.teams,
    strategies: DATA.strategies.defaults,
    playerDriverId: PLAYER,
    seed,
  }
}

function runWholeRace(config: RaceConfig): RaceState {
  let state = initRace(config)
  const rng = createRng(config.seed)
  for (let i = 0; i < config.circuit.laps * 3; i++) state = stepSector(config, state, rng)
  return state
}

describe('fastForwardTo', () => {
  it('at lap 0 is exactly the starting grid', () => {
    const config = makeConfig(4242)
    const { state } = fastForwardTo(config, 0)
    expect(JSON.stringify(state)).toBe(JSON.stringify(initRace(config)))
  })

  it('lands on the lap it was asked for', () => {
    const config = makeConfig(4242)
    for (const lap of [1, 10, 30]) {
      expect(fastForwardTo(config, lap).state.lap, `lap ${lap}`).toBe(lap)
    }
  })

  it('is deterministic — the same scenario is the same situation every time', () => {
    /*
     * The property every shipped scenario rests on. A scenario file stores a
     * seed and a lap; if those stopped reproducing the same race, an authored
     * "P8 with 12 to go" would quietly become some other situation in a later
     * build, and the goal attached to it would become unfair or trivial.
     */
    const a = fastForwardTo(makeConfig(4242), 25).state
    const b = fastForwardTo(makeConfig(4242), 25).state
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('a different seed is a different situation', () => {
    // Guards against fastForwardTo ignoring config.seed and always building the
    // same race, which would make every scenario identical.
    const a = fastForwardTo(makeConfig(4242), 25).state
    const b = fastForwardTo(makeConfig(9999), 25).state
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b))
  })

  it('IS A REAL SLICE OF A REAL RACE, not a divergent branch', () => {
    /*
     * THE LOAD-BEARING TEST.
     *
     * Fast-forward to lap 20 with the returned rng, then step to the flag with
     * that SAME rng. The result must be byte-identical to running the whole race
     * from the grid. If it is not, the handover forks the race onto a different
     * branch: the player would be dropped into a situation, and the rest of the
     * race would then unfold differently from the one the scenario was found in
     * — so the goal chosen during authoring could be impossible.
     *
     * This is also what would break if someone "tidied" fastForwardTo to return
     * only the state and let the caller make a fresh rng. Mutation-verified:
     * replacing the returned rng with createRng(config.seed) fails this.
     */
    const config = makeConfig(4242)
    const { state: handover, rng } = fastForwardTo(config, 20)

    let state = handover
    const remaining = (config.circuit.laps - 20) * 3
    for (let i = 0; i < remaining; i++) state = stepSector(config, state, rng)

    expect(JSON.stringify(state)).toBe(JSON.stringify(runWholeRace(config)))
  }, 60_000)

  it('clamps a negative or fractional lap instead of misbehaving', () => {
    const config = makeConfig(4242)
    expect(fastForwardTo(config, -5).state.lap).toBe(0)
    expect(fastForwardTo(config, 3.7).state.lap).toBe(3)
  })
})

describe('startScenario — the handover', () => {
  it('HANDS OVER A MANAGED CAR, not an abandoned one', () => {
    /*
     * THE BUG THIS FUNCTION EXISTS FOR, caught by actually looking at what the
     * scenario search produced rather than trusting it.
     *
     * race.ts:322 never makes strategy calls for the player's car. So a plain
     * fastForwardTo with the real playerDriverId leaves that car unmanaged for
     * the entire run-up. Measured here: zero pit stops and a 41-lap-old tyre,
     * versus a normally-raced car under startScenario. A scenario built on the
     * former hands the player a wreck no strategist could have produced.
     */
    const config = makeConfig(5)
    const naive = fastForwardTo(config, 41).state.cars.find(c => c.driverId === PLAYER)!
    const handed = startScenario(config, 41).state.cars.find(c => c.driverId === PLAYER)!

    expect(naive.pitsDone, 'the engine will not pit for the player').toBe(0)
    expect(handed.pitsDone, 'autopilot must have raced the car properly').toBeGreaterThan(0)
    expect(handed.tyreAge, 'and it must not be on a 41-lap-old set').toBeLessThan(naive.tyreAge)
  }, 60_000)

  it('gives the player their car and nobody else theirs', () => {
    const { state } = startScenario(makeConfig(4242), 20)
    const players = state.cars.filter(c => c.isPlayer)
    expect(players).toHaveLength(1)
    expect(players[0]!.driverId).toBe(PLAYER)
  }, 60_000)

  it('is deterministic', () => {
    const a = startScenario(makeConfig(4242), 20).state
    const b = startScenario(makeConfig(4242), 20).state
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  }, 60_000)

  it('the returned rng continues the race rather than restarting it', () => {
    // Stepping on from the handover must keep working and stay deterministic;
    // the player's own car now takes its orders from the player, not the AI.
    const config = makeConfig(4242)
    const runOn = () => {
      const { state, rng } = startScenario(config, 20)
      let s = state
      for (let i = 0; i < 5 * 3; i++) s = stepSector(config, s, rng)
      return s
    }
    expect(runOn().lap).toBe(25)
    expect(JSON.stringify(runOn())).toBe(JSON.stringify(runOn()))
  }, 60_000)
})

describe('goalMet', () => {
  const base = fastForwardTo(makeConfig(4242), 5).state

  function withPlayer(over: Partial<{ position: number; retired: boolean }>): RaceState {
    return {
      ...base,
      cars: base.cars.map(c => c.driverId === PLAYER ? { ...c, ...over } : c),
    }
  }

  it('passes on or inside the target position', () => {
    expect(goalMet(withPlayer({ position: 3, retired: false }), PLAYER, { position: 3 })).toBe(true)
    expect(goalMet(withPlayer({ position: 1, retired: false }), PLAYER, { position: 3 })).toBe(true)
  })

  it('fails outside it', () => {
    expect(goalMet(withPlayer({ position: 4, retired: false }), PLAYER, { position: 3 })).toBe(false)
  })

  it('FAILS A RETIREMENT even when the classified position would pass', () => {
    /*
     * The engine still assigns retired cars a position — they sort after every
     * classified runner. So a bare `position <= goal` check would award "finish
     * P15 or better" to a player who crashed out and was classified P15.
     */
    expect(goalMet(withPlayer({ position: 2, retired: true }), PLAYER, { position: 3 })).toBe(false)
  })

  it('fails when the driver is not in the race at all', () => {
    expect(goalMet(base, 'd_nobody', { position: 3 })).toBe(false)
  })
})

describe('describeSituation', () => {
  it('reports the handover situation from state, not from a stored blurb', () => {
    const config = makeConfig(4242)
    const { state } = fastForwardTo(config, 30)
    const sit = describeSituation(state, PLAYER)!
    expect(sit.position).toBeGreaterThanOrEqual(1)
    expect(sit.position).toBeLessThanOrEqual(20)
    expect(sit.lapsRemaining, 'bengaluru is 56 laps').toBe(config.circuit.laps - 30)
    expect(['S', 'M', 'H', 'I', 'W']).toContain(sit.compound)
    expect(sit.tyreAge).toBeGreaterThanOrEqual(0)
  })

  it('has no gap ahead when leading', () => {
    const { state } = fastForwardTo(makeConfig(4242), 10)
    const leader = state.cars.find(c => c.position === 1)!
    expect(describeSituation(state, leader.driverId)!.gapAhead).toBeNull()
  })

  it('reports a positive gap to the car ahead', () => {
    const { state } = fastForwardTo(makeConfig(4242), 10)
    const second = state.cars.find(c => c.position === 2)!
    const gap = describeSituation(state, second.driverId)!.gapAhead
    expect(gap).not.toBeNull()
    expect(gap!, 'the car ahead is ahead on race time').toBeGreaterThan(0)
  })

  it('returns null for a driver who is not racing', () => {
    const { state } = fastForwardTo(makeConfig(4242), 10)
    expect(describeSituation(state, 'd_nobody')).toBeNull()
  })
})
