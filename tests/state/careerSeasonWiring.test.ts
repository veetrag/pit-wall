import { describe, it, expect, beforeEach } from 'vitest'
import { useSeasonStore, seedFor } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { loadGameData } from '@data/validators'

describe('career wiring', () => {
  beforeEach(() => {
    useCareerStore.getState().endCareer()
    useSeasonStore.setState({
      phase: 'championship', playerDriverId: 'd_voss', selectedTeamId: 'apex',
      raceIndex: 11, attemptNonce: 0, standings: [{ driverId: 'd_voss', points: 300 }],
      devPoints: 40, purchasedTiers: { power: 3, aero: 3 }, rivalDevelopment: { apex: 10 },
    })
  })

  it('SEASON 1 SEEDS EXACTLY AS IT DOES TODAY', () => {
    /*
     * THE load-bearing assertion of this whole feature. byteIdentity, the
     * Monte-Carlo bands and all three scenarios are pinned to today's seeds.
     * The season term is written (season - 1) precisely so season 1 adds zero.
     */
    useCareerStore.setState({ seasonNumber: 1 })
    for (const raceIndex of [0, 5, 11]) {
      for (const attemptNonce of [0, 3]) {
        useSeasonStore.setState({ raceIndex, attemptNonce })
        expect(useSeasonStore.getState().currentSeed())
          .toBe(raceIndex * 1000 + 42 + attemptNonce * 7919)
      }
    }
  })

  it('LATER SEASONS DO NOT REPLAY EARLIER ONES', () => {
    /*
     * Exercised through the PURE seedFor rather than the store. Driving
     * 30 x 12 x 1000 combinations through setState took 360,000 store
     * notifications and 37 seconds, which is how a real guarantee becomes a
     * test people skip. The delegation test below keeps currentSeed honest.
     *
     * The nonce bound is explicit because attemptNonce is unbounded in
     * principle (retryRace never caps it), so this is a guarantee over a
     * stated domain rather than a universal one. See the career spec 3.2.
     */
    const seeds = new Set<number>()
    let count = 0
    for (let season = 1; season <= 30; season++) {
      for (let raceIndex = 0; raceIndex < 12; raceIndex++) {
        for (let attemptNonce = 0; attemptNonce < 1000; attemptNonce++) {
          seeds.add(seedFor(season, raceIndex, attemptNonce))
          count++
        }
      }
    }
    expect(seeds.size, 'a collision means two seasons run the same race').toBe(count)
  })

  it('currentSeed DELEGATES TO seedFor', () => {
    // The pure function carries the collision guarantee, so the store must
    // actually use it rather than keeping a second copy of the arithmetic.
    useCareerStore.setState({ seasonNumber: 4 })
    useSeasonStore.setState({ raceIndex: 7, attemptNonce: 2 })
    expect(useSeasonStore.getState().currentSeed()).toBe(seedFor(4, 7, 2))
  })

  it('startNextSeason KEEPS THE SEAT AND ERODES THE UPGRADES', () => {
    useCareerStore.getState().beginCareer()
    useSeasonStore.getState().startNextSeason()
    const s = useSeasonStore.getState()
    const { tierDecayPerSeason } = loadGameData().tuning.career

    expect(s.playerDriverId, 'the player keeps their seat').toBe('d_voss')
    expect(s.selectedTeamId).toBe('apex')
    expect(s.purchasedTiers.power).toBe(3 - tierDecayPerSeason)
    expect(s.raceIndex, 'a new season starts at round 1').toBe(0)
    expect(s.standings, 'standings do not carry').toEqual([])
    // Unspent points DO carry. This assertion originally said they did not,
    // which contradicted the principle already stated at seasonStore's
    // toRaceSetup ("unspent points bank rather than expire") and made the
    // career plateau dead flat -- see the banking test in careerBalance.
    expect(s.devPoints, 'unspent points bank across the winter').toBe(40)
    expect(useCareerStore.getState().seasonNumber).toBe(2)
    expect(s.phase).toBe('development')
  })

  it('startNextSeason ESCALATES THE RIVALS RATHER THAN DISCARDING THEM', () => {
    // playAgain used to reset rivalDevelopment to {}. Carrying it forward is
    // most of what "rivals get stronger every season" means.
    useCareerStore.getState().beginCareer()
    useSeasonStore.getState().startNextSeason()
    expect(useSeasonStore.getState().rivalDevelopment.apex!).toBeGreaterThan(10)
  })

  it('endCareer WIPES THE SEASON AND THE CAREER', () => {
    useCareerStore.getState().beginCareer()
    useSeasonStore.getState().endCareer()
    expect(useSeasonStore.getState().playerDriverId).toBeNull()
    expect(useSeasonStore.getState().purchasedTiers).toEqual({})
    expect(useCareerStore.getState().hasCareer).toBe(false)
    expect(useSeasonStore.getState().phase).toBe('menu')
  })
})

describe('the race log records what actually happened', () => {
  /*
   * Without these the log could be plausibly populated but WRONG -- and every
   * grid-based badge (comeback, damage_limitation) would be wrong with it,
   * silently, because nothing else in the game reads grid position once the
   * race has started.
   */
  function order(playerSlot: number): string[] {
    // 20 ids with the player at the given 1-based slot.
    const ids = Array.from({ length: 20 }, (_, i) => `d_filler${i}`)
    ids[playerSlot - 1] = 'd_voss'
    return ids
  }

  beforeEach(() => {
    useCareerStore.getState().beginCareer()
    useSeasonStore.setState({
      phase: 'racing', playerDriverId: 'd_voss', raceIndex: 3,
      standings: [], lastRaceResults: null, qualifyingResult: null,
    })
  })

  it('STORES THE GRID SLOT, NOT THE FINISHING POSITION', () => {
    useSeasonStore.setState({ qualifyingResult: { laps: [], order: order(12) } })
    useSeasonStore.getState().recordRaceResult(
      [{ driverId: 'd_voss', position: 4 }],
      { overtakesGained: 8, pitsDone: 2, hadRain: true },
    )
    const fact = useCareerStore.getState().raceLog[0]
    expect(fact?.grid, 'grid must come from qualifyingResult.order').toBe(12)
    expect(fact?.finish).toBe(4)
    expect(fact?.round, 'round is seasonStore.raceIndex').toBe(3)
    expect(fact?.overtakes).toBe(8)
    expect(fact?.stops).toBe(2)
    expect(fact?.wet).toBe(true)
  })

  it('a pole start is recorded as grid 1 AND pole true', () => {
    useSeasonStore.setState({ qualifyingResult: { laps: [], order: order(1) } })
    useSeasonStore.getState().recordRaceResult(
      [{ driverId: 'd_voss', position: 1 }],
      { overtakesGained: 0, pitsDone: 1, hadRain: false },
    )
    const fact = useCareerStore.getState().raceLog[0]
    expect(fact?.grid).toBe(1)
    expect(fact?.pole).toBe(true)
  })

  it('WITHOUT QUALIFYING, grid is never 0', () => {
    // indexOf returns -1 for a driver not in the order, and -1 + 1 = 0 would
    // read as "started ahead of pole" -- which would earn nothing, but would
    // also make damage_limitation impossible to reason about. The fallback is
    // the finishing position.
    useSeasonStore.setState({ qualifyingResult: null })
    useSeasonStore.getState().recordRaceResult(
      [{ driverId: 'd_voss', position: 6 }],
      { overtakesGained: 0, pitsDone: 1, hadRain: false },
    )
    expect(useCareerStore.getState().raceLog[0]?.grid).toBe(6)
  })
})
