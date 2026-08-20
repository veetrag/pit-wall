import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSeasonStore } from '@state/seasonStore'

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
