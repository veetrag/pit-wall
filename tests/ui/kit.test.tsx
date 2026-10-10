import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { KitButton, Pill, Segmented, TyreChip, ProgressStrip, useCountUp } from '@ui/kit'
import { useSettingsStore } from '@state/settingsStore'
import { soundService } from '@audio/soundService'

vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) }, ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {} }))

vi.mock('@audio/soundService', () => ({ soundService: { play: vi.fn() } }))

beforeEach(() => useSettingsStore.setState({ reducedMotion: true }))

describe('kit', () => {
  it('KitButton is a real button with the variant fill and ink text on volt', () => {
    let n = 0
    render(<KitButton variant="primary" onClick={() => { n++ }}>Race now</KitButton>)
    const b = screen.getByRole('button', { name: 'Race now' })
    expect(b.style.background).toContain('--volt')
    expect(b.style.color).toContain('--ink')
    expect(b.className).toContain('slant-')
    fireEvent.click(b); expect(n).toBe(1)
  })
  it('primary and urgent clicks play the UI sound unless sound={false}', () => {
    vi.mocked(soundService.play).mockClear()
    render(<KitButton variant="primary" onClick={() => {}}>Go</KitButton>)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(soundService.play).toHaveBeenCalledWith('navTap')
    vi.mocked(soundService.play).mockClear()
    render(<KitButton variant="urgent" sound={false} onClick={() => {}}>Box</KitButton>)
    fireEvent.click(screen.getByRole('button', { name: 'Box' }))
    expect(soundService.play).not.toHaveBeenCalled()
  })
  it('urgent uses hot with ink text', () => {
    render(<KitButton variant="urgent" onClick={() => {}}>Pit</KitButton>)
    const b = screen.getByRole('button', { name: 'Pit' })
    expect(b.style.background).toContain('--hot')
    expect(b.style.color).toContain('--ink')
  })
  it('Segmented is a radiogroup and reports the picked value', () => {
    let v = ''
    render(<Segmented ariaLabel="Pace mode" value="neutral" onChange={x => { v = x }}
      options={[{ value: 'conserve', label: 'SAVE' }, { value: 'neutral', label: 'HOLD' }, { value: 'push', label: 'PUSH' }]} />)
    expect(screen.getByRole('radiogroup', { name: 'Pace mode' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /HOLD/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.click(screen.getByRole('radio', { name: /PUSH/ })); expect(v).toBe('push')
  })
  it('TyreChip names the compound and shows its letter', () => {
    render(<TyreChip compound="M" />)
    expect(screen.getByLabelText('Medium')).toBeTruthy()
    expect(screen.getByText('M')).toBeTruthy()
  })
  it('ProgressStrip states progress for screen readers', () => {
    render(<ProgressStrip total={12} done={3} />)
    expect(screen.getByLabelText('3 of 12 rounds done')).toBeTruthy()
  })
  it('Pill renders its content', () => {
    render(<Pill>190 DP</Pill>); expect(screen.getByText('190 DP')).toBeTruthy()
  })
  it('useCountUp lands instantly under reduced motion', () => {
    function C() { return <span>{useCountUp(18)}</span> }
    render(<C />); expect(screen.getByText('18')).toBeTruthy()
  })
  it('useCountUp counts up when motion is on', () => {
    vi.useFakeTimers(); useSettingsStore.setState({ reducedMotion: false })
    function C() { return <span data-testid="n">{useCountUp(18, 400)}</span> }
    render(<C />)
    expect(Number(screen.getByTestId('n').textContent)).toBeLessThan(18)
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.getByTestId('n').textContent).toBe('18')
    vi.useRealTimers()
  })
})

describe('KitButton haptic opt-out', () => {
  it('haptic={false} suppresses the kit impact but still calls onClick', async () => {
    const { Haptics } = await import('@capacitor/haptics')
    useSettingsStore.setState({ hapticsEnabled: true })
    vi.mocked(Haptics.impact).mockClear()
    let n = 0
    render(<KitButton variant="urgent" haptic={false} onClick={() => { n++ }}>Box</KitButton>)
    fireEvent.click(screen.getByRole('button', { name: 'Box' }))
    expect(n).toBe(1)
    expect(Haptics.impact).not.toHaveBeenCalled()
  })
  it('haptics stay on by default for primary/urgent', async () => {
    const { Haptics } = await import('@capacitor/haptics')
    useSettingsStore.setState({ hapticsEnabled: true })
    vi.mocked(Haptics.impact).mockClear()
    render(<KitButton variant="primary" onClick={() => {}}>Go</KitButton>)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(Haptics.impact).toHaveBeenCalledTimes(1)
  })
})

describe('KitButton testId', () => {
  it('passes testId through as data-testid', () => {
    render(<KitButton variant="primary" testId="go-btn" onClick={() => {}}>Go</KitButton>)
    expect(screen.getByTestId('go-btn').tagName).toBe('BUTTON')
  })
})
