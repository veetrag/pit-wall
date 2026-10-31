import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { readFileSync } from 'node:fs'
vi.mock('@capacitor/preferences', () => ({ Preferences: { get: async () => ({ value: null }), set: async () => {}, remove: async () => {} } }))
import { DailyCard } from '@ui/DailyCard'
import { useDailyStore } from '@state/dailyStore'
import { generateDaily, dateKey } from '@state/daily'
import { useScenarioStore } from '@state/scenarioStore'
import { useSeasonStore } from '@state/seasonStore'

describe('DailyCard', () => {
  beforeEach(() => { useDailyStore.setState({ today: null, status: 'idle', best: {} }) })

  it('shows a designed loader while building', () => {
    useDailyStore.setState({ status: 'building' })
    render(<DailyCard />)
    expect(screen.getByText(/Building today's challenge/)).toBeTruthy()
  })
  it('PLAY selects the daily as a daily challenge and starts it', () => {
    const today = generateDaily(dateKey(new Date()))
    useDailyStore.setState({ today, status: 'ready' })
    render(<DailyCard />)
    expect(screen.getByText(`FINISH P${today.spec.goal.position} OR BETTER`)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Play the daily challenge/ }))
    expect(useScenarioStore.getState().active?.kind).toBe('daily')
    expect(useSeasonStore.getState().phase).toBe('scenario_racing')
  }, 60_000)
  it('a ready daily from a past date is rebuilt on mount', () => {
    useDailyStore.setState({ today: generateDaily('2026-10-28'), status: 'ready' })
    render(<DailyCard />)
    expect(useDailyStore.getState().status).toBe('building')
    expect(screen.getByText(/Building today's challenge/)).toBeTruthy()
  }, 60_000)
  it('NO NAG: no streak, countdown or come-back copy anywhere in the daily UI', () => {
    for (const f of ['src/ui/DailyCard.tsx', 'src/state/dailyStore.ts', 'src/state/daily.ts']) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/streak|countdown|come back|tomorrow|in a row/i)
    }
  })
})
