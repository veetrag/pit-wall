import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { useSeasonStore } from '@state/seasonStore'

// Without a handler, Android's hardware back button finishes the activity from
// any screen. On-device that was destructive rather than merely annoying: back
// mid-race sent the player to the launcher, and relaunching reloaded the WebView
// (Capacitor logs "Loading app at https://localhost" and React remounts), so the
// race was gone. In-race state lives only in memory, so it cannot be recovered.
//
// The mapping below mirrors each screen's own on-screen back affordance, so the
// hardware button and the "← BACK" buttons agree.
export function useAndroidBackButton() {
  useEffect(() => {
    const listener = App.addListener('backButton', () => {
      // Read fresh state at press time — capturing it in the closure would
      // pin the phase from whenever this effect last ran.
      const s = useSeasonStore.getState()

      switch (s.phase) {
        // Mid-race, back does nothing. There is no quit-race flow yet, and
        // silently binning the race (as it did before) is far worse than
        // ignoring the press. Revisit when a pause/quit menu exists.
        case 'racing':
        case 'sprint_racing':
          return

        // Terminal screens own their own navigation (NEXT RACE / NEW SEASON /
        // PLAY AGAIN / ON TO THE GRAND PRIX); backing out of them has no
        // sensible meaning. Sprint setup has no back either: qualifying is done.
        case 'result':
        case 'championship':
        case 'sprint_result':
        case 'sprint_setup':
          return

        case 'grid':
          s.exitGrid()
          return
        case 'how_to_play':
          s.exitHowToPlay()
          return
        case 'settings':
          s.exitSettings()
          return

        case 'team_select':
          s.backToMenu()
          return
        case 'driver_select':
          s.backToTeamSelect()
          return
        case 'race_setup':
          s.backToDriverSelect()
          return

        // At the top of the tree, back should behave like any other Android app
        // and background it — not kill it.
        case 'menu':
          void App.minimizeApp()
          return
      }
    })

    return () => { void listener.then(l => l.remove()) }
  }, [])
}
