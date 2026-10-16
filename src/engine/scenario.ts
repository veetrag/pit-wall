import type { RaceConfig, RaceState } from './types'
import type { Rng } from './rng'
import { createRng } from './rng'
import { initRace, stepSector } from './race'
import { neutralisationKind } from './incidents'

/**
 * Scenarios — "you are P8 with 12 laps left and a safety car is coming."
 *
 * THE DESIGN POINT: a scenario is not an authored RaceState. It is a SEED plus
 * a LAP COUNT, and the situation is produced by running the real engine to that
 * lap and handing the wheel over.
 *
 * Hand-authoring a mid-race state would mean writing 20 cars of raceTime,
 * tyreAge, compound, allocation, pit counts and dirty-air history by hand, and
 * every one of those files would be a chance to describe a race that the
 * simulation could never actually produce — a car on lap 40 with a fresh soft
 * and no pit stop, gaps that imply impossible pace. Fast-forwarding instead
 * makes an illegal scenario unrepresentable: the state came out of `stepSector`,
 * so it is by definition a state the engine can reach.
 *
 * The cost is that scenarios are DISCOVERED rather than written — you search
 * seeds for a situation you want instead of typing it. That is what
 * scripts/find-scenarios.ts is for. It is a good trade: the search is cheap
 * (the engine runs a full race in milliseconds) and the result is exact.
 *
 * This only works because of the determinism guarantee in MODEL_SPEC.md §10.1.
 * If the same seed ever stopped reproducing the same race, every shipped
 * scenario would silently become a different situation than the one authored.
 * tests/engine/byteIdentity.test.ts is what protects that.
 */

export interface ScenarioGoal {
  /** Finish this position or better. */
  position: number
}

export interface ScenarioSpec {
  id: string
  name: string
  blurb: string
  circuitId: string
  /** The race seed. Together with startLap this IS the situation. */
  seed: number
  playerDriverId: string
  /** How many laps the AI plays before the player takes over. 0 = from the grid. */
  startLap: number
  goal: ScenarioGoal
}

/**
 * Runs the race to `startLap` and returns the state plus the LIVE rng.
 *
 * Returning the rng is not a convenience — it is the whole contract. The caller
 * must keep stepping with this exact instance, because the draw sequence is
 * continuous across the handover. Creating a fresh rng to continue would fork
 * the race onto a different branch and the scenario would stop being the
 * situation it was authored as.
 */
export function fastForwardTo(config: RaceConfig, startLap: number): { state: RaceState; rng: Rng } {
  const rng = createRng(config.seed)
  let state = initRace(config)
  const sectors = Math.max(0, Math.floor(startLap)) * 3
  for (let i = 0; i < sectors; i++) state = stepSector(config, state, rng)
  return { state, rng }
}

/**
 * A driver id that matches no driver, so every car is AI-managed.
 *
 * race.ts:322 gates the AI strategy decision on `if (!updated.isPlayer)` — the
 * player's car is deliberately never driven for them. That is right during a
 * race and wrong during a fast-forward, where nobody is driving at all.
 */
const AUTOPILOT = '__none__'

/**
 * Builds the handover state for a scenario: the AI races every car up to
 * `startLap`, then the player inherits theirs.
 *
 * WHY NOT JUST fastForwardTo. Fast-forwarding with the real `playerDriverId`
 * leaves the player's car unmanaged for the whole run-up, because the engine
 * refuses to make strategy calls for the player. Measured at bengaluru, seed 5,
 * lap 41: the player's car had made ZERO pit stops and was on a 41-lap-old
 * medium in P8. Under autopilot the same car is P4 on a 10-lap tyre.
 *
 * That is not a harder scenario, it is a broken one — it hands the player a
 * situation no strategist could have produced, and any goal attached to it
 * would be calibrated against a car that had been abandoned for 40 laps.
 *
 * The rng is returned live, as in fastForwardTo: the caller must keep stepping
 * with it, using the REAL config, from the handover onward.
 */
export function startScenario(config: RaceConfig, startLap: number): { state: RaceState; rng: Rng } {
  const { state, rng } = fastForwardTo({ ...config, playerDriverId: AUTOPILOT }, startLap)
  return {
    state: {
      ...state,
      // Ownership transfers here and only here: AI up to this lap, player after.
      cars: state.cars.map(c => ({ ...c, isPlayer: c.driverId === config.playerDriverId })),
    },
    rng,
  }
}

/**
 * Whether the player met the scenario's objective.
 *
 * A retirement always fails, whatever position the classification gives. The
 * engine sorts retired cars after every classified runner but still assigns
 * them a position, so `position <= goal` alone would pass a player who crashed
 * out of a 20-car race into "P15" on a goal of "finish P15 or better".
 */
export function goalMet(state: RaceState, playerDriverId: string, goal: ScenarioGoal): boolean {
  const car = state.cars.find(c => c.driverId === playerDriverId)
  if (!car || car.retired) return false
  return car.position <= goal.position
}

export interface ScenarioSituation {
  position: number
  lapsRemaining: number
  /** Seconds to the car ahead, or null when leading. */
  gapAhead: number | null
  compound: string
  tyreAge: number
  safetyCarOut: boolean
}

/**
 * The handover situation, for the scenario picker and the briefing screen.
 * Derived from state rather than stored in the spec, so a blurb can never drift
 * out of step with the race it describes.
 */
export function describeSituation(state: RaceState, playerDriverId: string): ScenarioSituation | null {
  const car = state.cars.find(c => c.driverId === playerDriverId)
  if (!car) return null
  const ahead = state.cars
    .filter(c => !c.retired && c.position === car.position - 1)
    .map(c => car.raceTime - c.raceTime)[0] ?? null
  return {
    position: car.position,
    lapsRemaining: state.totalLaps - state.lap,
    gapAhead: ahead,
    compound: car.compound,
    tyreAge: car.tyreAge,
    safetyCarOut: neutralisationKind(state.safetyCar) === 'sc',
  }
}
