import type { RaceConfig, CarState, RaceState, Compound, WeatherState, PaceMode, StrategyBrain } from './types'
import { tyreCliffFraction, effectiveTyreAge, resolveAllocatedCompound } from './tyres'
import { createRng, type Rng } from './rng'

const CLIFF_EMERGENCY_THRESHOLD = 1.5

/**
 * The cliff fraction at which each brain boxes on wear alone. Exported so rival
 * intel projects a rival's stop from the SAME thresholds the AI acts on --
 * a second copy would let the card promise a window the car then ignores.
 * Naive brains only stop on wear at the emergency threshold.
 */
export const PIT_CLIFF_THRESHOLD: Record<StrategyBrain, number> = {
  naive: CLIFF_EMERGENCY_THRESHOLD, smart: 0.90, optimal: 0.94,
}

export type AIDecision = {
  pit: boolean
  compound: Compound
  paceMode: PaceMode
}

// Every pit:true exit point routes through here so no AI decision can ever
// request a compound with zero sets left — reroutes to the nearest available
// compound in the same family, or forces pit:false if literally nothing
// remains (spec: "keep current tyres").
function pitWith(car: CarState, compound: Compound, paceMode: PaceMode): AIDecision {
  const resolved = resolveAllocatedCompound(compound, car.tyreAllocation)
  if (!resolved) return { pit: false, compound: car.compound, paceMode: 'neutral' }
  return { pit: true, compound: resolved, paceMode }
}

/**
 * How many consecutive COMPLETED laps, ending with the one just completed,
 * satisfy `pred`. At a lap boundary `state.weatherState` is still the lap just
 * completed (stepSector advances it after the AI decides), so it counts first
 * and the walk continues through timeline[lap-2], [lap-3], ... It never reads
 * index >= state.lap: the AI does not see the future (spec 1.6 §0.1, ruling R2).
 */
export function weatherRun(state: RaceState, pred: (w: WeatherState) => boolean): number {
  if (!pred(state.weatherState)) return 0
  let n = 1
  for (let i = state.lap - 2; i >= 0; i--) {
    const w = state.weatherTimeline[i]
    if (w === undefined || !pred(w)) break
    n++
  }
  return n
}

/**
 * The tyre family a wet track calls for: WET gives W, DAMP gives I, DRY none.
 * Shared by weatherPit and the neutralisation reaction so the two can never
 * disagree (item 16b: an AI on inters must not box onto slicks under a VSC in
 * the damp, only for weatherPit to send it straight back).
 */
export function weatherFamily(w: WeatherState): Compound | null {
  switch (w) {
    case 'WET': return 'W'
    case 'DAMP': return 'I'
    case 'DRY': return null
    default: { const never: never = w; return never }
  }
}

/**
 * Tyre-family changes for the weather, all brains. Before 1.6 this boxed every
 * AI car the lap the track turned DAMP and again the lap it turned DRY, ~100
 * stops a race on a showery circuit. Now a change must hold for
 * ai.weatherConfirmLaps completed laps (a WET track boxes slick-shod cars at
 * once), and there is no weather stop with ai.weatherMinLapsLeft laps or fewer
 * to go. The AI will sit out short damp spells on slicks and lose time: that
 * is the intended trade. Pure threshold, no rng.
 */
function weatherPit(car: CarState, state: RaceState, config: RaceConfig): AIDecision | null {
  const compSpec = config.compounds[car.compound]
  if (!compSpec) return null
  const ai = config.tuning.ai
  // lapsLeft 0 is the race-completing boundary: race.ts drops any stop there,
  // so it is left to the old rule (pre-flight E1: confirm 1 / minLapsLeft 0 is
  // then exactly the pre-1.6 decision on every boundary).
  const lapsLeft = state.totalLaps - state.lap
  if (lapsLeft > 0 && lapsLeft <= ai.weatherMinLapsLeft) return null
  const now = state.weatherState
  if (compSpec.type === 'dry' && now !== 'DRY' &&
      (now === 'WET' || weatherRun(state, w => w !== 'DRY') >= ai.weatherConfirmLaps)) {
    return { pit: true, compound: weatherFamily(now) ?? 'I', paceMode: 'neutral' }
  }
  if (compSpec.type === 'wet' && now === 'DRY' && weatherRun(state, w => w === 'DRY') >= ai.weatherConfirmLaps) {
    return { pit: true, compound: 'M', paceMode: 'neutral' }
  }
  return null
}

