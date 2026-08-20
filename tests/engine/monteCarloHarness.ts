import { initRace, stepSector } from '@engine/index'
import { createRng } from '@engine/rng'
import { loadGameData } from '@data/validators'
import type { RaceConfig, StrategyBrain, DifficultyProfile } from '@engine/types'

export type HarnessOptions = {
  races: number
  circuitIds: string[]
  seedBase?: number
  difficulty?: 'rookie' | 'pro'
  forceDry?: boolean
}

export type Metrics = {
  races: number
  winShareByTeam: Record<string, number>
  topTeamId: string
  topTeamShare: number
  distinctWinners: number
  meanAbsPosChange: number
  sePosChange: number
  gridFinishSpearman: number
  paceRankCorrelation: number
  meanOvertakeEvents: number
  minOvertakeEvents: number
  // Retirements with retiredCause === 'mechanical', per car-race. Banded in
  // tuning.json as mechanicalDnfPerCarRace; MODEL_SPEC.md §3 bands it 0.06-0.10
  // against a real-F1 9.8pp, but the sim measures 5-6%, so that band is
  // ASPIRATIONAL and owned by the race-incidents plan, not this one.
  mechanicalDnfPerCarRace: number
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

// Per-point s/lap cost of a car facet, derived from the engine's own arithmetic:
// facetToRating9 gives (100 - facet) * 9/100, then carDelta multiplies by
// deltaPerRating * sectorSplit[s] * 3. A car facet governs exactly one sector:
// power -> S1, aero -> S2, handling -> S3 (see src/engine/lapModel.ts:28-31).
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

function spearman(xs: number[], ys: number[]): number {
  // Inputs here are already ranks (grid slot, finish position), both dense and
  // tie-free within a race, so Pearson on the raw values IS Spearman's rho.
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
  let carRaces = 0
  const finishSumByTeam = new Map<string, number>()
  const finishCountByTeam = new Map<string, number>()

  for (let r = 0; r < races; r++) {
    const circuitId = circuitIds[r % circuitIds.length]!
    const seed = seedBase + r * 7919
    const config = buildConfig(seed, circuitId, difficulty, forceDry)
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
    paceRankCorrelation: spearman(paceRanks, meanFinishes),
    meanOvertakeEvents: overtakeTotal / races,
    minOvertakeEvents: overtakeMin,
    mechanicalDnfPerCarRace: mechanicalDnfs / carRaces,
  }
}
