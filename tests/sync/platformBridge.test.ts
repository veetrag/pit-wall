import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Preferences } from '@capacitor/preferences'
import { shouldAskForReview } from '@sync/reviewPolicy'
import {
  setPlatformClients, resetPlatformClients,
  maybeAskForReview, checkForUpdate, startCrashReporting, integrityToken,
} from '@sync/platformBridge'

describe('shouldAskForReview', () => {
  /*
   * The whole point is WHEN, not how often -- Google throttles whether the
   * sheet appears and never tells us. So the only thing we control is not
   * asking at a moment that would earn a one-star review.
   */
  it('ASKS ONLY AFTER WINNING THE CHAMPIONSHIP', () => {
    expect(shouldAskForReview({ championshipPosition: 1, alreadyAsked: false })).toBe(true)
  })

  it('NEVER ASKS AFTER A LOSS', () => {
    for (const pos of [2, 3, 4, 10, 20]) {
      expect(shouldAskForReview({ championshipPosition: pos, alreadyAsked: false }), `P${pos}`).toBe(false)
    }
  })

  it('NEVER ASKS TWICE', () => {
    expect(shouldAskForReview({ championshipPosition: 1, alreadyAsked: true })).toBe(false)
  })
})

describe('maybeAskForReview', () => {
  beforeEach(async () => {
    resetPlatformClients()
    await Preferences.remove({ key: 'review.asked' })
  })

  it('PROMPTS ON A TITLE AND RECORDS THAT IT DID', async () => {
    const request = vi.fn(async () => {})
    setPlatformClients({ review: { request } })
    expect(await maybeAskForReview(1)).toBe(true)
    expect(request).toHaveBeenCalledOnce()
    // The second call must be refused from persistence, not from memory --
    // the app restarts between championships.
    expect(await maybeAskForReview(1)).toBe(false)
    expect(request).toHaveBeenCalledOnce()
  })

  it('DOES NOT PROMPT ON A LOSS, AND DOES NOT BURN THE ONE CHANCE', async () => {
    const request = vi.fn(async () => {})
    setPlatformClients({ review: { request } })
    expect(await maybeAskForReview(4)).toBe(false)
    expect(request).not.toHaveBeenCalled()
    // A losing season must leave the prompt available for a later title.
    expect(await maybeAskForReview(1)).toBe(true)
  })

  it('RECORDS THE ASK EVEN IF THE PLUGIN THROWS', async () => {
    /*
     * An unshown prompt costs nothing; a repeated one costs a rating. So the
     * flag is written before the request, and a throwing plugin must not
     * unwind it.
     */
    setPlatformClients({ review: { request: async () => { throw new Error('no store') } } })
    await expect(maybeAskForReview(1)).rejects.toThrow()
    setPlatformClients({ review: { request: async () => {} } })
    expect(await maybeAskForReview(1), 'the ask was not recorded').toBe(false)
  })
})

describe('checkForUpdate', () => {
  beforeEach(() => resetPlatformClients())

  it('DOES NOTHING WHEN THERE IS NO UPDATE', async () => {
    const startFlexible = vi.fn(async () => {})
    setPlatformClients({ updates: { updateAvailable: async () => false, startFlexible } })
    expect(await checkForUpdate()).toBe(false)
    expect(startFlexible).not.toHaveBeenCalled()
  })

  it('STARTS A FLEXIBLE UPDATE, NEVER AN IMMEDIATE ONE', async () => {
    // There is no server contract a stale client can break, so the player is
    // never blocked out of a game they already have.
    const startFlexible = vi.fn(async () => {})
    setPlatformClients({ updates: { updateAvailable: async () => true, startFlexible } })
    expect(await checkForUpdate()).toBe(true)
    expect(startFlexible).toHaveBeenCalledOnce()
  })
})

describe('the no-op defaults', () => {
  beforeEach(() => resetPlatformClients())

  it('LET EVERY CALL PATH RUN AND DO NOTHING', async () => {
    // What component tests and the web build run through. None of these may
    // throw, and integrity must answer null rather than blocking anything.
    await expect(startCrashReporting()).resolves.toBeUndefined()
    await expect(checkForUpdate()).resolves.toBe(false)
    await expect(integrityToken('n')).resolves.toBeNull()
  })
})
