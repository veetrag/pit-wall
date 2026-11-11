import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { TrackGrip, gripText } from '@ui/TrackGrip'
import { useRaceStore, gripResetLost } from '@state/raceStore'
import { initRace } from '@engine/race'
import { makeConfig } from '../fixtures/raceHarness'
import type { WeatherState } from '@engine/types'

const WASH = { trackEvolution: { wash: { DAMP: 0.35, WET: 0.80 } } }

describe('TRACK GRIP (spec §4.5)', () => {
  beforeEach(() => useRaceStore.getState().resetRace())

  it('gripText rounds and states the cost', () => {
    expect(gripText(0.78, 0.066)).toBe('78% · +0.07s/lap')
    expect(gripText(1, 0)).toBe('100% · rubbered in')
  })

  it('renders a meter with an accessible value', () => {
    const config = makeConfig(WASH, 4)
    const s = { ...initRace(config), lap: 4, weatherTimeline: Array(60).fill('DRY') as WeatherState[] }
    useRaceStore.setState({ config, raceState: s, phase: 'racing' })
    render(<TrackGrip />)
    const m = screen.getByRole('meter', { name: /track grip/i })
    expect(m.getAttribute('aria-valuenow')).toBe('20')
    expect(m.getAttribute('aria-valuetext')).toMatch(/20 percent, plus 0\.24 seconds a lap/)
  })

  it('a wet lap costs segments and is reported once', () => {
    const config = makeConfig(WASH, 4)
    const tl: WeatherState[] = [...Array(12).fill('DRY'), 'WET', ...Array(40).fill('DRY')] as WeatherState[]
    const prev = { ...initRace(config), lap: 12, weatherTimeline: tl }
    const next = { ...prev, lap: 13 }
    expect(gripResetLost(prev, next, config.tuning)).toBe(5)       // 60% -> 13% of grip, 10 segments
    expect(gripResetLost(next, { ...next, lap: 14 }, config.tuning)).toBe(0)
  })

  it('shipped tuning (no wash): grip only builds, never a reset', () => {
    const config = makeConfig({}, 4)
    const tl = Array(60).fill('WET') as WeatherState[]
    const s0 = { ...initRace(config), weatherTimeline: tl }
    for (let lap = 0; lap < 30; lap++) {
      expect(gripResetLost({ ...s0, lap }, { ...s0, lap: lap + 1 }, config.tuning)).toBe(0)
    }
  })

  it('the GRIP RESET flash mounts once per wash: re-renders and later laps never remount or replay it', () => {
    const config = makeConfig(WASH, 4)
    const tl: WeatherState[] = [...Array(12).fill('DRY'), 'WET', ...Array(40).fill('DRY')] as WeatherState[]
    const s12 = { ...initRace(config), lap: 12, weatherTimeline: tl }
    useRaceStore.setState({ config, raceState: s12, phase: 'racing' })
    const { rerender } = render(<TrackGrip />)
    const segs = () => Array.from(screen.getByRole('meter', { name: /track grip/i }).children)
    act(() => useRaceStore.setState({ raceState: { ...s12, lap: 13 } }))
    const washed = segs()[5]!                       // 6 lit -> 1 lit: segments 1..5 washed
    rerender(<TrackGrip />)                         // unrelated re-render, same lap
    expect(segs()[5]).toBe(washed)
    act(() => useRaceStore.setState({ raceState: { ...s12, lap: 14 } }))
    expect(segs()[5]).toBe(washed)                  // next lap: still the same element, flash not cut or replayed
    act(() => useRaceStore.setState({ raceState: { ...s12, lap: 12 } }))   // grip back up (no wash): no remount either
    expect(segs()[5]).toBe(washed)
  })
})
