import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { aiSetups } from '@engine/setup'
import { loadGameData } from '@data/validators'
import type { RaceConfig, StrategyBrain, DifficultyProfile } from '@engine/types'

export type HarnessOptions = {
  races: number
  circuitIds: string[]
  seedBase?: number
  difficulty?: 'rookie' | 'pro'
  forceDry?: boolean
  /** Give every car an AI wing (config.setups = aiSetups). Off by default. */
  withSetups?: boolean
}

export type Metrics = {
  races: number
  winShareByTeam: Record<string, number>
  topTeamId: string
  topTeamShare: number
  distinctWinners: number
  meanAbsPosChange: number
  // Naive SE: sqrt(var / (20 * races)), which treats car-races as independent.
  // They are not -- finishing positions within a race are a permutation, so
  // |dpos| values inside one race are negatively coupled and the true SE is
  // somewhat wider. It is used only to size band margins that sit 20+ SE away,
  // where the correction cannot change a verdict; do not quote it as a precise
  // confidence interval.
  sePosChange: number
  gridFinishSpearman: number
  paceRankCorrelation: number
  meanOvertakeEvents: number
  minOvertakeEvents: number
  // NOTE on convention: meanAbsPosChange and gridFinishSpearman are computed
  // over the FULL classification including retirements, whereas MODEL_SPEC.md
  // §3's real-F1 anchors (2.97 and 0.779) are the classified-finishers figures.
  // Real F1's DNF-inclusive equivalents are 3.70 and 0.628, so this comparison
  // is mildly conservative on |dpos| and mildly generous on rho.
  // Retirements with retiredCause === 'mechanical', per car-race. Banded in
  // tuning.json as mechanicalDnfPerCarRace; MODEL_SPEC.md §3 bands it 0.06-0.10
  // against a real-F1 9.8pp, but the sim measures 4.67% +- 0.12pp, so that band is
  // ASPIRATIONAL and owned by the race-incidents plan, not this one.
  mechanicalDnfPerCarRace: number
  // Race-incidents metrics (spec 8.2). crashesPerCarRace is the direct
  // counterpart of real F1's 7.0pp accident share; safetyCarsPerRace is the
  // owner's ~0.6-0.7 choice.
  crashesPerCarRace: number
  safetyCarsPerRace: number
  driverErrorsPerRace: number
}

// Duplicated from src/state/raceStore.ts:53 and :57-62 (BRAIN_ORDER and
// applyBrainProfile), which are module-private there. They are copied rather
// than imported because importing raceStore into an engine test would drag a
// Zustand store, a seasonStore type and UI types into a pure-engine
// measurement, crossing the boundary CLAUDE.md §3 keeps clean.
//
// This MUST stay behaviourally identical to the original: it is what makes
// `difficulty` actually control AI strategy quality here, exactly as it does in
// production. If raceStore.ts:57-62 changes, mirror the change here.
const BRAIN_ORDER: StrategyBrain[] = ['naive', 'smart', 'optimal']

function applyBrainProfile(baseBrain: StrategyBrain, profile: DifficultyProfile): StrategyBrain {
  const baseIdx = BRAIN_ORDER.indexOf(baseBrain)
  const capIdx = BRAIN_ORDER.indexOf(profile.brainCap)
  const promotedIdx = profile.brainPromote ? Math.min(baseIdx + 1, BRAIN_ORDER.length - 1) : baseIdx
  return BRAIN_ORDER[Math.min(promotedIdx, capIdx)]!
}

// Per-point s/lap cost of a car facet: facetToRating9 gives (100 - facet) * 9/100,
// then carDelta multiplies by deltaPerRating * weight * 3. A car facet governs
// exactly one sector: power -> S1, aero -> S2, handling -> S3.
//
// IMPORTANT, and no longer "the engine's own arithmetic": since 2026-08-23 lapModel
// takes `weight` from circuit.carSensitivity[sector], NOT from the global
// carPerformance.sectorSplit this function is passed. So this is a CIRCUIT-BLIND
// PROXY for pace order, and it disagrees with the engine: on the shipped calendar
// meridian is the fastest car on 8 of 12 circuits and apex on only 3, while this
// proxy always ranks apex first.
//
// That is tolerable for what paceRankCorrelation is for -- a single fixed reference
// ordering, applied identically to every race, is enough to detect results
// decoupling from car quality altogether (the lottery failure mode). It is NOT
// evidence about per-circuit pace order, and a stable paceRankCorrelation must not
// be read as evidence that per-circuit weighting left pace ordering untouched.
// See MODEL_SPEC.md section 3's note on this row.
function teamPaceDeficit(
  facets: { power: number; aero: number; handling: number },
  deltaPerRating: number,
  sectorSplit: readonly number[],
): number {
  const per = (i: number) => (9 / 100) * deltaPerRating * sectorSplit[i]! * 3
  return (100 - facets.power) * per(0)
    + (100 - facets.aero) * per(1)
    + (100 - facets.handling) * per(2)
}

