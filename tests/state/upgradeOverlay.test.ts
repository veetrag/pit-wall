import { describe, it, expect, vi } from 'vitest'
import { applyUpgrades, rivalFacetValue } from '@state/upgradeOverlay'
import { useRaceStore } from '@state/raceStore'
import { loadGameData } from '@data/validators'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

const ATTRS = loadGameData().upgrades.attributes

function ent(id: string, facets: Record<string, number>) { return { id, facets } }

describe('applyUpgrades', () => {
  it('adds pointsPerTier for each owned tier', () => {
    // power is +5 per tier; 2 tiers = +10
    const out = applyUpgrades([ent('apex', { power: 82, aero: 95 })], {
      attributes: ATTRS, purchasedTiers: { power: 2 }, target: 'team',
      appliesTo: () => true,
    })
    expect(out[0]!.facets.power).toBe(92)
    expect(out[0]!.facets.aero).toBe(95)
  })

  it('never mutates the input', () => {
    const original = ent('apex', { power: 82 })
    const snapshot = { ...original.facets }
    const out = applyUpgrades([original], {
      attributes: ATTRS, purchasedTiers: { power: 3 }, target: 'team',
      appliesTo: () => true,
    })
    expect(original.facets).toEqual(snapshot)
    expect(out[0]!.facets).not.toBe(original.facets)
    expect(out[0]).not.toBe(original)
  })

  it('applies only to entities that pass appliesTo', () => {
    const out = applyUpgrades(
      [ent('apex', { power: 82 }), ent('zenith', { power: 66 })],
      {
        attributes: ATTRS, purchasedTiers: { power: 1 }, target: 'team',
        appliesTo: t => t.id === 'apex',
      },
    )
    expect(out[0]!.facets.power).toBe(87)
    expect(out[1]!.facets.power).toBe(66)
  })

  it('ignores attributes belonging to the other target', () => {
    // pace is a driver attribute; it must not touch a team's facets.
    const out = applyUpgrades([ent('apex', { power: 92 })], {
      attributes: ATTRS, purchasedTiers: { pace: 3 }, target: 'team',
      appliesTo: () => true,
    })
    expect(out[0]!.facets.power).toBe(92)
    expect(out[0]!.facets['pace']).toBeUndefined()
  })

  it('adds rival development to teams other than the player', () => {
    const out = applyUpgrades([ent('terra', { power: 70, aero: 71, handling: 72 })], {
      attributes: ATTRS, purchasedTiers: {}, target: 'team',
      appliesTo: () => false,
      rivalDevelopment: { terra: 9 },
    })
    // 9 points spread evenly across power/aero/handling = +3 each
    expect(out[0]!.facets.power).toBe(73)
    expect(out[0]!.facets.aero).toBe(74)
    expect(out[0]!.facets.handling).toBe(75)
  })

  it('does not give rival development to the player team', () => {
    const out = applyUpgrades([ent('apex', { power: 70, aero: 71, handling: 72 })], {
      attributes: ATTRS, purchasedTiers: {}, target: 'team',
      appliesTo: () => true,
      rivalDevelopment: { apex: 9 },
    })
    expect(out[0]!.facets).toEqual({ power: 70, aero: 71, handling: 72 })
  })

  it('clamps purchased facets to 100', () => {
    const out = applyUpgrades([ent('apex', { power: 98 })], {
      attributes: ATTRS, purchasedTiers: { power: 3 }, target: 'team',
      appliesTo: () => true,
    })
    // facetToRating9 would go negative above 100, inverting the pace benefit.
    expect(out[0]!.facets.power).toBe(100)
  })

  it('clamps every facet of a fully upgraded strong team to 100', () => {
    const apex = loadGameData().cars.teams.find(t => t.id === 'apex')!
    const out = applyUpgrades([{ id: apex.id, facets: { ...apex.facets } }], {
      attributes: ATTRS,
      purchasedTiers: { power: 3, aero: 3, handling: 3, reliability: 3 },
      target: 'team',
      appliesTo: () => true,
    })
    for (const v of Object.values(out[0]!.facets)) {
      expect(v).toBeLessThanOrEqual(100)
      expect(v).toBeGreaterThan(0)
    }
  })

  it('clamps a full 12-race rival pool for the strongest team', () => {
    const { poolPerRace, facets } = loadGameData().upgrades.rivalDevelopment
    const apex = loadGameData().cars.teams.find(t => t.id === 'apex')!
    const pool = poolPerRace * (apex.developmentRate ?? 1) * facets.length * 12
    // sanity: unclamped this really would breach 100, so the clamp is exercised
    expect(apex.facets.aero + pool / facets.length).toBeGreaterThan(100)
    const out = applyUpgrades([{ id: apex.id, facets: { ...apex.facets } }], {
      attributes: ATTRS, purchasedTiers: {}, target: 'team',
      appliesTo: () => false,
      rivalDevelopment: { apex: pool },
    })
    for (const v of Object.values(out[0]!.facets)) expect(v).toBeLessThanOrEqual(100)
  })

  it('ignores unknown attribute ids and out-of-range tier counts', () => {
    const out = applyUpgrades([ent('apex', { power: 80, aero: 80 })], {
      attributes: ATTRS,
      purchasedTiers: { notAnAttribute: 3, power: -2, aero: 99 },
      target: 'team',
      appliesTo: () => true,
    })
    expect(out[0]!.facets.power).toBe(80)   // negative tiers ignored
    expect(out[0]!.facets.aero).toBe(100)   // absurd tier count still clamped
    expect(Object.keys(out[0]!.facets).sort()).toEqual(['aero', 'power'])
  })

  it('with zero purchased tiers and no rival pool, returns the input untouched', () => {
    const input = [ent('apex', { power: 92, aero: 95 }), ent('terra', { power: 70 })]
    const out = applyUpgrades(input, {
      attributes: ATTRS, purchasedTiers: {}, target: 'team', appliesTo: t => t.id === 'apex',
    })
    expect(out).toEqual(input)
  })
})

