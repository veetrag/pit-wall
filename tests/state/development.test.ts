import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSeasonStore } from '@state/seasonStore'
import { rivalFacetValue } from '@state/upgradeOverlay'
import { loadGameData } from '@data/validators'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

describe('development points', () => {
  beforeEach(() => { useSeasonStore.getState().startNewSeason() })

  it('starts a season with no points and no tiers', () => {
    const s = useSeasonStore.getState()
    expect(s.devPoints).toBe(0)
    expect(s.purchasedTiers['power'] ?? 0).toBe(0)
  })

  it('charges escalating costs and decrements the balance', () => {
    useSeasonStore.setState({ devPoints: 100 })
    const s = () => useSeasonStore.getState()

    expect(s().tierCost('power')).toBe(10)
    s().purchaseTier('power')
    expect(s().devPoints).toBe(90)
    expect(s().purchasedTiers['power']).toBe(1)

    expect(s().tierCost('power')).toBe(18)
    s().purchaseTier('power')
    expect(s().devPoints).toBe(72)

    expect(s().tierCost('power')).toBe(30)
    s().purchaseTier('power')
    expect(s().devPoints).toBe(42)
    expect(s().purchasedTiers['power']).toBe(3)
  })

  it('refuses a fourth tier', () => {
    useSeasonStore.setState({ devPoints: 200, purchasedTiers: { power: 3 } })
    expect(useSeasonStore.getState().tierCost('power')).toBeNull()
    useSeasonStore.getState().purchaseTier('power')
    expect(useSeasonStore.getState().purchasedTiers['power']).toBe(3)
    expect(useSeasonStore.getState().devPoints).toBe(200)
  })

  it('refuses a purchase the player cannot afford', () => {
    useSeasonStore.setState({ devPoints: 9 })
    expect(useSeasonStore.getState().canAfford('power')).toBe(false)
    useSeasonStore.getState().purchaseTier('power')
    expect(useSeasonStore.getState().purchasedTiers['power'] ?? 0).toBe(0)
    expect(useSeasonStore.getState().devPoints).toBe(9)
  })

  it('refuses buying tier 2 before tier 1 is owned', () => {
    useSeasonStore.setState({ devPoints: 100, purchasedTiers: {} })
    // tierCost always returns the *next* tier's cost based on owned count,
    // so there's no way to "skip" to tier 2 — purchaseTier always buys the
    // next sequential tier. Confirm that repeated purchases go 1,2,3 in order.
    const s = () => useSeasonStore.getState()
    s().purchaseTier('power')
    expect(s().purchasedTiers['power']).toBe(1)
    s().purchaseTier('power')
    expect(s().purchasedTiers['power']).toBe(2)
  })

  it('rejects an unknown attribute id as a no-op', () => {
    useSeasonStore.setState({ devPoints: 100 })
    const s = () => useSeasonStore.getState()
    expect(s().tierCost('doesNotExist')).toBeNull()
    expect(s().canAfford('doesNotExist')).toBe(false)
    s().purchaseTier('doesNotExist')
    expect(s().devPoints).toBe(100)
    expect(s().purchasedTiers['doesNotExist']).toBeUndefined()
  })

  it('cannot buy two attributes to max on one season of income', () => {
    // 12 races x 10 DP = 120 DP; maxing one attribute costs 58.
    useSeasonStore.setState({ devPoints: 120 })
    const s = () => useSeasonStore.getState()
    for (const id of ['power', 'aero']) for (let i = 0; i < 3; i++) s().purchaseTier(id)
    expect(s().devPoints).toBe(120 - 58 - 58)
    // ...and a third attribute is then unaffordable, forcing specialisation.
    expect(s().canAfford('handling')).toBe(false)
  })

  it('clears everything on a new season', () => {
    useSeasonStore.setState({ devPoints: 50, purchasedTiers: { power: 2 }, rivalDevelopment: { terra: 6 } })
    useSeasonStore.getState().startNewSeason()
    const s = useSeasonStore.getState()
    expect(s.devPoints).toBe(0)
    expect(s.purchasedTiers).toEqual({})
    expect(s.rivalDevelopment).toEqual({})
  })

  it('clears everything on playAgain', () => {
    useSeasonStore.setState({ devPoints: 50, purchasedTiers: { power: 2 }, rivalDevelopment: { terra: 6 } })
    useSeasonStore.getState().playAgain()
    const s = useSeasonStore.getState()
    expect(s.devPoints).toBe(0)
    expect(s.purchasedTiers).toEqual({})
    expect(s.rivalDevelopment).toEqual({})
  })
})

