import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@capacitor/preferences', () => ({
  Preferences: { set: vi.fn(async () => {}), get: vi.fn(async () => ({ value: null })), remove: vi.fn(async () => {}) },
}))

import { CareerStats } from '@ui/CareerStats'
import { CareerRecord } from '@ui/CareerRecord'
import { useCareerStore } from '@state/careerStore'
import { useSeasonStore } from '@state/seasonStore'
import { snapshotFrom } from '@state/seasonPersistence'

beforeEach(() => {
  useCareerStore.getState().beginCareer()
  useSeasonStore.setState({ phase: 'career' })
})

describe('the STATS screen (spec 1.6 §7)', () => {
  it('opens from the trophy room and backs out to it', () => {
    render(<CareerRecord />)
    fireEvent.click(screen.getByRole('button', { name: /stats/i }))
    expect(useSeasonStore.getState().phase).toBe('career_stats')
    render(<CareerStats />)
    fireEvent.click(screen.getAllByRole('button', { name: /back/i }).slice(-1)[0]!)
    expect(useSeasonStore.getState().phase).toBe('career')
  })

  it('renders an empty career without NaN and says where data starts', () => {
    useCareerStore.setState({ raceLog: [
      { season: 1, round: 0, grid: 5, finish: 3, retired: false, pole: false, stops: 1, overtakes: 0, wet: false },
    ] })
    const { container } = render(<CareerStats />)
    expect(container.textContent).not.toMatch(/NaN|Infinity|undefined/)
    expect(screen.getAllByText(/since 1\.6/i).length).toBeGreaterThan(0)
  })

  it('is a detour: the season save is not overwritten while on it', () => {
    useSeasonStore.setState({ phase: 'career_stats', playerDriverId: 'd_voss' })
    expect(snapshotFrom(useSeasonStore.getState())).toBeNull()
  })
})
