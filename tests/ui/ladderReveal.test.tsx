import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LadderReveal, ConstructorsList } from '@ui/LadderReveal'
import { useSettingsStore } from '@state/settingsStore'
import type { LadderMove } from '@state/teamLadder'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => {}), notification: vi.fn(async () => {}) },
  ImpactStyle: { Medium: 'MEDIUM' }, NotificationType: { Success: 'SUCCESS', Warning: 'WARNING' },
}))
vi.mock('@audio/soundService', () => ({ soundService: { play: vi.fn() } }))

const m = (teamId: string, deserved: number, finished: number, before: number, after: number): LadderMove =>
  ({ teamId, deserved, finished, before, after })

beforeEach(() => { useSettingsStore.setState({ reducedMotion: true }) })

describe('LadderReveal', () => {
  it('announces a step up with an arrow and both positions', () => {
    render(<LadderReveal moves={[m('terra', 7, 4, 1, 2)]} playerTeamId="terra" />)
    expect(screen.getByText('▲ STEP UP')).toBeTruthy()
    expect(screen.getByLabelText('Deserved P7')).toBeTruthy()
    expect(screen.getByLabelText('Finished P4')).toBeTruthy()
    expect(screen.getByLabelText('Tier +1 to +2')).toBeTruthy()
  })

  it('announces a step down', () => {
    render(<LadderReveal moves={[m('terra', 3, 6, 0, -1)]} playerTeamId="terra" />)
    expect(screen.getByText('▼ STEP DOWN')).toBeTruthy()
  })

  it('announces a hold', () => {
    render(<LadderReveal moves={[m('terra', 5, 5, 1, 1)]} playerTeamId="terra" />)
    expect(screen.getByText('● HELD')).toBeTruthy()
  })

  it('lists the other teams that moved, and only those', () => {
    render(<LadderReveal
      moves={[m('terra', 5, 5, 0, 0), m('apex', 1, 4, 0, -1), m('zenith', 9, 6, 0, 1), m('nimbus', 6, 7, 0, 0)]}
      playerTeamId="terra" />)
    const movers = screen.getByLabelText('Grid movers')
    expect(movers.textContent).toContain('▼')
    expect(movers.textContent).toContain('▲')
    expect(movers.textContent).not.toMatch(/nimbus/i)
  })

  it('renders nothing when the player team is not in the moves', () => {
    const { container } = render(<LadderReveal moves={[m('apex', 1, 1, 0, 0)]} playerTeamId="terra" />)
    expect(container.textContent).toBe('')
  })
})

describe('ConstructorsList', () => {
  it('orders teams by summed points and marks the player team', () => {
    render(<ConstructorsList
      standings={[{ driverId: 'd_voss', points: 100 }, { driverId: 'd_chen', points: 90 }]}
      playerTeamId="apex" />)
    const first = screen.getAllByRole('listitem')[0]!
    expect(first.textContent).toMatch(/190/)
    expect(first.getAttribute('aria-current')).toBe('true')
  })
})
