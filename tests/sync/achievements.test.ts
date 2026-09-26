import { describe, it, expect, vi } from 'vitest'
import {
  ACHIEVEMENTS, BADGES_WITHOUT_ACHIEVEMENTS, ALL_BADGE_IDS, unlockFor,
} from '@sync/achievements'
import { offlineClient, type PlayGamesClient } from '@sync/index'

function recorder() {
  const unlocked: string[] = []
  const client: PlayGamesClient = {
    ...offlineClient,
    unlockAchievement: async (id) => { unlocked.push(id) },
  }
  return { client, unlocked }
}

describe('the achievement mapping', () => {
  it('ACCOUNTS FOR EVERY BADGE, MAPPED OR DELIBERATELY NOT', () => {
    /*
     * The totality guard, and the reason BADGES_WITHOUT_ACHIEVEMENTS exists.
     * A plain "every badge maps" assertion would be false -- the Play Games
     * set is a curated subset. So instead every badge must appear in exactly
     * one of the two lists, which turns "add a badge" into "decide whether it
     * gets an achievement" rather than letting it fall silently through the
     * gap.
     */
    const mapped = Object.keys(ACHIEVEMENTS)
    const excluded = [...BADGES_WITHOUT_ACHIEVEMENTS]
    const accounted = new Set([...mapped, ...excluded])

    const missing = ALL_BADGE_IDS.filter(id => !accounted.has(id))
    expect(missing, 'add these to ACHIEVEMENTS or BADGES_WITHOUT_ACHIEVEMENTS').toEqual([])

    const unknown = [...accounted].filter(id => !ALL_BADGE_IDS.includes(id))
    expect(unknown, 'these name badges that no longer exist').toEqual([])

    const both = mapped.filter(id => excluded.includes(id))
    expect(both, 'a badge cannot be both mapped and excluded').toEqual([])
  })

  it('USES DISTINCT, PLAY-SHAPED IDS', () => {
    // A copy-paste slip between two rows would silently unlock the wrong
    // achievement, and a published achievement cannot be deleted.
    const ids = Object.values(ACHIEVEMENTS)
    expect(new Set(ids).size, 'duplicate achievement id').toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^Cgk[A-Za-z0-9_-]{10,}$/)
  })

  it('HAS THE EIGHT THE CONSOLE ACTUALLY HOLDS', () => {
    expect(Object.keys(ACHIEVEMENTS).length).toBe(8)
  })

  it('SHARES ONE PROJECT PREFIX, AS GENERATED IDS DO', () => {
    /*
     * Every id Play Console generated for this project starts with the same
     * encoded project prefix. A pasted id from a DIFFERENT game would pass
     * the shape check above and fail only on a device, with an unhelpful
     * error -- this catches it here.
     */
    const prefixes = new Set(Object.values(ACHIEVEMENTS).map(id => id.slice(0, 12)))
    expect([...prefixes], 'an id is from another project').toHaveLength(1)
  })
})

describe('unlockFor', () => {
  it('UNLOCKS ONLY THE BADGES THAT MAP', async () => {
    const { client, unlocked } = recorder()
    const out = await unlockFor(client, ['champion', 'veteran', 'comeback'])
    // veteran is deliberately excluded; it must be skipped, not an error.
    expect(unlocked).toEqual([ACHIEVEMENTS.champion, ACHIEVEMENTS.comeback])
    expect(out).toEqual(unlocked)
  })

  it('DOES NOTHING FOR AN EMPTY LIST', async () => {
    const { client, unlocked } = recorder()
    expect(await unlockFor(client, [])).toEqual([])
    expect(unlocked).toEqual([])
  })

  it('IGNORES A BADGE ID IT HAS NEVER HEARD OF', async () => {
    // Defends against a save from a future version carrying a badge this
    // build does not know. It must skip, not throw, mid-championship.
    const { client, unlocked } = recorder()
    await expect(unlockFor(client, ['from_the_future'])).resolves.toEqual([])
    expect(unlocked).toEqual([])
  })

  it('IS A NO-OP ON THE OFFLINE CLIENT', async () => {
    const spy = vi.spyOn(offlineClient, 'unlockAchievement')
    await expect(unlockFor(offlineClient, ['champion'])).resolves.toHaveLength(1)
    expect(spy).toHaveBeenCalledWith(ACHIEVEMENTS.champion)
    spy.mockRestore()
  })
})
