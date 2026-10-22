import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, renderHook } from '@testing-library/react'
import { act } from 'react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

import { useNewTutorialMarks } from '@ui/RaceHUD'
import { useNewCoachMarkOwed } from '@hooks/useCoachingActive'
import { useCoachStore } from '@state/coachStore'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { useSettingsStore } from '@state/settingsStore'
import { useCareerStore } from '@state/careerStore'
import type { RaceState, CarState, IncidentEvent } from '@engine/types'

function Probe() { useNewTutorialMarks(); return null }

/** A minimal race state: the player at lap `lap`, next planned stop at `stopLap`. */
function race(lap: number, stopLap: number | null, incidents: IncidentEvent[] = [], phase: 'racing' | 'starting' = 'racing') {
  const player = {
    driverId: 'd_voss', teamId: 'apex', isPlayer: true, position: 5, pitsDone: 0, retired: false,
    strategy: { plannedStops: stopLap === null ? [] : [{ lap: stopLap, compound: 'H' }] },
  } as unknown as CarState
  act(() => {
    useRaceStore.setState({
      phase,
      raceState: { cars: [player], lap, totalLaps: 50, sector: 0, incidents, safetyCar: null } as unknown as RaceState,
    })
  })
}
const SC: IncidentEvent = { lap: 7, sector: 1, kind: 'safety_car_deployed', driverId: null } as IncidentEvent

beforeEach(() => {
  useCoachStore.setState({ active: null, done: {} })
  useSettingsStore.setState({ coachSeen: {}, coachMarksSeen: true })   // a returning player
  useSeasonStore.setState({ phase: 'racing' })
  useCareerStore.getState().beginCareer()
  useCareerStore.setState({ racesStarted: 9 })
  useRaceStore.getState().resetRace()
})

describe('the new marks are owed per mark (spec 1.6 §9)', () => {
  it('is owed in a season race and a sprint, never in a scenario, and not once seen', () => {
    const owed = () => renderHook(() => useNewCoachMarkOwed('safety_car')).result.current
    expect(owed()).toBe(true)
    useSeasonStore.setState({ phase: 'sprint_racing' }); expect(owed()).toBe(true)
    useSeasonStore.setState({ phase: 'scenario_racing' }); expect(owed()).toBe(false)
    useSeasonStore.setState({ phase: 'racing' })
    useSettingsStore.setState({ coachSeen: { safety_car: true } }); expect(owed()).toBe(false)
  })

  it('SAFETY_CAR fires on the first deployment, not before', () => {
    render(<Probe />)
    race(6, null)
    expect(useCoachStore.getState().active).toBeNull()
    race(7, null, [SC])
    expect(useCoachStore.getState().active).toBe('safety_car')
  })

  it('PIT_WINDOW fires at two laps out and not at three', () => {
    render(<Probe />)
    race(20, 23)
    expect(useCoachStore.getState().active, 'three laps out is not yet the window').toBeNull()
    race(21, 23)
    expect(useCoachStore.getState().active).toBe('pit_window')
  })

  it('a red flag never triggers or burns the safety_car mark (item 16c)', () => {
    const RED = { lap: 7, sector: 1, kind: 'red_flag', driverId: null } as unknown as IncidentEvent
    render(<Probe />)
    race(7, null, [RED])
    race(8, null, [RED])
    expect(useCoachStore.getState().active, 'a red flag has its own card').toBeNull()
    expect(useCoachStore.getState().done).not.toHaveProperty('safety_car')
    expect(useSettingsStore.getState().coachSeen).not.toHaveProperty('safety_car')
    race(12, null, [RED, { ...SC, lap: 12 }])
    expect(useCoachStore.getState().active, 'still owed for the first real SC').toBe('safety_car')
  })

  it('pit_window never fires with no planned stop (item 16c)', () => {
    render(<Probe />)
    for (let lap = 1; lap <= 50; lap++) {
      race(lap, null)
      expect(useCoachStore.getState().active, `lap ${lap}`).toBeNull()
    }
    expect(useCoachStore.getState().done).not.toHaveProperty('pit_window')
  })

  it('neither fires before lights out', () => {
    render(<Probe />)
    race(7, 9, [SC], 'starting')
    expect(useCoachStore.getState().active, 'a pause set during the lights is discarded').toBeNull()
  })
})
