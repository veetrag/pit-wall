import type { RaceConfig, RaceState, Compound, PaceMode } from './types'
import type { Rng } from './rng'
import { resolveAllocatedCompound, consumeTyreSet } from './tyres'
import { pitStopTime } from './pitStop'
import { neutralisationKind } from './incidents'
import { redFlagPending } from './redFlag'

/**
 * A call the player made during a race. `step` is the number of stepSector
 * calls completed before it; calls land between steps, so this pins each one
 * exactly and makes a race reproducible from (config, seed, calls).
 */
export type PlayerCall =
  | { step: number; kind: 'pit'; compound: Compound }
  | { step: number; kind: 'pace'; mode: PaceMode }
  | { step: number; kind: 'restart_tyre'; compound: Compound }

/** The log stores the REQUESTED compound; replay re-resolves it identically via resolveAllocatedCompound. */
/** The PIT button. Null when no tyres of any type remain; draws nothing then. */
export function applyPlayerPit(
  config: RaceConfig, state: RaceState, compound: Compound, rng: Rng,
): RaceState | null {
  // No stop under a red flag: the tyre change is free at the restart, and a
  // stop here would pay the lane price for nothing. No draw, so replay agrees.
  if (neutralisationKind(state.safetyCar) === 'red') return null
  const player = state.cars.find(c => c.isPlayer)
  if (!player) return null
  const resolved = resolveAllocatedCompound(compound, player.tyreAllocation)
  if (!resolved) return null
  const stop = pitStopTime(config, player.teamId, state.safetyCar, rng)
  const next: RaceState = {
    ...state,
    cars: state.cars.map(car => car.isPlayer
      ? {
          ...car,
          raceTime: car.raceTime + stop.total,
          compound: resolved,
          tyreAge: 0,
          pitsDone: car.pitsDone + 1,
          tyreAllocation: consumeTyreSet(car.tyreAllocation, resolved),
          compoundsUsed: [...car.compoundsUsed, resolved],
        }
      : car),
  }
  // Logged at the moment of the call. The incidents array is only replaced
  // when there is something to log, so a fast stop leaves the log untouched.
  if (stop.slow <= 0) return next
  return {
    ...next,
    incidents: [...state.incidents, { lap: state.lap, sector: state.sector, kind: 'slow_stop', driverId: player.driverId, timeLoss: stop.slow }],
  }
}

export function applyPlayerPace(state: RaceState, mode: PaceMode): RaceState {
  return { ...state, cars: state.cars.map(c => c.isPlayer ? { ...c, paceMode: mode } : c) }
}

/**
 * The player's tyre for a red-flag restart (spec 1.6 §4). Recorded on the
 * state only when the restart is the next step; anywhere else -- a stale log,
 * a debrief future where the red flag fell elsewhere -- it is a no-op that
 * returns the SAME state, and the AI rule fits the tyre.
 */
export function applyRestartTyre(state: RaceState, compound: Compound): RaceState {
  return redFlagPending(state) ? { ...state, redFlagTyre: compound } : state
}

export function applyCall(config: RaceConfig, state: RaceState, call: PlayerCall, rng: Rng): RaceState {
  switch (call.kind) {
    case 'pit': return applyPlayerPit(config, state, call.compound, rng) ?? state
    case 'pace': return applyPlayerPace(state, call.mode)
    case 'restart_tyre': return applyRestartTyre(state, call.compound)
    default: { const never: never = call; return never }
  }
}
