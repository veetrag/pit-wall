import { describe, it, expect, beforeEach, vi } from 'vitest'

const mem = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) }),
    get: vi.fn(async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null })),
    remove: vi.fn(async ({ key }: { key: string }) => { mem.delete(key) }),
  },
}))

import { useSettingsStore } from '@state/settingsStore'
import { applyDisplaySettings, startDisplaySettingsSync } from '@state/displaySettings'

beforeEach(() => {
  mem.clear()
  useSettingsStore.setState({ tyrePalette: 'standard' })
  delete document.documentElement.dataset.palette
})

describe('display settings on the root element', () => {
  it('sets data-palette="cb" for high contrast and removes it for standard', () => {
    const el = document.createElement('div')
    applyDisplaySettings(el, { tyrePalette: 'cb' })
    expect(el.getAttribute('data-palette')).toBe('cb')
    applyDisplaySettings(el, { tyrePalette: 'standard' })
    expect(el.hasAttribute('data-palette')).toBe(false)
  })

  it('follows the store while synced, and stops when unsubscribed', () => {
    const stop = startDisplaySettingsSync()
    useSettingsStore.getState().setTyrePalette('cb')
    expect(document.documentElement.dataset.palette).toBe('cb')
    stop()
    useSettingsStore.getState().setTyrePalette('standard')
    expect(document.documentElement.dataset.palette, 'no longer synced').toBe('cb')
  })

  it('applies the current value immediately on start (no flash of the standard set)', () => {
    useSettingsStore.setState({ tyrePalette: 'cb' })
    const stop = startDisplaySettingsSync()
    expect(document.documentElement.dataset.palette).toBe('cb')
    stop()
  })
})
