import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'

vi.mock('@engine/index', async orig => {
  const real = await orig<typeof import('@engine/index')>()
  return { ...real, neutralisationOutlook: vi.fn(real.neutralisationOutlook) }
})

import { neutralisationOutlook } from '@engine/index'
import { ScOutlook, useScChanceLine } from '@ui/ScOutlook'
import { useRaceStore } from '@state/raceStore'
import { initRace } from '@engine/race'
import { makeConfig } from '../fixtures/raceHarness'

describe('SC outlook is computed once per lap, shared (spec §9.3)', () => {
  beforeEach(() => useRaceStore.getState().resetRace())

  it('meter + pit line mounted: one neutralisationOutlook call per lap change, none per sector', () => {
    const config = makeConfig({}, 3, 'harbour_lights')
    const st = initRace(config)
    useRaceStore.setState({ config, raceState: { ...st, lap: 10 }, phase: 'racing' })
    function PitLine() { return <div>{useScChanceLine()}</div> }
    render(<><ScOutlook /><PitLine /></>)
    const spy = vi.mocked(neutralisationOutlook)
    spy.mockClear()
    act(() => useRaceStore.setState({ raceState: { ...st, lap: 11 } }))
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockClear()
    act(() => useRaceStore.setState({ raceState: { ...st, lap: 11, sector: 1 } as never }))
    expect(spy).toHaveBeenCalledTimes(0)
  })
})
