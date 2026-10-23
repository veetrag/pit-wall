import type { RaceConfig, RaceState, Compound, CarState } from '@engine/types'
import { tyreCliffFraction, effectiveTyreAge } from '@engine/tyres'
import { bestDryCompound, weatherFamily, weatherRun } from '@engine/strategy'
import { neutralisationKind } from '@engine/incidents'

/**
 * Driver radio requests (spec 2026-10-17 §2): the driver occasionally asks a
 * yes/no question. Detection is a pure function of the race state plus a small
 * tracker the caller threads through (like radioMapper's RadioState), so it is
 * deterministic and unit-testable. Picking the words and the countdown live in
 * raceStore / RadioRequest.tsx. Checked at lap ends only (ruling R6).
 */
export type RadioRequestKind = 'box' | 'push' | 'rain'

export interface RadioRequest {
  kind: RadioRequestKind
  /** state.lap at the lap end that raised it. */
  lap: number
  /** The car the player wants to attack (push only). */
  aheadId: string | null
  /** What YES fits (box and rain). */
  compound: Compound | null
}

export interface RequestTracker {
  asked: number
  lastAskedLap: Record<RadioRequestKind, number>
  /** pitsDone when the last box request was made: one per stint. -1 = never. */
  boxAskedAtPits: number
  /** Consecutive lap ends within pushGap of the same car ahead. */
  closeLapEnds: number
  closeAheadId: string | null
  lastLapSeen: number
  /**
   * The tyre the last rain request offered (1.6.2). While the mismatch keeps
   * calling for the same tyre it is not asked again -- a NO (or expiry) stands
   * until the call changes or the mismatch clears. Null = re-armed.
   */
  rainAskedFor: Compound | null
  /** pitsDone when the rain request was asked: a stop since (a plan stop onto the wrong tyre) re-arms it. */
  rainAskedAtPits: number
}

export function makeRequestTracker(): RequestTracker {
  return {
    asked: 0,
    lastAskedLap: { box: -1e9, push: -1e9, rain: -1e9 }, // finite: survives a JSON round-trip
    boxAskedAtPits: -1,
    closeLapEnds: 0,
    closeAheadId: null,
    lastLapSeen: -1,
    rainAskedFor: null,
    rainAskedAtPits: -1,
  }
}

export interface RequestContext {
  /** The player's car is still in the pit lane. */
  inPit: boolean
  /** A box request is suppressed while the pit panel is open (spec §2). */
  pitPanelOpen: boolean
  /** A request is already on screen: never stack them. */
  pending: boolean
}

/** The last completed lap's time: the car's three most recent sector results. */
function lastLapTime(state: RaceState, driverId: string): number | null {
  let sum = 0
  let n = 0
  for (let i = state.sectorResults.length - 1; i >= 0 && n < 3; i--) {
    const r = state.sectorResults[i]!
    if (r.driverId !== driverId) continue
    sum += r.sectorTime
    n++
  }
  return n === 3 ? sum : null
}

/** What YES to a box request fits (ruling R6): the weather family on a non-dry track, else the next planned stop, else the AI's best dry compound. */
/** The player's next planned stop; only a configured player strategy counts. */
function nextPlannedStop(config: RaceConfig, player: CarState) {
  return config.playerStrategyOverride ? player.strategy.plannedStops[player.pitsDone] : undefined
}

export function boxRequestCompound(config: RaceConfig, state: RaceState): Compound {
  if (state.weatherState === 'WET') return 'W'
  if (state.weatherState === 'DAMP') return 'I'
  const player = state.cars.find(c => c.isPlayer)
  const next = player ? nextPlannedStop(config, player) : undefined
  if (next) return next.compound
  return bestDryCompound(config, state.totalLaps - state.lap)
}

/**
 * The tyre the weather calls for when the player's tyre family is wrong for
 * the track (1.6.2 rain request), else null. The AI's weatherPit rule exactly
 * (same ai.weatherConfirmLaps / weatherMinLapsLeft, same weatherRun): slicks
 * on a WET track at once, on a DAMP one after the confirm laps; wet-family
 * tyres on a DRY track after the confirm laps. Inters in the WET is not a
 * mismatch (the AI does not switch either). Off the wet, YES fits the next
 * planned compound when it is a slick, else bestDryCompound.
 */
export function rainRequestCompound(config: RaceConfig, state: RaceState, player: CarState): Compound | null {
  const spec = config.compounds[player.compound]
  if (!spec) return null
  const ai = config.tuning.ai
  const lapsLeft = state.totalLaps - state.lap
  if (lapsLeft <= ai.weatherMinLapsLeft) return null
  const now = state.weatherState
  if (spec.type === 'dry' && now !== 'DRY' &&
      (now === 'WET' || weatherRun(state, w => w !== 'DRY') >= ai.weatherConfirmLaps)) {
    return weatherFamily(now)
  }
  if (spec.type === 'wet' && now === 'DRY' && weatherRun(state, w => w === 'DRY') >= ai.weatherConfirmLaps) {
    const next = nextPlannedStop(config, player)
    if (next && config.compounds[next.compound]?.type === 'dry') return next.compound
    return bestDryCompound(config, lapsLeft)
  }
  return null
}

