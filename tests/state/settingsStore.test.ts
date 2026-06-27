import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from '@state/settingsStore'

describe('settingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({ soundEnabled: true, hapticsEnabled: true, reducedMotion: false })
  })

  it('has correct defaults', () => {
    const s = useSettingsStore.getState()
    expect(s.soundEnabled).toBe(true)
    expect(s.hapticsEnabled).toBe(true)
    expect(s.reducedMotion).toBe(false)
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
})
