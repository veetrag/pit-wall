import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RaceSetup } from '@ui/RaceSetup'
import { useSettingsStore } from '@state/settingsStore'

beforeEach(() => {
  useSettingsStore.setState({ reducedMotion: true })
  Element.prototype.scrollIntoView = () => {} // jsdom lacks it
})

describe('RaceSetup in Race Day Bold', () => {
  it('the circuit card does not shrink, shows the outline, and the plan is a stint bar', () => {
    render(<RaceSetup />)
    const outline = screen.getByRole('img', { name: / layout$/ })
    const card = outline.closest('.slant-lg') as HTMLElement
    expect(card.style.flexShrink).toBe('0')
    expect(screen.getByRole('radiogroup', { name: 'Start tyre' }).querySelectorAll('[role="radio"]')).toHaveLength(5)
    expect(screen.getByRole('slider', { name: 'Stop 1 lap' })).toBeTruthy()
    expect(screen.queryByRole('slider', { name: 'Stop 2 lap' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: '2 STOP' }))
    expect(screen.getByRole('slider', { name: 'Stop 2 lap' })).toBeTruthy()
    expect(screen.getByText(/PLAN:/)).toBeTruthy()
  })
  it('long circuit names wrap', () => {
    render(<RaceSetup />)
    const h = screen.getAllByText(/GP|Grand Prix|Lights|Bay/i)[0] as HTMLElement
    expect(h.style.whiteSpace).not.toBe('nowrap')
  })
  it('switching 1 -> 2 stops with stop 1 late clamps exactly like the old sliders', () => {
    render(<RaceSetup />)
    const s1 = screen.getByRole('slider', { name: 'Stop 1 lap' })
    const laps = Number(s1.getAttribute('aria-valuemax')) + 3
    fireEvent.keyDown(s1, { key: 'End' })
    expect(s1.getAttribute('aria-valuenow')).toBe(String(laps - 3))
    fireEvent.click(screen.getByRole('radio', { name: '2 STOP' }))
    const a = screen.getByRole('slider', { name: 'Stop 1 lap' })
    const b = screen.getByRole('slider', { name: 'Stop 2 lap' })
    expect(a.getAttribute('aria-valuenow')).toBe(String(laps - 3 - 4))
    expect(b.getAttribute('aria-valuenow')).toBe(String(laps - 3))
    expect(b.getAttribute('aria-valuemin')).toBe(String(laps - 3))
    expect(screen.getByText(/PLAN:/).textContent).toMatch(new RegExp(`on lap ${laps - 7} → . on lap ${laps - 3}`))
  })
})

describe('StintBar pointer drag', () => {
  it('maps x over the bar width to a lap and clamps to the bounds', async () => {
    const { StintBar } = await import('@ui/StintBar')
    const calls: [number, number][] = []
    render(<StintBar laps={40} startCompound="M" stops={[{ lap: 20, compound: 'H' }]} onChange={(i, l) => calls.push([i, l])} />)
    const s = screen.getByRole('slider', { name: 'Stop 1 lap' })
    const bar = s.parentElement as HTMLElement
    bar.getBoundingClientRect = () => ({ left: 100, width: 400, top: 0, height: 48, right: 500, bottom: 48, x: 100, y: 0, toJSON: () => ({}) })
    fireEvent.pointerMove(s, { clientX: 300 })          // not dragging yet: ignored
    fireEvent.pointerDown(s, { clientX: 300, pointerId: 1 })
    fireEvent.pointerMove(s, { clientX: 350 })          // 250/400*40 = 25
    fireEvent.pointerMove(s, { clientX: 1000 })         // past the end: clamps to 37
    fireEvent.pointerMove(s, { clientX: 0 })            // past the start: clamps to 5
    fireEvent.pointerUp(s, { pointerId: 1 })
    fireEvent.pointerMove(s, { clientX: 300 })          // released: ignored
    expect(calls).toEqual([[0, 25], [0, 37], [0, 5]])
  })
})
