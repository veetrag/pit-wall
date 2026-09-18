import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { act } from 'react'
import { useCoachStore } from '@state/coachStore'
import { useSettingsStore } from '@state/settingsStore'
import { useClockStore } from '@state/clockStore'
import { CoachMark } from '@ui/CoachMark'

vi.mock('@hooks/useHaptics', async (orig) => ({
  ...(await orig<typeof import('@hooks/useHaptics')>()),
  useHaptics: () => ({ impact: vi.fn(), success: vi.fn(), warning: vi.fn() }),
}))

describe('CoachMark', () => {
  beforeEach(() => {
    useCoachStore.setState({ active: null, done: {} })
    useSettingsStore.setState({ reducedMotion: false })
    useClockStore.setState({ speed: 1 })
  })

  it('renders nothing when it is not the active mark', () => {
    const { container } = render(<CoachMark id="tyre_cliff" title="Cliff" body="The cliff explained." />)
    expect(container.textContent).toBe('')
  })

  it('renders title and body when it is the active mark', () => {
    act(() => { useCoachStore.getState().request('tyre_cliff') })
    render(<CoachMark id="tyre_cliff" title="Cliff" body="The cliff explained." />)
    expect(screen.getByText('Cliff')).toBeTruthy()
    expect(screen.getByText('The cliff explained.')).toBeTruthy()
  })

  it('GOT IT dismisses it and marks it done in coachStore', () => {
    act(() => { useCoachStore.getState().request('tyre_cliff') })
    render(<CoachMark id="tyre_cliff" title="Cliff" body="The cliff explained." />)
    fireEvent.click(screen.getByRole('button', { name: 'GOT IT' }))
    expect(useCoachStore.getState().active).toBeNull()
    expect(useCoachStore.getState().done.tyre_cliff).toBe(true)
  })

  it('pauses the race while up and restores the previous speed on dismiss', () => {
    // This is the one that bites: restoring to a hardcoded 1 instead of the
    // captured value would pass a naive test but silently drop a 4x player.
    act(() => { useClockStore.getState().setSpeed(4) })
    act(() => { useCoachStore.getState().request('tyre_cliff') })
    render(<CoachMark id="tyre_cliff" title="Cliff" body="The cliff explained." />)
    expect(useClockStore.getState().speed).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'GOT IT' }))
    expect(useClockStore.getState().speed).toBe(4)
  })

  it('restores the previous speed on unmount while still showing', () => {
    act(() => { useClockStore.getState().setSpeed(4) })
    act(() => { useCoachStore.getState().request('tyre_cliff') })
    const { unmount } = render(<CoachMark id="tyre_cliff" title="Cliff" body="The cliff explained." />)
    expect(useClockStore.getState().speed).toBe(0)

    unmount()
    expect(useClockStore.getState().speed).toBe(4)
  })

  it('still renders its text under reduced motion', () => {
    useSettingsStore.setState({ reducedMotion: true })
    act(() => { useCoachStore.getState().request('tyre_cliff') })
    render(<CoachMark id="tyre_cliff" title="Cliff" body="The cliff explained." />)
    expect(screen.getByText('Cliff')).toBeTruthy()
    expect(screen.getByText('The cliff explained.')).toBeTruthy()
  })
})
