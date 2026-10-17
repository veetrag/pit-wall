import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LapChart, LapChartCard, highlightedDrivers, lapChartSummary } from '@ui/LapChart'
import { useSettingsStore } from '@state/settingsStore'
import { useDebriefStore } from '@state/debriefStore'
import { useSeasonStore } from '@state/seasonStore'
import { loadGameData } from '@data/validators'
import type { LapHistory, CarHistory } from '@engine/raceHistory'

const DRIVERS = loadGameData().drivers.drivers

/** A 20-car, 30-lap history where car i finishes P(i+1) and holds that place all race. */
function history(overrides: (cars: CarHistory[]) => CarHistory[] = c => c): LapHistory {
  const cars: CarHistory[] = DRIVERS.map((d, i) => ({
    driverId: d.id, teamId: d.teamId, isPlayer: i === 6,
    positions: Array.from({ length: 31 }, () => i + 1), pitLaps: [15], retiredLap: null, finish: i + 1,
  }))
  return {
    totalLaps: 30, lapsRun: 30, cars: overrides(cars),
    neutralisations: [{ kind: 'sc', startLap: 8, endLap: 11 }, { kind: 'vsc', startLap: 20, endLap: 21 }],
  }
}
const id = (i: number) => DRIVERS[i]!.id

beforeEach(() => {
  useSettingsStore.setState({ reducedMotion: false })
  useDebriefStore.getState().cancel()
})

describe('highlighted set', () => {
  it('two ahead and two behind in the midfield', () => {
    expect(highlightedDrivers(history(), id(6))).toEqual([id(4), id(5), id(6), id(7), id(8)])
  })
  it('shifts at P1 and at P20', () => {
    expect(highlightedDrivers(history(), id(0))).toEqual([id(0), id(1), id(2), id(3), id(4)])
    expect(highlightedDrivers(history(), id(19))).toEqual([id(15), id(16), id(17), id(18), id(19)])
  })
})

describe('text summary for screen readers', () => {
  it('names the start, the place after each stop and the finish', () => {
    const h = history(cars => cars.map((c, i) => i === 6
      ? { ...c, positions: c.positions.map((_, lap) => (lap === 0 ? 7 : lap >= 21 ? 3 : lap >= 15 ? 4 : 7)), pitLaps: [21], finish: 3 }
      : c))
    expect(lapChartSummary(h, id(6))).toBe('Started P7, P3 after the stop on lap 21, finished P3')
  })
})

