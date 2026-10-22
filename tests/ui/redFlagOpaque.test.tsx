import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useRaceStore } from '@state/raceStore'
import { useSeasonStore } from '@state/seasonStore'
import { RedFlagCard } from '@ui/RedFlagCard'
import { RaceHUD } from '@ui/RaceHUD'
import { makeDeterministicTuning } from '../fixtures/tuning'

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' }, NotificationType: {},
}))

/*
 * 1.6 device playthrough: the RED FLAG card was see-through -- radio text, the
 * tower, "RESTART AT LAP" and the tyre gauge showed behind it. The card root
 * must be opaque ink over the whole viewport from its first frame, and the
 * HUD behind it hidden from assistive tech and input.
 */
const r = () => useRaceStore.getState()
function toRedFlag() {
  r().resetRace()
  r().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie',
    { startCompound: 'M', plannedStops: [{ lap: 30, compound: 'H' }] }, null, undefined, false)
  const c = r().config!
  const crasher = c.drivers.find(d => d.id !== 'd_voss')!.id
  const tuning = makeDeterministicTuning({
    incidents: {
      driverErrorPerLap: 3, consistencyReliefMax: 1, terminalFraction: 1,
      redFlag: { crashChance: 1, maxPerRace: 1, minLapsLeft: 5, planWindowLaps: 15 },
    },
    tyreFailure: { chancePerLapOverThreshold: 0, maxChancePerLap: 0 },
  })
  useRaceStore.setState({
    phase: 'racing',
    config: { ...c, tuning, drivers: c.drivers.map(d => ({ ...d, facets: { ...d.facets, consistency: d.id === crasher ? 0 : 100 } })) },
  })
  for (let n = 0; n < 12 && r().phase === 'racing'; n++) r().step()
  expect(r().phase).toBe('red_flag')
}

describe('RED FLAG card is opaque and owns the screen', () => {
  it('root is fixed, covers the viewport, ink background, never translucent', () => {
    toRedFlag()
    render(<RedFlagCard />)
    const root = screen.getByTestId('red-flag-root')
    expect(root.style.position).toBe('fixed')
    for (const side of ['top', 'right', 'bottom', 'left'] as const) expect(root.style[side]).toBe('0px')
    expect(root.style.background).toBe('var(--ink)')
    // No fade on the root: an opacity below 1 is exactly the see-through card.
    expect(root.style.opacity === '' || root.style.opacity === '1').toBe(true)
    // Rendered at the body, outside any transformed/faded screen frame.
    expect(root.parentElement).toBe(document.body)
  })

  it('the HUD behind it is aria-hidden and inert while the card is up', () => {
    toRedFlag()
    useSeasonStore.setState({ phase: 'racing' })
    render(<RaceHUD />)
    const hud = screen.getByTestId('race-hud-body')
    expect(hud.getAttribute('aria-hidden')).toBe('true')
    expect(hud.hasAttribute('inert')).toBe(true)
  })
})
