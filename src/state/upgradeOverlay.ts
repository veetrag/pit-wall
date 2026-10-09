import { loadGameData, type UpgradeAttribute } from '@data/validators'

// Facets feed facetToRating9() in engine/lapModel.ts as (1 - facet/100) * 9.
// Above 100 that goes negative and the benefit inverts — a facet of 101 makes a
// car *slower*. The ceiling is therefore a correctness bound, not a balance
// choice, which is why this one number lives in code and not in upgrades.json.
const FACET_MAX = 100

// WHICH facets a rival's development pool spreads across, and how many ways it
// divides, both come from data/upgrades.json (`rivalDevelopment.facets`) —
// CLAUDE.md §5, the designer balances by editing data. Memoised because
// loadGameData() re-parses eight zod schemas per call and this is read once per
// rival team per race build; the underlying JSON is a static import, so the
// list cannot change within a process and caching it stays deterministic.
let rivalFacetsCache: readonly string[] | null = null
function rivalFacets(): readonly string[] {
  return (rivalFacetsCache ??= loadGameData().upgrades.rivalDevelopment.facets)
}

// The ladder's step and facet list, memoised for the same reason as
// rivalFacets(): the JSON is a static import and cannot change in-process.
let tierTuningCache: { step: number; facets: readonly string[] } | null = null
function tierTuning(): { step: number; facets: readonly string[] } {
  if (tierTuningCache === null) {
    const { step, facets } = loadGameData().tuning.career.teamTiers
    tierTuningCache = { step, facets }
  }
  return tierTuningCache
}

// facet name -> the per-attribute ceiling declared for it in upgrades.json,
// beneath the global FACET_MAX. Memoised for the same reason as rivalFacets().
let facetCeilingCache: Map<string, number> | null = null

/**
 * The ceiling that applies to `facet`: the per-attribute `facetMax` from
 * upgrades.json if one is declared, otherwise the global correctness bound.
 *
 * Exported because BOTH paths need it. The player path reads it off the
 * attribute it is applying; the rival path has only a facet *name* (the pool is
 * spread across `rivalDevelopment.facets`, which are names, not attributes), so
 * it has to look the ceiling up. Before this existed the rival path clamped at
 * the global 100 only — so a `facetMax` that exists precisely because 100
 * removes a mechanic was honoured for the player and silently ignored for the
 * other nine teams.
 */
export function facetCeiling(facet: string): number {
  if (facetCeilingCache === null) {
    facetCeilingCache = new Map()
    for (const attr of loadGameData().upgrades.attributes) {
      if (attr.facetMax !== undefined) facetCeilingCache.set(attr.facet, attr.facetMax)
    }
  }
  return Math.min(FACET_MAX, facetCeilingCache.get(facet) ?? FACET_MAX)
}

/**
 * Converts a raw accumulated development pool for one rival team into the
 * effective value of a single facet, given that facet's un-upgraded base.
 * The pool is a season-long total spread evenly across
 * `rivalDevelopment.facets`, so it is divided by that list's length here — at
 * the same point a caller would otherwise write `pool / n` straight onto a
 * facet. `seasonStore.accumulateRivalDevelopment` multiplies by the same
 * length on accrual, so accrual and application share one source of truth.
 *
 * Clamped HERE, where the effective facet value is produced, rather than on the
 * raw pool: the pool is not a facet, and clamping it would cap development for
 * every facet the moment any single one hit the ceiling.
 *
 * Pass `facet` to have the per-attribute `facetMax` honoured as well as the
 * global bound; omitting it clamps at the global bound only.
 *
 * Lives in this pure module rather than in seasonStore so the dependency
 * direction stays state -> pure-computation (CLAUDE.md §3).
 */
export function rivalFacetValue(
  baseFacet: number,
  pool: number,
  facet?: string,
  facetCount = rivalFacets().length,
): number {
  const ceiling = facet === undefined ? FACET_MAX : facetCeiling(facet)
  return Math.min(ceiling, baseFacet + pool / facetCount)
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
  /** team id -> ladder offset. Career only; absent everywhere else. */
  teamTiers?: Record<string, number>
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
  /**
   * team id -> ladder offset. Applies to EVERY team, player included -- it is
   * the car's base, not a purchase. Only meaningful when target is 'team'.
   */
  teamTiers?: Record<string, number>
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
 * input. This makes the overlay safe *regardless of whether the data loader
 * caches*. As of today `loadGameData()` does NOT cache — it re-runs
 * `zod.parse` on every call and zod constructs fresh objects recursively, so
 * each caller already gets its own copy. But memoising `loadGameData()` is an
 * obvious future optimisation (it re-parses eight schemas per race build), and
 * the day someone does it, an overlay that wrote through its input would leak
 * one race's upgrades into every later race in the process and destroy
 * determinism. The copy is what makes that refactor safe instead of
 * catastrophic. `tests/state/upgradeOverlay.test.ts` asserts the isolation
 * directly against a single held `loadGameData()` result, so it tests this
 * function's contract rather than an incidental property of zod.
 *
 * Every entity is copied unconditionally — an "only copy when changed"
 * optimisation would hand the caller live references to its own input for
 * untouched entities, which is exactly the aliasing this prevents.
 */
export function applyUpgrades<T extends FacetEntity>(
  entities: T[],
  opts: UpgradeOverlayOptions<T>,
): T[] {
  const { attributes, purchasedTiers, target, appliesTo, rivalDevelopment, teamTiers } = opts
  const relevant = attributes.filter(a => a.target === target)
  const spread = rivalFacets()

  return entities.map(entity => {
    const facets: Record<string, number> = { ...entity.facets }

    // The ladder offset is the car's base for this season, so it goes on
    // FIRST; upgrades and rival development stack on top. Clamped here as
    // well as below, because a negative offset must not go under 0 and a
    // positive one must not cross the correctness ceiling on its own.
    const offset = target === 'team' ? (teamTiers?.[entity.id] ?? 0) : 0
    if (offset !== 0) {
      const { step, facets: tierFacets } = tierTuning()
      for (const facet of tierFacets) {
        const v = facets[facet]
        if (v === undefined) continue
        facets[facet] = Math.max(0, Math.min(facetCeiling(facet), v + offset * step))
      }
    }

    if (appliesTo(entity)) {
      for (const attr of relevant) {
        const tiers = purchasedTiers[attr.id] ?? 0
        if (tiers <= 0) continue
        const base = facets[attr.facet]
        // Absent facet: never introduce a key the data didn't have — the engine
        // reads facets by name and a phantom key would be silently meaningless.
        if (base === undefined) continue
        // Per-attribute ceiling beneath the global correctness bound. See
        // UpgradeAttributeSchema.facetMax in data/validators.ts for why
        // reliability must never be allowed to reach exactly 100.
        const ceiling = Math.min(FACET_MAX, attr.facetMax ?? facetCeiling(attr.facet))
        facets[attr.facet] = Math.min(ceiling, base + tiers * attr.pointsPerTier)
      }
    } else {
      const pool = rivalDevelopment?.[entity.id] ?? 0
      if (pool > 0) {
        for (const facet of spread) {
          const base = facets[facet]
          if (base === undefined) continue
          facets[facet] = rivalFacetValue(base, pool, facet, spread.length)
        }
      }
    }

    return { ...entity, facets }
  })
}