// Fractional (tie-averaged) ranks, ascending: the smallest value gets rank 1.
// Needed because `spearman` below is Pearson on its inputs, so any continuous
// input must be rank-transformed first or the result is sensitive to SPACING,
// not just ordering.
//
// DO NOT "simplify" this away at the paceRankCorrelation call site. That metric
// correlates car-pace rank against per-team mean finishing position, which is
// continuous. Without this transform the gate punishes a COMPRESSED grid --
// exactly what the competitive-grid plan is meant to produce -- because
// compression multiplies near-ties (solstice and kestrel differ by 0.009 s/lap)
// and near-ties shrink the spacing the Pearson form keys on. Rank-transforming
// both sides makes the metric ask the question it is actually for: does pace
// ORDERING still predict finish ORDERING? That stays robust under compression
// and still collapses toward 0 if results go random, which is the anti-lottery
// property the gate exists to protect.
function rankify(vs: number[]): number[] {
  const idx = vs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(vs.length)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1]![0] === idx[i]![0]) j++
    // Average rank over the tied block, 1-based.
    const avg = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[idx[k]![1]] = avg
    i = j + 1
  }
  return out
}

function spearman(xs: number[], ys: number[]): number {
  // Pearson on the inputs given. Callers MUST pass ranks. Grid slot and finish
  // position are already dense, tie-free ranks within a race, so Pearson on
  // those raw values IS Spearman's rho; anything continuous goes through
  // `rankify` first.
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx, b = ys[i]! - my
    num += a * b; dx += a * a; dy += b * b
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy)
}

function buildConfig(seed: number, circuitId: string, difficulty: 'rookie' | 'pro', forceDry: boolean): RaceConfig {
  const data = loadGameData()
  const circuit = data.circuits[circuitId]
  if (!circuit) throw new Error(`unknown circuit ${circuitId}`)
  const profile = data.tuning.difficultyProfiles[difficulty]
  const laps = circuit.laps
  return {
    circuit: forceDry ? { ...circuit, rainProbability: 0 } : circuit,
    tuning: data.tuning,
    compounds: data.compounds,
    drivers: data.drivers.drivers,
    teams: data.cars.teams,
    strategies: data.strategies.defaults.map(s => ({
      ...s,
      brain: applyBrainProfile((s.brain ?? 'naive') as StrategyBrain, profile),
      plannedStops: s.plannedStops.map(stop => ({ ...stop, lap: Math.round((stop.lap / 30) * laps) })),
    })),
    // A non-existent id so EVERY car is AI-managed. See MODEL_SPEC.md §12 --
    // a real playerDriverId leaves one car on its start tyre in neutral all
    // race and silently skews every field-wide statistic.
    playerDriverId: '__none__',
    seed,
    tyreAllocationBase: data.tuning.tyreRules.allocation[difficulty],
    mandatoryTwoCompound: data.tuning.tyreRules.mandatoryTwoCompound[difficulty],
    coverReactionScale: profile.coverReactionScale,
    paceModeAggression: profile.aiPaceModeAggression,
  }
}

