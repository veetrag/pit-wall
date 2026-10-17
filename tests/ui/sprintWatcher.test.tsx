import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { useClockStore } from '@state/clockStore'
import { useDebriefStore, setDebriefRunner } from '@state/debriefStore'
import { sprintLaps } from '@state/sprint'
import { RaceWatcher } from '@ui/RaceWatcher'
import { loadGameData } from '@data/validators'

const DATA = loadGameData()
const s = () => useSeasonStore.getState()
const r = () => useRaceStore.getState()

function toSprint() {
  useCareerStore.getState().beginCareer()
  s().startNewSeason()
  s().selectTeam('apex'); s().confirmTeam()
  s().selectDriver('d_voss'); s().confirmDriver()
  useSeasonStore.setState({ raceIndex: 3, selectedCircuitId: null })
  s().toRaceSetup()
  s().confirmRaceSetup(undefined, { startCompound: 'M', plannedStops: [{ lap: 18, compound: 'H' }], wing: 3 })
  s().runQualifyingSession({ compound: 'M', attack: 'balanced' }, 'rookie')
  s().startRaceFromQualifying()
  s().confirmSprintSetup({ startCompound: 'S', paceMode: 'push' })
}

beforeEach(() => {
  r().resetRace()
  useClockStore.setState({ speed: 0 })
  // Judging a whole race is seconds of work; these tests are about the watcher.
  setDebriefRunner({ start: () => ({ cancel: () => {} }) })
  useDebriefStore.getState().cancel()
})
afterEach(() => { vi.useRealTimers() })

describe('RaceWatcher runs the sprint', () => {
  it('starts it with the sprint seed, the sprint distance, the shared grid and the chosen start', async () => {
    toSprint()
    render(<RaceWatcher />)
    await act(async () => { await Promise.resolve() })
    const { config, raceState, playerCalls } = r()
    expect(config!.seed).toBe(s().currentSprintSeed())
    expect(config!.lapsOverride).toBe(sprintLaps(DATA.circuits['sol_desert']!.laps))
    expect(config!.mandatoryTwoCompound).toBe(false)
    expect(config!.gridOrder).toEqual(s().qualifyingResult!.order)
    const me = raceState!.cars.find(c => c.isPlayer)!
    expect(me.compound).toBe('S')
    expect(me.paceMode).toBe('push')
    expect(playerCalls).toEqual([{ step: 0, kind: 'pace', mode: 'push' }])
  })

  it('at the flag it records the SPRINT (not the Grand Prix) and starts the sprint debrief', async () => {
    toSprint()
    render(<RaceWatcher />)
    await act(async () => { await Promise.resolve() })
    await act(async () => {
      useRaceStore.setState({ phase: 'racing' })
      while (r().phase === 'racing') r().step()
      await Promise.resolve()
    })
    expect(s().phase).toBe('sprint_result')
    expect(s().sprintPending).toBe(true)
    expect(s().lastRaceResults, 'the Grand Prix result is untouched').toBeNull()
    expect(useDebriefStore.getState().raceKey).toBe(`sprint-${r().config!.seed}`)
  })

  it('ON TO THE GRAND PRIX tapped before the 1.5s reset still starts the Grand Prix exactly once, from lap 0', async () => {
    vi.useFakeTimers()
    toSprint()
    render(<RaceWatcher />)
    await act(async () => { await Promise.resolve() })
    await act(async () => {
      useRaceStore.setState({ phase: 'racing' })
      while (r().phase === 'racing') r().step()
      await Promise.resolve()
    })
    act(() => { s().toGrandPrix() })
    expect(s().phase).toBe('racing')
    expect(r().config!.lapsOverride, 'the sprint is still on screen until the reset').toBe(13)
    act(() => { vi.advanceTimersByTime(1500) })
    expect(r().phase).toBe('starting')
    expect(r().config!.seed).toBe(s().currentSeed())
    expect('lapsOverride' in r().config!).toBe(false)
    expect(r().raceState!.lap).toBe(0)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(r().phase, 'no stray reset kills the Grand Prix').toBe('starting')
  })
})
