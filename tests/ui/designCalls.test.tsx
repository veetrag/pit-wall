import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Pill, Segmented } from '@ui/kit'
import { LadderReveal } from '@ui/LadderReveal'
import { useSettingsStore } from '@state/settingsStore'
import { soundService } from '@audio/soundService'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {},
}))
vi.mock('@audio/soundService', () => ({ soundService: { play: vi.fn() } }))

beforeEach(() => { useSettingsStore.setState({ reducedMotion: true }); vi.mocked(soundService.play).mockClear() })
afterEach(() => { vi.useRealTimers() })

describe('rain pill', () => {
  it('rings in the wet-tyre blue, not race-control caution', () => {
    render(<Pill tone="rain">Rain likely in 3L</Pill>)
    const el = screen.getByText('Rain likely in 3L')
    expect(el.style.boxShadow).toContain('--tyre-wet')
    expect(el.style.background).not.toContain('--caution')
  })
})

describe('Segmented keyboard', () => {
  const opts = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]
  it('is one tab stop and arrows move the selection, wrapping', () => {
    let v = 'a'
    const { rerender } = render(<Segmented ariaLabel="Pick" options={opts} value={v} onChange={x => { v = x }} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map(r => r.tabIndex)).toEqual([0, -1, -1])
    fireEvent.keyDown(radios[0]!, { key: 'ArrowRight' }); expect(v).toBe('b')
    rerender(<Segmented ariaLabel="Pick" options={opts} value="a" onChange={x => { v = x }} />)
    fireEvent.keyDown(radios[0]!, { key: 'ArrowLeft' }); expect(v).toBe('c')
  })
})

describe('ladder reveal feedback', () => {
  const up = [{ teamId: 'terra', deserved: 7, finished: 4, before: 1, after: 2 }]
  it('lands with the verdict, not on mount', () => {
    useSettingsStore.setState({ reducedMotion: false })
    vi.useFakeTimers()
    render(<LadderReveal moves={up} playerTeamId="terra" />)
    expect(soundService.play).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(700) })
    expect(soundService.play).toHaveBeenCalledWith('positionGain')
  })
  it('fires at once under reduced motion', () => {
    render(<LadderReveal moves={up} playerTeamId="terra" />)
    expect(soundService.play).toHaveBeenCalledWith('positionGain')
  })
})
