import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AnimatePresence } from 'framer-motion'
import { ScreenFrame, ScreenHeader, StatTile, Tabs, KitToggle } from '@ui/kit'
import { useSettingsStore } from '@state/settingsStore'

vi.mock('@capacitor/haptics', () => ({ Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) }, ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {} }))

beforeEach(() => useSettingsStore.setState({ reducedMotion: true }))

describe('kit 2', () => {
  it('KitToggle name is the label and its description carries the sub', () => {
    render(<KitToggle label="Haptics" sub="Vibrate on taps" checked={false} onChange={() => {}} />)
    const sw = screen.getByRole('switch', { name: 'Haptics' })
    const d = sw.getAttribute('aria-describedby')!
    expect(document.getElementById(d)!.textContent).toBe('Vibrate on taps')
  })
  it('ScreenFrame is an opaque, absolutely positioned, labelled region', () => {
    render(<ScreenFrame label="Settings"><p>x</p></ScreenFrame>)
    const el = screen.getByRole('region', { name: 'Settings' })
    expect(el.style.position).toBe('absolute')
    expect([el.style.top, el.style.right, el.style.bottom, el.style.left]).toEqual(['0px', '0px', '0px', '0px'])
    expect(el.style.background).toContain('--ink')
  })
  it('ScreenHeader has a 48px Back button only when onBack is given', () => {
    let n = 0
    const { rerender } = render(<ScreenHeader eyebrow="CAREER" title="Trophy room" onBack={() => { n++ }} />)
    const back = screen.getByRole('button', { name: 'Back' })
    expect(back.style.width).toBe('48px'); expect(back.style.height).toBe('48px')
    fireEvent.click(back); expect(n).toBe(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Trophy room' })).toBeTruthy()
    rerender(<ScreenHeader title="Trophy room" />)
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })
  it('StatTile shows value and label; volt tone uses ink text', () => {
    render(<StatTile value="P1" label="BEST" tone="volt" />)
    const tile = screen.getByText('P1').parentElement as HTMLElement
    expect(tile.style.background).toContain('--volt')
    expect(tile.style.color).toContain('--ink')
    expect(screen.getByText('BEST')).toBeTruthy()
  })
  it('Tabs is a tablist with one tab stop and arrow keys', () => {
    let v = 'drivers'
    render(<Tabs ariaLabel="Standings" value="drivers" onChange={x => { v = x }}
      tabs={[{ value: 'drivers', label: 'DRIVERS' }, { value: 'teams', label: 'TEAMS' }]} />)
    expect(screen.getByRole('tablist', { name: 'Standings' })).toBeTruthy()
    const tabs = screen.getAllByRole('tab')
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true')
    expect(tabs.map(t => t.tabIndex)).toEqual([0, -1])
    fireEvent.keyDown(tabs[0]!, { key: 'ArrowRight' }); expect(v).toBe('teams')
    fireEvent.click(tabs[0]!); expect(v).toBe('drivers')
  })
  it('KitToggle is a switch with a 48px target that reports its state', () => {
    let on = false
    render(<KitToggle label="Sound effects" sub="Engine, pit and UI audio" checked={false} onChange={x => { on = x }} />)
    const sw = screen.getByRole('switch', { name: 'Sound effects' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(parseInt(sw.style.minHeight, 10)).toBeGreaterThanOrEqual(48)
    fireEvent.click(sw); expect(on).toBe(true)
  })
})

describe('screen switch never shows a blank or faded frame', () => {
  for (const reduced of [true, false]) {
    it(`old frame holds opaque and below the new one, then leaves (reducedMotion=${reduced})`, async () => {
      useSettingsStore.setState({ reducedMotion: reduced })
      const App = ({ k }: { k: 'a' | 'b' }) => (
        <AnimatePresence initial={false}>
          {k === 'a' ? <ScreenFrame key="a" label="Alpha"><p>a</p></ScreenFrame> : <ScreenFrame key="b" label="Beta"><p>b</p></ScreenFrame>}
        </AnimatePresence>
      )
      const { rerender } = render(<App k="a" />)
      rerender(<App k="b" />)
      // Immediately after the swap (no timers advanced): both are mounted.
      const oldF = screen.getByRole('region', { name: 'Alpha' })
      const newF = screen.getByRole('region', { name: 'Beta' })
      expect(parseFloat(oldF.style.opacity || '1')).toBeGreaterThanOrEqual(1)
      // Framer applies the exit's instant zIndex drop on the next animation frame.
      await waitFor(() => expect(Number(screen.getByRole('region', { name: 'Alpha' }).style.zIndex)).toBeLessThan(Number(newF.style.zIndex)))
      // Mid-hold the old one is still there and still opaque.
      await new Promise(r => setTimeout(r, 60))
      const mid = screen.queryByRole('region', { name: 'Alpha' })
      expect(mid).toBeTruthy()
      expect(parseFloat(mid!.style.opacity || '1')).toBeGreaterThanOrEqual(1)
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Alpha' })).toBeNull(), { timeout: 1500 })
      expect(screen.getByRole('region', { name: 'Beta' })).toBeTruthy()
    })
  }
})