/** The AI's dry compound for a stint of remainingLaps. Also YES-to-box's fallback (spec 1.6 §2). */
export function bestDryCompound(config: RaceConfig, remainingLaps: number): Compound {
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
  const wPit = weatherPit(car, state, config)
  if (wPit) return pitWith(car, wPit.compound, wPit.paceMode)

  const spec = config.compounds[car.compound]
  const driver = config.drivers.find(d => d.id === car.driverId)!
  const cliffFrac = spec ? tyreCliffFraction(spec, effectiveTyreAge(car, driver, weatherState, config.tuning)) : 0
  const remainingLaps = state.totalLaps - state.lap
  // Use pitsDone as index so dynamic early pits don't cause a second planned stop later
  const nextStop = car.strategy.plannedStops[car.pitsDone]

  // NAIVE: planned stops only, neutral pace
  if (brain === 'naive') {
    if (cliffFrac >= CLIFF_EMERGENCY_THRESHOLD) {
      const fallback: Compound = car.compound === 'S' ? 'M' : 'H'
      return pitWith(car, nextStop?.compound ?? fallback, 'neutral')
    }
    if (nextStop && car.lap >= nextStop.lap) {
      return pitWith(car, nextStop.compound, 'neutral')
    }
    return { pit: false, compound: car.compound, paceMode: 'neutral' }
  }

  // SMART / OPTIMAL: dynamic cliff reaction + pace modes

  // Emergency cliff
  if (cliffFrac >= CLIFF_EMERGENCY_THRESHOLD) {
    const fallback: Compound = car.compound === 'S' ? 'M' : 'H'
    return pitWith(car, nextStop?.compound ?? bestDryCompound(config, remainingLaps), 'push')
  }

  // Neutralisation reaction, SC and VSC alike (spec 2026-10-16 §1). A cheap
  // stop is a race against the smart teams: box at this lap boundary if the
  // planned stop was coming within the window anyway, or the tyres are already
  // well worn. Naive brains never get here. A pure threshold -- NO rng draw --
  // so it cannot shift the stream. state.safetyCar is the neutralisation as it
  // stands AFTER this tick (race.ts), so a car never boxes on the boundary
  // where it ends and pays the full green-flag loss.
  const ai = config.tuning.ai
  if (state.safetyCar !== null && nextStop &&
      (nextStop.lap - car.lap <= ai.neutralisationWindowLaps || cliffFrac >= ai.neutralisationCliffFrac)) {
    // A car already on wet-family tyres off the dry keeps the weather's family:
    // the plan's slick would only be undone by weatherPit. A car on slicks
    // keeps its plan compound (weatherPit owns its switch, after confirmation).
    const onWets = spec?.type === 'wet'
    return pitWith(car, (onWets ? weatherFamily(state.weatherState) : null) ?? nextStop.compound, 'neutral')
  }

  // Pit when tyre is near the real cliff (not buffered by tyreManagement)
  // Use a fraction slightly past nominal to avoid pitting too early on managed tyres
  const pitThreshold = PIT_CLIFF_THRESHOLD[brain]
  if (cliffFrac >= pitThreshold && remainingLaps > 3) {
    const compound = nextStop?.compound ?? bestDryCompound(config, remainingLaps)
    return pitWith(car, compound, 'neutral')
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
        const prob = (r.coverReactionProb[brain] ?? 0) * (config.coverReactionScale ?? 1.0)
        if (rng() < prob) {
          const compound = nextStop?.compound ?? bestDryCompound(config, remainingLaps)
          return pitWith(car, compound, 'push') // push the out-lap to defend
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
          return pitWith(car, compound, 'neutral')
        }
      }
    }
  }

  // M5: aiPaceModeAggression scales how readily a brain reaches for PUSH —
  // rookie rivals attack less, pro rivals attack more, on top of the same
  // fresh-tyre gating. Only the discretionary "push on fresh tyres" calls
  // scale with this; the emergency-cliff push above is a necessity, not a
  // preference, so it stays unconditional.
  const aggression = config.paceModeAggression ?? 1.0

  // Planned stop
  if (nextStop && car.lap >= nextStop.lap) {
    const paceMode: PaceMode = cliffFrac < 0.20 * aggression ? 'push' : 'neutral'
    return pitWith(car, nextStop.compound, paceMode)
  }

  // Pace mode: push on fresh tyres, neutral otherwise.
  // Conserve is NOT used here — it hurts when pitting dynamically (slows the car
  // but doesn't defer the pit since we pit on cliff proximity, not lap count).
  const paceMode: PaceMode = cliffFrac < 0.18 * aggression ? 'push' : 'neutral'

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
