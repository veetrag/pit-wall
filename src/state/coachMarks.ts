/**
 * Coach-mark ids, in their own module so settingsStore (which persists the
 * new marks' seen flags) and coachStore (which imports settingsStore as a
 * value) can both read them without an import cycle.
 *
 * LEGACY: the first-race four, still retired together by coachMarksSeen.
 * NEW (spec 1.6 §9): each persisted on its own in settings.coachSeen.
 */
export const LEGACY_COACH_MARKS = ['timing_tower', 'pace_modes', 'tyre_cliff', 'projection'] as const
export const NEW_COACH_MARKS = ['safety_car', 'pit_window', 'radio_request'] as const
export const COACH_MARK_IDS = [...LEGACY_COACH_MARKS, ...NEW_COACH_MARKS] as const
export type CoachMarkId = typeof COACH_MARK_IDS[number]
export type NewCoachMarkId = typeof NEW_COACH_MARKS[number]

export function isNewCoachMark(id: CoachMarkId): id is NewCoachMarkId {
  return (NEW_COACH_MARKS as readonly string[]).includes(id)
}
