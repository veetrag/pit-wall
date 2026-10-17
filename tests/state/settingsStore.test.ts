import { describe, it, expect, beforeEach, vi } from 'vitest'

/*
 * A STATEFUL Preferences fake, not an always-null stub -- the round-trip
 * tests below save, then load, then check the value actually came back.
 */
const mem = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) }),
    get: vi.fn(async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null })),
    remove: vi.fn(async ({ key }: { key: string }) => { mem.delete(key) }),
  },
}))

import { useSettingsStore } from '@state/settingsStore'

describe('settingsStore', () => {
  beforeEach(() => {
    mem.clear()
    useSettingsStore.setState({ soundEnabled: true, hapticsEnabled: true, reducedMotion: false, coachMarksSeen: false })
  })

  it('has correct defaults', () => {
    const s = useSettingsStore.getState()
    expect(s.soundEnabled).toBe(true)
    expect(s.hapticsEnabled).toBe(true)
    expect(s.reducedMotion).toBe(false)
    expect(s.coachMarksSeen).toBe(false)
  })

  it('setSoundEnabled toggles sound', () => {
    useSettingsStore.getState().setSoundEnabled(false)
    expect(useSettingsStore.getState().soundEnabled).toBe(false)
  })

  it('setHapticsEnabled toggles haptics', () => {
    useSettingsStore.getState().setHapticsEnabled(false)
    expect(useSettingsStore.getState().hapticsEnabled).toBe(false)
  })

  it('setReducedMotion toggles motion', () => {
    useSettingsStore.getState().setReducedMotion(true)
    expect(useSettingsStore.getState().reducedMotion).toBe(true)
  })

  describe('coachMarksSeen', () => {
    it('loading with no stored value yields false, so a new player gets the tutorial', async () => {
      useSettingsStore.setState({ coachMarksSeen: true })
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().coachMarksSeen).toBe(false)
    })

    it('round-trips true through save and load', async () => {
      useSettingsStore.getState().setCoachMarksSeen(true)
      useSettingsStore.setState({ coachMarksSeen: false })
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().coachMarksSeen).toBe(true)
    })

    it('round-trips false through save and load', async () => {
      useSettingsStore.getState().setCoachMarksSeen(false)
      useSettingsStore.setState({ coachMarksSeen: true })
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().coachMarksSeen).toBe(false)
    })
  })

  describe('tyrePalette (spec 1.6 §10)', () => {
    it('defaults to standard on a fresh install', async () => {
      useSettingsStore.setState({ tyrePalette: 'cb' })
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().tyrePalette).toBe('standard')
    })
    it('round-trips cb', async () => {
      useSettingsStore.getState().setTyrePalette('cb')
      useSettingsStore.setState({ tyrePalette: 'standard' })
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().tyrePalette).toBe('cb')
    })
    it('reads an unknown stored value as standard', async () => {
      mem.set('settings.tyrePalette', 'neon')
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().tyrePalette).toBe('standard')
    })
    it('does not disturb the keys before it (positional destructure)', async () => {
      useSettingsStore.getState().setCoachMarksSeen(true)
      useSettingsStore.getState().setTyrePalette('cb')
      useSettingsStore.setState({ coachMarksSeen: false, tyrePalette: 'standard' })
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().coachMarksSeen).toBe(true)
      expect(useSettingsStore.getState().tyrePalette).toBe('cb')
    })
  })

  describe('textSize (spec 1.6 §11)', () => {
    it('defaults to standard and round-trips large', async () => {
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().textSize).toBe('standard')
      useSettingsStore.getState().setTextSize('large')
      useSettingsStore.setState({ textSize: 'standard' })
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().textSize).toBe('large')
    })
    it('keeps tyrePalette (the key before it) intact', async () => {
      useSettingsStore.getState().setTyrePalette('cb')
      useSettingsStore.getState().setTextSize('large')
      useSettingsStore.setState({ tyrePalette: 'standard', textSize: 'standard' })
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().tyrePalette).toBe('cb')
      expect(useSettingsStore.getState().textSize).toBe('large')
    })
  })
})
