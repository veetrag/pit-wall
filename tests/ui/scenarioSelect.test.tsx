import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}),
  },
}))

import { ScenarioSelect } from '@ui/ScenarioSelect'
import { useSeasonStore } from '@state/seasonStore'
import { useScenarioStore } from '@state/scenarioStore'
import { loadGameData } from '@data/validators'

const SCENARIOS = loadGameData().scenarios

beforeEach(() => {
  useSeasonStore.setState({ phase: 'scenario_select' })
  useScenarioStore.setState({ active: null, outcome: null })
})

describe('ScenarioSelect', () => {
  it('renders every scenario name', () => {
    render(<ScenarioSelect />)
    for (const spec of SCENARIOS) {
      expect(screen.getByText(spec.name)).toBeTruthy()
    }
  })

  it('hides the goal and situation until a card is tapped', () => {
    render(<ScenarioSelect />)
    const first = SCENARIOS[0]!
    expect(screen.queryByText(`FINISH P${first.goal.position} OR BETTER`)).toBeNull()
    expect(screen.queryByText(new RegExp(`P${first.expect.position}\\b`))).toBeNull()
  })

  it('reveals the goal and situation readout on tap', () => {
    render(<ScenarioSelect />)
    const first = SCENARIOS[0]!
    act(() => { screen.getByText(first.name).click() })

    expect(screen.getByText(`FINISH P${first.goal.position} OR BETTER`)).toBeTruthy()
    expect(screen.getByText(`P${first.expect.position}`)).toBeTruthy()
    expect(screen.getByText(`${first.expect.lapsRemaining} LAPS LEFT`)).toBeTruthy()
    expect(screen.getByText(`${first.expect.compound}${first.expect.tyreAge}`)).toBeTruthy()
  })

  it('tapping the selected card again collapses it', async () => {
    render(<ScenarioSelect />)
    const first = SCENARIOS[0]!
    act(() => { screen.getByText(first.name).click() })
    expect(screen.getByText(`FINISH P${first.goal.position} OR BETTER`)).toBeTruthy()

    act(() => { screen.getByText(first.name).click() })
    // AnimatePresence unmounts the briefing after its exit animation, which is
    // async even under jsdom, so this settles rather than asserting instantly.
    await waitFor(() => {
      expect(screen.queryByText(`FINISH P${first.goal.position} OR BETTER`)).toBeNull()
    })
  })

  it('TAKE OVER selects the spec and moves the phase to scenario_racing', () => {
    render(<ScenarioSelect />)
    const first = SCENARIOS[0]!
    act(() => { screen.getByText(first.name).click() })
    act(() => { screen.getByText('TAKE OVER').click() })

    expect(useScenarioStore.getState().active).toEqual(first)
    expect(useSeasonStore.getState().phase).toBe('scenario_racing')
  })

  it('BACK returns to the menu', () => {
    render(<ScenarioSelect />)
    act(() => { screen.getByText('BACK').click() })
    expect(useSeasonStore.getState().phase).toBe('menu')
  })

  it('each scenario shows its circuit display name', () => {
    const GAME = loadGameData()
    render(<ScenarioSelect />)
    for (const spec of SCENARIOS) {
      const circuitName = GAME.circuits[spec.circuitId]!.name.toUpperCase()
      expect(screen.getAllByText(circuitName).length).toBeGreaterThan(0)
    }
  })
})
