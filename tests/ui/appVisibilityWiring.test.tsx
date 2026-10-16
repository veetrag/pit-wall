import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { act } from 'react'
import { useClockStore } from '@state/clockStore'

/*
 * The 1.5 to-do list still carried "backgrounding mid-race: no
 * visibilitychange / appStateChange handler". That was stale: the handler
 * shipped in 1.4 (useAppVisibility, mounted in App), and the PAUSE logic is
 * pinned by tests/ui/backgroundPause.test.tsx. What nothing pinned was the
 * WIRING -- that the hook actually listens to both signals. Removing either
 * listener left every test green.
 */

type StateListener = (s: { isActive: boolean }) => void
const appListeners: StateListener[] = []
const remove = vi.fn()

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (event: string, fn: StateListener) => {
      if (event === 'appStateChange') appListeners.push(fn)
      return { remove }
    }),
  },
}))

const { useAppVisibility } = await import('@hooks/useAppVisibility')

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  appListeners.length = 0
  remove.mockClear()
  setVisibility('visible')
  useClockStore.setState({ speed: 2, appVisible: true })
})

describe('useAppVisibility wiring', () => {
  it('PAUSES ON THE NATIVE SIGNAL (home button, a phone call)', () => {
    renderHook(() => useAppVisibility())
    expect(appListeners).toHaveLength(1)
    act(() => { appListeners[0]!({ isActive: false }) })
    expect(useClockStore.getState()).toMatchObject({ appVisible: false, speed: 0 })
    act(() => { appListeners[0]!({ isActive: true }) })
    expect(useClockStore.getState(), 'back on screen, still paused for the player to resume')
      .toMatchObject({ appVisible: true, speed: 0 })
  })

  it('pauses on document visibilitychange too (the browser build)', () => {
    renderHook(() => useAppVisibility())
    act(() => { setVisibility('hidden') })
    expect(useClockStore.getState()).toMatchObject({ appVisible: false, speed: 0 })
  })

  it('removes both listeners on unmount', async () => {
    const { unmount } = renderHook(() => useAppVisibility())
    unmount()
    await Promise.resolve()
    expect(remove).toHaveBeenCalled()
    act(() => { setVisibility('hidden') })
    expect(useClockStore.getState().appVisible, 'an unmounted hook must not still listen').toBe(true)
  })
})
