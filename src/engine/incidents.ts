import type { CircuitSpec, NeutralisationKind, SafetyCarState, TuningConstants } from './types'
import type { Rng } from './rng'
import { gaussianPair } from './rng'

/**
 * Race incidents — the DECISIONS only.
 *
 * This module is deliberately stateless and mutates nothing. `race.ts` owns
 * applying every outcome to `CarState`/`RaceState`; see the spec's section 5.5,
 * which settles the split explicitly because both sides touch sector time.
 *
 * RNG-STREAM DISCIPLINE. Every roll here short-circuits on a zero rate so it
 * performs no rng() call at all, matching race.ts's existing
 * `perLap > 0 && rng() < perLap / 3`. The order of that `&&` is load-bearing
 * and `tests/engine/incidents.test.ts` asserts it directly with a counting rng.
 * Without it, every measured number in this repository moves.
 */

/**
 * Per-SECTOR chance that a driver makes a mistake.
 *
 * Mirrors the wet spin's shape at lapModel.ts:67-71: a per-lap rate divided by
 * three, relieved by a driver facet. Relief reduces how OFTEN a driver errs; it
 * deliberately does not touch `terminalFraction` -- a mistake, once made, is no
 * less likely to end the race for a consistent driver.
 */
export function driverErrorChancePerSector(consistency: number, tuning: TuningConstants, crashRisk = 1): number {
  const inc = tuning.incidents
  const relief = (consistency / 100) * inc.consistencyReliefMax
  return (inc.driverErrorPerLap / 3) * (1 - relief) * crashRisk
}

export function rollDriverError(consistency: number, tuning: TuningConstants, rng: Rng, crashRisk = 1): boolean {
  const chance = driverErrorChancePerSector(consistency, tuning, crashRisk)
  return chance > 0 && rng() < chance
}

export function rollErrorIsTerminal(tuning: TuningConstants, rng: Rng): boolean {
  const f = tuning.incidents.terminalFraction
  return f > 0 && rng() < f
}

/**
 * Seconds lost to a non-terminal mistake. Clamped at zero, so the realised mean
 * sits marginally above `errorTimeLossMean` -- the same clamp the wet spin uses
 * at lapModel.ts:80.
 *
 * NOTE: gaussianPair consumes TWO rng draws and this function discards the
 * second. That is intentional and consistent -- lapModel.ts already pairs its
 * noise sample with the spin magnitude. Do not "optimise" it into a single draw
 * without re-capturing every measured figure in MODEL_SPEC.md section 3.
 */
export function rollErrorTimeLoss(tuning: TuningConstants, rng: Rng): number {
  const inc = tuning.incidents
  const [g] = gaussianPair(rng)
  return Math.max(0, inc.errorTimeLossMean + g * inc.errorTimeLossSigma)
}

export function rollSafetyCarDeployment(
  cause: 'crash' | 'mechanical',
  tuning: TuningConstants,
  rng: Rng,
  risk = 1,
): boolean {
  const sc = tuning.incidents.safetyCar
  const chance = Math.min(1, (cause === 'crash' ? sc.crashDeployChance : sc.mechanicalDeployChance) * risk)
  return chance > 0 && rng() < chance
}

/** Inclusive of both bounds. */
export function rollSafetyCarDuration(tuning: TuningConstants, rng: Rng): number {
  const sc = tuning.incidents.safetyCar
  const span = sc.durationLapsMax - sc.durationLapsMin + 1
  return sc.durationLapsMin + Math.floor(rng() * span)
}

/**
 * Pull the field towards the leader. `raceTime := leader + (raceTime - leader) * c`.
 *
 * The leader is the MINIMUM of the input, not element 0: race.ts passes active
 * cars in whatever order they happen to sit in, and a compression that depended
 * on the caller sorting first would be a trap.
 *
 * Documented simplification (spec section 3): the engine has no un-lapping
 * concept, so this pulls a two-lap-down car unfairly close. It affects no gated
 * metric.
 */
export function compressRaceTimes(raceTimes: number[], compression: number): number[] {
  if (raceTimes.length === 0) return []
  const leader = Math.min(...raceTimes)
  return raceTimes.map(t => leader + (t - leader) * compression)
}

/**
 * The pit-lane loss that applies right now.
 *
 * SINGLE SOURCE OF TRUTH, and that is the point. `pitLaneTimeLoss` is read at
 * five call sites (race.ts, projection.ts, raceStore.ts x2, PitTimer.tsx). If
 * a neutralisation discount were applied at some of them and not others, the
 * projection overlay would promise the player a discount the race then failed
 * to give, on the game's centrepiece decision. Every call site must route
 * through here. A VSC discounts proportionally (the field keeps racing speed
 * relationships); a full SC uses its own absolute figure.
 */
export function effectivePitLaneLoss(
  circuit: CircuitSpec,
  safetyCar: SafetyCarState | null,
  tuning: TuningConstants,
): number {
  const kind = neutralisationKind(safetyCar)
  switch (kind) {
    case null: return circuit.pitLaneTimeLoss
    case 'sc': return tuning.incidents.safetyCar.laneTimeLossUnderSc
    case 'vsc': return circuit.pitLaneTimeLoss * tuning.incidents.vsc.laneLossFactor
    case 'red': return tuning.incidents.safetyCar.laneTimeLossUnderSc
    default: { const never: never = kind; return never }
  }
}

/** The neutralisation in force. A state from before the VSC has no `kind`: it was a safety car. */
export function neutralisationKind(safetyCar: SafetyCarState | null): NeutralisationKind | null {
  if (safetyCar === null) return null
  return safetyCar.kind ?? 'sc'
}

/**
 * VSC deployment roll. Same guard idiom as the SC roll: a zero chance performs
 * NO rng() call, which is what keeps the golden race byte-identical with the
 * VSC switched off.
 */
export function rollVscDeployment(
  cause: 'crash' | 'mechanical',
  tuning: TuningConstants,
  rng: Rng,
  risk = 1,
): boolean {
  const v = tuning.incidents.vsc
  const chance = Math.min(1, (cause === 'crash' ? v.crashDeployChance : v.mechanicalDeployChance) * risk)
  return chance > 0 && rng() < chance
}

/** Inclusive of both bounds. */
export function rollVscDuration(tuning: TuningConstants, rng: Rng): number {
  const v = tuning.incidents.vsc
  const span = v.durationLapsMax - v.durationLapsMin + 1
  return v.durationLapsMin + Math.floor(rng() * span)
}

/** Every car is scaled by the same factor, so this changes no gaps. No rng. */
export function neutralisationPaceMultiplier(safetyCar: SafetyCarState | null, tuning: TuningConstants): number {
  const kind = neutralisationKind(safetyCar)
  switch (kind) {
    case null: return 1
    case 'sc': return tuning.incidents.safetyCar.paceMultiplier
    case 'vsc': return tuning.incidents.vsc.paceMultiplier
    case 'red': return tuning.incidents.safetyCar.paceMultiplier
    default: { const never: never = kind; return never }
  }
}

/**
 * Red-flag roll (spec 2026-10-17 §4). Same guard idiom as every incident roll:
 * a zero chance performs NO rng() call. race.ts checks eligibility (a crash,
 * maxPerRace, minLapsLeft) BEFORE calling this, so an ineligible tick draws
 * nothing either.
 */
export function rollRedFlag(tuning: TuningConstants, rng: Rng): boolean {
  const c = tuning.incidents.redFlag.crashChance
  return c > 0 && rng() < c
}
