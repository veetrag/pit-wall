import { describe, it, expect } from 'vitest'
import { loadGameData, UpgradesSchema } from '@data/validators'

describe('upgrades data', () => {
  it('exposes income and escalating tier costs summing to the full-upgrade cost', () => {
    const { upgrades } = loadGameData()
    expect(upgrades.income.perRace).toBe(10)
    expect(upgrades.tierCosts).toEqual([10, 18, 30])
    expect(upgrades.tierCosts.reduce((a, b) => a + b, 0)).toBe(58)
  })

  it('income times a full season covers a meaningful chunk of the max-out cost', () => {
    const { upgrades } = loadGameData()
    const SEASON_RACES = 24
    const seasonIncome = upgrades.income.perRace * SEASON_RACES
    const maxOneAttribute = upgrades.tierCosts.reduce((a, b) => a + b, 0)
    // A season's income should comfortably fund several fully-maxed attributes,
    // not just a fraction of one, and not absurdly all eight at once.
    expect(seasonIncome / maxOneAttribute).toBeGreaterThan(2)
    expect(seasonIncome / maxOneAttribute).toBeLessThan(6)
  })

  it('offers exactly the eight viable attributes', () => {
    const { upgrades } = loadGameData()
    const ids = upgrades.attributes.map(a => a.id).sort()
    expect(ids).toEqual([
      'aero', 'handling', 'pace', 'power', 'racecraft',
      'reliability', 'tyreManagement', 'wetWeather',
    ])
  })

  it('excludes the attributes that are traps or inert', () => {
    const { upgrades } = loadGameData()
    const facets = upgrades.attributes.map(a => a.facet)
    expect(facets).not.toContain('pitCrew')
    expect(facets).not.toContain('consistency')
    expect(facets).not.toContain('experience')
  })

  it('names a real facet for every attribute, split correctly between team and driver', () => {
    const data = loadGameData()
    const teamFacets = Object.keys(data.cars.teams[0]!.facets)
    const driverFacets = Object.keys(data.drivers.drivers[0]!.facets)
    for (const attr of data.upgrades.attributes) {
      const pool = attr.target === 'team' ? teamFacets : driverFacets
      expect(pool).toContain(attr.facet)
    }
  })

  it('pins the exact per-tier point values (regression oracle for balance)', () => {
    const { upgrades } = loadGameData()
    const byId = Object.fromEntries(upgrades.attributes.map(a => [a.id, a.pointsPerTier]))
    expect(byId).toEqual({
      power: 5,
      aero: 3,
      handling: 6,
      pace: 3,
      reliability: 5,
      tyreManagement: 5,
      racecraft: 5,
      wetWeather: 6,
    })
  })

  it('rejects a negative tier cost', () => {
    const { upgrades } = loadGameData()
    const bad = { ...upgrades, tierCosts: [10, -18, 30] }
    expect(() => UpgradesSchema.parse(bad)).toThrow()
  })

  it('rejects a tier list that is missing an entry', () => {
    const { upgrades } = loadGameData()
    const bad = { ...upgrades, tierCosts: [10, 18] }
    expect(() => UpgradesSchema.parse(bad)).toThrow()
  })

  it('rejects an attribute with an unknown target', () => {
    const { upgrades } = loadGameData()
    const bad = {
      ...upgrades,
      attributes: [
        ...upgrades.attributes.slice(1),
        { ...upgrades.attributes[0], target: 'engine' },
      ],
    }
    expect(() => UpgradesSchema.parse(bad)).toThrow()
  })

  it('rejects an attribute with a non-positive pointsPerTier', () => {
    const { upgrades } = loadGameData()
    const bad = {
      ...upgrades,
      attributes: [
        ...upgrades.attributes.slice(1),
        { ...upgrades.attributes[0], pointsPerTier: 0 },
      ],
    }
    expect(() => UpgradesSchema.parse(bad)).toThrow()
  })

  it('rejects a payload with fewer than eight attributes', () => {
    const { upgrades } = loadGameData()
    const bad = { ...upgrades, attributes: upgrades.attributes.slice(0, 7) }
    expect(() => UpgradesSchema.parse(bad)).toThrow()
  })
})
