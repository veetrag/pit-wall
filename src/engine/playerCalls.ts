import type { RaceConfig, RaceState, Compound, PaceMode } from './types'
import type { Rng } from './rng'
import { resolveAllocatedCompound, consumeTyreSet } from './tyres'
import { pitStopTime } from './pitStop'

/**
 * A call the player made during a race. `step` is the number of stepSector
 * calls completed before it; calls land between steps, so this pins each one
 * exactly and makes a race reproducible from (config, seed, calls).
 */
export type PlayerCall =
  | { step: number; kind: 'pit'; compound: Compound }
  | { step: number; kind: 'pace'; mode: PaceMode }

/** The PIT button. Null when no tyres of any type remain; draws nothing then. */
export function applyPlayerPit(
  config: RaceConfig, state: RaceState, compound: Compound, rng: Rng,
): RaceState | null {
  const player = state.cars.find(c => c.isPlayer)
  if (!player) return null
  const resolved = resolveAllocatedCompound(compound, player.tyreAllocation)
  if (!resolved) return null
  const stopTime = pitStopTime(config, player.teamId, state.safetyCar, rng)
  return {
    ...state,
    cars: state.cars.map(car => car.isPlayer
      ? {
          ...car,
          raceTime: car.raceTime + stopTime,
          compound: resolved,
          tyreAge: 0,
          pitsDone: car.pitsDone + 1,
          tyreAllocation: consumeTyreSet(car.tyreAllocation, resolved),
          compoundsUsed: [...car.compoundsUsed, resolved],
        }
      : car),
  }
}

export function applyPlayerPace(state: RaceState, mode: PaceMode): RaceState {
  return { ...state, cars: state.cars.map(c => c.isPlayer ? { ...c, paceMode: mode } : c) }
}

export function applyCall(config: RaceConfig, state: RaceState, call: PlayerCall, rng: Rng): RaceState {
  switch (call.kind) {
    case 'pit': return applyPlayerPit(config, state, call.compound, rng) ?? state
    case 'pace': return applyPlayerPace(state, call.mode)
    default: { const never: never = call; return never }
  }
}
