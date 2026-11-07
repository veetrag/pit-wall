import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ScOutlook, outlookLabel, REASON_TEXT } from '@ui/ScOutlook'
import { useRaceStore } from '@state/raceStore'
import { initRace } from '@engine/race'
import { makeTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

describe('SC meter (spec §9.3)', () => {
  beforeEach(() => useRaceStore.getState().resetRace())

  it('labels: OUT, and a rounded percentage with the band', () => {
    expect(outlookLabel({ kind: 'out' })).toBe('SC OUT')
    expect(outlookLabel({ kind: 'clear', chance: 0.236, band: 'medium', horizon: 5, reasons: [] })).toBe('SC 24% · MED')
  })

  it('renders a 44px button with a full spoken label, and the reasons card on tap', () => {
    const base = makeConfig({}, 3, 'harbour_lights')
    const config = { ...base, tuning: makeTuning({ incidents: { circuitRiskWeight: 1 } }) }
    useRaceStore.setState({ config, raceState: { ...initRace(config), lap: 10 }, phase: 'racing' })
    render(<ScOutlook />)
    const btn = screen.getByRole('button', { name: /safety car chance next 5 laps \d+ percent/i })
    expect(parseInt(getComputedStyle(btn).minHeight, 10)).toBeGreaterThanOrEqual(44)
    fireEvent.click(btn)
    expect(screen.getByText(REASON_TEXT.street)).toBeTruthy()
  })

  it('reads OUT while a neutralisation is out, and the spoken label says so', () => {
    const config = makeConfig({}, 3, 'harbour_lights')
    const st = initRace(config)
    useRaceStore.setState({ config, raceState: { ...st, lap: 10, safetyCar: { kind: 'vsc', lapsRemaining: 2 } as never }, phase: 'racing' })
    render(<ScOutlook />)
    expect(screen.getByRole('button', { name: /out now/i })).toBeTruthy()
    expect(screen.getByText('SC OUT')).toBeTruthy()
  })
})

describe('pit panel SC chance line (spec §9.1)', () => {
  beforeEach(() => useRaceStore.getState().resetRace())

  it('states the same number as the meter, and hides while OUT', async () => {
    const { useScChanceLine } = await import('@ui/ScOutlook')
    const config = makeConfig({}, 3, 'harbour_lights')
    useRaceStore.setState({ config, raceState: { ...initRace(config), lap: 10 }, phase: 'racing' })
    function Probe() { return <div>{useScChanceLine() ?? 'none'}</div> }
    const { unmount } = render(<><Probe /><ScOutlook /></>)
    const pct = /SC (\d+)%/.exec(screen.getByText(/^SC \d+% · /).textContent ?? '')?.[1]
    expect(screen.getByText(`SC CHANCE NEXT 5 LAPS: ${pct}%`)).toBeTruthy()
    unmount()
    useRaceStore.setState({ raceState: { ...initRace(config), lap: 10, safetyCar: { kind: 'sc', lapsRemaining: 2 } as never } })
    render(<Probe />)
    expect(screen.getByText('none')).toBeTruthy()
  })
})

describe('SC meter card behaviour', () => {
  beforeEach(() => useRaceStore.getState().resetRace())
  const setup = (lap = 10) => {
    const config = makeConfig({}, 3, 'harbour_lights')
    const st = initRace(config)
    useRaceStore.setState({ config, raceState: { ...st, lap }, phase: 'racing' })
    return st
  }

  it('lit segments step 35/65/100% opacity', () => {
    setup()
    render(<ScOutlook />)
    const ops = screen.getAllByTestId('sc-seg').map(e => parseFloat((e as HTMLElement).style.opacity))
    const lit = ops.filter(o => o > 0.2)
    expect(lit).toEqual([0.35, 0.65, 1].slice(0, lit.length))
  })

  it('focuses the card on open, Escape closes and returns focus', () => {
    setup()
    render(<ScOutlook />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    const card = screen.getByRole('dialog')
    expect(document.activeElement).toBe(card)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(btn)
  })

  it('closes on outside tap and on lap change', () => {
    const st = setup()
    render(<ScOutlook />)
    const btn = screen.getByRole('button')
    fireEvent.click(btn)
    fireEvent.pointerDown(document.body)
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    act(() => useRaceStore.setState({ raceState: { ...st, lap: 11 } }))
    expect(btn.getAttribute('aria-expanded')).toBe('false')
  })

  it('OUT is not expandable', () => {
    const config = makeConfig({}, 3, 'harbour_lights')
    useRaceStore.setState({ config, raceState: { ...initRace(config), lap: 10, safetyCar: { kind: 'sc', lapsRemaining: 2 } as never }, phase: 'racing' })
    render(<ScOutlook />)
    const btn = screen.getByRole('button')
    expect(btn.hasAttribute('aria-expanded')).toBe(false)
    fireEvent.click(btn)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
