import { describe, it, expect, beforeEach } from 'vitest'
import { useSeasonStore } from '@state/seasonStore'
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
    const seeds = new Set<number>()
    for (let season = 1; season <= 30; season++) {
      useCareerStore.setState({ seasonNumber: season })
      for (let raceIndex = 0; raceIndex < 12; raceIndex++) {
        for (let attemptNonce = 0; attemptNonce < 1000; attemptNonce++) {
          useSeasonStore.setState({ raceIndex, attemptNonce })
          seeds.add(useSeasonStore.getState().currentSeed())
        }
      }
    }
    // The nonce bound is explicit because attemptNonce is unbounded in
    // principle (retryRace never caps it), so the guarantee is over a stated
    // domain rather than universal. See the career spec section 3.2.
    expect(seeds.size).toBe(30 * 12 * 1000)
  }, 60_000)

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
    expect(s.devPoints, 'unspent points do not carry').toBe(0)
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
