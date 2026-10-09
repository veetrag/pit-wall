import { describe, it, expect, beforeEach } from 'vitest'
import { useRaceStore } from '@state/raceStore'

beforeEach(() => {
  useRaceStore.getState().resetRace()
  useRaceStore.getState().startSeasonRace('d_voss', 4242, 'bengaluru', 'rookie',
    { startCompound: 'M', plannedStops: [] }, null, undefined, true)
  useRaceStore.setState({ phase: 'racing' })
})

describe('the call log', () => {
  it('counts steps and logs each call at the step it was made', () => {
    const r = () => useRaceStore.getState()
    for (let i = 0; i < 7; i++) r().step()
    r().setPaceMode('push')
    for (let i = 0; i < 5; i++) r().step()
    r().pitNow('H')
    expect(r().stepCount).toBe(12)
    expect(r().playerCalls).toEqual([
      { step: 7, kind: 'pace', mode: 'push' },
      { step: 12, kind: 'pit', compound: 'H' },
    ])
  })

  it('a refused pit (no tyres) is not logged', () => {
    const s = useRaceStore.getState().raceState!
    useRaceStore.setState({ raceState: { ...s, cars: s.cars.map(c => c.isPlayer
      ? { ...c, tyreAllocation: { S: 0, M: 0, H: 0, I: 0, W: 0 } } : c) } })
    useRaceStore.getState().pitNow('H')
    expect(useRaceStore.getState().playerCalls).toEqual([])
  })

  it('a new race starts an empty log', () => {
    useRaceStore.getState().setPaceMode('push')
    useRaceStore.getState().resetRace()
    useRaceStore.getState().startSeasonRace('d_voss', 1, 'bengaluru')
    expect(useRaceStore.getState().playerCalls).toEqual([])
    expect(useRaceStore.getState().stepCount).toBe(0)
  })
})
