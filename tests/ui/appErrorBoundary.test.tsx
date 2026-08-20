import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { act } from 'react'
import { AppErrorBoundary } from '@ui/AppErrorBoundary'
import { useSeasonStore } from '@state/seasonStore'

// Previously the only boundary in the app was CanvasBoundary, wrapping just
// <TrackCanvas>. A throw anywhere else — timing tower, pit panel, engine.step()
// via raceStore — unmounted the whole tree, leaving a black screen with no route
// back to the menu and the run lost.

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

function Boom({ explode }: { explode: boolean }): React.ReactNode {
  if (explode) throw new Error('tyre model divided by zero')
  return <div>race running</div>
}

// Mirrors the real failure shape: the component that threw is race-only, so
// resetting the phase to 'menu' swaps it out and the tree recovers. A child that
// threw unconditionally would just re-throw the instant the error is cleared.
function PhaseScopedBoom(): React.ReactNode {
  const phase = useSeasonStore(s => s.phase)
  if (phase === 'racing') throw new Error('tyre model divided by zero')
  return <div>menu content</div>
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    cleanup()
    // React logs caught render errors; silence it so the suite output stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('renders children untouched when nothing throws', () => {
    render(<AppErrorBoundary><Boom explode={false} /></AppErrorBoundary>)
    expect(screen.getByText('race running')).toBeTruthy()
  })

  it('shows a recoverable fallback instead of a blank tree when a child throws', () => {
    render(<AppErrorBoundary><Boom explode /></AppErrorBoundary>)

    expect(screen.getByText(/Something broke/i)).toBeTruthy()
    // The message is surfaced — it is the only diagnostic a player can report.
    expect(screen.getByText(/divided by zero/i)).toBeTruthy()
    // Both recovery routes must exist: menu for a race-only fault, reload for
    // when the menu itself is what threw.
    expect(screen.getByText(/RETURN TO MENU/i)).toBeTruthy()
    expect(screen.getByText(/RELOAD/i)).toBeTruthy()
  })

  it('exposes the fallback to assistive tech as an alert', () => {
    render(<AppErrorBoundary><Boom explode /></AppErrorBoundary>)
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('RETURN TO MENU resets the phase and recovers the tree', () => {
    useSeasonStore.setState({ phase: 'racing' } as never)
    render(<AppErrorBoundary><PhaseScopedBoom /></AppErrorBoundary>)

    // Fault surfaced rather than blanking the app.
    expect(screen.getByText(/Something broke/i)).toBeTruthy()

    const button = screen.getByText(/RETURN TO MENU/i).closest('button')!
    act(() => { button.click() })

    expect(useSeasonStore.getState().phase).toBe('menu')
    // The tree actually recovers -- fallback gone, children rendering again.
    expect(screen.queryByText(/Something broke/i)).toBeNull()
    expect(screen.getByText('menu content')).toBeTruthy()
  })

  it('keeps showing the fallback if the remounted child throws again', () => {
    // Why RELOAD exists as a second route: when the menu itself is what throws,
    // resetting the phase cannot help.
    render(<AppErrorBoundary><Boom explode /></AppErrorBoundary>)
    const button = screen.getByText(/RETURN TO MENU/i).closest('button')!
    act(() => { button.click() })
    expect(screen.getByText(/Something broke/i)).toBeTruthy()
  })
})
