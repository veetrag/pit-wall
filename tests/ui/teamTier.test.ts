import { describe, it, expect } from 'vitest'
import cars from '@data/cars.json'
import { carRating, teamTierByRank } from '@ui/teamTier'

type Team = { id: string; name: string; archetype: string; facets: Record<string, number>; colorPrimary: string }
const teams = (cars as { teams: Team[] }).teams

// Words in a description that claim a tier.
const CLAIMS: [RegExp, string][] = [
  [/front-runner|benchmark|challenger/i, 'FRONT-RUNNER'],
  [/midfield/i, 'MIDFIELD'],
  [/backmarker|tail of the field/i, 'BACKMARKER'],
]

describe('team tiers', () => {
  it('rating is the rounded facet mean', () => {
    expect(carRating({ a: 90, b: 91 })).toBe(91)
  })
  it('three front-runners, five midfield, two backmarkers', () => {
    const tiers = teams.map(t => teamTierByRank(t.id, teams))
    expect(tiers.filter(t => t === 'FRONT-RUNNER')).toHaveLength(3)
    expect(tiers.filter(t => t === 'BACKMARKER')).toHaveLength(2)
  })
  it.each(teams.map(t => [t.id, t] as const))('%s: description agrees with its tier', (_id, t) => {
    const tier = teamTierByRank(t.id, teams)
    for (const [re, claimed] of CLAIMS) if (re.test(t.archetype)) expect(claimed, t.archetype).toBe(tier)
  })
})
