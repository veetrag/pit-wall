import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { stewardMessage, StewardToast } from '@ui/StewardToast'
import { playerEffectivePosition } from '@ui/TimingTower'
import { useRaceStore } from '@state/raceStore'
import { initRace } from '@engine/race'
import { makeDeterministicTuning } from '../fixtures/tuning'
import { makeConfig } from '../fixtures/raceHarness'

const ev = (kind: 'track_limits' | 'penalty_issued' | 'unsafe_release' | 'penalty_served', timeLoss: number | null = null) =>
  ({ lap: 5, sector: 1 as const, kind, driverId: 'd_voss', timeLoss })

describe('penalties on screen (spec §8.3)', () => {
  beforeEach(() => useRaceStore.getState().resetRace())

  it('steward messages: warnings in caution, penalties in hot, words not colour', () => {
    expect(stewardMessage(ev('track_limits'), 3, 2)).toEqual({ text: 'TRACK LIMITS · WARNING 2/3', tone: 'caution' })
    expect(stewardMessage(ev('penalty_issued', 5), 3, 4)).toEqual({ text: '5s TIME PENALTY', tone: 'hot' })
    expect(stewardMessage(ev('unsafe_release'), 3, 0)).toEqual({ text: 'UNSAFE RELEASE — UNDER INVESTIGATION', tone: 'caution' })
    expect(stewardMessage(ev('penalty_served', 5), 3, 0)).toEqual({ text: '5s PENALTY SERVED', tone: 'caution' })
  })

  it('road position and position after penalties', () => {
    const c = { ...makeConfig({}, 2, 'veloce'), playerDriverId: 'd_voss', tuning: makeDeterministicTuning({ penalties: { enabled: true } }) }
    const s = initRace(c)
    const cars = s.cars.map((x, i) => ({ ...x, raceTime: i * 2, position: i + 1, penalty: { warnings: 0, pendingSec: x.isPlayer ? 5 : 0, servedSec: 0 } }))
    expect(playerEffectivePosition({ ...s, cars })).toEqual({ road: 1, after: 3 })
  })

  it('the toast is a polite live region and names the penalty in text', () => {
    const c = { ...makeConfig({}, 2, 'veloce'), playerDriverId: 'd_voss', tuning: makeDeterministicTuning({ penalties: { enabled: true } }) }
    const s = initRace(c)
    useRaceStore.setState({ config: c, raceState: { ...s, incidents: [ev('penalty_issued', 5)] }, phase: 'racing' })
    render(<StewardToast />)
    const region = screen.getByRole('status')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.textContent).toContain('5s TIME PENALTY')
  })
})

describe('lap chart penalties (spec §8.3)', () => {
  it('names each penalty in the summary and draws a +5 glyph', async () => {
    const { lapChartSummary, LapChart } = await import('@ui/LapChart')
    const history = {
      totalLaps: 10, lapsRun: 10, neutralisations: [],
      cars: [0, 1].map(i => ({ driverId: i ? 'd_b' : 'd_a', teamId: 't', isPlayer: i === 0, positions: Array.from({ length: 11 }, () => i + 1), pitLaps: [], penaltyLaps: i ? [] : [4], retiredLap: null, finish: i + 1 })),
    }
    expect(lapChartSummary(history, 'd_a')).toBe('Started P1, 5-second penalty on lap 4, finished P1')
    const { container } = render(<LapChart history={history} playerDriverId="d_a" />)
    expect(container.querySelectorAll('[data-penalty]')).toHaveLength(1)
    expect(container.querySelector('[data-penalty]')?.textContent).toBe('+5')
  })
})
