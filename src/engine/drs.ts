import type { RaceConfig, RaceState, SectorIndex } from './types'

/** Lap from which DRS counts again: start, SC end or red-flag restart (spec §3.2). */
export function greenSinceLap(state: Pick<RaceState, 'incidents'>): number {
  let since = 0
  for (const ev of state.incidents) {
    if (ev.kind === 'safety_car_ended' || ev.kind === 'red_flag_restart') since = Math.max(since, ev.lap + 1)
  }
  return since
}

function runningSorted(state: Pick<RaceState, 'cars'>) {
  return state.cars.filter(c => !c.retired).sort((a, b) => a.raceTime - b.raceTime)
}

/** Who has DRS in `sector` this tick, from the PRE-tick order (ruling D1). */
export function drsOpenSet(config: RaceConfig, state: RaceState, sector: SectorIndex): Set<string> {
  const d = config.tuning.drs
  const open = new Set<string>()
  if (!d.enabled || state.safetyCar !== null || state.weatherState !== 'DRY') return open
  if (!(config.circuit.drsSectors ?? []).includes(sector)) return open
  if (state.lap - greenSinceLap(state) < d.enableAfterLaps) return open
  const sorted = runningSorted(state)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.raceTime - sorted[i - 1]!.raceTime <= d.detectionGap) open.add(sorted[i]!.driverId)
  }
  return open
}

/** Multiplier on the pass probability (ruling D2: the train cancels the bonus). */
export function drsOvertakeFactor(config: RaceConfig, open: ReadonlySet<string>, behindId: string, aheadId: string): number {
  if (!open.has(behindId)) return 1
  const d = config.tuning.drs
  return 1 + d.overtakeBonus * (1 - d.trainNeutralisation * (open.has(aheadId) ? 1 : 0))
}

export function drsTrains(config: RaceConfig, state: Pick<RaceState, 'cars'>): { carIds: string[] }[] {
  const d = config.tuning.drs
  const sorted = runningSorted(state)
  const out: { carIds: string[] }[] = []
  let run: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const linked = i > 0 && sorted[i]!.raceTime - sorted[i - 1]!.raceTime <= d.detectionGap
    if (linked) run.push(sorted[i]!.driverId)
    else { if (run.length >= d.trainMinCars) out.push({ carIds: run }); run = [sorted[i]!.driverId] }
  }
  if (run.length >= d.trainMinCars) out.push({ carIds: run })
  return out
}

export function inTrainBehindHead(config: RaceConfig, state: Pick<RaceState, 'cars'>, driverId: string): boolean {
  return drsTrains(config, state).some(t => t.carIds.indexOf(driverId) > 0)
}
