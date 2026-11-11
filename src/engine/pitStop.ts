import type { RaceConfig, RaceState, CarState, Compound, IncidentEvent, SectorIndex } from './types'
import { gaussianPair, type Rng } from './rng'
import { effectivePitLaneLoss } from './incidents'
import { consumeTyreSet } from './tyres'
import { unsafeReleaseChance } from './penalties'

/**
 * What one stop cost. `slow` is the part of `total` that was a slow stop (0 if
 * it was not); `stationary` = total - lane loss; `releaseDraw` is the raw g2.
 */
export interface PitStopCost { total: number; slow: number; stationary: number; releaseDraw: number }

/**
 * Standard normal CDF, Abramowitz & Stegun 7.1.26 (|error| < 1.5e-7). Plain
 * arithmetic, so it is as deterministic as the rest of the engine.
 */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2)
  const poly = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
  const erf = 1 - poly * Math.exp(-(x * x) / 2)
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf)
}

/** Lane loss plus the team's effective mean stationary time. No rng: the expected stop. */
export function expectedPitStopTime(config: RaceConfig, teamId: string, safetyCar: RaceState['safetyCar']): number {
  const team = config.teams.find(t => t.id === teamId)!
  const crewFactor = team.facets.pitCrew / 100
  // Under yellow the lane loss is the neutralisation's, not the circuit value.
  return effectivePitLaneLoss(config.circuit, safetyCar, config.tuning) +
    (config.tuning.pit.stopMean - crewFactor * config.tuning.pit.pitCrewMeanRelief)
}

/**
 * The slow-stop seconds for a standard normal sample `g` (spec 2026-10-17 §1).
 * Slow when Φ(g) > 1 - p, i.e. g > Φ⁻¹(1 - p); the depth into that tail sets
 * where in [slowStopMin, slowStopMax] it lands. p = 0 returns 0 without even
 * evaluating Φ.
 */
export function slowStopComponent(config: RaceConfig, teamId: string, g: number): number {
  const pit = config.tuning.pit
  if (pit.slowStopChance <= 0) return 0
  const crew = config.teams.find(t => t.id === teamId)!.facets.pitCrew / 100
  const p = pit.slowStopChance * (1 - crew * pit.pitCrewSlowRelief)
  if (p <= 0) return 0
  const u = normalCdf(g)
  if (!(u > 1 - p)) return 0 // also 0 for a NaN draw
  const frac = Math.min(1, (u - (1 - p)) / p)
  return pit.slowStopMin + (pit.slowStopMax - pit.slowStopMin) * frac
}

/**
 * The time one pit stop costs, for ANY stop: an AI decision, the player's
 * plan, or the player's PIT button. One model, so a player's pit crew counts
 * however the stop is called. Draws exactly one gaussianPair from `rng`: the
 * first value is the stationary-time noise, the second decides a slow stop --
 * no extra draw, so the stream is the same with slow stops on or off.
 * `allowSlow: false` prices the expected stop (the projection).
 */
export function pitStopTime(
  config: RaceConfig, teamId: string, safetyCar: RaceState['safetyCar'], rng: Rng,
  opts: { allowSlow?: boolean } = {},
): PitStopCost {
  const [stopNoise, g2] = gaussianPair(rng)
  const team = config.teams.find(t => t.id === teamId)!
  const crewFactor = team.facets.pitCrew / 100
  const effectiveStopSigma = config.tuning.pit.stopSigma * (1 - crewFactor * config.tuning.pit.pitCrewSigmaRelief)
  // Same association as the pre-1.6 expression ((lane + mean) + noise x sigma),
  // so a zero slow chance is byte-identical to it.
  const base = expectedPitStopTime(config, teamId, safetyCar) + stopNoise * effectiveStopSigma
  const slow = opts.allowSlow === false ? 0 : slowStopComponent(config, teamId, g2)
  const total = base + slow
  return { total, slow, stationary: total - effectivePitLaneLoss(config.circuit, safetyCar, config.tuning), releaseDraw: g2 }
}

export interface StopContext {
  safetyCar: RaceState['safetyCar']
  /** For the incident log: the PRE-tick lap and the sector being completed. */
  lap: number
  sector: SectorIndex
  /** The team box occupancy (spec §7). Absent = double-stacking off. */
  boxFree?: Record<string, number>
}

export interface StopOutcome {
  car: CarState
  cost: PitStopCost
  /** Seconds queued behind the team-mate (spec §7). 0 when double-stacking is off or the box is free. */
  queue: number
  /** Pending penalty seconds served (stationary) at this stop (spec §8.2). */
  served: number
  /** An unsafe release was called at this stop: a new pending penalty (spec §8.2). */
  unsafe: boolean
  boxFree?: Record<string, number>
  events: IncidentEvent[]
}

/**
 * The stopped car (spec 2026-10-24 §0.4, ruling A4). Spreads the car and only
 * overwrites keys it already has, so JSON key order never changes. 2.0 resets
 * (served penalty) are added by later tasks HERE and nowhere else.
 */
