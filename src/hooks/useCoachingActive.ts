import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore } from '@state/seasonStore'

/**
 * Coaching runs on a season race only, and only until the player has seen it.
 *
 * Scenario mode is excluded deliberately: a scenario drops the player into lap
 * 40 of a race that is already half-run, which is the worst possible moment to
 * meet the tyre cliff for the first time.
 */
export function useCoachingActive(): boolean {
  const seen = useSettingsStore(s => s.coachMarksSeen)
  const phase = useSeasonStore(s => s.phase)
  return !seen && phase === 'racing'
}
