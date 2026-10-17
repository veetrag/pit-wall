import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { act } from 'react'
import { useCoachStore } from '@state/coachStore'
import { useSettingsStore } from '@state/settingsStore'
import { useClockStore } from '@state/clockStore'
import { useRaceStore } from '@state/raceStore'
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

describe('CoachMark — staying clear of the pit drawer', () => {
  it('MOVES TO THE TOP WHILE THE PIT DRAWER IS OPEN', () => {
    /*
     * Found on device. Raising the mark above the drawer (zIndex 120) stopped
     * it being invisible, but then it simply covered the drawer instead: the
     * cliff mark sat over the compound chips and pushed BOX NOW off screen.
     *
     * Both marks can be up while that drawer is open -- the projection one
     * always is, since a computed projection is its only firing path -- so the
     * card gets out of the way rather than fighting it for the same strip.
     */
    useRaceStore.setState({ pitPanelOpen: false })
    useCoachStore.setState({ active: 'tyre_cliff', done: {} })
    const { container, rerender } = render(
      <CoachMark id="tyre_cliff" title="T" body="B" />,
    )
    const card = () => container.querySelector('[role="region"]') as HTMLElement
    expect(card().style.bottom, 'bottom-anchored normally').not.toBe('')
    expect(card().style.top).toBe('')

    act(() => { useRaceStore.setState({ pitPanelOpen: true }) })
    rerender(<CoachMark id="tyre_cliff" title="T" body="B" />)
    expect(card().style.top, 'top-anchored while the drawer is open').not.toBe('')
    expect(card().style.bottom, 'and no longer bottom-anchored').toBe('')
  })
})

describe('CoachMark under a red flag', () => {
  beforeEach(() => {
    useCoachStore.setState({ active: null, done: {} })
    useClockStore.setState({ speed: 2 })
    useRaceStore.setState({ phase: 'racing' })
  })

  it('withdraws an open mark without marking it done, restores speed, and refuses new requests', () => {
    act(() => { useCoachStore.getState().request('tyre_cliff') })
    render(<CoachMark id="tyre_cliff" title="Cliff" body="The cliff explained." />)
    expect(useClockStore.getState().speed).toBe(0)
    act(() => { useRaceStore.setState({ phase: 'red_flag' }) })
    expect(useCoachStore.getState().active).toBeNull()
    expect(useCoachStore.getState().done.tyre_cliff).toBeUndefined()
    expect(useClockStore.getState().speed).toBe(2)
    act(() => { useCoachStore.getState().request('projection') })
    expect(useCoachStore.getState().active).toBeNull()
    act(() => { useRaceStore.setState({ phase: 'racing' }); useCoachStore.getState().request('tyre_cliff') })
    expect(useCoachStore.getState().active).toBe('tyre_cliff')
  })
})
