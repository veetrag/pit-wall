import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { act } from 'react'
import { Development } from '@ui/Development'
import { useSeasonStore } from '@state/seasonStore'
import { loadGameData } from '@data/validators'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

const UPGRADES = loadGameData().upgrades
const TIER1 = UPGRADES.tierCosts[0]!

describe('Development screen', () => {
  beforeEach(() => {
    cleanup()
    useSeasonStore.getState().startNewSeason()
    useSeasonStore.setState({ phase: 'development', playerDriverId: 'd_voss', selectedTeamId: 'apex' })
  })

  it('shows the current DP balance', () => {
    useSeasonStore.setState({ devPoints: 40 })
    render(<Development />)
    expect(screen.getByTestId('dp-balance').textContent).toContain('40')
  })

  it('buys a tier and deducts the cost', () => {
    useSeasonStore.setState({ devPoints: 40 })
    render(<Development />)
    act(() => { screen.getByTestId('buy-power').click() })
    expect(useSeasonStore.getState().purchasedTiers['power']).toBe(1)
    expect(useSeasonStore.getState().devPoints).toBe(40 - TIER1)
    // the displayed balance follows the store
    expect(screen.getByTestId('dp-balance').textContent).toContain(String(40 - TIER1))
  })

  it('disables a tier the player cannot afford', () => {
    useSeasonStore.setState({ devPoints: TIER1 - 1 })
    render(<Development />)
    const buy = screen.getByTestId('buy-power')
    expect(buy.hasAttribute('disabled')).toBe(true)
    act(() => { buy.click() })
    expect(useSeasonStore.getState().purchasedTiers['power'] ?? 0).toBe(0)
    expect(useSeasonStore.getState().devPoints).toBe(TIER1 - 1)
  })

  it('cannot purchase a maxed attribute even with points to spare', () => {
    useSeasonStore.setState({ devPoints: 999, purchasedTiers: { power: 3 } })
    render(<Development />)
    const buy = screen.getByTestId('buy-power')
    expect(buy.hasAttribute('disabled')).toBe(true)
    act(() => { buy.click() })
    expect(useSeasonStore.getState().purchasedTiers['power']).toBe(3)
    expect(useSeasonStore.getState().devPoints).toBe(999)
  })

  it('distinguishes maxed from unaffordable in text, not colour alone', () => {
    useSeasonStore.setState({ devPoints: 0, purchasedTiers: { power: 3 } })
    render(<Development />)
    // maxed: says so
    expect(screen.getByTestId('buy-power').textContent).toMatch(/MAX/i)
    // unaffordable but not maxed: says how short the player is, not "MAX"
    const aero = screen.getByTestId('buy-aero')
    expect(aero.textContent).not.toMatch(/MAX/i)
    expect(aero.textContent).toMatch(/NEED/i)
  })

  // Fix 2: a tier whose facet is already at its ceiling grants literally
  // nothing, but "tiers remaining" was the only maxed test, so the row stayed
  // enabled and sold it at full price. Probed live on Apex: aero T3 for 30 DP
  // showing "-0.00s/lap", reliability T2 for 18 DP re-advertising a benefit
  // already fully owned — 78 DP (nearly eight races of income) for nothing.
  it('refuses to sell a tier that would grant nothing', () => {
    // aero 95 with facetMax 100 and +3/tier: two tiers reach 100 (95+6=101 ->
    // 100), so the third tier moves the facet not at all.
    useSeasonStore.setState({ devPoints: 999, purchasedTiers: { aero: 2 } })
    render(<Development />)
    const buy = screen.getByTestId('buy-aero')
    expect(buy.hasAttribute('disabled')).toBe(true)
    act(() => { buy.click() })
    expect(useSeasonStore.getState().purchasedTiers['aero']).toBe(2)
    expect(useSeasonStore.getState().devPoints).toBe(999)
  })

  it('distinguishes spent-out from both maxed and unaffordable, without colour', () => {
    useSeasonStore.setState({ devPoints: 999, purchasedTiers: { aero: 2, power: 3 } })
    render(<Development />)
    const spentOut = screen.getByTestId('buy-aero').textContent ?? ''
    const maxed = screen.getByTestId('buy-power').textContent ?? ''
    // three distinct wordings, none of them shared
    expect(spentOut).not.toMatch(/MAX/i)
    expect(spentOut).not.toMatch(/NEED/i)
    // and it must not still read as a purchase offer
    expect(spentOut).not.toMatch(/BUY T/i)
    expect(maxed).toMatch(/MAX/i)
    expect(spentOut.trim().length).toBeGreaterThan(0)
    expect(spentOut).not.toBe(maxed)
  })

  it('tells a screen reader that a spent-out tier grants nothing', () => {
    useSeasonStore.setState({ devPoints: 999, purchasedTiers: { aero: 2 } })
    render(<Development />)
    const label = screen.getByTestId('buy-aero').getAttribute('aria-label') ?? ''
    expect(label).toMatch(/no|nothing/i)
    // and it must NOT read as a purchasable offer
    expect(label).not.toMatch(/^Buy /)
  })

  it('shows a lap-time consequence rather than a raw facet number', () => {
    useSeasonStore.setState({ devPoints: 999 })
    render(<Development />)
    const line = screen.getByTestId('effect-power').textContent ?? ''
    expect(line).toMatch(/s\/lap/)
    expect(line).not.toMatch(/\+\s*\d+\s*(power|aero|facet)/i)
  })

  it('labels each buy control for a screen reader', () => {
    useSeasonStore.setState({ devPoints: 999 })
    render(<Development />)
    const attr = UPGRADES.attributes.find(a => a.id === 'power')!
    const label = screen.getByTestId('buy-power').getAttribute('aria-label') ?? ''
    expect(label).toContain(attr.label)
    expect(label).toContain(String(TIER1))
  })

  it('announces the balance to assistive tech', () => {
    render(<Development />)
    expect(screen.getByTestId('dp-balance').getAttribute('role')).toBe('status')
  })

  it('makes rival development visible', () => {
    useSeasonStore.setState({ rivalDevelopment: { meridian: 9, terra: 12 } })
    render(<Development />)
    expect(screen.getByTestId('rival-development')).toBeTruthy()
  })

  it('skipping banks the points and starts the race', () => {
    useSeasonStore.setState({ devPoints: 40 })
    render(<Development />)
    act(() => { screen.getByTestId('to-race').click() })
    expect(useSeasonStore.getState().phase).toBe('race_setup')
    expect(useSeasonStore.getState().devPoints).toBe(40)
  })

  it('offers exactly the attributes in the data, and no others', () => {
    render(<Development />)
    for (const attr of UPGRADES.attributes) {
      expect(screen.getByTestId(`buy-${attr.id}`)).toBeTruthy()
    }
    expect(screen.queryByTestId('buy-pitCrew')).toBeNull()
    expect(screen.queryByTestId('buy-consistency')).toBeNull()
    expect(screen.queryByTestId('buy-experience')).toBeNull()
  })
})

describe('development phase routing', () => {
  beforeEach(() => { cleanup(); useSeasonStore.getState().startNewSeason() })

  it('nextRace mid-season lands on development, not race_setup', () => {
    useSeasonStore.setState({ phase: 'result', raceIndex: 2, playerDriverId: 'd_voss' })
    act(() => { useSeasonStore.getState().nextRace() })
    expect(useSeasonStore.getState().phase).toBe('development')
    expect(useSeasonStore.getState().raceIndex).toBe(3)
  })

  it('confirmDriver routes round 1 through development too', () => {
    useSeasonStore.getState().selectTeam('apex')
    useSeasonStore.getState().confirmTeam()
    useSeasonStore.getState().selectDriver('d_voss')
    act(() => { useSeasonStore.getState().confirmDriver() })
    expect(useSeasonStore.getState().phase).toBe('development')
  })

  it('toRaceSetup advances without touching points', () => {
    useSeasonStore.setState({ phase: 'development', devPoints: 17 })
    act(() => { useSeasonStore.getState().toRaceSetup() })
    expect(useSeasonStore.getState().phase).toBe('race_setup')
    expect(useSeasonStore.getState().devPoints).toBe(17)
  })
})
