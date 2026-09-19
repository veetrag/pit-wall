import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'

/**
 * Coaching runs on the player's FIRST CAREER RACE only.
 *
 * Scenario mode is excluded deliberately: a scenario drops the player into lap
 * 40 of a race that is already half-run, which is the worst possible moment to
 * meet the tyre cliff for the first time.
 *
 * racesStarted === 0 is the load-bearing half of this. coachMarksSeen only
 * flips once EVERY mark has been dismissed (see useRetireCoachTutorial), so on
 * its own it let the tutorial follow a player into race two and beyond -- a
 * player who ignored a tip, or who never met one of the conditions, kept being
 * interrupted all season. The cliff mark in particular never fires in a wet
 * race, so a wet opener alone was enough to strand the tutorial permanently.
 */
export function useCoachingActive(): boolean {
  const seen = useSettingsStore(s => s.coachMarksSeen)
  const phase = useSeasonStore(s => s.phase)
  const racesStarted = useCareerStore(s => s.racesStarted)
  return !seen && phase === 'racing' && racesStarted === 0
}
