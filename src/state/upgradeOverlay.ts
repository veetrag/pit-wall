import type { UpgradeAttribute } from '@data/validators'

// Facets feed facetToRating9() in engine/lapModel.ts as (1 - facet/100) * 9.
// Above 100 that goes negative and the benefit inverts — a facet of 101 makes a
// car *slower*. The ceiling is therefore a correctness bound, not a balance
// choice, which is why it lives in code and not in data/upgrades.json.
const FACET_MAX = 100

// Rival development is spread evenly across the three pace facets rather than
// weighted toward a team's existing strength, so it stays legible and does not
// silently amplify the aero-is-worth-more asymmetry (MODEL_SPEC §4).
const RIVAL_FACETS = ['power', 'aero', 'handling'] as const

/**
 * Converts a raw accumulated development pool for one rival team into the
 * effective value of a single facet, given that facet's un-upgraded base.
 * The pool is a season-long total split evenly across `RIVAL_FACETS`, so it is
 * divided by three here — at the same point a caller would otherwise write
 * `pool / 3` straight onto a facet.
 *
 * Clamped HERE, where the effective facet value is produced, rather than on the
 * raw pool: the pool is not a facet, and clamping it would cap development for
 * every facet the moment any single one hit the ceiling.
 *
 * Lives in this pure module rather than in seasonStore so the dependency
 * direction stays state -> pure-computation (CLAUDE.md §3).
 */
export function rivalFacetValue(baseFacet: number, pool: number): number {
  return Math.min(FACET_MAX, baseFacet + pool / RIVAL_FACETS.length)
}

/**
 * The progression slice `buildConfig` needs, passed in rather than read from
 * seasonStore (see the note at buildConfig). Task 6's development screen can
 * build the same shape from unsaved, previewed tiers to show their effect
 * without touching the store.
 */
export interface UpgradeOverlayInput {
  purchasedTiers: Record<string, number>
  rivalDevelopment?: Record<string, number>
}

/** Any facet-bearing entity: a team from cars.json or a driver from drivers.json. */
export interface FacetEntity {
  id: string
  facets: Record<string, number>
}

export interface UpgradeOverlayOptions<T extends FacetEntity> {
  attributes: UpgradeAttribute[]
  /** attribute id -> tiers owned (0-3). Unknown ids and out-of-range counts are ignored. */
  purchasedTiers: Record<string, number>
  /** Which half of the attribute list this call is applying. */
  target: UpgradeAttribute['target']
  /** True for the entities the player's purchases benefit; false for everyone else. */
  appliesTo: (entity: T) => boolean
  /** team id -> accumulated rival development pool. Only reaches non-`appliesTo` entities. */
  rivalDevelopment?: Record<string, number>
}

/**
 * Applies purchased upgrade tiers (and rival development) as facet deltas,
 * returning brand-new entities with brand-new `facets` objects.
 *
 * This is the ONLY place progression becomes simulation input: the engine
 * receives ordinary facet numbers and never learns that upgrades exist
 * (CLAUDE.md §3, the golden rule).
 *
 * Never mutates its input, and never returns an object reachable from its
 * input. `loadGameData()` hands out shared, cached objects; writing through
 * them would leak one race's upgrades into every later race in the process and
 * destroy determinism. Every entity is copied unconditionally — an
 * "only copy when changed" optimisation would hand the caller live references
 * to the load cache for untouched entities, which is precisely the leak.
 */
export function applyUpgrades<T extends FacetEntity>(
  entities: T[],
  opts: UpgradeOverlayOptions<T>,
): T[] {
  const { attributes, purchasedTiers, target, appliesTo, rivalDevelopment } = opts
  const relevant = attributes.filter(a => a.target === target)

  return entities.map(entity => {
    const facets: Record<string, number> = { ...entity.facets }

    if (appliesTo(entity)) {
      for (const attr of relevant) {
        const tiers = purchasedTiers[attr.id] ?? 0
        if (tiers <= 0) continue
        const base = facets[attr.facet]
        // Absent facet: never introduce a key the data didn't have — the engine
        // reads facets by name and a phantom key would be silently meaningless.
        if (base === undefined) continue
        facets[attr.facet] = Math.min(FACET_MAX, base + tiers * attr.pointsPerTier)
      }
    } else {
      const pool = rivalDevelopment?.[entity.id] ?? 0
      if (pool > 0) {
        for (const facet of RIVAL_FACETS) {
          const base = facets[facet]
          if (base === undefined) continue
          facets[facet] = rivalFacetValue(base, pool)
        }
      }
    }

    return { ...entity, facets }
  })
}
