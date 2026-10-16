import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSeasonStore, seedFor, type PlayerStrategyChoice } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { snapshotFrom } from '@state/seasonPersistence'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { initRace } from '@engine/index'
import { computeStartWeather } from '@ui/RaceSetup'
import { loadGameData } from '@data/validators'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

/*
 * Found on the 1.4 phone pass: RETRY ROUND re-rolled the weather (a retry
 * bumps attemptNonce, and the weather stream derives from the seed) but went
 * straight back to racing on the OLD plan. A wet-start plan retried into a dry
 * race started on full wets and fell to P20 on lap 1, with no chance to see
 * the new forecast.
 *
 * Ruling (Veet, 2026-10-16): RETRY ROUND reopens race setup for the same
 * round, the previous plan pre-filled, and the round is qualified again.
 */

const EVENTS = { overtakesGained: 0, pitsDone: 1, hadRain: false }
const P8 = [{ driverId: 'd_rossi', position: 1 }, { driverId: 'd_voss', position: 8 }]
const WIN = [{ driverId: 'd_voss', position: 1 }, { driverId: 'd_rossi', position: 2 }]
const PLAN: PlayerStrategyChoice = { startCompound: 'W', plannedStops: [{ lap: 20, compound: 'M' }], wing: 4 }

function midRoundResult() {
  useCareerStore.getState().beginCareer()
  useSeasonStore.getState().startNewSeason()
  useSeasonStore.setState({
    playerDriverId: 'd_voss', selectedTeamId: 'apex', raceIndex: 5, selectedCircuitId: 'costa_verde',
    phase: 'racing', playerStrategy: PLAN,
    qualifyingResult: { order: ['d_voss', 'd_rossi'], laps: [] } as never,
  })
  useSeasonStore.getState().recordRaceResult(P8, EVENTS)
}

beforeEach(midRoundResult)

describe('RETRY ROUND reopens race setup', () => {
  it('GOES TO RACE SETUP, NOT STRAIGHT BACK TO RACING', () => {
    useSeasonStore.getState().retryRace()
    expect(useSeasonStore.getState().phase).toBe('race_setup')
  })

  it('keeps the round, the circuit and the plan, for the setup screen to pre-fill', () => {
    useSeasonStore.getState().retryRace()
    const s = useSeasonStore.getState()
    expect(s.raceIndex).toBe(5)
    expect(s.selectedCircuitId).toBe('costa_verde')
    expect(s.playerStrategy).toEqual(PLAN)
  })

  it('moves to the next attempt, so setup forecasts the weather the retry will race in', () => {
    const before = useSeasonStore.getState().currentSeed()
    useSeasonStore.getState().retryRace()
    const s = useSeasonStore.getState()
    const seed = s.currentSeed()
    expect(seed).not.toBe(before)
    expect(seed).toBe(seedFor(useCareerStore.getState().seasonNumber, 5, 1))
    // The forecast on the setup screen and the race it leads to agree.
    const laps = loadGameData().circuits['costa_verde']!.laps
    const shown = computeStartWeather('costa_verde', laps, seed, false)
    const race = initRace(buildRaceConfig(seed, 'd_voss', 'costa_verde', 'rookie', PLAN, null, undefined, false))
    expect(shown).toEqual(race.weatherTimeline)
  })

  it('THROWS AWAY THE OLD GRID: the round is qualified again under the new seed', () => {
    /*
     * The grid was set under the previous attempt's weather. Keeping it would
     * mean a grid qualified in the wet leading a race run in the dry. The
     * guard in startRaceFromQualifying then makes a fresh session mandatory.
     */
    useSeasonStore.getState().retryRace()
    expect(useSeasonStore.getState().qualifyingResult).toBeNull()
    useSeasonStore.getState().confirmRaceSetup('costa_verde', PLAN)
    expect(useSeasonStore.getState().phase).toBe('qualifying')
    expect(() => useSeasonStore.getState().startRaceFromQualifying()).toThrow()
  })

  it('discards the pending result exactly once, and nothing is left to keep', () => {
    const standings = JSON.stringify(useSeasonStore.getState().standings)
    const devPoints = useSeasonStore.getState().devPoints
    useSeasonStore.getState().retryRace()
    const s = useSeasonStore.getState()
    expect(s.resultPending).toBe(false)
    expect(s.lastRaceResults).toBeNull()
    expect(s.pendingRace).toBeNull()
    // keepResult after a retry is a no-op: the discarded attempt cannot be
    // counted by a later keep.
    useSeasonStore.getState().keepResult()
    expect(JSON.stringify(useSeasonStore.getState().standings)).toBe(standings)
    expect(useSeasonStore.getState().devPoints).toBe(devPoints)
    expect(useCareerStore.getState().racesStarted).toBe(0)
  })

  it('the retried race counts once when kept, like a race never retried', () => {
    useSeasonStore.getState().retryRace()
    useSeasonStore.getState().confirmRaceSetup('costa_verde', PLAN)
    useSeasonStore.setState({ qualifyingResult: { order: ['d_voss', 'd_rossi'], laps: [] } as never })
    useSeasonStore.getState().startRaceFromQualifying()
    useSeasonStore.getState().recordRaceResult(WIN, EVENTS)
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().standings.find(x => x.driverId === 'd_voss')?.points).toBe(25)
    expect(useCareerStore.getState().racesStarted).toBe(1)
    expect(useCareerStore.getState().wins).toBe(1)
  })

  it('a save written after the retry reopens setup on the new attempt', () => {
    useSeasonStore.getState().retryRace()
    const snap = snapshotFrom(useSeasonStore.getState())!
    expect(snap.resumePhase).toBe('race_setup')
    expect(snap.attemptNonce).toBe(1)
    expect(snap.playerStrategy).toEqual(PLAN)
    expect(snap.resultPending).toBe(false)
  })
})