export function detectRadioRequest(
  state: RaceState,
  config: RaceConfig,
  tracker: RequestTracker,
  ctx: RequestContext,
): { request: RadioRequest | null; tracker: RequestTracker } {
  const rr = config.tuning.radioRequests
  const player = state.cars.find(c => c.isPlayer)
  if (!player || player.retired || state.sector !== 0 || state.lap === 0 ||
      state.lap === tracker.lastLapSeen || state.lap >= state.totalLaps) {
    return { request: null, tracker }
  }
  const t: RequestTracker = {
    ...tracker,
    lastAskedLap: { ...tracker.lastAskedLap, rain: tracker.lastAskedLap.rain ?? -1e9 },
    rainAskedFor: tracker.rainAskedFor ?? null,
    rainAskedAtPits: tracker.rainAskedAtPits ?? -1,
    lastLapSeen: state.lap,
  }
  const kind = neutralisationKind(state.safetyCar)
  // A streak needs consecutive lap ends: a skipped lap or a neutralisation breaks it.
  const consecutive = tracker.lastLapSeen < 0 || state.lap === tracker.lastLapSeen + 1

  // The push streak is tracked at every lap end, asked or not.
  const ahead = state.cars.find(c => !c.retired && c.position === player.position - 1) ?? null
  const gap = ahead ? player.raceTime - ahead.raceTime : Number.POSITIVE_INFINITY
  if (ahead && gap <= rr.pushGap && kind === null && consecutive) {
    t.closeLapEnds = t.closeAheadId === ahead.driverId ? t.closeLapEnds + 1 : 1
    t.closeAheadId = ahead.driverId
  } else {
    t.closeLapEnds = 0
    t.closeAheadId = null
  }

  // Rain (1.6.2): tracked at every lap end, so a cleared or changed call re-arms it.
  const rain = rainRequestCompound(config, state, player)
  if (rain !== t.rainAskedFor || player.pitsDone !== t.rainAskedAtPits) t.rainAskedFor = null

  // No questions under a red flag: the free tyre change is coming (ruling R6).
  if (ctx.pending || kind === 'red') return { request: null, tracker: t }

  // Rain first, and outside maxPerRace / cooldownLaps: staying on the wrong
  // family is what retires cars. Asked once per call (rainAskedFor).
  if (rain !== null && t.rainAskedFor === null && !ctx.inPit && !ctx.pitPanelOpen) {
    t.asked++
    t.lastAskedLap.rain = state.lap
    t.rainAskedFor = rain
    t.rainAskedAtPits = player.pitsDone
    return { request: { kind: 'rain', lap: state.lap, aheadId: null, compound: rain }, tracker: t }
  }

  if (t.asked >= rr.maxPerRace) return { request: null, tracker: t }

  const spec = config.compounds[player.compound]
  const driver = config.drivers.find(d => d.id === player.driverId)
  const cliff = spec && driver ? tyreCliffFraction(spec, effectiveTyreAge(player, driver, state.weatherState, config.tuning)) : 0
  const lapsLeft = state.totalLaps - state.lap

  // Box: "Tyres are gone, can we box?"
  const next = nextPlannedStop(config, player)
  const planSoon = next !== undefined && next.lap - player.lap <= rr.boxPlanWindowLaps
  if (cliff >= rr.boxCliffFrac && !planSoon && lapsLeft > rr.minLapsLeft &&
      !ctx.inPit && !ctx.pitPanelOpen && t.boxAskedAtPits !== player.pitsDone &&
      state.lap - t.lastAskedLap.box >= rr.cooldownLaps) {
    t.asked++
    t.lastAskedLap.box = state.lap
    t.boxAskedAtPits = player.pitsDone
    return { request: { kind: 'box', lap: state.lap, aheadId: null, compound: boxRequestCompound(config, state) }, tracker: t }
  }

  // Push: "I'm faster than {ahead}, let me push". Never under a neutralisation (ruling R6).
  if (ahead && t.closeLapEnds >= rr.pushLapEnds && player.paceMode !== 'push' &&
      cliff < rr.pushMaxCliffFrac && state.lap - t.lastAskedLap.push >= rr.cooldownLaps) {
    const mine = lastLapTime(state, player.driverId)
    const theirs = lastLapTime(state, ahead.driverId)
    if (mine !== null && theirs !== null && theirs - mine >= rr.pushPaceMargin) {
      t.asked++
      t.lastAskedLap.push = state.lap
      return { request: { kind: 'push', lap: state.lap, aheadId: ahead.driverId, compound: null }, tracker: t }
    }
  }
  return { request: null, tracker: t }
}
