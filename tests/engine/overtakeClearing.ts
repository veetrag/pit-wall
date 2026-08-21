import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig, StrategyBrain, CarState } from '@engine/types'

const GAME = loadGameData()

export interface ClearingOptions {
  circuitId: string
  /** Seeds to run; one clearing trial per seed. */
  seeds: number[]
  /** s/lap advantage to give the chasing car. Spec targets 0.3-0.5. */
  advantage: number
  /** Give up after this many laps and record a failure. */
  patienceLaps?: number
}

export interface ClearingResult {
  circuitId: string
  advantage: number
  trials: number
  /** Laps to clear, for the trials that cleared. */
  clearedLaps: number[]
  /** Fraction of trials that never cleared within patienceLaps. */
  failureRate: number
  meanLapsToClear: number
  medianLapsToClear: number
  /** Binomial SE of failureRate. */
  seFailureRate: number
}

/**
 * A two-car race: the chaser starts directly behind the leader and is `advantage`
 * s/lap faster. Everything else is held equal -- same team facets, same driver
 * facets, same compound, same age -- so the ONLY asymmetry is pace. That makes
 * "laps to clear" attributable to the overtaking model and nothing else.
 *
 * The advantage is injected through the leader's sectorBase-independent handling
 * facet rather than through tuning, so the pace gap is exact and does not
 * depend on which sector the cars are in.
 */
export function measureClearing(opts: ClearingOptions): ClearingResult {
  // Default chosen empirically: under the clear-air definition, the largest
  // patienceLaps whose zero-advantage failure rate still exceeds 0.8 (see
  // task-1-report.md for the full sweep at 10/15/20/25 -- 20 sits exactly at
  // the 0.8 boundary, not above it, so 15 is the largest that clears it).
  const { circuitId, seeds, advantage, patienceLaps = 15 } = opts
  const circuit = GAME.circuits[circuitId]
  if (!circuit) throw new Error(`unknown circuit ${circuitId}`)

  // Two identical cars. The chaser's handling facet is raised so it is exactly
  // `advantage` s/lap faster: from lapModel, one facet point on `handling` is
  // worth (9/100) * deltaPerRating * sectorSplit[2] * 3 s/lap.
  const { deltaPerRating, sectorSplit } = GAME.tuning.carPerformance
  const perPoint = (9 / 100) * deltaPerRating * sectorSplit[2]! * 3
  const baseTeam = GAME.cars.teams[0]!
  const baseDriver = GAME.drivers.drivers[0]!

  const teams = [
    { ...baseTeam, id: 'leader' },
    { ...baseTeam, id: 'chaser', facets: { ...baseTeam.facets, handling: baseTeam.facets.handling + advantage / perPoint } },
  ]
  const drivers = [
    { ...baseDriver, id: 'lead_d', teamId: 'leader' },
    { ...baseDriver, id: 'chase_d', teamId: 'chaser' },
  ]

  const clearedLaps: number[] = []
  let failures = 0

  for (const seed of seeds) {
    const cfg: RaceConfig = {
      circuit, tuning: GAME.tuning, compounds: GAME.compounds,
      drivers, teams,
      // No planned stops: a pit stop would confound "laps to clear".
      strategies: [
        { teamId: 'leader', startCompound: 'M', plannedStops: [], brain: 'naive' as StrategyBrain },
        { teamId: 'chaser', startCompound: 'M', plannedStops: [], brain: 'naive' as StrategyBrain },
      ],
      playerDriverId: '__none__',
      seed,
      tyreAllocationBase: GAME.tuning.tyreRules.allocation.pro,
      mandatoryTwoCompound: false,
      coverReactionScale: GAME.tuning.difficultyProfiles.pro.coverReactionScale,
      paceModeAggression: GAME.tuning.difficultyProfiles.pro.aiPaceModeAggression,
    }
    const rng = createRng(seed)
    let state = initRace(cfg)
    const startLap = state.lap
    let cleared = false

    // "Cleared" = the chaser is ahead on raceTime AND the gap back to the
    // other car exceeds tuning.traffic.gapThreshold (clear air). A bare
    // crossing inside that gap is "stuck in the train" -- precisely the
    // state the traffic penalty models -- not a completed pass. Measuring
    // bare crossings instead measures the per-sector Gaussian noise (a
    // driftless random walk crosses zero with high probability given enough
    // steps) rather than the overtaking mechanism; clear-air is robust to
    // that because noise alone rarely opens and holds a >1.0s gap.
    const gapThreshold = GAME.tuning.traffic.gapThreshold
    const clearAirGap = (s: typeof state): number => {
      const active = s.cars.filter((c: CarState) => !c.retired)
      const lead = active.find(c => c.driverId === 'lead_d')
      const chase = active.find(c => c.driverId === 'chase_d')
      if (!lead || !chase) return -Infinity
      return lead.raceTime - chase.raceTime // positive => chaser ahead by this many seconds
    }

    // RaceState has no `finished` flag of its own (it is derived in
    // src/state/raceStore.ts:198 from lap/sector, not tracked by the engine),
    // so the loop bound below is `patienceLaps` alone -- `state.finished`
    // would never be true and this would hang forever.
    while (state.lap - startLap < patienceLaps) {
      state = stepSector(cfg, state, rng)
      if (clearAirGap(state) > gapThreshold) { clearedLaps.push(state.lap - startLap); cleared = true; break }
    }
    if (!cleared) failures++
  }

  const trials = seeds.length
  const failureRate = failures / trials
  const sorted = [...clearedLaps].sort((a, b) => a - b)
  return {
    circuitId, advantage, trials, clearedLaps, failureRate,
    meanLapsToClear: clearedLaps.length ? clearedLaps.reduce((a, b) => a + b, 0) / clearedLaps.length : NaN,
    medianLapsToClear: sorted.length ? sorted[Math.floor(sorted.length / 2)]! : NaN,
    seFailureRate: Math.sqrt(failureRate * (1 - failureRate) / trials),
  }
}
