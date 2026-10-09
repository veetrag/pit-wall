import { describe, it, expect } from 'vitest'
import { buildRaceConfig, effectiveTeams } from '@state/buildRaceConfig'
import { applyUpgrades, facetCeiling } from '@state/upgradeOverlay'
import { loadGameData } from '@data/validators'

const data = loadGameData()
const base = (id: string) => data.cars.teams.find(t => t.id === id)!.facets
const { step, facets } = data.tuning.career.teamTiers

describe('tier offsets on team facets', () => {
  it('adds offset x step to the ladder facets only', () => {
    const terra = effectiveTeams('d_voss', { purchasedTiers: {}, teamTiers: { terra: 2 } })
      .find(t => t.id === 'terra')!.facets
    for (const f of facets) expect(terra[f as 'power'], f).toBe(base('terra')[f as 'power']! + 2 * step)
    expect(terra.reliability).toBe(base('terra').reliability)
    expect(terra.pitCrew).toBe(base('terra').pitCrew)
  })

  it('subtracts for a negative offset', () => {
    const apex = effectiveTeams('d_voss', { purchasedTiers: {}, teamTiers: { apex: -1 } })
      .find(t => t.id === 'apex')!.facets
    expect(apex.power).toBe(base('apex').power - step)
  })

  it('never exceeds the facet ceiling', () => {
    // Meridian power is 98: +9 would be 107, which the engine inverts.
    const meridian = effectiveTeams('d_voss', { purchasedTiers: {}, teamTiers: { meridian: 3 } })
      .find(t => t.id === 'meridian')!.facets
    expect(meridian.power).toBe(facetCeiling('power'))
  })

  it('applies to the player team AND rivals alike', () => {
    // d_voss drives for apex.
    const teams = effectiveTeams('d_voss', { purchasedTiers: {}, teamTiers: { apex: 1, terra: 1 } })
    expect(teams.find(t => t.id === 'apex')!.facets.aero).toBe(Math.min(100, base('apex').aero + step))
    expect(teams.find(t => t.id === 'terra')!.facets.aero).toBe(base('terra').aero + step)
  })

  it('stacks under upgrades and rival development, each clamped', () => {
    const teams = effectiveTeams('d_voss', {
      purchasedTiers: {}, rivalDevelopment: { terra: 3 }, teamTiers: { terra: 1 },
    })
    // rival pool 3 spread over 3 facets = +1 each, on top of +step.
    expect(teams.find(t => t.id === 'terra')!.facets.power).toBe(base('terra').power + step + 1)
  })

  it('buildRaceConfig races the same teams effectiveTeams returns', () => {
    const input = { purchasedTiers: { power: 2 }, rivalDevelopment: { terra: 4 }, teamTiers: { terra: 2, apex: -1 } }
    const config = buildRaceConfig(42, 'd_voss', 'bengaluru', 'rookie', null, input)
    expect(config.teams).toEqual(effectiveTeams('d_voss', input))
  })

  it('without teamTiers, builds exactly what it built before', () => {
    const plain = buildRaceConfig(42, 'd_voss')
    const zeroed = buildRaceConfig(42, 'd_voss', 'bengaluru', 'rookie', null, { purchasedTiers: {}, teamTiers: {} })
    expect(zeroed.teams).toEqual(plain.teams)
  })

  it('does not mutate its input entities', () => {
    const teams = data.cars.teams
    const before = JSON.stringify(teams)
    applyUpgrades(teams, {
      attributes: data.upgrades.attributes, purchasedTiers: {}, target: 'team',
      appliesTo: () => false, teamTiers: { terra: 3 },
    })
    expect(JSON.stringify(teams)).toBe(before)
  })
})
