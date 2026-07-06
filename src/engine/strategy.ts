import type { RaceConfig, CarState, RaceState, Compound, WeatherState, PaceMode } from './types'
import { tyreCliffFraction } from './tyres'
import { createRng, type Rng } from './rng'

const CLIFF_EMERGENCY_THRESHOLD = 1.5

export type AIDecision = {
  pit: boolean
  compound: Compound
  paceMode: PaceMode
}

function weatherPit(car: CarState, weatherState: WeatherState, config: RaceConfig): AIDecision | null {
  const compSpec = config.compounds[car.compound]
  if (!compSpec) return null
  if (compSpec.type === 'dry' && weatherState === 'WET') return { pit: true, compound: 'W' as Compound, paceMode: 'neutral' }
  if (compSpec.type === 'dry' && weatherState === 'DAMP') return { pit: true, compound: 'I' as Compound, paceMode: 'neutral' }
  if (compSpec.type === 'wet' && weatherState === 'DRY') return { pit: true, compound: 'M' as Compound, paceMode: 'neutral' }
  return null
}

function bestDryCompound(config: RaceConfig, remainingLaps: number): Compound {
  if (remainingLaps > 20 && config.compounds['H']) return 'H'
  if (remainingLaps > 12 && config.compounds['M']) return 'M'
  return 'S'
}

export function aiDecision(
  config: RaceConfig,
  car: CarState,
  state: RaceState,
  rng: Rng,
): AIDecision {
  const brain = car.strategy.brain ?? 'naive'
  const weatherState = state.weatherState

  // Weather emergency — all brains react
  const wPit = weatherPit(car, weatherState, config)
  if (wPit) return wPit

  const spec = config.compounds[car.compound]
  const cliffFrac = spec ? tyreCliffFraction(spec, car.tyreAge) : 0
  const remainingLaps = state.totalLaps - state.lap
  // Use pitsDone as index so dynamic early pits don't cause a second planned stop later
  const nextStop = car.strategy.plannedStops[car.pitsDone]

  // NAIVE: planned stops only, neutral pace
  if (brain === 'naive') {
    if (cliffFrac >= CLIFF_EMERGENCY_THRESHOLD) {
      const fallback: Compound = car.compound === 'S' ? 'M' : 'H'
      return { pit: true, compound: nextStop?.compound ?? fallback, paceMode: 'neutral' }
    }
    if (nextStop && car.lap >= nextStop.lap) {
      return { pit: true, compound: nextStop.compound, paceMode: 'neutral' }
    }
    return { pit: false, compound: car.compound, paceMode: 'neutral' }
  }

  // SMART / OPTIMAL: dynamic cliff reaction + pace modes

  // Emergency cliff
  if (cliffFrac >= CLIFF_EMERGENCY_THRESHOLD) {
    const fallback: Compound = car.compound === 'S' ? 'M' : 'H'
    return { pit: true, compound: nextStop?.compound ?? bestDryCompound(config, remainingLaps), paceMode: 'push' }
  }

  // Pit when tyre is near the real cliff (not buffered by tyreManagement)
  // Use a fraction slightly past nominal to avoid pitting too early on managed tyres
  const pitThreshold = brain === 'optimal' ? 0.94 : 0.90
  if (cliffFrac >= pitThreshold && remainingLaps > 3) {
    const compound = nextStop?.compound ?? bestDryCompound(config, remainingLaps)
    return { pit: true, compound, paceMode: 'neutral' }
  }

  // OPTIMAL: cover an undercut — a car just behind has pitted onto fresh tyres
  if (brain === 'optimal' && config.tuning.strategyReaction?.coverUndercutEnabled) {
    const r = config.tuning.strategyReaction
    const sorted = [...state.cars].sort((a, b) => a.raceTime - b.raceTime)
    const myIdx = sorted.findIndex(c => c.driverId === car.driverId)
    const behind = sorted[myIdx + 1]
    if (behind && remainingLaps > r.minRemainingLaps && cliffFrac >= r.minCliffFracToCover) {
      const gapBehind = behind.raceTime - car.raceTime
      const behindJustPitted = behind.pitsDone > 0 && behind.tyreAge <= 1
      if (gapBehind <= r.coverWindowGap && behindJustPitted) {
        const prob = r.coverReactionProb[brain] ?? 0
        if (rng() < prob) {
          const compound = nextStop?.compound ?? bestDryCompound(config, remainingLaps)
          return { pit: true, compound, paceMode: 'push' } // push the out-lap to defend
        }
      }
    }
  }

  // OPTIMAL: undercut attempt — stuck in dirty air with older tyres than the car ahead
  if (brain === 'optimal') {
    const sortedCars = [...state.cars].sort((a, b) => a.raceTime - b.raceTime)
    const myIdx = sortedCars.findIndex(c => c.driverId === car.driverId)
    if (myIdx > 0) {
      const ahead = sortedCars[myIdx - 1]
      if (ahead) {
        const gap = car.raceTime - ahead.raceTime
        // Only undercut when genuinely stuck AND the car ahead is running similar-or-older tyres
        // and we're approaching (not past) the pit window
        if (gap < config.tuning.traffic.gapThreshold &&
            cliffFrac >= 0.60 && cliffFrac <= 0.85 &&
            ahead.tyreAge <= car.tyreAge + 2 && // car ahead not meaningfully fresher
            remainingLaps > 8) {
          const compound = nextStop?.compound ?? bestDryCompound(config, remainingLaps)
          return { pit: true, compound, paceMode: 'neutral' }
        }
      }
    }
  }

  // Planned stop
  if (nextStop && car.lap >= nextStop.lap) {
    const paceMode: PaceMode = cliffFrac < 0.20 ? 'push' : 'neutral'
    return { pit: true, compound: nextStop.compound, paceMode }
  }

  // Pace mode: push on fresh tyres, neutral otherwise.
  // Conserve is NOT used here — it hurts when pitting dynamically (slows the car
  // but doesn't defer the pit since we pit on cliff proximity, not lap count).
  const paceMode: PaceMode = cliffFrac < 0.18 ? 'push' : 'neutral'

  return { pit: false, compound: car.compound, paceMode }
}

// Backward-compatible wrapper. No rng of its own — reactive/probabilistic branches
// (e.g. cover-undercut) are deterministically rolled against a fixed local stream,
// since this wrapper isn't part of the live race loop's rng stream.
export function shouldAIPit(
  config: RaceConfig,
  car: CarState,
  state: RaceState,
  _weatherState: WeatherState = 'DRY',
): { pit: boolean; compound: Compound } {
  const d = aiDecision(config, car, state, createRng(1))
  return { pit: d.pit, compound: d.compound }
}
