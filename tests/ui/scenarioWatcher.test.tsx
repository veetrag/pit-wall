import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useScenarioStore } from '@state/scenarioStore'
import { useClockStore } from '@state/clockStore'
import { RaceWatcher } from '@ui/RaceWatcher'
import { loadGameData } from '@data/validators'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}),
  },
}))

const SPEC = loadGameData().scenarios[0]!

beforeEach(() => {
  useRaceStore.getState().resetRace()
  useClockStore.setState({ speed: 0 })
  useScenarioStore.setState({ active: null, outcome: null })
  useSeasonStore.setState({
    phase: 'menu', playerDriverId: null, standings: [], raceIndex: 0,
    lastRaceResults: null, lastRaceEvents: null, devPoints: 0,
  })
})

describe('RaceWatcher — a scenario is not a season race', () => {
  it('A FINISHED SCENARIO AWARDS NO CHAMPIONSHIP POINTS', async () => {
    /*
     * THE SEPARATION TEST, driven through the real watcher.
     *
     * Asserting this by calling recordOutcome directly proves nothing: the
     * hazard is not in the scenario path, it is that the SEASON path also runs.
     * RaceWatcher's "race finished" effect guards on racePhase and its own
     * hasFiredRef, and hasFiredRef starts false -- so a scenario played on a
     * fresh app satisfies it, calls recordRaceResult, and writes standings and
     * devPoints out of a race that was never part of a championship. It also
     * sets phase 'result', stealing the player away from the scenario result.
     *
     * Reproduced before it was fixed: standings gained 20 entries and the phase
     * ended on 'result' instead of 'scenario_result'.
     */
    useScenarioStore.getState().select(SPEC)
    useSeasonStore.setState({ phase: 'scenario_racing' })

    render(<RaceWatcher />)

    // Let the watcher start the scenario race, then drive it to the flag.
    await act(async () => { await Promise.resolve() })
    expect(useRaceStore.getState().raceState, 'the scenario must have started').not.toBeNull()

    await act(async () => {
      const { config } = useRaceStore.getState()
      const total = config!.circuit.laps
      // step() sets phase 'finished' on its own once the flag is reached
      for (let i = 0; i < (total - SPEC.startLap) * 3 + 3; i++) {
        if (useRaceStore.getState().phase !== 'racing') break
        useRaceStore.getState().step()
      }
      await Promise.resolve()
    })

    expect(useRaceStore.getState().phase, 'the race must have finished').toBe('finished')

    expect(useSeasonStore.getState().standings,
      'a scenario must never write championship standings').toEqual([])
    expect(useSeasonStore.getState().devPoints,
      'nor award development points').toBe(0)
    expect(useSeasonStore.getState().lastRaceResults,
      'nor overwrite the last season race result').toBeNull()
    expect(useSeasonStore.getState().phase,
      'and it must land on the scenario result, not the season one').toBe('scenario_result')
    expect(useScenarioStore.getState().outcome,
      'the scenario outcome must be recorded').not.toBeNull()
  }, 120_000)
})

describe('RaceWatcher — a scenario starts running', () => {
  it('STARTS THE CLOCK, because nothing else will', async () => {
    /*
     * clockStore initialises at speed 0, and StartLights -- the only thing in
     * the app that ever sets it to 1 -- renders exclusively during the
     * 'starting' phase, which a mid-race takeover deliberately skips.
     *
     * So the scenario opened fully rendered and completely frozen: timing tower
     * populated, safety car banner up, and the race never advancing. The player
     * had to find the speed control to start their own scenario.
     *
     * The existing separation test above could never catch this because it
     * drives the race by calling step() in a loop, bypassing the clock.
     */
    useScenarioStore.getState().select(SPEC)
    useSeasonStore.setState({ phase: 'scenario_racing' })
    render(<RaceWatcher />)
    await act(async () => { await Promise.resolve() })

    expect(useRaceStore.getState().phase).toBe('racing')
    expect(useClockStore.getState().speed,
      'a scenario that never ticks is not a race').toBeGreaterThan(0)
  }, 60_000)
})