describe('LapChart', () => {
  it('draws the player in volt at 3px, the four nearest in team colour at 2px, the rest faded at 1px', () => {
    const { container } = render(<LapChart history={history()} playerDriverId={id(6)} />)
    const tier = (t: string) => container.querySelectorAll(`[data-tier="${t}"]`).length
    expect(tier('player')).toBe(1)
    expect(tier('near')).toBe(4)
    expect(tier('field')).toBe(15)
    // Read from data attributes: jsdom's CSSStyleDeclaration does not keep SVG
    // properties like `stroke`, so the inline style cannot be asserted directly.
    const player = container.querySelector('[data-tier="player"]')!
    expect(player.getAttribute('data-stroke')).toBe('var(--volt)')
    expect(player.getAttribute('data-width')).toBe('3')
    const near = container.querySelector('[data-tier="near"]')!
    expect(near.getAttribute('data-width')).toBe('2')
    expect(near.getAttribute('data-stroke')).toMatch(/^#[0-9A-Fa-f]{6}$/)
    expect(container.querySelector('[data-tier="field"]')!.getAttribute('data-width')).toBe('1')
  })

  it('marks stops as dots and SC/VSC laps as bands', () => {
    const { container } = render(<LapChart history={history()} playerDriverId={id(6)} />)
    expect(container.querySelectorAll('[data-pit]').length).toBe(20)
    expect(container.querySelector('[data-neutralisation="sc"]')).not.toBeNull()
    expect(container.querySelector('[data-neutralisation="vsc"]')).not.toBeNull()
  })

  it('a legend tap brings that line to the front, and the legend buttons are labelled and 44px', () => {
    const { container } = render(<LapChart history={history()} playerDriverId={id(6)} />)
    const code = DRIVERS[8]!.code
    const btn = screen.getByRole('button', { name: `Bring ${code} to the front` })
    expect(btn.style.minHeight).toBe('44px')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    const lines = [...container.querySelectorAll('[data-line]')]
    expect(lines[lines.length - 1]!.getAttribute('data-line')).toBe(id(8))
  })

  // Final review fix 4: a 13-lap sprint has no L20, so ten-lap ticks left one label.
  const tickLabels = (container: HTMLElement) =>
    [...container.querySelectorAll('svg text')].map(t => t.textContent ?? '').filter(t => /^L\d+$/.test(t))
  it('lap ticks every 10 laps on a full race, every 5 below 25 laps (a sprint)', () => {
    expect(tickLabels(render(<LapChart history={history()} playerDriverId={id(6)} />).container))
      .toEqual(['L10', 'L20', 'L30'])
    const sprint = history(cars => cars.map(c => ({ ...c, positions: c.positions.slice(0, 14), pitLaps: [] })))
    const short: LapHistory = { ...sprint, totalLaps: 13, lapsRun: 13, neutralisations: [] }
    expect(tickLabels(render(<LapChart history={short} playerDriverId={id(6)} />).container))
      .toEqual(['L5', 'L10'])
  })

  it('reduced motion draws the lines complete', () => {
    useSettingsStore.setState({ reducedMotion: true })
    const { container } = render(<LapChart history={history()} playerDriverId={id(6)} />)
    expect(container.querySelector('svg')!.getAttribute('data-animated')).toBe('false')
    // No draw-in: the polyline starts fully drawn (pathLength 1, never 0).
    const lines = container.querySelectorAll('polyline')
    expect(lines.length).toBeGreaterThan(0)
    lines.forEach(l => expect(l.getAttribute('pathLength')).toBe('1'))
  })

  it('draws the SC band after the VSC band, so SC wins a shared handover lap', () => {
    const h = { ...history(), neutralisations: [{ kind: 'vsc' as const, startLap: 5, endLap: 8 }, { kind: 'sc' as const, startLap: 8, endLap: 12 }] }
    const { container } = render(<LapChart history={h} playerDriverId={id(6)} />)
    const kinds = [...container.querySelectorAll('[data-neutralisation]')].map(e => e.getAttribute('data-neutralisation'))
    expect(kinds).toEqual(['vsc', 'sc'])
    const swapped = { ...h, neutralisations: [h.neutralisations[1]!, h.neutralisations[0]!] }
    const r2 = render(<LapChart history={swapped} playerDriverId={id(6)} />)
    expect([...r2.container.querySelectorAll('[data-neutralisation]')].map(e => e.getAttribute('data-neutralisation'))).toEqual(['vsc', 'sc'])
  })

  it('A PLAYER OUT ON LAP 1 (Review Focus 4): renders a point and an ×, no NaN anywhere', () => {
    const h = history(cars => cars.map((c, i) => i === 6
      ? { ...c, positions: [7], pitLaps: [], retiredLap: 1, finish: 20 }
      : c))
    const { container } = render(<LapChart history={h} playerDriverId={id(6)} />)
    expect(container.innerHTML).not.toMatch(/NaN/)
    expect(container.querySelector('[data-tier="player"] [data-retired]')).not.toBeNull()
    expect(lapChartSummary(h, id(6))).toBe('Started P7, retired on lap 1')
    expect(container.querySelector('svg')!.getAttribute('aria-label')).toBe('Started P7, retired on lap 1')
  })
})

describe('retirement marker', () => {
  it('sits at the last vertex of the line for a car retired mid-race', () => {
    const h = history(cars => cars.map((c, i) => i === 6
      ? { ...c, positions: [7, 7, 8, 9, 10, 11], pitLaps: [], retiredLap: 6, finish: 20 }
      : c))
    const { container } = render(<LapChart history={h} playerDriverId={id(6)} />)
    const line = container.querySelector('[data-tier="player"] polyline')!
    const pts = line.getAttribute('points')!.split(' ')
    const [lx, ly] = pts[pts.length - 1]!.split(',').map(Number)
    const cross = container.querySelector('[data-tier="player"] [data-retired] line')!
    const mid = (Number(cross.getAttribute('x1')) + Number(cross.getAttribute('x2'))) / 2
    const midY = (Number(cross.getAttribute('y1')) + Number(cross.getAttribute('y2'))) / 2
    expect(mid).toBeCloseTo(lx!, 1)
    expect(midY).toBeCloseTo(ly!, 1)
  })
})

describe('LapChartCard', () => {
  it('renders nothing without a history (a race resumed from a save)', () => {
    useSeasonStore.setState({ playerDriverId: id(6) })
    const { container } = render(<LapChartCard />)
    expect(container.innerHTML).toBe('')
  })

  it('shows a busy placeholder while the debrief runs with no history yet', () => {
    useSeasonStore.setState({ playerDriverId: id(6) })
    useDebriefStore.setState({ history: null, raceKey: 'k', status: 'running' })
    render(<LapChartCard />)
    const region = screen.getByRole('region', { name: 'Lap chart' })
    expect(region.getAttribute('aria-busy')).toBe('true')
    expect(region.textContent).toContain('BUILDING LAP CHART')
  })

  it('renders nothing when idle or failed without a history', () => {
    useSeasonStore.setState({ playerDriverId: id(6) })
    for (const status of ['idle', 'failed'] as const) {
      useDebriefStore.setState({ history: null, raceKey: 'k', status })
      const { container, unmount } = render(<LapChartCard />)
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })

  it('renders the chart once the debrief has delivered the history', () => {
    useSeasonStore.setState({ playerDriverId: id(6) })
    useDebriefStore.setState({ history: history(), raceKey: 'k', status: 'running' })
    render(<LapChartCard />)
    expect(screen.getByRole('region', { name: 'Lap chart' })).toBeTruthy()
  })
})
