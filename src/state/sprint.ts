import { loadGameData } from '@data/validators'

/**
 * Sprint weekend rules (spec 2026-10-16 §3), from tuning.json.
 *
 * Cached, for the reason seedStride is cached in seasonStore: loadGameData()
 * re-parses every schema on every call and these are read per render and per
 * store action. The values are build-time constants.
 */
let cached: { rounds: number[]; distanceFraction: number; points: number[] } | null = null
function rules() {
  if (cached === null) cached = loadGameData().tuning.sprint
  return cached
}

/** raceIndex is 0-based; tuning.sprint.rounds is 1-based. */
export function isSprintRound(raceIndex: number): boolean {
  return rules().rounds.includes(raceIndex + 1)
}

export function sprintLaps(circuitLaps: number): number {
  return Math.max(1, Math.round(circuitLaps * rules().distanceFraction))
}

/** Points for a classified sprint finish; a retirement is scored 0 by the caller. */
export function sprintPointsFor(position: number): number {
  return rules().points[position - 1] ?? 0
}