describe('development income', () => {
  beforeEach(() => { useSeasonStore.getState().startNewSeason() })

  function finishRace(position: number, retired = false) {
    useSeasonStore.getState().recordRaceResult(
      [{ driverId: 'd_voss', position, retired }],
      { overtakesGained: 0, pitsDone: 1, hadRain: false },
    )
  }

  it('pays the flat rate for a win', () => {
    finishRace(1)
    expect(useSeasonStore.getState().devPoints).toBe(10)
  })

  it('pays the same flat rate for a poor finish', () => {
    // Flat income is deliberate: position-based income compounds an existing
    // advantage and makes the underdog run impossible. See spec section 2.
    finishRace(18)
    expect(useSeasonStore.getState().devPoints).toBe(10)
  })

  it('pays the same flat rate for a DNF', () => {
    finishRace(20, true)
    expect(useSeasonStore.getState().devPoints).toBe(10)
  })

  it('accumulates unspent points across rounds', () => {
    finishRace(1); finishRace(5); finishRace(9)
    expect(useSeasonStore.getState().devPoints).toBe(30)
  })
})

describe('rival development', () => {
  beforeEach(() => { useSeasonStore.getState().startNewSeason() })

  function finishRace() {
    useSeasonStore.getState().recordRaceResult(
      [{ driverId: 'd_voss', position: 1, retired: false }],
      { overtakesGained: 0, pitsDone: 1, hadRain: false },
    )
  }

  it('develops rivals in proportion to developmentRate', () => {
    finishRace()
    const dev = useSeasonStore.getState().rivalDevelopment
    // Terra 1.4 develops fastest, Apex 1.0 slowest.
    expect(dev['terra']!).toBeGreaterThan(dev['apex']!)
  })

  it('accumulates across the season', () => {
    finishRace()
    const afterOne = useSeasonStore.getState().rivalDevelopment['terra']!
    finishRace()
    expect(useSeasonStore.getState().rivalDevelopment['terra']!).toBeGreaterThan(afterOne)
  })

  it('is deterministic — no RNG', () => {
    finishRace()
    const first = { ...useSeasonStore.getState().rivalDevelopment }
    useSeasonStore.getState().startNewSeason()
    finishRace()
    expect(useSeasonStore.getState().rivalDevelopment).toEqual(first)
  })

  it('clamps the effective facet value at 100 even for the strongest team after a full season', () => {
    // Apex starts near the top of every team facet (power 92, aero 95,
    // handling 90, reliability 96). A full 12-race season's worth of pooled
    // development, applied naively on top of those bases, would push aero
    // and reliability past 100 — which `facetToRating9` would then treat as
    // a *penalty* instead of a bonus. rivalFacetValue must clamp per-facet.
    for (let i = 0; i < 12; i++) finishRace()
    const pool = useSeasonStore.getState().rivalDevelopment['apex']!
    for (const base of [92, 95, 90, 96]) {
      expect(rivalFacetValue(base, pool)).toBeLessThanOrEqual(100)
    }
    // sanity: the unclamped version really would have exceeded 100, so this
    // test is actually exercising the clamp and not vacuously passing.
    expect(96 + pool / 3).toBeGreaterThan(100)
  })

  it('reads pool size and facet split from upgrades.json, not a hardcoded constant', () => {
    // Pins rivalDevelopment's per-race pool contribution to the JSON's
    // poolPerRace / facets.length values, the same way the income test pins
    // `perRace` — a careless edit to data/upgrades.json (or a regression back
    // to a hardcoded constant in seasonStore.ts) must fail this loudly.
    const { poolPerRace, facets } = loadGameData().upgrades.rivalDevelopment
    finishRace()
    const apexRate = loadGameData().cars.teams.find(t => t.id === 'apex')!.developmentRate ?? 1.0
    expect(useSeasonStore.getState().rivalDevelopment['apex']).toBeCloseTo(poolPerRace * apexRate * facets.length)
  })
})
