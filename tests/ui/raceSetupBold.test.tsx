import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { RaceSetup, computeStartWeather } from '@ui/RaceSetup'
import { useSettingsStore } from '@state/settingsStore'
import { useSeasonStore } from '@state/seasonStore'
import { CIRCUIT_ORDER } from '@state/raceStore'
import circuitsJson from '@data/circuits.json'

const CIRCUITS = (circuitsJson as unknown as { circuits: Record<string, { name: string; laps: number }> }).circuits
const WORD = { DRY: 'Dry', DAMP: 'Damp', WET: 'Wet' } as const

beforeEach(() => {
  useSettingsStore.setState({ reducedMotion: true })
  Element.prototype.scrollIntoView = () => {} // jsdom lacks it
  useSeasonStore.setState({ raceIndex: 0, attemptNonce: 0 })
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
    const id = CIRCUIT_ORDER[useSeasonStore.getState().raceIndex % CIRCUIT_ORDER.length]!
    const h = screen.getByRole('heading', { level: 2, name: CIRCUITS[id]!.name })
    expect(h.style.whiteSpace).not.toBe('nowrap')
    expect(h.style.textOverflow).not.toBe('ellipsis')
  })
  it('shows the seeded forecast for the next three laps, icon and word', () => {
    // Find an attempt whose laps 2-4 differ from lap 1, so the test can tell
    // the forecast apart from the start pill. raceIndex 1: round 1 is forced dry.
    let found: { nonce: number; next: string[] } | null = null
    for (let nonce = 0; nonce < 60 && !found; nonce++) {
      useSeasonStore.setState({ raceIndex: 1, attemptNonce: nonce })
      const id = CIRCUIT_ORDER[1 % CIRCUIT_ORDER.length]!
      const t = computeStartWeather(id, CIRCUITS[id]!.laps, useSeasonStore.getState().currentSeed(), false)
      if (t.slice(1, 4).some(w => w !== t[0])) found = { nonce, next: t.slice(1, 4) }
    }
    expect(found).not.toBeNull()
    useSeasonStore.setState({ raceIndex: 1, attemptNonce: found!.nonce })
    const { container } = render(<RaceSetup />)
    const shown = [...container.querySelectorAll('[data-forecast]')]
    expect(shown.map(e => e.getAttribute('data-forecast'))).toEqual(found!.next)
    shown.forEach((e, i) => expect(e.textContent).toMatch(new RegExp(`^\\+${i + 1} \\S+ ${WORD[found!.next[i] as keyof typeof WORD]}$`)))
  })
  it('marks the recommended start tyre visibly and in its description', () => {
    render(<RaceSetup />) // round 1 is forced dry: Medium is recommended
    const group = screen.getByRole('radiogroup', { name: 'Start tyre' })
    const medium = within(group).getByRole('radio', { name: 'Medium' })
    expect(medium.textContent).toMatch(/REC/)
    const desc = document.getElementById(medium.getAttribute('aria-describedby') ?? '')
    expect(desc?.textContent).toMatch(/recommended/i)
    const soft = within(group).getByRole('radio', { name: 'Soft' })
    expect(soft.getAttribute('aria-describedby')).toBeNull()
    expect(soft.textContent).not.toMatch(/REC/)
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
    fireEvent.pointerMove(s, { clientX: 350, buttons: 1 })          // 250/400*40 = 25
    fireEvent.pointerMove(s, { clientX: 1000, buttons: 1 })         // past the end: clamps to 37
    fireEvent.pointerMove(s, { clientX: 0, buttons: 1 })  // past the start: clamps to 5
    fireEvent.pointerUp(s, { pointerId: 1 })
    fireEvent.pointerMove(s, { clientX: 300, buttons: 1 }) // released: ignored
    expect(calls).toEqual([[0, 25], [0, 37], [0, 5]])
  })
  const rect = { left: 0, width: 200, top: 0, height: 48, right: 200, bottom: 48, x: 0, y: 0, toJSON: () => ({}) }
  it('a press in the overlap of two close splits grabs the nearest one', async () => {
    const { StintBar } = await import('@ui/StintBar')
    const calls: [number, number][] = []
    // 20 laps over 200 px: stops at laps 9 and 13 sit 40 px apart, closer than their 48 px hit areas.
    render(<StintBar laps={20} startCompound="M" stops={[{ lap: 9, compound: 'H' }, { lap: 13, compound: 'M' }]} onChange={(i, l) => calls.push([i, l])} />)
    const s2 = screen.getByRole('slider', { name: 'Stop 2 lap' })
    ;(s2.parentElement as HTMLElement).getBoundingClientRect = () => rect
    // Pressed on stop 2's element, but at x=100 (lap 10): nearest split is stop 1.
    fireEvent.pointerDown(s2, { clientX: 100, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(s2, { clientX: 70, buttons: 1 })   // lap 7
    expect(calls).toEqual([[0, 7]])
    fireEvent.pointerUp(s2, { pointerId: 1 })
    // Pressed at x=125 (lap 12.5): nearest is stop 2.
    fireEvent.pointerDown(s2, { clientX: 125, pointerId: 2, buttons: 1 })
    fireEvent.pointerMove(s2, { clientX: 160, buttons: 1 })  // lap 16
    expect(calls).toEqual([[0, 7], [1, 16]])
  })
  it('a move with no button held ends a drag whose release was missed', async () => {
    const { StintBar } = await import('@ui/StintBar')
    const calls: [number, number][] = []
    render(<StintBar laps={20} startCompound="M" stops={[{ lap: 10, compound: 'H' }]} onChange={(i, l) => calls.push([i, l])} />)
    const s = screen.getByRole('slider', { name: 'Stop 1 lap' })
    ;(s.parentElement as HTMLElement).getBoundingClientRect = () => rect
    fireEvent.pointerDown(s, { clientX: 100, pointerId: 1, buttons: 1 })
    fireEvent.pointerMove(s, { clientX: 120, buttons: 0 })   // hover after a lost release: ignored, drag dropped
    fireEvent.pointerMove(s, { clientX: 140, buttons: 1 })   // still not dragging
    expect(calls).toEqual([])
  })
  it('losing pointer capture ends the drag', async () => {
    const { StintBar } = await import('@ui/StintBar')
    const calls: [number, number][] = []
    render(<StintBar laps={20} startCompound="M" stops={[{ lap: 10, compound: 'H' }]} onChange={(i, l) => calls.push([i, l])} />)
    const s = screen.getByRole('slider', { name: 'Stop 1 lap' })
    ;(s.parentElement as HTMLElement).getBoundingClientRect = () => rect
    fireEvent.pointerDown(s, { clientX: 100, pointerId: 1, buttons: 1 })
    fireEvent.lostPointerCapture(s, { pointerId: 1 })
    fireEvent.pointerMove(s, { clientX: 140, buttons: 1 })
    expect(calls).toEqual([])
  })
})
