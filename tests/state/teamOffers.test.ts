import { describe, it, expect } from 'vitest'
import { offerOrder, seasonOffer, boardTarget } from '@state/teamOffers'
import { loadGameData } from '@data/validators'

const OFFERS = { beatBy: 2, stepUp: 2 }
const { order } = offerOrder({})
const at = (i: number) => order[i]!

describe('the offer rule (spec 1.6 §12)', () => {
  it('ranks all ten teams, best first, deterministically', () => {
    expect(order).toHaveLength(loadGameData().cars.teams.length)
    expect(offerOrder({}).order).toEqual(order)
  })

  it('beating the board target by beatBy brings an offer from stepUp places higher', () => {
    const o = seasonOffer({ season: 3, teamId: at(6), deserved: 7, finished: 5, wonTitle: false, tiers: {}, ...OFFERS })
    expect(o).toMatchObject({ season: 3, teamId: at(4), reason: 'constructors', boardTarget: 5 })
    expect(Number.isInteger(o!.rating) && Number.isInteger(o!.currentRating)).toBe(true)
    expect(o!.rating).toBeGreaterThanOrEqual(o!.currentRating)
  })

  it('beating it by one is not enough; the drivers\' title always is', () => {
    expect(seasonOffer({ season: 1, teamId: at(6), deserved: 7, finished: 6, wonTitle: false, tiers: {}, ...OFFERS })).toBeNull()
    expect(seasonOffer({ season: 1, teamId: at(6), deserved: 7, finished: 9, wonTitle: true, tiers: {}, ...OFFERS })).toMatchObject({ teamId: at(4), reason: 'title' })
  })

  it('clamps to the top team, and the top team gets no offer', () => {
    expect(seasonOffer({ season: 1, teamId: at(1), deserved: 5, finished: 1, wonTitle: true, tiers: {}, ...OFFERS })!.teamId).toBe(at(0))
    expect(seasonOffer({ season: 1, teamId: at(0), deserved: 1, finished: 1, wonTitle: true, tiers: {}, ...OFFERS })).toBeNull()
  })

  it('ladder offsets move the order', () => {
    const bottom = at(order.length - 1)
    const boosted = offerOrder({ [bottom]: 3 }).order
    expect(boosted.indexOf(bottom)).toBeLessThan(order.indexOf(bottom))
  })

  it('board target is the deserved constructors\' rank of the player\'s car', () => {
    const t = boardTarget('d_voss', { purchasedTiers: {}, rivalDevelopment: {}, teamTiers: {} })
    expect(t).toBeGreaterThanOrEqual(1)
    expect(t).toBeLessThanOrEqual(10)
    expect(boardTarget('__nobody__', { purchasedTiers: {}, rivalDevelopment: {}, teamTiers: {} })).toBeNull()
  })
})
