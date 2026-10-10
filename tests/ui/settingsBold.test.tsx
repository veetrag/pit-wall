import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

import { SettingsScreen } from '@ui/SettingsPanel'
import { HowToPlay } from '@ui/HowToPlay'
import { useSettingsStore } from '@state/settingsStore'

beforeEach(() => { useSettingsStore.setState({ reducedMotion: false }) })

describe('settings and how to play in Race Day Bold', () => {
  it('settings are slanted switches, segmented speed and difficulty, and cloud save stays coming soon', () => {
    render(<SettingsScreen />)
    for (const n of ['Sound effects', 'Haptic feedback', 'Reduce motion', 'Skip start sequence', 'Pro mode', 'Replay tutorial'])
      expect(screen.getByRole('switch', { name: n })).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Sim speed' })).toBeTruthy()
    expect(screen.getByRole('radiogroup', { name: 'Difficulty' })).toBeTruthy()
    expect((screen.getByRole('switch', { name: 'Cloud save' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('Coming soon', { exact: false })).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: 'Reduce motion' }))
    expect(useSettingsStore.getState().reducedMotion).toBe(true)
  })
  it('how to play steps are reachable from the strip and announce the current step', () => {
    render(<HowToPlay />)
    fireEvent.click(screen.getByRole('button', { name: 'Step 3' }))
    expect(screen.getByRole('button', { name: 'Step 3' }).getAttribute('aria-current')).toBe('step')
    expect(screen.getByText(/3 OF 6/)).toBeTruthy()
  })
})
