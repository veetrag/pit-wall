import { create } from 'zustand'

/*
 * Order matters to the player, not to this file: the marks are requested at
 * the moment each thing first happens, so the race itself sequences them --
 * the tower at lights-out, the pace trade once running, then the cliff and
 * the projection when those actually arise.
 */
export type CoachMarkId =
  | 'timing_tower'
  | 'pace_modes'
  | 'tyre_cliff'
  | 'projection'

interface CoachStore {
  /** At most one mark is ever on screen. */
  active: CoachMarkId | null
  done: Record<string, boolean>
  request: (id: CoachMarkId) => void
  dismiss: (id: CoachMarkId) => void
  reset: () => void
}

/**
 * Coach marks are request-driven, not scripted: the UI asks for a mark at the
 * moment the thing it explains actually happens (the cliff approaching, the
 * pit panel opening), and this store decides whether it is still owed.
 *
 * `done` makes a mark idempotent within a session, so a condition that stays
 * true across many sim ticks -- which is exactly what "the cliff is coming"
 * does -- cannot re-raise it on every tick.
 */
export const useCoachStore = create<CoachStore>((set, get) => ({
  active: null,
  done: {},
  request(id) {
    // Never interrupt a mark already up, and never repeat a finished one.
    if (get().active !== null || get().done[id]) return
    set({ active: id })
  },
  dismiss(id) {
    set(s => ({ active: s.active === id ? null : s.active, done: { ...s.done, [id]: true } }))
  },
  reset() { set({ active: null, done: {} }) },
}))