export function runRaces(opts: HarnessOptions): Metrics {
  const { races, circuitIds, seedBase = 1000, difficulty = 'pro', forceDry = false } = opts
  const data = loadGameData()
  const teamById = new Map(data.cars.teams.map(t => [t.id, t]))
  const driverTeam = new Map(data.drivers.drivers.map(d => [d.id, d.teamId]))

  const paceByTeam = new Map(
    data.cars.teams.map(t => [
      t.id,
      teamPaceDeficit(t.facets, data.tuning.carPerformance.deltaPerRating, data.tuning.carPerformance.sectorSplit),
    ]),
  )
  const paceRank = new Map(
    [...paceByTeam.entries()].sort((a, b) => a[1] - b[1]).map(([id], i) => [id, i + 1]),
  )

  const winsByTeam: Record<string, number> = {}
  const absPosChanges: number[] = []
  let spearmanSum = 0
  let overtakeTotal = 0
  let overtakeMin = Number.POSITIVE_INFINITY
  let mechanicalDnfs = 0
  let crashes = 0
  let safetyCars = 0
  let driverErrors = 0
  let carRaces = 0
  const finishSumByTeam = new Map<string, number>()
  const finishCountByTeam = new Map<string, number>()

  for (let r = 0; r < races; r++) {
    const circuitId = circuitIds[r % circuitIds.length]!
    const seed = seedBase + r * 7919
    const built = buildConfig(seed, circuitId, difficulty, forceDry)
    // playerDriverId is '__none__' here, so every car gets an AI wing.
    const config = opts.withSetups ? { ...built, setups: aiSetups(built) } : built
    let state = initRace(config)
    const grid = new Map(state.cars.map(c => [c.driverId, c.position]))
    const rng = createRng(seed)
    for (let i = 0; i < config.circuit.laps * 3; i++) state = stepSector(config, state, rng)

    const winnerTeam = driverTeam.get(state.cars[0]!.driverId)!
    winsByTeam[winnerTeam] = (winsByTeam[winnerTeam] ?? 0) + 1

    const gs: number[] = []
    const fs: number[] = []
    for (const car of state.cars) {
      carRaces++
      if (car.retired && car.retiredCause === 'mechanical') mechanicalDnfs++
      const g = grid.get(car.driverId)!
      absPosChanges.push(Math.abs(g - car.position))
      gs.push(g); fs.push(car.position)
      const t = driverTeam.get(car.driverId)!
      finishSumByTeam.set(t, (finishSumByTeam.get(t) ?? 0) + car.position)
      finishCountByTeam.set(t, (finishCountByTeam.get(t) ?? 0) + 1)
    }
    spearmanSum += spearman(gs, fs)

    crashes += state.cars.filter(c => c.retiredCause === 'crash').length
    safetyCars += state.incidents.filter(i => i.kind === 'safety_car_deployed').length
    driverErrors += state.incidents.filter(i => i.kind === 'driver_error').length

    const ot = state.overtakeEvents.length
    overtakeTotal += ot
    if (ot < overtakeMin) overtakeMin = ot
  }

  const winShareByTeam: Record<string, number> = {}
  for (const t of teamById.keys()) winShareByTeam[t] = (winsByTeam[t] ?? 0) / races
  const topTeamId = Object.entries(winShareByTeam).sort((a, b) => b[1] - a[1])[0]![0]

  const n = absPosChanges.length
  const mean = absPosChanges.reduce((a, b) => a + b, 0) / n
  const variance = absPosChanges.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)

  // Genuine competitiveness check: does car pace rank still predict mean finish?
  const ranked = [...finishSumByTeam.keys()]
  const paceRanks = ranked.map(t => paceRank.get(t)!)
  const meanFinishes = ranked.map(t => finishSumByTeam.get(t)! / finishCountByTeam.get(t)!)

  return {
    races,
    winShareByTeam,
    topTeamId,
    topTeamShare: winShareByTeam[topTeamId]!,
    distinctWinners: Object.values(winsByTeam).filter(w => w > 0).length,
    meanAbsPosChange: mean,
    sePosChange: Math.sqrt(variance / n),
    gridFinishSpearman: spearmanSum / races,
    // Both sides ranks -- see `rankify`. Robust to grid compression by design.
    paceRankCorrelation: spearman(paceRanks, rankify(meanFinishes)),
    meanOvertakeEvents: overtakeTotal / races,
    minOvertakeEvents: overtakeMin,
    mechanicalDnfPerCarRace: mechanicalDnfs / carRaces,
    crashesPerCarRace: crashes / carRaces,
    safetyCarsPerRace: safetyCars / races,
    driverErrorsPerRace: driverErrors / races,
  }
}
