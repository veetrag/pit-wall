import { describe, it, expect } from 'vitest'
import { loadGameData, UpgradesSchema } from '@data/validators'
import { TOTAL_RACES } from '@state/seasonStore'

describe('upgrades data', () => {
  it('exposes income and escalating tier costs summing to the full-upgrade cost', () => {
    const { upgrades } = loadGameData()
    expect(upgrades.income.perRace).toBe(10)
    expect(upgrades.tierCosts).toEqual([10, 18, 27])
    expect(upgrades.tierCosts.reduce((a, b) => a + b, 0)).toBe(55)
  })

  it('makes the real budget exactly two full max-outs, with nothing stranded', () => {
    // THE ECONOMY INVARIANT. Income is awarded in recordRaceResult, i.e. AFTER
    // each race, while spending happens on the development screen BEFORE each
    // race — so the last race's income is never spendable and the real budget is
    // `perRace * (TOTAL_RACES - 1)`, not `perRace * TOTAL_RACES`.
    //
    // At 10/race over 12 rounds that is 110. The lever chosen to make 110 land
    // cleanly was tierCosts (30 -> 27, so a max-out costs 55): income stays a
    // round 10 and the escalating 1x / 1.8x / 2.7x shape is preserved. 110 is
    // now EXACTLY two max-outs, so nothing is structurally unspendable and
    // "which two of the five do I commit to" is the real decision. Before this,
    // 110 against 58-per-max-out reached neither 58+58 (116) nor 58+28+30 (116),
    // stranding 24 of the 110 and 34 of the advertised 120.
    const { upgrades } = loadGameData()
    const maxOut = upgrades.tierCosts.reduce((a, b) => a + b, 0)
    const budget = upgrades.income.perRace * (TOTAL_RACES - 1)
    expect(budget).toBe(2 * maxOut)
    // ...and three max-outs must stay out of reach, or there is no choice left.
    expect(budget).toBeLessThan(3 * maxOut)
  })

  it('offers exactly the five attributes that measurably change a race', () => {
    const { upgrades } = loadGameData()
    const ids = upgrades.attributes.map(a => a.id).sort()
    expect(ids).toEqual(['aero', 'handling', 'pace', 'power', 'reliability'])
  })

  it('excludes the attributes that are traps or inert', () => {
    const { upgrades } = loadGameData()
    const facets: string[] = upgrades.attributes.map(a => a.facet)
    // Never wired to an outcome:
    expect(facets).not.toContain('pitCrew')
    expect(facets).not.toContain('consistency')
    expect(facets).not.toContain('experience')
    // Withdrawn after measurement (task-7-report.md Q5): racecraft is worth
    // exactly zero because engine overtakes never change raceTime; wetWeather
    // fires once in 72 races; tyreManagement is 6.7% of power's value.
    expect(facets).not.toContain('racecraft')
    expect(facets).not.toContain('wetWeather')
    expect(facets).not.toContain('tyreManagement')
  })

  it('rejects re-adding a withdrawn attribute to the shop', () => {
    const { upgrades } = loadGameData()
    for (const id of ['racecraft', 'wetWeather', 'tyreManagement']) {
      const bad = {
        ...upgrades,
        attributes: [...upgrades.attributes, { ...upgrades.attributes[0], id, facet: id }],
      }
      expect(() => UpgradesSchema.parse(bad), id).toThrow()
    }
  })

  it('rejects reliability in the rival development spread', () => {
    // A rival pool driving reliability toward 100 makes race.ts's
    // `perLap = base * (1 - reliability/100)` exactly zero, and its
    // `perLap > 0` short-circuit then skips the mechanical-failure roll for
    // every sector — season-long immortality for the whole AI grid, from one
    // array edit. facetMax cannot save this path: it is a facet name, not an
    // attribute, so the schema is the guard.
    const { upgrades } = loadGameData()
    const bad = {
      ...upgrades,
      rivalDevelopment: {
        ...upgrades.rivalDevelopment,
        facets: [...upgrades.rivalDevelopment.facets, 'reliability'],
      },
    }
    expect(() => UpgradesSchema.parse(bad)).toThrow()
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

  it('rejects a payload with fewer than five attributes', () => {
    const { upgrades } = loadGameData()
    const bad = { ...upgrades, attributes: upgrades.attributes.slice(0, 4) }
    expect(() => UpgradesSchema.parse(bad)).toThrow()
  })
})
