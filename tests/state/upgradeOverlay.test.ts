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

  it('never mutates the input — the load cache is shared', () => {
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
    const { poolPerRace, facetSplit } = loadGameData().upgrades.rivalDevelopment
    const apex = loadGameData().cars.teams.find(t => t.id === 'apex')!
    const pool = poolPerRace * (apex.developmentRate ?? 1) * facetSplit * 12
    // sanity: unclamped this really would breach 100, so the clamp is exercised
    expect(apex.facets.aero + pool / 3).toBeGreaterThan(100)
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

  it('does not leak upgrades into a later race built without them', () => {
    store().startSeasonRace('d_voss', 42, 'bengaluru', 'rookie', null, {
      purchasedTiers: { power: 3, pace: 3 },
      rivalDevelopment: { terra: 12 },
    })
    const upgraded = store().config!

    // Second build, same process, no overlay at all.
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

    // Third build after deliberately vandalising the first result: the shared
    // loaded data must not be reachable from the overlay's output.
    const apexUp = upgraded.teams.find(t => t.id === 'apex')!
    ;(apexUp.facets as unknown as Record<string, number>).power = 1
    ;(upgraded.drivers.find(d => d.id === 'd_voss')!.facets as unknown as Record<string, number>).pace = 1
    store().startSeasonRace('d_voss', 42, 'bengaluru', 'rookie', null)
    const third = store().config!
    expect(third.teams.find(t => t.id === 'apex')!.facets.power)
      .toBe(rawTeams.find(t => t.id === 'apex')!.facets.power)
    expect(third.drivers.find(d => d.id === 'd_voss')!.facets.pace)
      .toBe(rawDrivers.find(d => d.id === 'd_voss')!.facets.pace)
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
