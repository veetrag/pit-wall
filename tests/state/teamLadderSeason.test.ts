import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSeasonStore, TOTAL_RACES } from '@state/seasonStore'
import { useCareerStore, escalateRivals } from '@state/careerStore'
import { buildRaceConfig, effectiveTeams } from '@state/buildRaceConfig'
import { settleSeason, meanFacet } from '@state/teamLadder'
import { loadGameData } from '@data/validators'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

const data = loadGameData()
// Every driver, ordered so terra's pair (a weak car) tops the table: a clear
// over-performance the ladder must reward.
const terraDrivers = data.drivers.drivers.filter(d => d.teamId === 'terra').map(d => d.id)
const others = data.drivers.drivers.filter(d => d.teamId !== 'terra').map(d => d.id)
const standings = [...terraDrivers, ...others].map((driverId, i) => ({ driverId, points: 400 - i * 10 }))
const player = terraDrivers[0]!

function atFinalRound() {
  useCareerStore.getState().beginCareer()
  useSeasonStore.setState({
    phase: 'result', playerDriverId: player, selectedTeamId: 'terra',
    raceIndex: TOTAL_RACES - 1, standings, purchasedTiers: { power: 2 },
    rivalDevelopment: { apex: 12, meridian: 12 }, devPoints: 0, lastLadder: null,
  })
}

beforeEach(atFinalRound)

describe('settling the ladder at season end', () => {
  it('moves the over-performing team up when the season is banked', () => {
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().phase).toBe('championship')
    expect(useCareerStore.getState().teamTiers.terra).toBe(1)
    const move = useSeasonStore.getState().lastLadder!.find(m => m.teamId === 'terra')!
    expect(move.finished).toBe(1)
    expect(move.after).toBe(1)
  })

  it('settles only once per season, however often the path is re-entered', () => {
    useSeasonStore.getState().nextRace()
    useSeasonStore.setState({ raceIndex: TOTAL_RACES - 1 })
    useSeasonStore.getState().nextRace()
    expect(useCareerStore.getState().teamTiers.terra).toBe(1)
  })

  it('judges the cars the season was raced with', () => {
    // The coupling the spec warns about: deserved rank must come from the
    // same overlay that built the races, including end-of-season rival pools.
    const s = useSeasonStore.getState()
    const overlay = s.overlayInput()
    const config = buildRaceConfig(42, player, 'bengaluru', 'rookie', null, overlay)
    expect(config.teams).toEqual(effectiveTeams(player, overlay))
    const ratings = Object.fromEntries(config.teams.map(t => [t.id, meanFacet(t.facets as unknown as Record<string, number>)]))
    const r = settleSeason({ standings, playerDriverId: player, overlay, tiers: {} })
    const deservedFirst = r.moves.reduce((best, m) => (m.deserved < best.deserved ? m : best)).teamId
    const topRated = Object.entries(ratings).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0]
    expect(deservedFirst).toBe(topRated)
  })
})

describe('the season boundary', () => {
  it('settles BEFORE erosion and the rival reset', () => {
    // If settlement ran after the reset, rivals would be judged on next
    // season's (weaker) cars and look like over-performers.
    useSeasonStore.getState().nextRace()
    const settled = { ...useCareerStore.getState().teamTiers }
    useSeasonStore.getState().startNextSeason()
    expect(useCareerStore.getState().teamTiers, 'rollover must not re-settle').toEqual(settled)
  })

  it('resets rival development to the winter head start', () => {
    useSeasonStore.getState().nextRace()
    useSeasonStore.getState().startNextSeason()
    // The player (terra driver) finished P1 in this fixture: champion's winter.
    expect(useSeasonStore.getState().rivalDevelopment).toEqual(escalateRivals({}, true))
  })

  it('races next season with the new offsets', () => {
    useSeasonStore.getState().nextRace()
    useSeasonStore.getState().startNextSeason()
    expect(useSeasonStore.getState().overlayInput().teamTiers).toEqual(useCareerStore.getState().teamTiers)
  })
})

describe('the saturation bug stays fixed', () => {
  it('by season 8, rivals are NOT all pinned at 100', () => {
    /*
     * Before the ladder, rival pools never reset: by season 4 every rival's
     * power/aero/handling sat at 100 (spec section 5). Drive eight rollovers
     * through the real store, accruing a full season of pool each time.
     */
    const { poolPerRace, facets } = data.upgrades.rivalDevelopment
    for (let season = 1; season <= 8; season++) {
      const accrued = Object.fromEntries(data.cars.teams.map(t =>
        [t.id, (useSeasonStore.getState().rivalDevelopment[t.id] ?? 0)
          + poolPerRace * (t.developmentRate ?? 1) * facets.length * TOTAL_RACES]))
      useSeasonStore.setState({ rivalDevelopment: accrued, raceIndex: TOTAL_RACES - 1, phase: 'result' })
      useSeasonStore.getState().nextRace()
      useSeasonStore.getState().startNextSeason()
    }
    const teams = effectiveTeams(player, { ...useSeasonStore.getState().overlayInput(), purchasedTiers: {} })
    const pinned = teams.filter(t => t.id !== 'terra')
      .flatMap(t => facets.map(f => t.facets[f as 'power']!))
      .filter(v => v >= 100).length
    expect(pinned).toBeLessThan(27)
  })
})
