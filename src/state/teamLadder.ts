import { loadGameData } from '@data/validators'
import { effectiveTeams } from './buildRaceConfig'
import type { UpgradeOverlayInput } from './upgradeOverlay'
/**
 * The team ladder: at each season end every team, the player's included,
 * climbs or slips one tier according to whether it beat the constructors'
 * position its car deserved. See
 * docs/superpowers/specs/2026-10-09-team-ladder-design.md.
 *
 * Everything here is pure. It imports neither seasonStore nor careerStore,
 * so both can call it without an ESM cycle.
 */

export interface TeamTierTuning {
  step: number
  min: number
  max: number
  threshold: number
  facets: string[]
}

export interface ConstructorRow {
  teamId: string
  points: number
  /** 1-based position of the team's best driver in the drivers' championship. */
  bestDriverRank: number
}

export interface LadderMove {
  teamId: string
  /** 1-based constructors' position the car deserved. */
  deserved: number
  /** 1-based constructors' position actually achieved. */
  finished: number
  before: number
  after: number
}

/** A car's rating: the mean of its facets. The same measure TeamSelect shows. */
export function meanFacet(facets: Record<string, number>): number {
  const vals = Object.values(facets)
  return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length
}

/**
 * The constructors' championship, folded from the drivers'.
 *
 * `standings` must be in drivers' championship order (seasonStore sorts it
 * by points). Every team in `driverTeam` appears, even with no classified
 * driver, so the ladder judges all ten every season.
 */
export function constructorsTable(
  standings: readonly { driverId: string; points: number }[],
  driverTeam: ReadonlyMap<string, string>,
): ConstructorRow[] {
  const rows = new Map<string, ConstructorRow>()
  for (const teamId of driverTeam.values()) {
    if (!rows.has(teamId)) rows.set(teamId, { teamId, points: 0, bestDriverRank: standings.length + 1 })
  }
  standings.forEach((s, i) => {
    const teamId = driverTeam.get(s.driverId)
    if (teamId === undefined) return
    const row = rows.get(teamId)!
    row.points += s.points
    row.bestDriverRank = Math.min(row.bestDriverRank, i + 1)
  })
  return [...rows.values()].sort((a, b) =>
    b.points - a.points
    || a.bestDriverRank - b.bestDriverRank
    || a.teamId.localeCompare(b.teamId))
}

/**
 * Where each team's car deserved to finish: best rating first. Ties fall to
 * the authored base rating, then to team id, so the order is total and
 * deterministic.
 */
export function deservedOrder(
  ratings: Readonly<Record<string, number>>,
  baseRatings: Readonly<Record<string, number>>,
): string[] {
  return Object.keys(ratings).sort((a, b) =>
    ratings[b]! - ratings[a]!
    || (baseRatings[b] ?? 0) - (baseRatings[a] ?? 0)
    || a.localeCompare(b))
}

/**
 * The rule. `delta = deserved - finished`: positive means the team finished
 * better than its car deserved. At or beyond `threshold` either way the
 * offset moves one step, clamped to [min, max].
 *
 * There is deliberately no notion of a player here. One rule, ten teams.
 */
export function settleTeamTiers(
  finishedOrder: readonly string[],
  deserved: readonly string[],
  tiers: Readonly<Record<string, number>>,
  t: TeamTierTuning,
): { tiers: Record<string, number>; moves: LadderMove[] } {
  const out: Record<string, number> = { ...tiers }
  const moves: LadderMove[] = []
  finishedOrder.forEach((teamId, i) => {
    const finished = i + 1
    const d = deserved.indexOf(teamId)
    const deservedPos = d < 0 ? finished : d + 1
    const delta = deservedPos - finished
    const before = tiers[teamId] ?? 0
    const stepBy = delta >= t.threshold ? 1 : delta <= -t.threshold ? -1 : 0
    const after = Math.max(t.min, Math.min(t.max, before + stepBy))
    out[teamId] = after
    moves.push({ teamId, deserved: deservedPos, finished, before, after })
  })
  return { tiers: out, moves }
}

/**
 * Settles one season: builds the constructors' table from the drivers'
 * standings, rates every car with the SAME overlay that built the races, and
 * applies the rule. Called by seasonStore once, when a season is banked.
 */
export function settleSeason(args: {
  standings: readonly { driverId: string; points: number }[]
  playerDriverId: string
  overlay: UpgradeOverlayInput
  tiers: Readonly<Record<string, number>>
}): { tiers: Record<string, number>; moves: LadderMove[] } {
  const data = loadGameData()
  const driverTeam = new Map(data.drivers.drivers.map(d => [d.id, d.teamId] as [string, string]))
  const finished = constructorsTable(args.standings, driverTeam).map(r => r.teamId)
  const teams = effectiveTeams(args.playerDriverId, { ...args.overlay, teamTiers: args.tiers })
  const ratings = Object.fromEntries(teams.map(t => [t.id, meanFacet(t.facets)]))
  const base = Object.fromEntries(data.cars.teams.map(t => [t.id, meanFacet(t.facets)]))
  return settleTeamTiers(finished, deservedOrder(ratings, base), args.tiers, data.tuning.career.teamTiers)
}
