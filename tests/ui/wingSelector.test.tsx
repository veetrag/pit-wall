import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WingSelector, wingTradeLine } from '@ui/WingSelector'
import { useSettingsStore } from '@state/settingsStore'
import { loadGameData } from '@data/validators'
import { expectedBestWing } from '@engine/setup'

beforeEach(() => { useSettingsStore.setState({ reducedMotion: true }) })
const data = loadGameData()

describe('WingSelector', () => {
  it('is a labelled radio group of five, with the selected level checked', () => {
    render(<WingSelector circuitId="veloce" value={2} onChange={() => {}} />)
    expect(screen.getByRole('radiogroup', { name: /wing level/i })).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(5)
    expect(radios[1]!.getAttribute('aria-checked')).toBe('true')
  })
  it('calls onChange with the tapped level', () => {
    let got = 0
    render(<WingSelector circuitId="veloce" value={3} onChange={w => { got = w }} />)
    fireEvent.click(screen.getAllByRole('radio')[4]!)
    expect(got).toBe(5)
  })
  it('marks the expected best level', () => {
    const best = expectedBestWing(data.circuits['veloce']!, data.tuning, data.circuits['veloce']!.rainProbability ?? 0)
    render(<WingSelector circuitId="veloce" value={3} onChange={() => {}} />)
    expect(screen.getAllByRole('radio')[best - 1]!.getAttribute('aria-label')).toMatch(/best/i)
  })
  it('the trade line shows the lap delta vs best, straights and rain, with arrows', () => {
    const line = wingTradeLine(data.circuits['veloce']!, data.tuning, 5)
    expect(line).toMatch(/s\/lap vs best/)
    expect(line).toMatch(/Straights [▲▼—]/)
    expect(line).toMatch(/Rain [+−]\d/)
  })
  it('names the circuit character from its most sensitive sector', () => {
    render(<WingSelector circuitId="veloce" value={3} onChange={() => {}} />)
    expect(screen.getByText(/track · S\d weighted/)).toBeTruthy()
  })
})

describe('RaceSetup wing row', () => {
  it('defaults to the remembered wing, shows it in the plan, and confirms it', async () => {
    const { RaceSetup } = await import('@ui/RaceSetup')
    const { useSeasonStore } = await import('@state/seasonStore')
    const { useCareerStore } = await import('@state/careerStore')
    const { CIRCUIT_ORDER } = await import('@state/raceStore')
    const circuitId = CIRCUIT_ORDER[useSeasonStore.getState().raceIndex % CIRCUIT_ORDER.length]!
    useCareerStore.setState({ wingByCircuit: { [circuitId]: 4 } })
    Element.prototype.scrollIntoView = () => {} // jsdom lacks it
    let got: unknown = null
    useSeasonStore.setState({ confirmRaceSetup: (_id: string, s: unknown) => { got = s } } as never)
    render(<RaceSetup />)
    expect(screen.getAllByRole('radio').find(r => r.getAttribute('aria-checked') === 'true')!.getAttribute('aria-label')).toMatch(/^Wing 4/)
    expect(screen.getByText(/PLAN:/).textContent).toMatch(/ · W4/)
    fireEvent.click(screen.getAllByRole('radio')[1]!)
    fireEvent.click(screen.getByText(/TO QUALIFYING/))
    expect((got as { wing?: number }).wing).toBe(2)
  })
})
