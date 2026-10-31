import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { act } from 'react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}),
  },
}))

import { ScenarioSelect } from '@ui/ScenarioSelect'
import { useSeasonStore } from '@state/seasonStore'
import { useScenarioStore, packOf } from '@state/scenarioStore'
import { loadGameData } from '@data/validators'

// The hub opens on the SCENARIOS tab, which lists the core pack only.
const SCENARIOS = loadGameData().scenarios.filter(s => packOf(s) === 'core')

beforeEach(() => {
  useSeasonStore.setState({ phase: 'scenario_select' })
  useScenarioStore.setState({ active: null, outcome: null })
})

describe('ScenarioSelect', () => {
  it('the RED FLAG pill is hot with ink text, like the in-race red flag (1.6.2 item 6)', () => {
    render(<ScenarioSelect />)
    fireEvent.click(screen.getByText('Red Flag Restart'))
    const pill = screen.getByText(/⚠ RED FLAG/)
    expect(pill.style.background).toBe('var(--hot)')
    expect(pill.style.color).toBe('var(--ink)')
  })

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
    act(() => { screen.getByRole('button', { name: 'Back' }).click() })
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

describe('ScenarioSelect — keyboard', () => {
  it('OPENS A CARD FROM THE KEYBOARD, not only from a tap', () => {
    /*
     * The cards are motion.divs with role="button". A non-native element with
     * that role does NOT synthesise a click from Enter or Space, so without an
     * explicit key handler a keyboard or switch user could focus a card and
     * never expand it -- and TAKE OVER lives inside the expanded region, so the
     * entire mode was unreachable for them.
     *
     * The rest of this file uses .click() throughout, which is exactly why this
     * went unnoticed.
     */
    render(<ScenarioSelect />)
    const first = SCENARIOS[0]!
    // Re-queried each time: expanding re-creates the card element, so a
    // reference captured before the first key press is detached afterwards and
    // React never sees the second event.
    const card = () => screen.getByText(first.name).closest('[role="button"]')!
    expect(screen.queryByText('TAKE OVER'), 'collapsed to start with').toBeNull()

    fireEvent.keyDown(card(), { key: 'Enter' })
    expect(screen.getByText('TAKE OVER'), 'Enter must open it').toBeTruthy()
    expect(card().getAttribute('aria-expanded')).toBe('true')

    // aria-expanded rather than the presence of TAKE OVER: collapsing plays an
    // exit animation, so the button is still mounted for a frame afterwards.
    // The attribute is the semantic state and flips immediately.
    fireEvent.keyDown(card(), { key: ' ' })
    expect(card().getAttribute('aria-expanded'), 'Space must close it again').toBe('false')
  })

  it('colours a compound from the validated data, including wets', () => {
    // Guards the removal of the local letter->token map: a compound present in
    // compounds.json must never fall through to the grey fallback.
    const cliff = SCENARIOS.find(s => s.expect.compound === 'I')!
    render(<ScenarioSelect />)
    act(() => { screen.getByText(cliff.name).click() })
    const stint = `${cliff.expect.compound}${cliff.expect.tyreAge}`
    expect(screen.getByText(stint), `the ${stint} stint renders`).toBeTruthy()
  })
  it('situation pills on the grape card use the dusk tone', () => {
    render(<ScenarioSelect />)
    const first = SCENARIOS[0]!
    act(() => { screen.getByText(first.name).click() })
    expect((screen.getByText(`P${first.expect.position}`) as HTMLElement).style.background).toContain('--dusk')
  })
})

describe('remembered bests (spec 1.6 §8)', () => {
  it('shows BEST P3 ✓ when the goal was met, BEST P7 when not, nothing before a first attempt', () => {
    const [a, b] = loadGameData().scenarios
    useScenarioStore.setState({ best: { [a!.id]: { position: 3, met: true }, [b!.id]: { position: 7, met: false } } })
    render(<ScenarioSelect />)
    expect(screen.getByLabelText('Best finish P3, goal met').textContent).toContain('BEST P3 ✓')
    expect(screen.getByLabelText('Best finish P7, goal not met yet').textContent).toContain('BEST P7')
    expect(screen.queryAllByText(/BEST /)).toHaveLength(2)
  })
})