export function fitTyres(_config: RaceConfig, car: CarState, compound: Compound, addSeconds: number): CarState {
  return {
    ...car,
    raceTime: car.raceTime + addSeconds,
    compound,
    tyreAge: 0,
    pitsDone: car.pitsDone + 1,
    tyreAllocation: consumeTyreSet(car.tyreAllocation, compound),
    compoundsUsed: [...car.compoundsUsed, compound],
  }
}

/**
 * Every real stop: AI, plan, PIT button and the projection. Draws exactly one
 * gaussianPair (via pitStopTime) and nothing else. `compound` must already be
 * resolved against the allocation by the caller.
 */
export function executeStop(
  config: RaceConfig, ctx: StopContext, car: CarState, compound: Compound, rng: Rng,
  opts: { allowSlow?: boolean } = {},
): StopOutcome {
  const cost = pitStopTime(config, car.teamId, ctx.safetyCar, rng, opts)
  const queue = boxQueueEstimate(config, ctx.boxFree, car, ctx.safetyCar)
  const pen = config.tuning.penalties
  const served = pen.enabled ? car.penalty?.pendingSec ?? 0 : 0
  // Exactly cost.total when nothing is added: no `+ 0` on the golden path.
  const add = queue === 0 && served === 0 ? cost.total : cost.total + queue + served
  const events: IncidentEvent[] = []
  // Every slow stop is logged, whoever made it (spec 1.6 §1, ruling R4).
  if (cost.slow > 0) events.push({ lap: ctx.lap, sector: ctx.sector, kind: 'slow_stop', driverId: car.driverId, timeLoss: cost.slow })
  if (queue > 0) events.push({ lap: ctx.lap, sector: ctx.sector, kind: 'double_stack', driverId: car.driverId, timeLoss: queue })
  if (served > 0) events.push({ lap: ctx.lap, sector: ctx.sector, kind: 'penalty_served', driverId: car.driverId, timeLoss: served })
  // Unsafe release reads the LOWER tail of g2; a slow stop the upper, so the
  // two never coincide and no draw is added. Never rolled in the projection.
  const unsafe = pen.enabled && opts.allowSlow !== false &&
    normalCdf(cost.releaseDraw) < unsafeReleaseChance(config, car.teamId, queue > 0)
  if (unsafe) {
    events.push({ lap: ctx.lap, sector: ctx.sector, kind: 'unsafe_release', driverId: car.driverId, timeLoss: null })
    events.push({ lap: ctx.lap, sector: ctx.sector, kind: 'penalty_issued', driverId: car.driverId, timeLoss: pen.timePenaltySec })
  }
  const boxFree = claimBox(config, ctx, car, queue, cost)
  const fitted = fitTyres(config, car, compound, add)
  const stopped = pen.enabled && car.penalty
    ? { ...fitted, penalty: { ...car.penalty, pendingSec: unsafe ? pen.timePenaltySec : 0, servedSec: car.penalty.servedSec + served } }
    : fitted
  return { car: stopped, cost, queue, served, unsafe, boxFree, events }
}

/** Seconds a stop now would queue behind the team-mate (spec §7.2). 0 when off or the box is free. */
export function boxQueueEstimate(
  config: RaceConfig, boxFree: Record<string, number> | undefined, car: CarState, safetyCar: RaceState['safetyCar'],
): number {
  if (!config.tuning.doubleStack.enabled || !boxFree) return 0
  const free = boxFree[car.teamId]
  if (free === undefined) return 0
  const laneIn = effectivePitLaneLoss(config.circuit, safetyCar, config.tuning) * config.tuning.doubleStack.entryShare
  return Math.max(0, free - (car.raceTime + laneIn))
}

/**
 * The box after this stop (spec §7): busy from arrival (car.raceTime, the car
 * BEFORE the stop) + lane entry + queue + stationary + release gap. Undefined
 * when double-stacking is off, so the state never gains `boxFree`.
 */
function claimBox(config: RaceConfig, ctx: StopContext, car: CarState, queue: number, cost: PitStopCost): Record<string, number> | undefined {
  const ds = config.tuning.doubleStack
  if (!ds.enabled) return undefined
  const lane = effectivePitLaneLoss(config.circuit, ctx.safetyCar, config.tuning)
  return { ...(ctx.boxFree ?? {}), [car.teamId]: car.raceTime + lane * ds.entryShare + queue + cost.stationary + ds.releaseGap }
}

/** The team keeps an AI car out a lap rather than queue too long (spec §7.2, ruling S2). Pure, no draw. */
export function deferForBusyBox(
  config: RaceConfig, car: CarState, queue: number, neutralised: boolean, weatherStop: boolean, cliffFrac: number,
): boolean {
  const d = config.tuning.doubleStack
  if (!d.enabled || queue <= 0 || weatherStop || cliffFrac >= d.emergencyCliffFrac) return false
  const brain = car.strategy.brain ?? 'naive'
  return queue > (neutralised ? d.maxQueueNeutralised : d.maxQueue)[brain]
}
