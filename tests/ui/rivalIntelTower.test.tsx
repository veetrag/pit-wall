import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { act } from 'react'
import { useRaceStore } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { TimingTower } from '@ui/TimingTower'
import { intelAriaLabel, intelStatusText } from '@ui/RivalIntelCard'
import { initRace } from '@engine/index'
import { loadGameData } from '@data/validators'
import { makeDeterministicTuning } from '../fixtures/tuning'
import type { RaceConfig, RaceState } from '@engine/types'

const DATA = loadGameData()
const PLAYER = DATA.drivers.drivers[0]!.id
const config: RaceConfig = {
  circuit: DATA.circuits['veloce']!, tuning: makeDeterministicTuning(), compounds: DATA.compounds,
  drivers: DATA.drivers.drivers, teams: DATA.cars.teams,
  strategies: DATA.strategies.defaults.map(s => ({ ...s, brain: s.brain ?? 'naive' })),
  playerDriverId: PLAYER, seed: 1,
}
const base: RaceState = initRace(config)

function show(state: RaceState) {
  act(() => { useRaceStore.setState({ config, raceState: state, pitPanelOpen: false, projectionResult: null }) })
}
const rivalRows = () => screen.getAllByRole('button', { name: /^Rival intel:/ })

beforeEach(() => {
  useSettingsStore.setState({ reducedMotion: true, driverNameFormat: 'code' })
  useRaceStore.setState({ raceState: null, config: null, pitPanelOpen: false, projectionResult: null })
})

describe('labels', () => {
  it('reads the facts and the window aloud, never the brain', () => {
    const intel = { driverId: 'x', compound: 'M' as const, tyreAge: 14, stops: 1, status: 'window' as const, from: 18, to: 22 }
    expect(intelAriaLabel(intel, 'VER')).toBe('Rival intel: VER, medium, 14 laps old, 1 stop, box window lap 18 to 22')
    expect(intelStatusText(intel)).toBe('BOX WINDOW L18–22')
    expect(intelAriaLabel({ ...intel, status: 'flag' }, 'VER')).toBe('Rival intel: VER, medium, 14 laps old, 1 stop, running to the flag')
    expect(intelStatusText({ ...intel, status: 'out' })).toBe('OUT')
    expect(intelAriaLabel({ ...intel, tyreAge: 1, stops: 0 }, 'VER')).toMatch(/1 lap old, 0 stops/)
  })
})

