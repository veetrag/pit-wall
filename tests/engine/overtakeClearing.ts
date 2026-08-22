import { initRace, stepSector, computeSectorTime } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig, StrategyBrain, CarState, SectorIndex } from '@engine/types'

const GAME = loadGameData()

export interface ClearingOptions {
  circuitId: string
  /** Seeds to run; one clearing trial per seed. */
  seeds: number[]
  /** s/lap advantage to give the chasing car. Spec targets 0.3-0.5. */
  advantage: number
  /** Give up after this many laps and record a failure. */
  patienceLaps?: number
  /**
   * Seconds the chaser starts BEHIND the leader. Must be non-zero: `initRace`
   * gives every car `raceTime: 0`, so a zero gap does not start the chaser
   * "directly behind the leader" (as this instrument's docstring long claimed)
   * -- it starts them dead level, and the traffic penalty then falls on
   * whichever car the first sector's noise happens to put second. Measured, a
   * level start makes the whole result a coin flip decided in the opening
   * sector: the easy-vs-hard failure-rate difference is 0.017, and even with
   * overtaking made outright IMPOSSIBLE the ceiling is 0.033. Nothing about
   * being stuck is observable. Starting 0.3s back instead yields 0.500 with a
   * 0.700 ceiling.
   *
   * Default 0.3 is derived, not fitted: per-sector gap noise between these two
   * cars has sd 0.070s (sigmaPerSector 0.08, relieved by d_voss's consistency
   * 95), so 0.3s is 4.3 sigma -- noise alone cannot flip the order in the
   * opening sector -- while staying inside traffic.gapThreshold (1.0s), so the
   * pair begins in the traffic-penalty and overtake-eligible zone that is the
   * whole subject of the measurement. It is also not knife-edge: 0.5s gives
   * 0.517 and 0.8s gives 0.683.
   */
  startGap?: number
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
 * The advantage is injected through the chaser's car facets rather than through
 * tuning, so the pace gap is exact. It is spread across ALL THREE of power,
 * aero and handling, one third of the advantage per sector, because lapModel
 * gives each sector a single governing facet (`[power, aero, handling][sector]`)
 * -- see the comment on the facet arithmetic below. An earlier version of this
 * instrument raised `handling` alone and claimed, right here, that the gap did
 * not depend on which sector the cars were in; it put the entire advantage into
 * sector 3, which is a different physical thing and broke the measurement.
 *
 * The chaser also starts `startGap` seconds BEHIND rather than level; see
 * ClearingOptions.startGap for why that is not optional either.
 */
export function measureClearing(opts: ClearingOptions): ClearingResult {
  // Default chosen empirically: under the clear-air definition, the largest
  // patienceLaps whose zero-advantage failure rate still exceeds 0.8 (see
  // task-1-report.md for the full sweep at 10/15/20/25 -- 20 sits exactly at
  // the 0.8 boundary, not above it, so 15 is the largest that clears it).
  // startGap = 0.3 is derived, not fitted. initRace puts every car on
  // raceTime 0, so a zero gap starts the pair DEAD LEVEL and the traffic
  // penalty falls on whichever car opening-sector noise puts second -- the
  // measurement becomes a coin flip settled in the first sector or two
  // (easy-vs-hard difference 0.017, and a ceiling of 0.033 even with
  // overtaking made outright impossible). 0.3s is 4.3 sigma of the per-sector
  // gap noise between these two cars (sd 0.070s: sigmaPerSector 0.08 relieved
  // by d_voss's consistency 95), so noise alone cannot flip the order in the
  // opening sector, while staying inside traffic.gapThreshold (1.0s) so the
  // pair begins inside the penalty-and-overtake-eligible zone that is the
  // whole subject of the measurement. Not knife-edge: 0.3 -> 0.500, 0.5 ->
  // 0.517, 0.8 -> 0.683, all consistent. Full derivation in ClearingOptions.
  const { circuitId, seeds, advantage, patienceLaps = 15, startGap = 0.3 } = opts
  const circuit = GAME.circuits[circuitId]
  if (!circuit) throw new Error(`unknown circuit ${circuitId}`)

  // Two identical cars, the chaser exactly `advantage` s/lap faster -- spread
  // UNIFORMLY across the lap, one third of it in each sector.
  //
  // This must be spread, not injected into one facet. lapModel.ts:27 picks the
  // car's governing facet per sector -- `[power, aero, handling][sector]` -- so
  // raising `handling` alone (as this instrument originally did, despite its
  // docstring claiming the opposite) gave the chaser its whole advantage in
  // sector 3 and nothing in sectors 1 and 2. A traced trial showed exactly
  // that: +0.37s per S3, +-0.02s per S1/S2. That is a fundamentally different
  // physical thing from being faster everywhere, and it broke the measurement
  // in two ways: no per-sector traffic penalty can resist a single-sector
  // burst that large, and on Harbour Lights the burst landed in the sector
  // with the LOWEST overtakingFactor, so the chaser cleared by pace in the
  // one place it should have been most stuck.
  //
  // A facet point is worth a different amount in each sector, because
  // carPerformance.sectorSplit differs, so each facet's points are computed
  // independently to make all three sector contributions equal.
  const { deltaPerRating, sectorSplit } = GAME.tuning.carPerformance
  const perSector = advantage / 3
  const pointsFor = (sector: 0 | 1 | 2): number =>
    perSector / ((9 / 100) * deltaPerRating * sectorSplit[sector]! * 3)
  const baseTeam = GAME.cars.teams[0]!
  const baseDriver = GAME.drivers.drivers[0]!

  const teams = [
    { ...baseTeam, id: 'leader' },
    {
      ...baseTeam,
      id: 'chaser',
      facets: {
        ...baseTeam.facets,
        power: baseTeam.facets.power + pointsFor(0),
        aero: baseTeam.facets.aero + pointsFor(1),
        handling: baseTeam.facets.handling + pointsFor(2),
      },
    },
  ]
  const drivers = [
    { ...baseDriver, id: 'lead_d', teamId: 'leader' },
    { ...baseDriver, id: 'chase_d', teamId: 'chaser' },
  ]

  // Drift guard: verify THROUGH THE ENGINE that the injection really is
  // `advantage` s/lap, spread evenly. This deliberately does not re-derive the
  // facet arithmetic (that would be a tautology -- it would only restate
  // pointsFor). It calls the real computeSectorTime with noise switched off and
  // measures the leader-minus-chaser delta the lap model actually produces. It
  // therefore fails if lapModel's facet-to-sector mapping, sectorSplit, or
  // deltaPerRating ever change under this instrument -- which is exactly the
  // silent drift that made the original single-facet injection wrong for as
  // long as it was.
  {
    const silent: RaceConfig = {
      circuit, tuning: { ...GAME.tuning, noise: { ...GAME.tuning.noise, sigmaPerSector: 0 } },
      compounds: GAME.compounds, drivers, teams,
      strategies: [], playerDriverId: '__none__', seed: 1,
      tyreAllocationBase: GAME.tuning.tyreRules.allocation.pro,
      mandatoryTwoCompound: false,
      coverReactionScale: GAME.tuning.difficultyProfiles.pro.coverReactionScale,
      paceModeAggression: GAME.tuning.difficultyProfiles.pro.aiPaceModeAggression,
    }
    const probe = (driverId: string, teamId: string, sector: SectorIndex): number => {
      const car = { ...initRace({ ...silent, strategies: [] }).cars[0]!, driverId, teamId }
      return computeSectorTime(silent, car, sector, createRng(1), 'DRY').sectorTime
    }
    const perSectorDelta = ([0, 1, 2] as SectorIndex[]).map(
      sec => probe('lead_d', 'leader', sec) - probe('chase_d', 'chaser', sec),
    )
    const total = perSectorDelta.reduce((a, b) => a + b, 0)
    if (Math.abs(total - advantage) > 1e-6) {
      throw new Error(
        `measureClearing injection drifted: engine reports ${total.toFixed(6)} s/lap, ` +
        `asked for ${advantage.toFixed(6)} (per sector ${perSectorDelta.map(d => d.toFixed(4)).join(', ')})`,
      )
    }
    for (const d of perSectorDelta) {
      if (Math.abs(d - advantage / 3) > 1e-6) {
        throw new Error(
          `measureClearing injection is not uniform across sectors: ` +
          `${perSectorDelta.map(x => x.toFixed(4)).join(', ')} (each must be ${(advantage / 3).toFixed(4)}). ` +
          'A single-sector burst is a different physical thing and cannot be resisted by a per-sector penalty.',
        )
      }
    }
  }

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
    // Put the chaser startGap seconds back. See ClearingOptions.startGap: every
    // car leaves initRace on raceTime 0, so without this the two start level
    // and the measurement is decided by opening-sector noise.
    state = {
      ...state,
      cars: state.cars.map((c: CarState) =>
        c.driverId === 'chase_d' ? { ...c, raceTime: c.raceTime + startGap } : c),
    }
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
