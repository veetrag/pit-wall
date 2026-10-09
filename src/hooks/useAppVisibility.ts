import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { useClockStore } from '@state/clockStore'

/**
 * Feeds the app's on-screen state into clockStore, which pauses the race.
 *
 * Both sources, because neither covers every case: appStateChange is the
 * native signal on Android (home button, an incoming call, the app switcher),
 * and visibilitychange covers the browser build. setAppVisible ignores a
 * repeat of the current state, so hearing both is harmless.
 */
export function useAppVisibility() {
  useEffect(() => {
    const setVisible = useClockStore.getState().setAppVisible
    const onVisibility = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibility)
    const listener = App.addListener('appStateChange', ({ isActive }) => setVisible(isActive))
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      void listener.then(l => l.remove())
    }
  }, [])
}
