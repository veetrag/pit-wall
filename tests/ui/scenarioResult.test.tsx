import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}),
  },
}))

import { ScenarioResult } from '@ui/ScenarioResult'
import { useSeasonStore } from '@state/seasonStore'
import { useScenarioStore } from '@state/scenarioStore'
import { useRaceStore } from '@state/raceStore'
import { loadGameData } from '@data/validators'

const SPEC = loadGameData().scenarios[0]!

beforeEach(() => {
  useSeasonStore.setState({ phase: 'scenario_result' })
  useScenarioStore.setState({ active: SPEC, outcome: null })
})

describe('ScenarioResult', () => {
  it('renders nothing when active or outcome is missing', () => {
    useScenarioStore.setState({ active: null, outcome: null })
    const { container } = render(<ScenarioResult />)
    expect(container.firstChild).toBeNull()
  })

  it('shows GOAL MET when the goal was met, with a non-colour signal', () => {
    useScenarioStore.setState({ outcome: { met: true, position: 2, retired: false } })
    render(<ScenarioResult />)
    expect(screen.getByText(/GOAL MET/)).toBeTruthy()
    expect(screen.getByText(/GOAL MET/).textContent).toContain('✓')
  })

  it('shows GOAL MISSED when the goal was not met, with a non-colour signal', () => {
    useScenarioStore.setState({ outcome: { met: false, position: 9, retired: false } })
    render(<ScenarioResult />)
    expect(screen.getByText(/GOAL MISSED/)).toBeTruthy()
    expect(screen.getByText(/GOAL MISSED/).textContent).toContain('✗')
  })

  it('shows the target and finishing position', () => {
    useScenarioStore.setState({ outcome: { met: true, position: 3, retired: false } })
    render(<ScenarioResult />)
    expect(screen.getByText(`TARGET P${SPEC.goal.position}`)).toBeTruthy()
    expect(screen.getByText('FINISHED P3')).toBeTruthy()
  })

  it('shows RETIRED instead of a finishing position for a retired player', () => {
    useScenarioStore.setState({ outcome: { met: false, position: 12, retired: true } })
    render(<ScenarioResult />)
    expect(screen.getByText('RETIRED')).toBeTruthy()
    expect(screen.queryByText('FINISHED P12')).toBeNull()
  })

  it('carries role="status" on the verdict container', () => {
    useScenarioStore.setState({ outcome: { met: true, position: 1, retired: false } })
    render(<ScenarioResult />)
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('TRY AGAIN resets the race, keeps active set, and moves phase to scenario_racing', () => {
    useScenarioStore.setState({ outcome: { met: false, position: 8, retired: false } })
    useRaceStore.setState({ phase: 'finished' })
    render(<ScenarioResult />)

    act(() => { screen.getByText('TRY AGAIN').click() })

    // The ordering bug this guards against: calling startScenarioPhase()
    // without resetting the race store first leaves raceStore.phase at
    // 'finished', and RaceWatcher only (re-)starts a scenario when it is
    // 'idle' -- so the player would be stuck on a finished race forever.
    expect(useRaceStore.getState().phase).toBe('idle')
    expect(useScenarioStore.getState().active).toEqual(SPEC)
    expect(useSeasonStore.getState().phase).toBe('scenario_racing')
  })

  it('BACK TO MENU clears active and returns to the menu phase', () => {
    useScenarioStore.setState({ outcome: { met: true, position: 1, retired: false } })
    render(<ScenarioResult />)

    act(() => { screen.getByText('BACK TO MENU').click() })

    expect(useScenarioStore.getState().active).toBeNull()
    expect(useSeasonStore.getState().phase).toBe('menu')
  })
})
