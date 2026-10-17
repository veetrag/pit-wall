import { loadGameData } from '@data/validators'
import { effectiveTeams } from './buildRaceConfig'
import { deservedOrder, meanFacet } from './teamLadder'
import type { UpgradeOverlayInput } from './upgradeOverlay'
import type { PendingOffer } from './careerStore'

/**
 * Team offers (spec 1.6 §12). Pure and rng-free. Imports careerStore for a
 * TYPE only, so seasonStore can call it without an ESM cycle.
 */

/** Every team, best first, on authored facets + ladder offsets only -- what next season starts from. */
export function offerOrder(tiers: Readonly<Record<string, number>>): { order: string[]; ratings: Record<string, number> } {
  const data = loadGameData()
  // '__none__' matches no driver: no player purchases, no rival development, offsets still applied.
  const teams = effectiveTeams('__none__', { purchasedTiers: {}, rivalDevelopment: {}, teamTiers: { ...tiers } })
  const ratings = Object.fromEntries(teams.map(t => [t.id, meanFacet(t.facets)]))
  const base = Object.fromEntries(data.cars.teams.map(t => [t.id, meanFacet(t.facets)]))
  return { order: deservedOrder(ratings, base), ratings }
}

/** The board's yardstick: where the player's car, as it stands, deserves to finish in the constructors'. */
export function boardTarget(playerDriverId: string, overlay: UpgradeOverlayInput): number | null {
  const data = loadGameData()
  const team = data.drivers.drivers.find(d => d.id === playerDriverId)?.teamId
  if (!team) return null
  const teams = effectiveTeams(playerDriverId, overlay)
  const ratings = Object.fromEntries(teams.map(t => [t.id, meanFacet(t.facets)]))
  const base = Object.fromEntries(data.cars.teams.map(t => [t.id, meanFacet(t.facets)]))
  const i = deservedOrder(ratings, base).indexOf(team)
  return i < 0 ? null : i + 1
}

export function seasonOffer(a: {
  season: number; teamId: string; deserved: number; finished: number; wonTitle: boolean
  tiers: Readonly<Record<string, number>>; beatBy: number; stepUp: number
}): PendingOffer | null {
  if (!(a.deserved - a.finished >= a.beatBy || a.wonTitle)) return null
  const { order, ratings } = offerOrder(a.tiers)
  const i = order.indexOf(a.teamId)
  if (i <= 0) return null
  const j = Math.max(0, i - a.stepUp)
  const teamId = order[j]!
  return {
    season: a.season, teamId, reason: a.wonTitle ? 'title' : 'constructors',
    boardTarget: j + 1, rating: Math.round(ratings[teamId] ?? 0), currentRating: Math.round(ratings[a.teamId] ?? 0),
  }
}
