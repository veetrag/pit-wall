import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))
vi.mock('@sync/storeBridge', () => ({ pushCloudSave: vi.fn() }))
vi.mock('@sync/platformBridge', () => ({ maybeAskForReview: vi.fn(async () => {}) }))

import { Championship } from '@ui/Championship'
import { DriverSelect } from '@ui/DriverSelect'
import { Development } from '@ui/Development'
import { CareerRecord } from '@ui/CareerRecord'
import { useSeasonStore } from '@state/seasonStore'
import { useCareerStore, type PendingOffer } from '@state/careerStore'
import { loadGameData } from '@data/validators'

const DATA = loadGameData()
const OFFER: PendingOffer = { season: 2, teamId: 'apex', reason: 'constructors', boardTarget: 3, rating: 84, currentRating: 79 }
const apexDrivers = DATA.drivers.drivers.filter(d => d.teamId === 'apex')
const other = DATA.drivers.drivers.find(d => d.teamId !== 'apex')!

beforeEach(() => {
  useCareerStore.getState().beginCareer()
  useCareerStore.setState({ seasonNumber: 2, pendingOffer: OFFER })
  useSeasonStore.setState({
    phase: 'championship', playerDriverId: other.id, selectedTeamId: other.teamId, raceIndex: 11,
    standings: DATA.drivers.drivers.map((d, i) => ({ driverId: d.id, points: 200 - i })), lastLadder: null, purchasedTiers: {},
  })
})

describe('the offer on the championship screen (spec 1.6 §12)', () => {
  it('ACCEPT/STAY rove with the arrow keys; only the checked radio is tabbable', () => {
    render(<Championship />)
    const stay = screen.getByRole('radio', { name: /stay/i })
    const accept = screen.getByRole('radio', { name: /accept/i })
    expect(stay.tabIndex).toBe(0); expect(accept.tabIndex).toBe(-1)
    fireEvent.keyDown(stay, { key: 'ArrowRight' })
    expect(accept.getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(accept)
    expect(accept.tabIndex).toBe(0)
    fireEvent.keyDown(accept, { key: 'ArrowLeft' })
    expect(stay.getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(stay)
  })

  it('shows the team, its rating against yours and its board target; STAY is the default', () => {
    render(<Championship />)
    const card = screen.getByRole('region', { name: /offer/i })
    expect(card.textContent).toMatch(/84/)
    expect(card.textContent).toMatch(/79/)
    expect(card.textContent).toMatch(/BOARD TARGET · P3 IN THE CONSTRUCTORS'/)
    expect(screen.getByRole('radio', { name: /stay/i }).getAttribute('aria-checked')).toBe('true')
  })

  it('STAY + NEXT SEASON keeps the seat and clears the offer', () => {
    render(<Championship />)
    fireEvent.click(screen.getByRole('button', { name: /next season/i }))
    expect(useSeasonStore.getState().phase).toBe('development')
    expect(useSeasonStore.getState().playerDriverId).toBe(other.id)
    expect(useCareerStore.getState().pendingOffer ?? null).toBeNull()
  })

  it('ACCEPT relabels the button, then goes to the NEW TEAM driver pick', () => {
    render(<Championship />)
    fireEvent.click(screen.getByRole('radio', { name: /accept/i }))
    const team = DATA.cars.teams.find(t => t.id === 'apex')!.name.toUpperCase()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`sign for ${team}`, 'i') }))
    expect(useSeasonStore.getState().phase).toBe('new_team_driver')
  })
})

describe('the new-team driver pick', () => {
  beforeEach(() => { useSeasonStore.setState({ phase: 'new_team_driver' }) })

  it('lists the new team\'s two drivers under a NEW TEAM eyebrow, and back returns to the offer', () => {
    render(<DriverSelect mode="new_team" />)
    expect(screen.getByText(/NEW TEAM/)).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(apexDrivers.length)
    fireEvent.click(screen.getByRole('button', { name: /back/i }))
    expect(useSeasonStore.getState().phase).toBe('championship')
  })

  it('confirming signs the driver', () => {
    render(<DriverSelect mode="new_team" />)
    fireEvent.click(screen.getAllByRole('radio')[1]!)
    fireEvent.click(screen.getByRole('button', { name: /race with/i }))
    expect(useSeasonStore.getState().playerDriverId).toBe(apexDrivers[1]!.id)
    expect(useSeasonStore.getState().selectedTeamId).toBe('apex')
  })
})

describe('board target and team history', () => {
  it('Development shows the board target', () => {
    useSeasonStore.setState({ phase: 'development', raceIndex: 2, devPoints: 0 })
    render(<Development />)
    expect(screen.getByLabelText(/board target: p\d+ in the constructors/i)).toBeTruthy()
    expect(screen.getByLabelText(/board target: p\d+ in the constructors/i).textContent).toMatch(/^BOARD TARGET · P\d+ IN THE CONSTRUCTORS'$/)
  })

  it('the trophy room marks a season raced for a new team', () => {
    useCareerStore.setState({ seasonHistory: [
      { seasonNumber: 1, teamId: other.teamId, driverId: other.id, championshipPosition: 3, points: 150, wins: 1 },
      { seasonNumber: 2, teamId: 'apex', driverId: apexDrivers[0]!.id, championshipPosition: 2, points: 210, wins: 3 },
    ] })
    render(<CareerRecord />)
    expect(screen.getAllByLabelText('Changed team')).toHaveLength(1)
  })
})
