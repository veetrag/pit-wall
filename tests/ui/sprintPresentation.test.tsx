import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'

const mem = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { mem.set(key, value) }),
    get: vi.fn(async ({ key }: { key: string }) => ({ value: mem.get(key) ?? null })),
    remove: vi.fn(async ({ key }: { key: string }) => { mem.delete(key) }),
  },
}))
vi.mock('@audio/soundService', () => ({ soundService: { play: vi.fn() } }))

import { MainMenu } from '@ui/MainMenu'
import { RaceSetup } from '@ui/RaceSetup'
import { Qualifying } from '@ui/Qualifying'
import { RaceResult } from '@ui/RaceResult'
import { CareerRecord } from '@ui/CareerRecord'
import { StartLights } from '@ui/StartLights'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore } from '@state/careerStore'
import { useRaceStore, CIRCUIT_ORDER } from '@state/raceStore'
import { useSettingsStore } from '@state/settingsStore'
import { useDebriefStore } from '@state/debriefStore'
import { useClockStore } from '@state/clockStore'
import { SAVE_KEY } from '@state/seasonPersistence'
import { loadGameData } from '@data/validators'
import type { RaceConfig } from '@engine/types'

const DATA = loadGameData()
const SEASON_14 = JSON.parse(readFileSync('tests/fixtures/season-save-1.4.json', 'utf8')) as Record<string, unknown>
const ORDER = DATA.drivers.drivers.map(d => d.id)

beforeEach(() => {
  // jsdom has no scrollIntoView; RaceSetup centres the active circuit chip.
  Element.prototype.scrollIntoView = vi.fn()
  mem.clear()
  useSettingsStore.setState({ reducedMotion: true })
  useDebriefStore.getState().cancel()
  useCareerStore.getState().beginCareer()
  useSeasonStore.setState({
    phase: 'menu', playerDriverId: 'd_voss', selectedTeamId: 'apex', selectedCircuitId: null, raceIndex: 3,
    standings: [], qualifyingResult: null, sprintBanked: false, lastSprintResults: null, playerStrategy: null,
    lastRaceResults: null, lastRaceEvents: null, resultPending: false, pendingRace: null,
  })
})

describe('SPRINT WEEKEND pill', () => {
  it('on the main menu next-race card for a sprint round, not otherwise', async () => {
    mem.set(SAVE_KEY, JSON.stringify({ ...SEASON_14, raceIndex: 3, resumePhase: 'development', resultPending: false, pendingRace: null }))
    const { unmount } = render(<MainMenu />)
    expect(await screen.findByText('SPRINT WEEKEND')).toBeTruthy()
    unmount()
    mem.set(SAVE_KEY, JSON.stringify({ ...SEASON_14, raceIndex: 2, resumePhase: 'development', resultPending: false, pendingRace: null }))
    render(<MainMenu />)
    expect(await screen.findByText(/ROUND 3 OF 12/)).toBeTruthy()
    expect(screen.queryByText('SPRINT WEEKEND')).toBeNull()
  })

  it('on race setup and qualifying for a sprint round', () => {
    const { unmount } = render(<RaceSetup />)
    expect(screen.getByText('SPRINT WEEKEND')).toBeTruthy()
    unmount()
    render(<Qualifying />)
    expect(screen.getByText('SPRINT WEEKEND')).toBeTruthy()
  })

  it('not on a normal round', () => {
    useSeasonStore.setState({ raceIndex: 2 })
    render(<RaceSetup />)
    expect(screen.queryByText('SPRINT WEEKEND')).toBeNull()
  })
})