describe('rivalFacetValue', () => {
  it('splits the pool across three facets', () => {
    expect(rivalFacetValue(70, 9)).toBe(73)
  })

  it('clamps at 100', () => {
    expect(rivalFacetValue(96, 36)).toBe(100)
  })
})

// The most important tests in this task: proof that the overlay cannot leak
// upgrades into a later race via loadGameData()'s shared objects.
describe('buildConfig overlay wiring', () => {
  const store = () => useRaceStore.getState()

  function facetsFor(teamId: string) {
    const cfg = store().config!
    return cfg.teams.find(t => t.id === teamId)!.facets
  }

  it('applies car upgrades to both of the player team cars, not to rivals', () => {
    store().startSeasonRace('d_voss', 42, 'bengaluru', 'rookie', null, {
      purchasedTiers: { handling: 2 }, // +6/tier => +12, clamped at 100
    })
    const cfg = store().config!
    const apex = cfg.teams.find(t => t.id === 'apex')!
    const raw = loadGameData().cars.teams.find(t => t.id === 'apex')!
    expect(apex.facets.handling).toBe(Math.min(100, raw.facets.handling + 12))
    // Both apex cars share the team entry, so both drivers get it.
    const apexDrivers = cfg.drivers.filter(d => d.teamId === 'apex')
    expect(apexDrivers).toHaveLength(2)
    for (const d of apexDrivers) {
      expect(cfg.teams.find(t => t.id === d.teamId)!.facets.handling).toBe(apex.facets.handling)
    }
    // A rival team with no dev pool is untouched.
    const rawTerra = loadGameData().cars.teams.find(t => t.id === 'terra')!
    expect(facetsFor('terra')).toEqual(rawTerra.facets)
  })

  it('applies driver upgrades only to the player driver, not the teammate', () => {
    store().startSeasonRace('d_voss', 42, 'bengaluru', 'rookie', null, {
      purchasedTiers: { tyreManagement: 2 }, // +5/tier => +10
    })
    const cfg = store().config!
    const raw = loadGameData().drivers.drivers
    const voss = cfg.drivers.find(d => d.id === 'd_voss')!
    const chen = cfg.drivers.find(d => d.id === 'd_chen')!
    const rawVoss = raw.find(d => d.id === 'd_voss')!
    const rawChen = raw.find(d => d.id === 'd_chen')!
    expect(voss.facets.tyreManagement).toBe(Math.min(100, rawVoss.facets.tyreManagement + 10))
    expect(chen.facets).toEqual(rawChen.facets)
  })

  // Kept as a regression guard on buildConfig's output, but note it is NOT
  // what proves the copy: loadGameData() does not memoise today, so each build
  // parses fresh objects and this would pass even against an overlay that
  // mutated its input. The real proof is the `input isolation` suite below,
  // which holds one loadGameData() result and asserts applyUpgrades never
  // writes through it. This test becomes load-bearing the day loadGameData()
  // is memoised.
  it('builds a plain, un-upgraded config after an upgraded one', () => {
    store().startSeasonRace('d_voss', 42, 'bengaluru', 'rookie', null, {
      purchasedTiers: { power: 3, pace: 3 },
      rivalDevelopment: { terra: 12 },
    })
    store().startSeasonRace('d_voss', 42, 'bengaluru', 'rookie', null)
    const plain = store().config!
    const rawTeams = loadGameData().cars.teams
    const rawDrivers = loadGameData().drivers.drivers
    for (const t of plain.teams) {
      expect(t.facets).toEqual(rawTeams.find(r => r.id === t.id)!.facets)
    }
    for (const d of plain.drivers) {
      expect(d.facets).toEqual(rawDrivers.find(r => r.id === d.id)!.facets)
    }
  })

  it('applies no overlay at all when playerDriverId matches no driver', () => {
    // playerTeamId falls back to '' for an unknown driver, so every team fails
    // appliesTo. Without the overlayActive guard the player's own team would
    // then take the *rival* branch: purchases discarded and a rival pool
    // applied to the player's car. A bad id must be a no-op, not an inversion.
    store().startSeasonRace('NOPE', 42, 'bengaluru', 'rookie', null, {
      purchasedTiers: { power: 3, pace: 3 },
      rivalDevelopment: { apex: 30, terra: 30 },
    })
    const cfg = store().config!
    const rawTeams = loadGameData().cars.teams
    const rawDrivers = loadGameData().drivers.drivers
    for (const t of cfg.teams) {
      expect(t.facets).toEqual(rawTeams.find(r => r.id === t.id)!.facets)
    }
    for (const d of cfg.drivers) {
      expect(d.facets).toEqual(rawDrivers.find(r => r.id === d.id)!.facets)
    }
  })

  it('an overlay with nothing purchased is equivalent to no overlay', () => {
    store().startSeasonRace('d_voss', 42, 'bengaluru', 'rookie', null)
    const plain = store().config!
    const plainTeams = plain.teams.map(t => ({ ...t, facets: { ...t.facets } }))
    const plainDrivers = plain.drivers.map(d => ({ ...d, facets: { ...d.facets } }))

    store().startSeasonRace('d_voss', 42, 'bengaluru', 'rookie', null, {
      purchasedTiers: {}, rivalDevelopment: {},
    })
    const overlaid = store().config!
    expect(overlaid.teams).toEqual(plainTeams)
    expect(overlaid.drivers).toEqual(plainDrivers)
  })
})

