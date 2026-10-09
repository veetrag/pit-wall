import { create } from 'zustand'

export type GameSpeed = 0 | 1 | 2 | 4

interface ClockStore {
  speed: GameSpeed
  /**
   * Whether the app is on screen. GameClock will not step the sim while this
   * is false, whatever `speed` says.
   *
   * Two guards, not one, because there are two ways a race can run unseen.
   * Pausing on hide stops a race already running. But StartLights sets the
   * speed on its own timer at lights-out, so an app hidden DURING the start
   * sequence gets its GO after the pause -- only gating the clock on
   * visibility catches that one.
   */
  appVisible: boolean
  setSpeed: (s: GameSpeed) => void
  /**
   * Hidden: pause. Shown again after being hidden: pause, whatever was set
   * while away, so the player sees the race before it moves and resumes it
   * themselves. A "visible" while already visible is a no-op -- the scenario
   * path sets speed 1 itself (RaceWatcher), and a spurious event at launch
   * must not freeze it.
   */
  setAppVisible: (visible: boolean) => void
}

export const useClockStore = create<ClockStore>((set, get) => ({
  speed: 0,
  appVisible: true,
  setSpeed: (speed) => set({ speed }),
  setAppVisible: (visible) => {
    if (visible === get().appVisible) return
    set({ appVisible: visible, speed: 0 })
  },
}))