describe('TimingTower rival intel', () => {
  it('every rival row is a labelled button; the player row is not', () => {
    render(<TimingTower />)
    show(base)
    const rows = rivalRows()
    expect(rows.length).toBe(5)   // compact window: six rows, one of them the player's
    const playerCode = DATA.drivers.drivers[0]!.code
    expect(rows.some(r => r.getAttribute('aria-label')!.includes(` ${playerCode},`))).toBe(false)
    expect(rows[0]!.getAttribute('aria-label')).toMatch(/^Rival intel: [A-Z]{3}, (soft|medium|hard|intermediate|wet), \d+ laps? old, \d+ stops?, /)
  })

  it('tap opens the card, tapping the same row closes it, tapping another switches it', () => {
    render(<TimingTower />)
    show(base)
    const [a, b] = rivalRows()
    fireEvent.click(a!)
    const card = screen.getByRole('region', { name: 'Rival intel' })
    const codeA = a!.getAttribute('aria-label')!.split(':')[1]!.trim().slice(0, 3)
    expect(within(card).getByText(codeA)).toBeTruthy()
    expect(a!.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(b!)
    const codeB = b!.getAttribute('aria-label')!.split(':')[1]!.trim().slice(0, 3)
    expect(within(screen.getByRole('region', { name: 'Rival intel' })).getByText(codeB)).toBeTruthy()
    fireEvent.click(b!)
    expect(screen.queryByRole('region', { name: 'Rival intel' })).toBeNull()
  })

  it('a tap outside the tower closes it', () => {
    render(<div><TimingTower /><p>elsewhere</p></div>)
    show(base)
    fireEvent.click(rivalRows()[0]!)
    expect(screen.getByRole('region', { name: 'Rival intel' })).toBeTruthy()
    fireEvent.pointerDown(screen.getByText('elsewhere'))
    expect(screen.queryByRole('region', { name: 'Rival intel' })).toBeNull()
  })

  it('Enter and Space open it from the keyboard', () => {
    render(<TimingTower />)
    show(base)
    fireEvent.keyDown(rivalRows()[0]!, { key: 'Enter' })
    expect(screen.getByRole('region', { name: 'Rival intel' })).toBeTruthy()
  })

  it('does not change the row height', () => {
    const { container } = render(<TimingTower />)
    show(base)
    const rival = container.querySelector('[data-intel-row]') as HTMLElement
    expect(rival.style.height).toBe('36px')
  })

  it('A CAR THAT RETIRES WHILE ITS CARD IS OPEN (Review Focus 3): the card stays and says OUT', () => {
    render(<TimingTower />)
    show(base)
    const row = rivalRows()[1]!
    const id = row.closest('[data-intel-row]')!.getAttribute('data-intel-row')!
    fireEvent.click(row)
    show({ ...base, cars: base.cars.map(c => c.driverId === id ? { ...c, retired: true, retiredLap: 0, retiredCause: 'mechanical' as const } : c) })
    const card = screen.getByRole('region', { name: 'Rival intel' })
    expect(within(card).getByText('OUT')).toBeTruthy()
  })

  it('the card follows the car if it leaves the compact window', () => {
    render(<TimingTower />)
    show(base)
    const row = rivalRows()[0]!
    const id = row.closest('[data-intel-row]')!.getAttribute('data-intel-row')!
    fireEvent.click(row)
    // Move that car to the back of the field.
    show({ ...base, cars: base.cars.map(c => c.driverId === id ? { ...c, position: 20, raceTime: 999 } : c.position === 20 ? { ...c, position: 1 } : c) })
    expect(screen.getByRole('region', { name: 'Rival intel' })).toBeTruthy()
  })

  it('Space opens it, and Escape closes it with focus kept on the row', () => {
    render(<TimingTower />)
    show(base)
    const row = rivalRows()[0]!
    row.focus()
    fireEvent.keyDown(row, { key: ' ' })
    expect(screen.getByRole('region', { name: 'Rival intel' })).toBeTruthy()
    fireEvent.keyDown(row, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Rival intel' })).toBeNull()
    expect(document.activeElement).toBe(row)
  })

  it('a held key (repeat) does not toggle it shut', () => {
    render(<TimingTower />)
    show(base)
    const row = rivalRows()[0]!
    fireEvent.keyDown(row, { key: 'Enter' })
    fireEvent.keyDown(row, { key: 'Enter', repeat: true })
    expect(screen.getByRole('region', { name: 'Rival intel' })).toBeTruthy()
  })

  it('clicking the player row shows no card', () => {
    const { container } = render(<TimingTower />)
    show(base)
    const playerRow = Array.from(container.querySelectorAll('[data-tower-row]')).find(r => !r.hasAttribute('data-intel-row'))!
    fireEvent.click(playerRow)
    expect(screen.queryByRole('region', { name: 'Rival intel' })).toBeNull()
  })

  it('a pointerdown inside the tower keeps the card open', () => {
    render(<TimingTower />)
    show(base)
    fireEvent.click(rivalRows()[0]!)
    fireEvent.pointerDown(screen.getByRole('button', { name: /FULL FIELD/ }))
    expect(screen.getByRole('region', { name: 'Rival intel' })).toBeTruthy()
  })

  it('reaching the flag closes the card', () => {
    render(<TimingTower />)
    show(base)
    fireEvent.click(rivalRows()[0]!)
    act(() => { useRaceStore.setState({ phase: 'finished' }) })
    expect(screen.queryByRole('region', { name: 'Rival intel' })).toBeNull()
    act(() => { useRaceStore.setState({ phase: 'racing' }) })
  })

  it('intel is lap-stable: a sector tick keeps the label, a new lap with a stop updates card and label', () => {
    render(<TimingTower />)
    show(base)
    const row = rivalRows()[0]!
    const id = row.closest('[data-intel-row]')!.getAttribute('data-intel-row')!
    const label0 = row.getAttribute('aria-label')!
    fireEvent.click(row)
    const age0 = base.cars.find(c => c.driverId === id)!.tyreAge
    // Sector-only change: same lap, tyre age moved (as it would not mid-lap, but must be ignored).
    show({ ...base, cars: base.cars.map(c => c.driverId === id ? { ...c, tyreAge: age0 + 5 } : c) })
    expect(rivalRows().find(r => r.closest('[data-intel-row]')!.getAttribute('data-intel-row') === id)!.getAttribute('aria-label')).toBe(label0)
    // Next lap, one more stop and fresh tyres.
    show({ ...base, lap: base.lap + 1, cars: base.cars.map(c => c.driverId === id ? { ...c, tyreAge: 0, pitsDone: c.pitsDone + 1 } : c) })
    const after = rivalRows().find(r => r.closest('[data-intel-row]')!.getAttribute('data-intel-row') === id)!
    expect(after.getAttribute('aria-label')).not.toBe(label0)
    expect(after.getAttribute('aria-label')).toMatch(/0 laps old/)
    expect(within(screen.getByRole('region', { name: 'Rival intel' })).getByText('0 LAPS')).toBeTruthy()
  })
})
