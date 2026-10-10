import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

import { SettingsScreen } from '@ui/SettingsPanel'
import { HowToPlay } from '@ui/HowToPlay'
import { useSettingsStore } from '@state/settingsStore'
import { useCoachStore } from '@state/coachStore'
import { useSeasonStore } from '@state/seasonStore'

beforeEach(() => { useSettingsStore.setState({ reducedMotion: false }) })

describe('settings and how to play in Race Day Bold', () => {
  it('settings are slanted switches, segmented speed and difficulty, and cloud save stays coming soon', () => {
    render(<SettingsScreen />)
    for (const n of ['Sound effects', 'Haptic feedback', 'Reduce motion', 'Skip start sequence', 'Pro mode', 'Replay tutorial'])
      expect(screen.getByRole('switch', { name: n })).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Sim speed' })).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Difficulty' })).toBeTruthy()
    expect((screen.getByRole('switch', { name: 'Cloud save' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getAllByText('Coming soon', { exact: false }).length).toBe(2)
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }))
    expect(useSettingsStore.getState().reducedMotion).toBe(true)
  })
  it('how to play steps are reachable from the strip and announce the current step', () => {
    render(<HowToPlay />)
    fireEvent.click(screen.getByRole('button', { name: 'Step 3' }))
    expect(screen.getByRole('button', { name: 'Step 3' }).getAttribute('aria-current')).toBe('step')
    expect(screen.getByText(/3 OF 6/)).toBeTruthy()
  })
  it('turning Replay tutorial on clears the seen flag and resets the coach', () => {
    const reset = vi.fn()
    useCoachStore.setState({ reset })
    useSettingsStore.setState({ coachMarksSeen: true })
    render(<SettingsScreen />)
    fireEvent.click(screen.getByRole('switch', { name: 'Replay tutorial' }))
    expect(useSettingsStore.getState().coachMarksSeen).toBe(false)
    expect(reset).toHaveBeenCalled()
  })
  it('START RACING on the last step starts a season', () => {
    const startNewSeason = vi.fn()
    useSeasonStore.setState({ startNewSeason })
    render(<HowToPlay />)
    fireEvent.click(screen.getByRole('button', { name: 'Step 6' }))
    fireEvent.click(screen.getByRole('button', { name: /START RACING/ }))
    expect(startNewSeason).toHaveBeenCalled()
  })
  it('the how to play card is never transparent right after a step change', () => {
    render(<HowToPlay />)
    fireEvent.click(screen.getByRole('button', { name: 'Step 2' }))
    const card = screen.getByText(/Switch modes live/).parentElement as HTMLElement
    expect(parseFloat(card.style.opacity || '1')).toBeGreaterThan(0)
  })
})
