import { BADGES } from '@state/badges'
import type { PlayGamesClient } from './types'

/**
 * Play Games achievements, mapped from the in-game badges.
 *
 * A CURATED SUBSET, not all fifteen. The trophy case keeps every badge; Play
 * Games gets the eight that read well on a public profile. Dropped
 * deliberately: the attendance ones (Veteran, Centurion), the near-automatic
 * one (In The Points), and three that overlap something already here
 * (Double Figures, Lights To Flag, Ironman, Damage Limitation).
 *
 * The ids come from Play Console's own "Get resources" export, which is the
 * only authority on them -- they are generated, not chosen. Points there sum
 * to 925 of the 2,000 available.
 *
 * These achievements are PUBLISHED, and Play Games does not allow deleting a
 * published achievement. The mapping below can change; the achievements
 * themselves cannot.
 */
export const ACHIEVEMENTS: Readonly<Record<string, string>> = {
  rostrum:          'CgkI1Pnxl94REAIQAg',
  winner:           'CgkI1Pnxl94REAIQAw',
  pole_position:    'CgkI1Pnxl94REAIQBA',
  storm_chaser:     'CgkI1Pnxl94REAIQBQ',
  comeback:         'CgkI1Pnxl94REAIQBg',
  one_stop_wonder:  'CgkI1Pnxl94REAIQBw',
  champion:         'CgkI1Pnxl94REAIQCA',
  dynasty:          'CgkI1Pnxl94REAIQCQ',
}

/**
 * Badges with no Play Games counterpart, listed rather than implied.
 *
 * Without this, "is this badge missing from ACHIEVEMENTS on purpose, or did
 * someone forget?" is unanswerable, and a totality test could only be written
 * as "every badge must map", which is false. Adding a badge to badges.ts now
 * forces a decision here -- see tests/sync/achievements.test.ts.
 */
export const BADGES_WITHOUT_ACHIEVEMENTS: readonly string[] = [
  'in_the_points',
  'double_figures',
  'veteran',
  'centurion',
  'lights_to_flag',
  'ironman',
  'damage_limitation',
]

/**
 * Unlock the Play Games achievements for badges just earned.
 *
 * Takes the same `justEarned` list the in-game toast uses, so the two
 * surfaces can never disagree about what was earned. Badges with no
 * achievement are skipped silently -- that is the normal case, not an error.
 *
 * Never throws: the client swallows its own failures, and a Play Games
 * outage must not be able to interrupt a championship screen.
 */
export async function unlockFor(
  client: PlayGamesClient, justEarned: readonly string[],
): Promise<string[]> {
  const unlocked: string[] = []
  for (const badgeId of justEarned) {
    const achievementId = ACHIEVEMENTS[badgeId]
    if (!achievementId) continue
    await client.unlockAchievement(achievementId)
    unlocked.push(achievementId)
  }
  return unlocked
}

/** Every badge id known to the game. Exported for the totality test. */
export const ALL_BADGE_IDS: readonly string[] = BADGES.map(b => b.id)
