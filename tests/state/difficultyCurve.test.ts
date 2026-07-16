import { describe, it, expect, beforeEach } from 'vitest'
import { useSeasonStore } from '@state/seasonStore'
import { useRaceStore } from '@state/raceStore'

describe('M5: per-attempt seed variance', () => {
  beforeEach(() => {
    useSeasonStore.setState({
      phase: 'menu', playerDriverId: null, raceIndex: 0, attemptNonce: 0,
      standings: [], lastRaceResults: null, lastRaceEvents: null,
    })
  })

  it('currentSeed differs across attemptNonce 0/1/2', () => {
    useSeasonStore.setState({ raceIndex: 2, attemptNonce: 0 })
    const seed0 = useSeasonStore.getState().currentSeed()
    useSeasonStore.setState({ attemptNonce: 1 })
    const seed1 = useSeasonStore.getState().currentSeed()
    useSeasonStore.setState({ attemptNonce: 2 })
    const seed2 = useSeasonStore.getState().currentSeed()

    expect(new Set([seed0, seed1, seed2]).size).toBe(3)
    expect(seed0).toBe(2042) // unchanged base formula at nonce 0
  })

  it('retryRace bumps attemptNonce and returns to the racing phase', () => {
    useSeasonStore.setState({ phase: 'result', attemptNonce: 0, lastRaceResults: [{ driverId: 'd_ver', position: 1, points: 25, retired: false }] })
    useSeasonStore.getState().retryRace()
    expect(useSeasonStore.getState().attemptNonce).toBe(1)
    expect(useSeasonStore.getState().phase).toBe('racing')
    expect(useSeasonStore.getState().lastRaceResults).toBeNull()
  })

  it('advancing a round (nextRace) resets attemptNonce back to 0', () => {
    useSeasonStore.setState({ phase: 'result', raceIndex: 2, attemptNonce: 3, standings: [], playerDriverId: 'd_ver', lastRaceResults: null })
    useSeasonStore.getState().nextRace()
    expect(useSeasonStore.getState().attemptNonce).toBe(0)
  })

  it('two attempts of the same round produce different weather timelines', () => {
    useSeasonStore.setState({ raceIndex: 0, playerDriverId: 'd_voss', attemptNonce: 0 })
    const seedAttempt0 = useSeasonStore.getState().currentSeed()
    useSeasonStore.getState().retryRace()
    const seedAttempt1 = useSeasonStore.getState().currentSeed()

    useRaceStore.getState().startSeasonRace('d_voss', seedAttempt0, 'bengaluru', 'rookie', null)
    const weatherAttempt0 = useRaceStore.getState().raceState!.weatherTimeline
    useRaceStore.getState().startSeasonRace('d_voss', seedAttempt1, 'bengaluru', 'rookie', null)
    const weatherAttempt1 = useRaceStore.getState().raceState!.weatherTimeline

    expect(weatherAttempt0).not.toEqual(weatherAttempt1)
  })
})

describe('M5: determinism preserved', () => {
  it('a fixed (raceIndex, attemptNonce) pair reproduces an identical race every run', () => {
    useSeasonStore.setState({ raceIndex: 3, attemptNonce: 2 })
    const seed = useSeasonStore.getState().currentSeed()
    expect(seed).toBe(3 * 1000 + 42 + 2 * 7919)

    useRaceStore.getState().startSeasonRace('d_voss', seed, 'bengaluru', 'pro', null)
    const configA = useRaceStore.getState().config!
    const stateA = useRaceStore.getState().raceState!

    useRaceStore.getState().startSeasonRace('d_voss', seed, 'bengaluru', 'pro', null)
    const configB = useRaceStore.getState().config!
    const stateB = useRaceStore.getState().raceState!

    expect(configA.seed).toBe(configB.seed)
    expect(stateA.weatherTimeline).toEqual(stateB.weatherTimeline)
    expect(stateA.cars.map(c => c.driverId)).toEqual(stateB.cars.map(c => c.driverId))
  })
})