describe('race setup after the sprint is banked', () => {
  it('goes straight to the Grand Prix, and the circuit is fixed for the weekend', () => {
    useSeasonStore.setState({ sprintBanked: true, qualifyingResult: { laps: [], order: ORDER } })
    render(<RaceSetup />)
    expect(screen.getByRole('button', { name: /TO THE GRAND PRIX/ })).toBeTruthy()
    const here = DATA.circuits[CIRCUIT_ORDER[3]!]!.name
    const elsewhere = DATA.circuits[CIRCUIT_ORDER[0]!]!.name
    fireEvent.click(screen.getByRole('button', { name: new RegExp(elsewhere) }))
    expect(screen.getByRole('button', { name: new RegExp(here) }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: new RegExp(elsewhere) }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByText('CIRCUIT SET FOR THE WEEKEND')).toBeTruthy()
  })

  it('has no lock caption before the sprint is banked', () => {
    render(<RaceSetup />)
    expect(screen.queryByText('CIRCUIT SET FOR THE WEEKEND')).toBeNull()
  })
})

describe('S+N on the Grand Prix result of a sprint round', () => {
  it('each row shows the sprint points beside the race points, and the championship card says so', () => {
    const gp = ORDER.map((driverId, i) => ({ driverId, position: i + 1, points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1][i] ?? 0, retired: false, retiredCause: null }))
    const sprint = ORDER.map((driverId, i) => ({ driverId, position: i + 1, points: [8, 7, 6, 5, 4, 3, 2, 1][i] ?? 0, retired: false, retiredCause: null }))
    useSeasonStore.setState({
      phase: 'result', lastRaceResults: gp, lastSprintResults: sprint, resultPending: true, sprintBanked: true,
      lastRaceEvents: { overtakesGained: 0, pitsDone: 1, hadRain: false },
      standings: sprint.map(r => ({ driverId: r.driverId, points: r.points })),
      playerDriverId: ORDER[2]!,
    })
    render(<RaceResult />)
    expect(screen.getByText(/incl\. S\+6 from the sprint/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /FULL RESULTS/ }))
    expect(screen.getByText('+15 · S+6')).toBeTruthy()
    // P10 scored 1 in the Grand Prix and nothing in the sprint: no S+0 clutter.
    expect(screen.getByText('+1')).toBeTruthy()
  })
})

describe('a non-sprint round result', () => {
  it('shows no sprint points anywhere', () => {
    const gp = ORDER.map((driverId, i) => ({ driverId, position: i + 1, points: [25, 18, 15][i] ?? 0, retired: false, retiredCause: null }))
    useSeasonStore.setState({
      phase: 'result', raceIndex: 2, lastRaceResults: gp, lastSprintResults: null, resultPending: true,
      lastRaceEvents: { overtakesGained: 0, pitsDone: 1, hadRain: false },
      standings: gp.map(r => ({ driverId: r.driverId, points: r.points })),
      playerDriverId: ORDER[2]!,
    })
    const { container } = render(<RaceResult />)
    fireEvent.click(screen.getByRole('button', { name: /FULL RESULTS/ }))
    expect(container.textContent).not.toContain('incl. S+')
    expect(container.textContent).not.toContain('· S+')
  })
})

describe('trophy room', () => {
  it('shows sprint wins, which never count as wins', () => {
    const fact = { season: 1, round: 3, grid: 4, finish: 1, retired: false, pole: false, stops: 0, overtakes: 2, wet: false, kind: 'sprint' as const }
    useCareerStore.setState({ raceLog: [fact, { ...fact, round: 7 }, { ...fact, round: 11, retired: true }], wins: 0 })
    render(<CareerRecord />)
    expect(screen.getByText(/2 sprint wins/)).toBeTruthy()
    // The WINS tile is untouched by sprint wins.
    expect(screen.getByText('WINS').previousElementSibling?.textContent).toBe('0')
  })
})

describe('start lights', () => {
  it('state the sprint distance, not the circuit distance', () => {
    useSettingsStore.setState({ hapticsEnabled: false, skipStartSequence: false })
    useClockStore.setState({ speed: 0, appVisible: true })
    useRaceStore.setState({ phase: 'starting', config: { circuit: DATA.circuits['sol_desert']!, lapsOverride: 13 } as RaceConfig })
    const { container } = render(<StartLights />)
    expect(container.textContent).toContain('LAP 1 OF 13')
  })
})
