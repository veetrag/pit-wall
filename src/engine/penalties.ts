import type { CarState, IncidentEvent, PaceMode, PenaltyState, RaceConfig, RaceState, SectorIndex, WeatherState } from './types'

/**
 * Penalties (spec 2026-10-24 §8.2, rulings N1-N3). Pure; no rng. Track limits
 * ride on lapModel's spare noise2, unsafe release on pitStopTime's g2.
 */
export function initPenalty(): PenaltyState { return { warnings: 0, pendingSec: 0, servedSec: 0 } }

/** Per-sector chance of exceeding track limits (spec §8.2). */
export function trackLimitsChance(config: RaceConfig, car: CarState, weather: WeatherState): number {
  const tl = config.tuning.penalties.trackLimits
  if (tl.chancePerLap <= 0) return 0
  const driver = config.drivers.find(d => d.id === car.driverId)!
  return tl.chancePerLap / 3 * tl.paceModeFactor[car.paceMode]
    * (1 - driver.facets.consistency / 100 * tl.consistencyRelief) * tl.wetFactor[weather]
}

/** One offence: a warning, or past the allowance a time penalty (N1). */
export function recordTrackLimits(config: RaceConfig, car: CarState, lap: number, sector: SectorIndex): { penalty: PenaltyState; events: IncidentEvent[] } {
  const p = config.tuning.penalties
  const prev = car.penalty ?? initPenalty()
  const warnings = prev.warnings + 1
  const events: IncidentEvent[] = [{ lap, sector, kind: 'track_limits', driverId: car.driverId, timeLoss: null }]
  if (warnings <= p.trackLimits.warningsAllowed) return { penalty: { ...prev, warnings }, events }
  events.push({ lap, sector, kind: 'penalty_issued', driverId: car.driverId, timeLoss: p.timePenaltySec })
  return { penalty: { ...prev, warnings, pendingSec: prev.pendingSec + p.timePenaltySec }, events }
}

export function unsafeReleaseChance(config: RaceConfig, teamId: string, stacked: boolean): number {
  const u = config.tuning.penalties.unsafeRelease
  const crew = config.teams.find(t => t.id === teamId)!.facets.pitCrew / 100
  return u.chance * (1 - crew * u.pitCrewRelief) * (stacked ? u.stackedFactor : 1)
}

/** At the flag every unserved penalty goes onto race time, before classification. */
export function addPendingAtFlag(cars: CarState[], lap: number, sector: SectorIndex): { cars: CarState[]; events: IncidentEvent[] } {
  const events: IncidentEvent[] = []
  const out = cars.map(c => {
    const pen = c.penalty
    if (c.retired || !pen || pen.pendingSec <= 0) return c
    events.push({ lap, sector, kind: 'penalty_added', driverId: c.driverId, timeLoss: pen.pendingSec })
    return { ...c, raceTime: c.raceTime + pen.pendingSec, penalty: { ...pen, pendingSec: 0, servedSec: pen.servedSec + pen.pendingSec } }
  })
  return { cars: out, events }
}

/** Running cars ordered as they would classify now, pending penalties included. */
export function effectiveOrder(state: Pick<RaceState, 'cars'>): CarState[] {
  return state.cars.filter(c => !c.retired)
    .sort((a, b) => (a.raceTime + (a.penalty?.pendingSec ?? 0)) - (b.raceTime + (b.penalty?.pendingSec ?? 0)))
}

/** Smart/optimal with a penalty and no stop left: build the gap (spec §8.2). Pure. */
export function aiPenaltyCoverPace(config: RaceConfig, car: CarState, state: RaceState, cliffFrac: number, proposed: PaceMode): PaceMode {
  const pend = car.penalty?.pendingSec ?? 0
  if (pend <= 0 || (car.strategy.brain ?? 'naive') === 'naive' || car.strategy.plannedStops[car.pitsDone] || cliffFrac >= 0.7) return proposed
  const sorted = state.cars.filter(c => !c.retired).sort((a, b) => a.raceTime - b.raceTime)
  const behind = sorted[sorted.findIndex(c => c.driverId === car.driverId) + 1]
  return behind && behind.raceTime - car.raceTime < pend + config.tuning.penalties.aiCoverMargin ? 'push' : proposed
}
