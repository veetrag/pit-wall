import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mem = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) }),
    get: vi.fn(async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null })),
    remove: vi.fn(async ({ key }: { key: string }) => { mem.delete(key) }),
  },
}))

import { useSettingsStore, startReducedMotionWatch } from '@state/settingsStore'

const MOTION_KEY = 'settings.motion'

/**
 * A matchMedia stub whose value can change and whose listeners actually fire,
 * so the watcher can be driven rather than merely constructed.
 */
function installMatchMedia(initial: boolean) {
  let matches = initial
  const listeners = new Set<(e: MediaQueryListEvent) => void>()
  const original = window.matchMedia
  window.matchMedia = ((query: string) => ({
    get matches() { return matches },
    media: query,
    onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => { listeners.add(fn) },
    removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => { listeners.delete(fn) },
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  return {
    setOsPreference(v: boolean) {
      matches = v
      for (const fn of listeners) fn({ matches: v } as MediaQueryListEvent)
    },
    listenerCount: () => listeners.size,
    restore() { window.matchMedia = original },
  }
}

let mq: ReturnType<typeof installMatchMedia>

beforeEach(() => {
  mem.clear()
  useSettingsStore.setState({ reducedMotion: false, motionPreferenceStored: false })
})
afterEach(() => { mq?.restore() })

describe('reduced motion follows the OS by default', () => {
  it('ADOPTS THE OS PREFERENCE WHEN THE PLAYER HAS NOT CHOSEN', async () => {
    /*
     * The gap this closes. reducedMotion defaulted to false and the store never
     * consulted matchMedia, so a player who had set reduce-motion at the system
     * level got the full motion language until they found the in-app toggle.
     *
     * tokens.css's @media block does not cover this: it only neutralises CSS
     * animation/transition durations, and this app animates from JS via framer
     * motion, so every layout animation and infinite pulse ran regardless.
     */
    mq = installMatchMedia(true)
    await useSettingsStore.getState().loadSettings()
    expect(useSettingsStore.getState().reducedMotion).toBe(true)
  })

  it('stays on full motion when the OS is quiet', async () => {
    mq = installMatchMedia(false)
    await useSettingsStore.getState().loadSettings()
    expect(useSettingsStore.getState().reducedMotion).toBe(false)
  })

  it('AN EXPLICIT CHOICE BEATS THE OS PREFERENCE', async () => {
    /*
     * THE ONE THAT MATTERS.
     *
     * "Default from the OS" is easy to write as "override from the OS", which
     * silently overrules a player who deliberately turned reduced motion OFF
     * while their system preference says on -- a real combination, e.g. someone
     * who uses reduce-motion system-wide but wants this game's animations.
     */
    mem.set(MOTION_KEY, 'false')
    mq = installMatchMedia(true)
    await useSettingsStore.getState().loadSettings()
    expect(useSettingsStore.getState().reducedMotion,
      'the stored choice wins over the OS').toBe(false)
    expect(useSettingsStore.getState().motionPreferenceStored).toBe(true)
  })

  it('an explicit ON is likewise kept when the OS is quiet', async () => {
    mem.set(MOTION_KEY, 'true')
    mq = installMatchMedia(false)
    await useSettingsStore.getState().loadSettings()
    expect(useSettingsStore.getState().reducedMotion).toBe(true)
  })
})

describe('startReducedMotionWatch', () => {
  it('follows an OS change made while the app is open', async () => {
    mq = installMatchMedia(false)
    await useSettingsStore.getState().loadSettings()
    const stop = startReducedMotionWatch()
    mq.setOsPreference(true)
    expect(useSettingsStore.getState().reducedMotion).toBe(true)
    stop()
  })

  it('DOES NOT OVERRULE A PLAYER WHO SET THE TOGGLE', () => {
    // The gate that turns this from an override back into a default. Without
    // it, someone who switched motion on in Settings has it switched off again
    // by an unrelated system-level change.
    mq = installMatchMedia(false)
    useSettingsStore.getState().setReducedMotion(false)
    const stop = startReducedMotionWatch()
    mq.setOsPreference(true)
    expect(useSettingsStore.getState().reducedMotion,
      'their explicit choice must survive').toBe(false)
    stop()
  })

  it('unsubscribing stops the updates and releases the listener', async () => {
    mq = installMatchMedia(false)
    await useSettingsStore.getState().loadSettings()
    const stop = startReducedMotionWatch()
    expect(mq.listenerCount()).toBe(1)
    stop()
    expect(mq.listenerCount(), 'the listener must be removed, not just ignored').toBe(0)
    mq.setOsPreference(true)
    expect(useSettingsStore.getState().reducedMotion).toBe(false)
  })

  it('is a harmless no-op where matchMedia does not exist', () => {
    const original = window.matchMedia
    // @ts-expect-error -- deliberately removing it to model a non-DOM host
    delete window.matchMedia
    expect(() => startReducedMotionWatch()()).not.toThrow()
    window.matchMedia = original
  })
})