// The proof that applyUpgrades never writes through its input. Unlike the
// buildConfig tests above, these hold a SINGLE loadGameData() result and reuse
// it, so they fail if the copy in applyUpgrades is removed — regardless of
// whether the loader memoises.
describe('input isolation', () => {
  it('leaves one held result untouched across repeated, differing calls', () => {
    const data = loadGameData()
    const teams = data.cars.teams
    const apex = teams.find(t => t.id === 'apex')!
    const apexFacets = apex.facets
    const before = structuredClone(teams)

    applyUpgrades(teams, {
      attributes: ATTRS, purchasedTiers: { power: 3, aero: 3, handling: 3 }, target: 'team',
      appliesTo: t => t.id === 'apex', rivalDevelopment: { terra: 30, zenith: 12 },
    })
    applyUpgrades(teams, {
      attributes: ATTRS, purchasedTiers: { handling: 2 }, target: 'team',
      appliesTo: t => t.id === 'terra', rivalDevelopment: { apex: 30 },
    })

    // Identity preserved at array, entity and nested-facets level...
    expect(teams).toBe(data.cars.teams)
    expect(teams.find(t => t.id === 'apex')!).toBe(apex)
    expect(apex.facets).toBe(apexFacets)
    // ...and every value too.
    expect(structuredClone(teams)).toEqual(before)
  })

  it('gives a second call the same result as if it had run first', () => {
    // The sharpest form of the invariant: if call 1 wrote through the shared
    // input, call 2 would compound on top of call 1's deltas.
    const teams = loadGameData().cars.teams
    const opts = {
      attributes: ATTRS, purchasedTiers: { power: 3 }, target: 'team' as const,
      appliesTo: (t: { id: string }) => t.id === 'apex',
      rivalDevelopment: { terra: 30 },
    }
    const alone = structuredClone(applyUpgrades(teams, opts).map(t => t.facets))
    applyUpgrades(teams, {
      ...opts, purchasedTiers: { aero: 3, handling: 3 }, rivalDevelopment: { terra: 60, apex: 0 },
    })
    expect(applyUpgrades(teams, opts).map(t => t.facets)).toEqual(alone)
  })

  it('returns objects unreachable from the input, at every level', () => {
    const drivers = loadGameData().drivers.drivers
    const out = applyUpgrades(drivers, {
      attributes: ATTRS, purchasedTiers: { pace: 1 }, target: 'driver',
      appliesTo: d => d.id === 'd_voss',
    })
    expect(out).not.toBe(drivers)
    for (const [i, d] of drivers.entries()) {
      // Untouched entities are copied too: returning them by reference would
      // hand the caller live aliases into its own input.
      expect(out[i]).not.toBe(d)
      expect(out[i]!.facets).not.toBe(d.facets)
    }
  })

  it('spreads a rival pool across exactly the facets named in upgrades.json', () => {
    // Pins the spread to data, not to a hardcoded list in upgradeOverlay.ts.
    // Accrual (seasonStore) multiplies by facets.length and application divides
    // by it; a hardcoded list on either side desynchronises the round trip and
    // silently rescales every rival's development.
    const { facets } = loadGameData().upgrades.rivalDevelopment
    const base: Record<string, number> = {
      power: 50, aero: 50, handling: 50, reliability: 50, pitCrew: 50,
    }
    const pool = facets.length * 4
    const out = applyUpgrades([{ id: 'terra', facets: base }], {
      attributes: ATTRS, purchasedTiers: {}, target: 'team',
      appliesTo: () => false, rivalDevelopment: { terra: pool },
    })
    for (const [facet, value] of Object.entries(out[0]!.facets)) {
      expect(value).toBe(facets.includes(facet as never) ? 54 : 50)
    }
  })
})
