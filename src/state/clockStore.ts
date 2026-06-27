import { create } from 'zustand'

export type GameSpeed = 0 | 1 | 2 | 4

interface ClockStore {
  speed: GameSpeed
  setSpeed: (s: GameSpeed) => void
}

export const useClockStore = create<ClockStore>(set => ({
  speed: 0,
  setSpeed: (speed) => set({ speed }),
}))
