import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { defaultPlanLaps, RaceSetup } from '@ui/RaceSetup'
import { PICKABLE_CIRCUITS, CIRCUIT_ORDER } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore } from '@state/seasonStore'

beforeEach(() => {
  useSettingsStore.setState({ reducedMotion: true })
  Element.prototype.scrollIntoView = () => {}
  useSeasonStore.setState({ raceIndex: 1, attemptNonce: 0, selectedCircuitId: null, playerStrategy: null })
})

describe('Race Setup extras', () => {
  it('offers the twelve calendar circuits, then the two extras', () => {
    expect(PICKABLE_CIRCUITS.slice(0, 12)).toEqual([...CIRCUIT_ORDER])
    expect(PICKABLE_CIRCUITS.slice(12)).toEqual(['lantern_quay', 'mesa_roja'])
  })
  it('opens a high-wear circuit on two stops at 30% / 62%', () => {
    expect(defaultPlanLaps(50, 1.35)).toEqual({ stops: 2, lap1: 15, lap2: 31 })
  })
  it('keeps today\'s one stop at 45% elsewhere', () => {
    expect(defaultPlanLaps(56, 1)).toEqual({ stops: 1, lap1: 25, lap2: 39 })
  })
  it('tapping the high-wear chip selects two stops and shows the hint', () => {
    render(<RaceSetup />)
    expect(screen.getByRole('radio', { name: '1 STOP' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /Mesa Roja/ }))
    expect(screen.getByRole('radio', { name: '2 STOP' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/High wear: a third stop may be needed/)).toBeTruthy()
    expect(screen.getByText(/HIGH WEAR/)).toBeTruthy()
  })
  it('tapping a non-high-wear chip after choosing 2 stops keeps 2 stops', () => {
    render(<RaceSetup />)
    fireEvent.click(screen.getByRole('radio', { name: '2 STOP' }))
    fireEvent.click(screen.getByRole('button', { name: /Bengaluru/ }))
    expect(screen.getByRole('radio', { name: '2 STOP' }).getAttribute('aria-checked')).toBe('true')
  })
  it('never claims night changes tyre wear', () => {
    const { container } = render(<RaceSetup />)
    fireEvent.click(screen.getByRole('button', { name: /Lantern Quay/ }))
    expect(container.textContent).not.toMatch(/cool track|tyres last longer/i)
    expect(container.textContent).toMatch(/NIGHT RACE/)
  })
})
