import type { CarState, Compound, RaceConfig, RaceState } from './types'
import { effectiveTyreAge } from './tyres'
import { PIT_CLIFF_THRESHOLD } from './strategy'

/**
 * What the pit wall can see about a rival (spec 2026-10-16 §2): observed facts
 * (compound, tyre age, stops) plus a fuzzy box window. Pure and rng-free, so
 * it cannot perturb a race, and stable within a lap: every input it reads
 * (lap, tyre age, pace mode, dirty-air laps, weather, stops) only changes at a
 * lap boundary, so the card never jitters between sectors.
 */
interface IntelBase { driverId: string; compound: Compound; tyreAge: number; stops: number }

export type RivalIntel =
  | (IntelBase & { status: 'window'; from: number; to: number })
  | (IntelBase & { status: 'flag' })
  | (IntelBase & { status: 'out' })

/**
 * A small, stable offset in [-max, +max] laps from an FNV-1a hash of the car id.
 * Keeps the window honest-but-imprecise without jittering between laps, and
 * without touching the race rng.
 */
export function intelOffset(driverId: string, maxOffsetLaps: number): number {
  let h = 2166136261
  for (let i = 0; i < driverId.length; i++) {
    h ^= driverId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const span = 2 * maxOffsetLaps + 1
  return ((h >>> 0) % span) - maxOffsetLaps
}

/**
 * The lap this car's tyres reach `threshold` x cliff at its current wear rate,
 * or null when the compound has no cliff to project.
 */
function projectedCliffLap(config: RaceConfig, state: RaceState, car: CarState, threshold: number): number | null {
  const spec = config.compounds[car.compound]
  const driver = config.drivers.find(d => d.id === car.driverId)
  if (!spec || !driver || spec.cliff <= 0) return null
  // effectiveTyreAge is linear in tyreAge, so its value at age 1 is the
  // per-lap wear rate at the car's current pace mode and conditions.
  const effNow = effectiveTyreAge(car, driver, state.weatherState, config)
  const perLap = effectiveTyreAge({ ...car, tyreAge: 1 }, driver, state.weatherState, config)
  if (perLap <= 0) return null
  const lapsToThreshold = (threshold * spec.cliff - effNow) / perLap
  return car.lap + Math.max(0, Math.ceil(lapsToThreshold))
}

export function rivalIntel(config: RaceConfig, state: RaceState, driverId: string): RivalIntel | null {
  const car = state.cars.find(c => c.driverId === driverId)
  if (!car) return null
  const base: IntelBase = { driverId, compound: car.compound, tyreAge: car.tyreAge, stops: car.pitsDone }
  if (car.retired) return { ...base, status: 'out' }

  const brain = car.strategy.brain ?? 'naive'
  const cfg = config.tuning.rivalIntel
  const cliffLap = projectedCliffLap(config, state, car, PIT_CLIFF_THRESHOLD[brain])
  // Indexed by pitsDone, exactly as strategy.ts reads the plan.
  const nextStop = car.strategy.plannedStops[car.pitsDone]
  let centre: number
  if (nextStop) {
    centre = cliffLap === null ? nextStop.lap : Math.min(nextStop.lap, cliffLap)
  } else {
    // No planned stop left is not a promise to run to the flag: aiDecision
    // still boxes on wear alone. Smart and optimal brains box at their
    // threshold only with more than 3 laps to go; naive brains box at the
    // emergency threshold (their PIT_CLIFF_THRESHOLD) with no such guard.
    const lastBoxLap = brain === 'naive' ? state.totalLaps : state.totalLaps - 3
    if (cliffLap === null || cliffLap >= lastBoxLap) return { ...base, status: 'flag' }
    centre = cliffLap
  }
  centre += intelOffset(driverId, cfg.maxOffsetLaps)

  const halfWidth = cfg.halfWidth[brain]
  const nowLap = state.lap + 1
  const last = state.totalLaps
  const from = Math.min(last, Math.max(nowLap, centre - halfWidth))
  const to = Math.min(last, Math.max(from, centre + halfWidth))
  return { ...base, status: 'window', from, to }
}
