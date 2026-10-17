import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

import { useSeasonStore, type FinishPosition } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { useSettingsStore } from '@state/settingsStore'
import { useDebriefStore, setDebriefRunner } from '@state/debriefStore'
import { buildRaceConfig } from '@state/buildRaceConfig'
import { sprintLaps } from '@state/sprint'
import { computeStartWeather } from '@ui/RaceSetup'
import { SprintSetup } from '@ui/SprintSetup'
import { SprintResult } from '@ui/SprintResult'
import { initRace } from '@engine/index'
import { CIRCUIT_ORDER } from '@state/raceStore'
import { seedFor } from '@state/seasonStore'
import { loadGameData } from '@data/validators'

const DATA = loadGameData()
const s = () => useSeasonStore.getState()

function toSprintSetup() {
  useCareerStore.getState().beginCareer()
  s().startNewSeason()
  s().selectTeam('apex'); s().confirmTeam()
  s().selectDriver('d_voss'); s().confirmDriver()
  useSeasonStore.setState({ raceIndex: 3, selectedCircuitId: null })
  s().toRaceSetup()
  s().confirmRaceSetup(undefined, { startCompound: 'M', plannedStops: [{ lap: 18, compound: 'H' }], wing: 3 })
  s().runQualifyingSession({ compound: 'M', attack: 'balanced' }, 'rookie')
  s().startRaceFromQualifying()
}
function finishSprint(pos: number) {
  s().confirmSprintSetup({ startCompound: 'M', paceMode: 'neutral' })
  const order = s().qualifyingResult!.order.filter(id => id !== 'd_voss')
  order.splice(pos - 1, 0, 'd_voss')
  const positions: FinishPosition[] = order.map((driverId, i) => ({ driverId, position: i + 1 }))
  s().recordSprintResult(positions, { overtakesGained: 0, pitsDone: 0, hadRain: false })
}

beforeEach(() => {
  useSettingsStore.setState({ reducedMotion: true })
  setDebriefRunner({ start: () => ({ cancel: () => {} }) })
  useDebriefStore.getState().cancel()
})

describe('SprintSetup', () => {
  it('states the sprint distance and the grid, and offers start tyre and pace only', () => {
    toSprintSetup()
    render(<SprintSetup />)
    expect(screen.getByText(`${sprintLaps(40)} LAPS`)).toBeTruthy()
    expect(screen.getByText(/^GRID P\d+$/)).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Sprint start tyre' })).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Sprint pace' })).toBeTruthy()
    expect(screen.queryByRole('radiogroup', { name: 'Number of stops' })).toBeNull()
  })

  it('confirms the chosen tyre and pace and goes to the sprint', () => {
    toSprintSetup()
    render(<SprintSetup />)
    fireEvent.click(screen.getByRole('radio', { name: 'Soft' }))
    fireEvent.click(screen.getByRole('radio', { name: /PUSH/ }))
    fireEvent.click(screen.getByRole('button', { name: /TO THE SPRINT GRID/ }))
    expect(s().phase).toBe('sprint_racing')
    expect(s().sprintStrategy).toEqual({ startCompound: 'S', paceMode: 'push' })
  })
})

describe('SprintResult', () => {
  it('shows the sprint finish and points, then ON TO THE GRAND PRIX banks them once', () => {
    toSprintSetup()
    finishSprint(3)
    render(<SprintResult />)
    expect(screen.getByText('P3')).toBeTruthy()
    // Twice in the DOM: the visible count and its invisible width twin.
    expect(screen.getAllByText(/\+6 SPRINT PTS/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /ON TO THE GRAND PRIX/ }))
    expect(s().phase).toBe('racing')
    expect(s().standings.find(x => x.driverId === 'd_voss')?.points).toBe(6)
  })

  it('RETRY SPRINT discards it', () => {
    toSprintSetup()
    finishSprint(1)
    render(<SprintResult />)
    fireEvent.click(screen.getByRole('button', { name: /RETRY SPRINT/ }))
    expect(s().phase).toBe('sprint_setup')
    expect(s().standings.find(x => x.driverId === 'd_voss')?.points ?? 0).toBe(0)
  })
})

describe('the sprint setup forecast agrees with the sprint', () => {
  it('for every sprint round, the screen shows the opening the race is built with', () => {
    for (const raceIndex of [3, 7, 11]) {
      const circuitId = CIRCUIT_ORDER[raceIndex]!
      const seed = seedFor(1, raceIndex, 0, 'sprint')
      const laps = sprintLaps(DATA.circuits[circuitId]!.laps)
      const shown = computeStartWeather(circuitId, laps, seed, false)
      const race = initRace(buildRaceConfig(seed, 'd_voss', circuitId, 'rookie', null, null, undefined, false, true))
      expect(shown, circuitId).toEqual(race.weatherTimeline)
    }
  })
})
