import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mem = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) }),
    get: vi.fn(async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null })),
    remove: vi.fn(async ({ key }: { key: string }) => { mem.delete(key) }),
  },
}))

import { useSettingsStore } from '@state/settingsStore'
import { useCoachStore } from '@state/coachStore'
import { COACH_MARK_IDS, NEW_COACH_MARKS, isNewCoachMark } from '@state/coachMarks'
import { SettingsScreen } from '@ui/SettingsPanel'

beforeEach(() => {
  mem.clear()
  useSettingsStore.setState({ coachSeen: {}, coachMarksSeen: false })
  useCoachStore.setState({ active: null, done: {} })
})

describe('per-mark coach flags (spec 1.6 §9)', () => {
  it('knows seven marks, three of them new', () => {
    expect(COACH_MARK_IDS).toHaveLength(7)
    expect([...NEW_COACH_MARKS]).toEqual(['safety_car', 'pit_window', 'radio_request'])
    expect(isNewCoachMark('tyre_cliff')).toBe(false)
    expect(isNewCoachMark('safety_car')).toBe(true)
  })

  it('dismissing a NEW mark persists it; dismissing an original one does not touch coachSeen', async () => {
    useCoachStore.getState().request('safety_car')
    useCoachStore.getState().dismiss('safety_car')
    useCoachStore.getState().request('tyre_cliff')
    useCoachStore.getState().dismiss('tyre_cliff')
    expect(useSettingsStore.getState().coachSeen).toEqual({ safety_car: true })
    useSettingsStore.setState({ coachSeen: {} })
    await useSettingsStore.getState().loadSettings()
    expect(useSettingsStore.getState().coachSeen).toEqual({ safety_car: true })
  })

  it('reads malformed or foreign JSON as nothing seen', async () => {
    for (const raw of ['not json', '[1,2]', '{"safety_car":"yes","bogus":true}', 'null']) {
      mem.set('settings.coachSeen', raw)
      await useSettingsStore.getState().loadSettings()
      expect(useSettingsStore.getState().coachSeen, raw).toEqual({})
    }
  })

  it('resetCoachSeen clears; setAllCoachSeen marks all three new', () => {
    useSettingsStore.getState().setAllCoachSeen()
    expect(useSettingsStore.getState().coachSeen).toEqual({ safety_car: true, pit_window: true, radio_request: true })
    useSettingsStore.getState().resetCoachSeen()
    expect(useSettingsStore.getState().coachSeen).toEqual({})
  })

  it('keeps every earlier key intact (positional destructure)', async () => {
    useSettingsStore.getState().setTextSize('large')
    useSettingsStore.getState().markCoachSeen('pit_window')
    useSettingsStore.setState({ textSize: 'standard', coachSeen: {} })
    await useSettingsStore.getState().loadSettings()
    expect(useSettingsStore.getState().textSize).toBe('large')
    expect(useSettingsStore.getState().coachSeen).toEqual({ pit_window: true })
  })
})

describe('Replay tutorial (spec 1.6 §9)', () => {
  it('CLEARS ALL: the original four and the three new marks', () => {
    useSettingsStore.setState({ coachMarksSeen: true, coachSeen: { safety_car: true, pit_window: true } })
    render(<SettingsScreen />)
    fireEvent.click(screen.getByRole('switch', { name: /replay tutorial/i }))
    expect(useSettingsStore.getState().coachMarksSeen).toBe(false)
    expect(useSettingsStore.getState().coachSeen).toEqual({})
  })
})
